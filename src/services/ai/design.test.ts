import { describe, expect, it } from "vitest";
import { createDesignProfile } from "./profile";
import { generateCanvaPrompt, refinePrompt } from "./prompt";
import { computeSignals, type Raster } from "./signals";
import type { DesignBrief, ImageAnalysis, RawImageSignals } from "./types";

const brief: DesignBrief = {
  purpose: "ゲームイベントの告知ポスターを作りたい",
  audience: "20代のインディーゲームファン",
  copyText: "NIGHT MARKET\n9.29 SAT 18:00",
  size: "A3（縦）",
  mood: "夜の熱量",
  imagery: "会場写真は使わない",
  notes: "",
};

function poster(id: string, over: Partial<RawImageSignals> = {}): RawImageSignals {
  return {
    id,
    filename: `${id}.png`,
    width: 800,
    height: 1000,
    palette: [
      { hex: "#16181d", ratio: 0.72, saturation: 0.08, lightness: 0.1 },
      { hex: "#f4f0e6", ratio: 0.2, saturation: 0.15, lightness: 0.93 },
      { hex: "#e23b2a", ratio: 0.05, saturation: 0.75, lightness: 0.52 },
    ],
    background: { hex: "#16181d", ratio: 0.72, saturation: 0.08, lightness: 0.1 },
    mainColors: ["#f4f0e6"],
    accentColors: ["#e23b2a"],
    brightness: 0.22,
    saturation: 0.16,
    contrast: 0.34,
    whitespace: 0.62,
    density: 0.38,
    symmetry: 0.48,
    verticalBalance: -0.45,
    horizontalBalance: -0.32,
    grid: [
      [0.55, 0.2, 0.02],
      [0.08, 0.04, 0.01],
      [0.06, 0.03, 0.01],
    ],
    photoScore: 0.08,
    illustrationScore: 0.2,
    gradientScore: 0.05,
    shadowScore: 0.12,
    borderScore: 0.08,
    edgeDensity: 0.12,
    textScore: 0.62,
    titleDominance: 2.4,
    uniqueColorCount: 6,
    warmCool: 0.05,
    backgroundRatio: 0.72,
    inkCenter: { x: 0.32, y: 0.24 },
    orientation: "portrait",
    ...over,
  };
}

function analysis(signals: RawImageSignals, at: string): ImageAnalysis {
  return {
    id: signals.id,
    filename: signals.filename,
    width: signals.width,
    height: signals.height,
    analyzedAt: at,
    signals,
  };
}

function paint(
  width: number,
  height: number,
  painter: (x: number, y: number) => [number, number, number, number],
): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = painter(x, y);
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    }
  }
  return { width, height, data };
}

describe("createDesignProfile", () => {
  it("does not treat a single image as a confirmed habit", () => {
    const profile = createDesignProfile([analysis(poster("only"), "2026-01-01T00:00:00.000Z")], null);
    expect(profile.sampleCount).toBe(1);
    expect(profile.personal_tendencies.length).toBeGreaterThan(0);
    expect(profile.personal_tendencies.every((item) => item.confidence < 0.55)).toBe(true);
    expect(profile.personal_tendencies[0]?.evidence).toContain("1点");
    expect(profile.narrative).toContain("1点");
  });

  it("finds shared habits across similar works and keeps them when a new work shifts the average", () => {
    const first = createDesignProfile(
      ["a", "b", "c", "d"].map((id, index) => analysis(poster(id), `2026-01-0${index + 1}T00:00:00.000Z`)),
      null,
    );
    expect(first.personal_tendencies.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "layout.top",
        "layout.generous-space",
        "color.dark-ground",
        "color.high-contrast",
        "color.single-accent",
        "visual.little-decoration",
      ]),
    );
    expect(first.personal_tendencies.find((item) => item.id === "layout.top")?.evidence).toBe("4点中4点");

    const shifted = poster("e", {
      brightness: 0.82,
      saturation: 0.4,
      contrast: 0.18,
      whitespace: 0.3,
      background: { hex: "#f7f4ee", ratio: 0.55, saturation: 0.05, lightness: 0.95 },
      mainColors: ["#203040"],
      accentColors: ["#3a7bd5", "#e2a53a"],
      verticalBalance: 0.02,
      horizontalBalance: 0.02,
      symmetry: 0.9,
      photoScore: 0.72,
      textScore: 0.2,
      titleDominance: 1.05,
      gradientScore: 0.5,
      shadowScore: 0.2,
      borderScore: 0.1,
      uniqueColorCount: 80,
      backgroundRatio: 0.4,
      inkCenter: { x: 0.5, y: 0.5 },
      grid: [
        [0.1, 0.12, 0.1],
        [0.12, 0.16, 0.12],
        [0.08, 0.12, 0.08],
      ],
      palette: [
        { hex: "#f7f4ee", ratio: 0.55, saturation: 0.05, lightness: 0.95 },
        { hex: "#203040", ratio: 0.2, saturation: 0.3, lightness: 0.2 },
      ],
    });
    const next = createDesignProfile(
      [
        ...["a", "b", "c", "d"].map((id, index) => analysis(poster(id), `2026-01-0${index + 1}T00:00:00.000Z`)),
        analysis(shifted, "2026-02-01T00:00:00.000Z"),
      ],
      first,
    );

    expect(next.personal_tendencies.some((item) => item.id === "color.dark-ground")).toBe(true);
    expect(next.personal_tendencies.some((item) => item.id === "layout.top")).toBe(true);
    expect(next.changelog.some((line) => line.includes("明るく寄り"))).toBe(true);
    expect(next.sampleCount).toBe(5);
    expect(next.changelog.some((line) => line.includes("新しい1点"))).toBe(true);
  });
});

