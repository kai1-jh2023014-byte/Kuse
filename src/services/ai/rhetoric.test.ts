import { describe, expect, it } from "vitest";
import { classifySlide, emphasisScore, isPhotoSparse, readDeckBeats } from "./rhetoric";
import type { RawImageSignals } from "./types";

function signal(over: Partial<RawImageSignals>): RawImageSignals {
  return {
    id: "x",
    filename: "x.png",
    width: 1920,
    height: 1080,
    palette: [{ hex: "#111111", ratio: 1, saturation: 0, lightness: 0.1 }],
    background: { hex: "#111111", ratio: 1, saturation: 0, lightness: 0.1 },
    mainColors: ["#ffffff"],
    accentColors: [],
    brightness: 0.3,
    saturation: 0.1,
    contrast: 0.2,
    whitespace: 0.4,
    density: 0.4,
    symmetry: 0.5,
    verticalBalance: 0,
    horizontalBalance: 0,
    grid: [
      [0.3, 0.3, 0.3],
      [0.3, 0.3, 0.3],
      [0.3, 0.3, 0.3],
    ],
    photoScore: 0.2,
    illustrationScore: 0.2,
    gradientScore: 0.1,
    shadowScore: 0.1,
    borderScore: 0.1,
    edgeDensity: 0.12,
    textScore: 0.3,
    titleDominance: 1.2,
    uniqueColorCount: 8,
    warmCool: 0,
    backgroundRatio: 0.5,
    inkCenter: { x: 0.5, y: 0.4 },
    orientation: "landscape",
    ...over,
  };
}

describe("rhetoric", () => {
  it("reads a photo-sparse slide as emphasis and a dense text slide as a list", () => {
    const photo = signal({ photoScore: 0.8, textScore: 0.15, whitespace: 0.6, contrast: 0.3 });
    const list = signal({ photoScore: 0.1, textScore: 0.65, density: 0.55, whitespace: 0.25, edgeDensity: 0.12 });
    expect(isPhotoSparse(photo)).toBe(true);
    const scores = [0.2, 0.4, 0.8, 0.2];
    expect(classifySlide(photo, 2, 4, scores)).toBe("peak-photo");
    expect(classifySlide(list, 1, 4, scores)).toBe("explain-list");
  });

  it("builds an emotional arc from upload order", () => {
    const beats = readDeckBeats([
      signal({ whitespace: 0.75, contrast: 0.1, titleDominance: 1, textScore: 0.2, photoScore: 0.1 }),
      signal({ photoScore: 0.1, textScore: 0.6, density: 0.55, whitespace: 0.25, edgeDensity: 0.1 }),
      signal({ photoScore: 0.8, textScore: 0.15, whitespace: 0.55, contrast: 0.35 }),
      signal({ whitespace: 0.72, contrast: 0.1, titleDominance: 1, textScore: 0.18, photoScore: 0.1 }),
    ]);
    expect(beats.map((beat) => beat.job)).toEqual(["open", "explain-list", "peak-photo", "land"]);
    expect(beats[2]?.feeling).toContain("動かされている");
    expect(emphasisScore(beats.length ? signal({ contrast: 0.4, titleDominance: 2 }) : signal({}))).toBeGreaterThan(0);
  });
});
