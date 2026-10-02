import { describe, expect, it } from "vitest";
import { applyApprovedTraits, proposeProfileAdditions } from "./profile-learning";
import { applyTasteTurn, emptyTasteMemory, recordTaste, tasteSection } from "./taste-memory";
import { createDesignProfile } from "./profile";
import { computeSignals, type Raster } from "./signals";
import type { ImageAnalysis, RawImageSignals } from "./types";

function paint(): Raster {
  const width = 40;
  const height = 40;
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(40);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
}

function signals(id: string): RawImageSignals {
  return computeSignals(paint(), { id, filename: `${id}.png`, width: 800, height: 800 });
}

function analysis(id: string): ImageAnalysis {
  const raw = signals(id);
  return { id, filename: raw.filename, width: 800, height: 800, analyzedAt: "2026-10-02T00:00:00.000Z", signals: raw };
}

describe("taste memory", () => {
  it("raises priority as the same complaint is repeated", () => {
    let memory = emptyTasteMemory();
    memory = recordTaste(memory, { kind: "fix", text: "文字が大きすぎる", at: "2026-10-02T01:00:00.000Z" });
    memory = recordTaste(memory, { kind: "fix", text: "見出しの文字がまだ大きい", at: "2026-10-02T02:00:00.000Z" });
    memory = recordTaste(memory, { kind: "keep", text: "色はこのままで", at: "2026-10-02T03:00:00.000Z" });
    const typeNote = memory.notes.find((note) => note.theme === "type" && note.kind === "fix");
    expect(typeNote?.count).toBe(2);
    const section = tasteSection(memory);
    expect(section).toContain("2回");
    expect(section).toContain("見出しの文字がまだ大きい");
    expect(section).toContain("色はこのままで");
  });

  it("folds repeated notes into the profile without replacing the palette", () => {
    const profile = createDesignProfile([analysis("1"), analysis("2"), analysis("3")], null, {
      now: "2026-10-02T00:00:00.000Z",
    });
    const first = applyTasteTurn({
      memory: emptyTasteMemory(),
      profile,
      kind: "fix",
      text: "余白が足りない",
    });
    expect(first.profile?.avoid.some((item) => item.includes("ユーザー指摘"))).toBe(false);
    const second = applyTasteTurn({
      memory: first.memory,
      profile: first.profile,
      kind: "fix",
      text: "余白をもっと広く",
    });
    expect(second.profile?.avoid.some((item) => item.includes("ユーザー指摘") && item.includes("余白"))).toBe(true);
    expect(second.profile?.color.background).toEqual(profile.color.background);
  });
});

describe("single-turn learning still waits for feels-like-me", () => {
  it("does not propose traits from a complaint alone", () => {
    const profile = createDesignProfile([analysis("a"), analysis("b"), analysis("c")], null, { now: "2026-10-02T00:00:00.000Z" });
    const refused = proposeProfileAdditions({
      profile,
      signals: signals("x"),
      feedback: { feelsLikeMe: false, difference: "文字が大きすぎる" },
    });
    expect(refused.traits).toEqual([]);
    const next = applyApprovedTraits(profile, refused.traits);
    expect(next.color.accent).toEqual(profile.color.accent);
  });
});