describe("prompts", () => {
  const profile = createDesignProfile(
    ["a", "b", "c", "d"].map((id, index) => analysis(poster(id), `2026-01-0${index + 1}T00:00:00.000Z`)),
    null,
  );

  it("weaves personal habits into a strong prompt and keeps them out of a generic one", async () => {
    const strong = await generateCanvaPrompt({ profile, brief, styleStrength: 100 });
    const generic = await generateCanvaPrompt({ profile, brief, styleStrength: 0 });

    expect(strong.prompt).toContain("【目的】");
    expect(strong.prompt).toContain("ゲームイベントの告知ポスター");
    expect(strong.prompt).toContain("NIGHT MARKET");
    expect(strong.prompt).toContain("画面の上部に主要な情報を集め");
    expect(strong.prompt.toLowerCase()).toContain("#16181d");
    expect(strong.prompt).toContain("100 / 100");

    expect(generic.prompt).toContain("一般的");
    expect(generic.prompt).not.toContain("画面の上部に主要な情報を集め");
    expect(generic.prompt).not.toMatch(/#[0-9a-f]{6}/i);
    expect(generic.mode).toBe("heuristic");
  });

  it("regenerates from the same profile when asked for more whitespace", async () => {
    const result = await refinePrompt({
      profile,
      brief,
      styleStrength: 70,
      currentPrompt: "old",
      instruction: "余白を増やす",
    });
    expect(result.prompt).toContain("さらに広く");
    expect(result.prompt).toContain("余白を増やす");
    expect(result.prompt).toContain("【レイアウト】");
    expect(result.styleStrength).toBe(70);
  });

  it("raises personal strength when asked to look more like the user", async () => {
    const result = await refinePrompt({
      profile,
      brief,
      styleStrength: 50,
      currentPrompt: "old",
      instruction: "もっと自分らしく",
    });
    expect(result.styleStrength).toBe(75);
    expect(result.prompt).toContain("75 / 100");
  });
});

describe("computeSignals", () => {
  it("reads a dark, top-weighted, flat poster", () => {
    const raster = paint(60, 80, (x, y) => {
      if (y >= 2 && y <= 5 && x >= 4 && x <= 20) return [226, 59, 42, 255];
      if (y >= 8 && y <= 24 && x >= 4 && x <= 36 && y % 3 !== 0) return [244, 240, 230, 255];
      if (y >= 70 && y <= 74 && x >= 4 && x <= 22) return [226, 59, 42, 255];
      return [22, 24, 29, 255];
    });
    const signals = computeSignals(raster, {
      id: "raster",
      filename: "raster.png",
      width: 800,
      height: 1000,
    });
    expect(signals.brightness).toBeLessThan(0.45);
    expect(signals.whitespace).toBeGreaterThan(0.5);
    expect(signals.verticalBalance).toBeLessThan(0);
    expect(signals.horizontalBalance).toBeLessThan(0);
    expect(signals.photoScore).toBeLessThan(0.4);
    expect(signals.contrast).toBeGreaterThan(0.18);
    expect(signals.accentColors.length + signals.mainColors.length).toBeGreaterThan(0);
  });
});
