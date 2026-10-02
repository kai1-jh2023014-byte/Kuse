import { describe, expect, it } from "vitest";
import { evaluateGeneratedDesign } from "./designEvaluator";
import { generateImprovementPrompt } from "./improvementGenerator";
import { emptyTasteMemory, recordTaste } from "./taste-memory";
import { applyApprovedTraits, proposeProfileAdditions } from "./profile-learning";
import { createDesignProfile } from "./profile";
import { computeSignals, type Raster } from "./signals";
import type { DesignBrief, ImageAnalysis, RawImageSignals } from "./types";
import { editCapability } from "@/services/canva/edit-capability";
import { assertCanRegenerate } from "@/services/canva/review";
import type { StoredVersion } from "@/services/canva/types";

const brief: DesignBrief = {
  purpose: "ゲームイベントの告知ポスターを作りたい",
  audience: "インディーゲームが好きな人",
  copyText: "NIGHT MARKET",
  size: "A3縦（ポスター）",
  mood: "夜の熱量",
  imagery: "",
  notes: "",
};

function paint(draw: (x: number, y: number, width: number, height: number) => [number, number, number, number]): Raster {
  const width = 80;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = draw(x, y, width, height);
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    }
  }
  return { width, height, data };
}

function darkPoster(id: string): RawImageSignals {
  return computeSignals(
    paint((x, y) => {
      if (y < 28 && x < 46) return [244, 240, 230, 255];
      if (y > 70 && y < 76 && x < 24) return [226, 59, 42, 255];
      return [22, 24, 29, 255];
    }),
    { id, filename: `${id}.png`, width: 800, height: 1000 },
  );
}

function brightCentered(id: string): RawImageSignals {
  return computeSignals(
    paint((x, y, width, height) => {
      const cx = Math.abs(x - width / 2) < 18 && Math.abs(y - height / 2) < 18;
      return cx ? [210, 210, 210, 255] : [250, 250, 250, 255];
    }),
    { id, filename: `${id}.png`, width: 800, height: 1000 },
  );
}

function analysis(signals: RawImageSignals): ImageAnalysis {
  return {
    id: signals.id,
    filename: signals.filename,
    width: 800,
    height: 1000,
    analyzedAt: `2026-09-29T00:00:0${signals.id}.000Z`,
    signals,
  };
}

describe("generated design evaluation", () => {
  const profile = createDesignProfile(
    [darkPoster("1"), darkPoster("2"), darkPoster("3")].map(analysis),
    null,
    { now: "2026-09-29T00:00:00.000Z" },
  );

  it("scores a similar poster as closer to the profile than a bright centered image", () => {
    const close = evaluateGeneratedDesign({ signals: darkPoster("4"), profile, brief, prompt: "告知" });
    const far = evaluateGeneratedDesign({ signals: brightCentered("5"), profile, brief, prompt: "告知" });
    expect(close.style_similarity).toBeGreaterThan(far.style_similarity);
    expect(close.style_similarity).toBeGreaterThan(60);
    expect(far.gaps.length).toBeGreaterThan(0);
    expect(close.mode).toBe("measured");
    const prompt = generateImprovementPrompt({ profile, originalPrompt: "【目的】夜の告知", evaluation: far, feedback: null });
    expect(prompt).toContain("作り直さない");
    expect(prompt).toContain("維持");
    expect(prompt).toContain("【元の指示】");
    expect(prompt).toContain("夜の告知");
  });

  it("puts repeated user notes into the improvement prompt", () => {
    const far = evaluateGeneratedDesign({ signals: brightCentered("5"), profile, brief, prompt: "告知" });
    const memory = recordTaste(recordTaste(emptyTasteMemory(), { kind: "fix", text: "文字が大きすぎる" }), {
      kind: "fix",
      text: "見出しがまだ大きい",
    });
    const prompt = generateImprovementPrompt({
      profile,
      originalPrompt: "【目的】夜の告知",
      evaluation: far,
      feedback: { feelsLikeMe: false, difference: "見出しがまだ大きい" },
      tasteMemory: memory,
    });
    expect(prompt).toContain("これまでのフィードバック");
    expect(prompt).toContain("2回");
  });

  it("keeps approved learning from replacing the palette until the user approves, and skips rejected traits", () => {
    const signals = brightCentered("6");
    const refused = proposeProfileAdditions({
      profile,
      signals,
      feedback: { feelsLikeMe: false, difference: "文字が大きすぎる" },
    });
    expect(refused.traits).toEqual([]);
    const proposed = proposeProfileAdditions({
      profile,
      signals: { ...signals, titleDominance: profile.metrics.titleDominance + 1, whitespace: profile.metrics.whitespace },
      feedback: { feelsLikeMe: true, difference: "文字が大きすぎる" },
    });
    expect(proposed.traits.some((trait) => trait.label.includes("タイトル"))).toBe(false);
    const next = applyApprovedTraits(profile, proposed.traits, "2026-09-29T00:00:00.000Z");
    expect(next.color.accent).toEqual(profile.color.accent);
    expect(next.color.background).toEqual(profile.color.background);
  });
});

describe("in-place Canva edits", () => {
  it("does not treat an undocumented editor as callable", () => {
    expect(editCapability(undefined).canEditInPlace).toBe(false);
    expect(editCapability([{ name: "perform-editing-operations" }]).reason).toContain("確認できません");
  });

  it("stops a second improvement generation", () => {
    const source = { id: "v1", parentVersionId: "root", improvementPrompt: "直す" } as StoredVersion;
    expect(() => assertCanRegenerate([source], "v1")).toThrow(/1回まで/);
  });
});
