import { describe, expect, it } from "vitest";
import { generateCanvaPrompt } from "./prompt";
import { describeReferenceSignals, notesFromAnalyses, referenceSection } from "./reference-frames";
import type { ImageAnalysis, RawImageSignals } from "./types";

function signals(id: string, patch: Partial<RawImageSignals> = {}): RawImageSignals {
  return {
    id,
    filename: `${id}.jpg`,
    width: 1600,
    height: 900,
    palette: [],
    background: { hex: "#111111", ratio: 0.4, saturation: 0.1, lightness: 0.1 },
    mainColors: ["#111111"],
    accentColors: [],
    brightness: 0.3,
    saturation: 0.2,
    contrast: 0.4,
    whitespace: 0.5,
    density: 0.3,
    symmetry: 0.5,
    verticalBalance: 0.45,
    horizontalBalance: 0.35,
    grid: [[0]],
    photoScore: 0.8,
    illustrationScore: 0.1,
    gradientScore: 0.1,
    shadowScore: 0.1,
    borderScore: 0.1,
    edgeDensity: 0.2,
    textScore: 0.2,
    titleDominance: 0.1,
    uniqueColorCount: 8,
    warmCool: 0.4,
    backgroundRatio: 0.4,
    inkCenter: { x: 0.3, y: 0.4 },
    orientation: "landscape",
    ...patch,
  };
}

describe("reference frames", () => {
  it("asks Canva to leave empty photo wells and describe selected photos", async () => {
    const analysis: ImageAnalysis = {
      id: "ref-1",
      filename: "site.jpg",
      width: 1600,
      height: 900,
      analyzedAt: "2026-01-01T00:00:00.000Z",
      signals: signals("ref-1"),
    };
    const notes = notesFromAnalyses([analysis], ["ref-1"]);
    expect(describeReferenceSignals(analysis.signals, "site.jpg")).toContain("横位置");
    const section = referenceSection({
      notes,
      media: { kind: "image", label: "画像", placement: "右に空枠", query: "現場" },
      imagery: "表紙の右に現場写真",
    });
    expect(section).toContain("描き込まない");
    expect(section).toContain("現場");
    expect(section).toContain("site");

    const result = await generateCanvaPrompt({
      profile: null,
      brief: {
        purpose: "方針発表",
        audience: "",
        copyText: "終わらせる仕事を決める",
        size: "16:9（発表）",
        mood: "",
        imagery: "表紙の右に現場写真",
        notes: "",
      },
      styleStrength: 0,
      references: notes,
    });
    expect(result.prompt).toContain("【参考画像と写真枠】");
    expect(result.prompt).toContain("空の写真枠");
    expect(result.prompt).toContain("ストック写真");
  });
});
