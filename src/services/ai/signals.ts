import {
  colorDistance,
  luminance,
  quantizeChannel,
  rgbToHex,
  rgbToHsl,
  type Rgb,
} from "./color";
import { clamp01 } from "./stats";
import type { Orientation, PaletteColor, RawImageSignals } from "./types";

export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface SignalMeta {
  id: string;
  filename: string;
  width: number;
  height: number;
}

interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
  y: number;
  s: number;
  h: number;
  key: string;
}

export function orientationOf(width: number, height: number): Orientation {
  if (width <= 0 || height <= 0) return "square";
  const ratio = width / height;
  if (ratio > 1.12) return "landscape";
  if (ratio < 0.88) return "portrait";
  return "square";
}

export function computeSignals(raster: Raster, meta: SignalMeta): RawImageSignals {
  const { width, height, data } = raster;
  if (width < 2 || height < 2) {
    throw new Error("画像が小さすぎて読み取れません");
  }

  const pixels: Pixel[] = new Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const a = data[offset + 3] ?? 0;
    const hsl = rgbToHsl(r, g, b);
    const key = `${quantizeChannel(r)}-${quantizeChannel(g)}-${quantizeChannel(b)}`;
    pixels[index] = { r, g, b, a, y: luminance(r, g, b), s: hsl.s, h: hsl.h, key };
  }

  const opaque = pixels.filter((pixel) => pixel.a >= 20);
  const total = pixels.length;
  const border = Math.max(1, Math.round(Math.min(width, height) * 0.08));
  const borderKeys = new Map<string, number>();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= border && x < width - border && y >= border && y < height - border) continue;
      const pixel = pixels[y * width + x];
      if (pixel.a < 20) continue;
      borderKeys.set(pixel.key, (borderKeys.get(pixel.key) ?? 0) + 1);
    }
  }

  let backgroundKey = "";
  let backgroundCount = -1;
  for (const [key, count] of borderKeys) {
    if (count > backgroundCount) {
      backgroundKey = key;
      backgroundCount = count;
    }
  }
  if (!backgroundKey && opaque.length > 0) {
    const allKeys = new Map<string, number>();
    for (const pixel of opaque) allKeys.set(pixel.key, (allKeys.get(pixel.key) ?? 0) + 1);
    for (const [key, count] of allKeys) {
      if (count > backgroundCount) {
        backgroundKey = key;
        backgroundCount = count;
      }
    }
  }

  const backgroundPixels = opaque.filter((pixel) => pixel.key === backgroundKey);
  const backgroundRgb = averageRgb(backgroundPixels);
  const backgroundHsl = rgbToHsl(backgroundRgb.r, backgroundRgb.g, backgroundRgb.b);

  const nearBackground = pixels.map(
    (pixel) => pixel.a < 20 || colorDistance(pixel, backgroundRgb) < 46,
  );
  const ink = pixels.map((pixel, index) => pixel.a >= 20 && !nearBackground[index]);

  let inkCount = 0;
  let sumX = 0;
  let sumY = 0;
  let sumYluma = 0;
  let sumYlumaSq = 0;
  let sumSat = 0;
  let opaqueCount = 0;
  let warm = 0;
  let cool = 0;
  const buckets = new Map<string, { count: number; r: number; g: number; b: number; s: number; l: number }>();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = pixels[y * width + x];
      if (pixel.a < 20) continue;
      opaqueCount += 1;
      sumYluma += pixel.y;
      sumYlumaSq += pixel.y * pixel.y;
      sumSat += pixel.s;
      const bucket = buckets.get(pixel.key) ?? { count: 0, r: 0, g: 0, b: 0, s: 0, l: 0 };
      bucket.count += 1;
      bucket.r += pixel.r;
      bucket.g += pixel.g;
      bucket.b += pixel.b;
      bucket.s += pixel.s;
      bucket.l += rgbToHsl(pixel.r, pixel.g, pixel.b).l;
      buckets.set(pixel.key, bucket);
      if (!ink[y * width + x]) continue;
      inkCount += 1;
      sumX += x;
      sumY += y;
      if (pixel.s >= 0.15) {
        if (pixel.h < 55 || pixel.h > 330) warm += 1;
        else if (pixel.h > 160 && pixel.h < 260) cool += 1;
      }
    }
  }

  const meanLuma = opaqueCount ? sumYluma / opaqueCount : 1;
  const variance = opaqueCount ? Math.max(0, sumYlumaSq / opaqueCount - meanLuma * meanLuma) : 0;
  const contrast = Math.sqrt(variance);
  const brightness = meanLuma;
  const saturation = opaqueCount ? sumSat / opaqueCount : 0;
  const density = inkCount / total;
  const whitespace = 1 - density;
  const backgroundRatio = total === 0 ? 1 : nearBackground.filter(Boolean).length / total;

  const palette: PaletteColor[] = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((bucket) => ({
      hex: rgbToHex({ r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count }),
      ratio: opaqueCount ? bucket.count / opaqueCount : 0,
      saturation: bucket.s / bucket.count,
      lightness: bucket.l / bucket.count,
    }));

  const background: PaletteColor = {
    hex: rgbToHex(backgroundRgb),
    ratio: opaqueCount ? backgroundPixels.length / opaqueCount : 1,
    saturation: backgroundHsl.s,
    lightness: backgroundHsl.l,
  };
  if (!palette.some((color) => color.hex === background.hex)) palette.unshift(background);

  const classified = classifyColors(palette, background.hex);
  const mainColors = classified.mainColors;
  const accentColors =
    classified.accentColors.length > 0
      ? classified.accentColors
      : saturatedAccents(pixels, ink, background.hex, mainColors);
  const grid = inkGrid(ink, width, height);
  const verticalBalance = axisBalance(ink, width, height, "vertical");
  const horizontalBalance = axisBalance(ink, width, height, "horizontal");
  const symmetry = symmetryScore(ink, width, height);
  const neighbor = neighborStats(pixels, ink, nearBackground, width, height);
  const uniqueColorCount = buckets.size;
  const photoScore = clamp01(
    clamp01(neighbor.averageDistance / 55) * 0.55 + clamp01((uniqueColorCount - 6) / 36) * 0.45,
  );
  const text = textStats(neighbor.bandEdge, photoScore);
  const gradientScore = gradientOf(pixels, width, height, neighbor.averageDistance);
  const borderScore = borderOf(ink, width, height, photoScore);
  const illustrationScore = clamp01(
    (1 - photoScore) *
      clamp01((uniqueColorCount - 4) / 10) *
      clamp01((40 - uniqueColorCount) / 40),
  );

  return {
    id: meta.id,
    filename: meta.filename,
    width: meta.width,
    height: meta.height,
    palette,
    background,
    mainColors,
    accentColors,
    brightness,
    saturation,
    contrast,
    whitespace,
    density,
    symmetry,
    verticalBalance,
    horizontalBalance,
    grid,
    photoScore,
    illustrationScore,
    gradientScore,
    shadowScore: neighbor.shadowScore,
    borderScore,
    edgeDensity: neighbor.edgeDensity,
    textScore: text.textScore,
    titleDominance: text.titleDominance,
    uniqueColorCount,
    warmCool: inkCount ? (warm - cool) / inkCount : 0,
    backgroundRatio,
    inkCenter: {
      x: inkCount ? sumX / inkCount / Math.max(1, width - 1) : 0.5,
      y: inkCount ? sumY / inkCount / Math.max(1, height - 1) : 0.5,
    },
    orientation: orientationOf(meta.width, meta.height),
  };
}

function averageRgb(pixels: Pixel[]): Rgb {
  if (pixels.length === 0) return { r: 255, g: 255, b: 255 };
  let r = 0;
  let g = 0;
  let b = 0;
  for (const pixel of pixels) {
    r += pixel.r;
    g += pixel.g;
    b += pixel.b;
  }
  return { r: r / pixels.length, g: g / pixels.length, b: b / pixels.length };
}

function classifyColors(palette: PaletteColor[], backgroundHex: string): {
  mainColors: string[];
  accentColors: string[];
} {
  const others = palette.filter(
    (color) => color.hex !== backgroundHex && colorDistanceHex(color.hex, backgroundHex) >= 42 && color.ratio > 0.004,
  );
  const mainColors = [...others]
    .filter((color) => color.ratio >= 0.045)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 2)
    .map((color) => color.hex);
  const accentColors = others
    .filter((color) => !mainColors.includes(color.hex) && color.ratio <= 0.22 && color.saturation >= 0.28)
    .sort((a, b) => b.saturation - a.saturation || a.ratio - b.ratio)
    .slice(0, 2)
    .map((color) => color.hex);
  return { mainColors, accentColors };
}

function saturatedAccents(pixels: Pixel[], ink: boolean[], backgroundHex: string, mainColors: string[]): string[] {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number; s: number }>();
  pixels.forEach((pixel, index) => {
    if (!ink[index] || pixel.s < 0.45) return;
    const bucket = buckets.get(pixel.key) ?? { count: 0, r: 0, g: 0, b: 0, s: 0 };
    bucket.count += 1;
    bucket.r += pixel.r;
    bucket.g += pixel.g;
    bucket.b += pixel.b;
    bucket.s += pixel.s;
    buckets.set(pixel.key, bucket);
  });
  return [...buckets.values()]
    .map((bucket) => ({
      hex: rgbToHex({ r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count }),
      saturation: bucket.s / bucket.count,
    }))
    .filter(
      (item) =>
        item.saturation >= 0.45 &&
        colorDistanceHex(item.hex, backgroundHex) > 50 &&
        mainColors.every((hex) => colorDistanceHex(item.hex, hex) > 36),
    )
    .sort((a, b) => b.saturation - a.saturation)
    .slice(0, 2)
    .map((item) => item.hex);
}

function colorDistanceHex(a: string, b: string): number {
  const parse = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  };
  if (!a.startsWith("#") || !b.startsWith("#")) return 999;
  return colorDistance(parse(a), parse(b));
}

function inkGrid(ink: boolean[], width: number, height: number): number[][] {
  const grid = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!ink[y * width + x]) continue;
      const col = Math.min(2, Math.floor((x / width) * 3));
      const row = Math.min(2, Math.floor((y / height) * 3));
      grid[row][col] += 1;
      total += 1;
    }
  }
  if (total === 0) return grid;
  return grid.map((row) => row.map((value) => value / total));
}

function axisBalance(ink: boolean[], width: number, height: number, axis: "vertical" | "horizontal"): number {
  let low = 0;
  let high = 0;
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!ink[y * width + x]) continue;
      total += 1;
      if (axis === "vertical") {
        if (y < height / 3) low += 1;
        else if (y >= (height * 2) / 3) high += 1;
      } else if (x < width / 3) low += 1;
      else if (x >= (width * 2) / 3) high += 1;
    }
  }
  if (total === 0) return 0;
  return (high - low) / total;
}

function symmetryScore(ink: boolean[], width: number, height: number): number {
  const columns = 12;
  const rows = 12;
  const cells = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!ink[y * width + x]) continue;
      const col = Math.min(columns - 1, Math.floor((x / width) * columns));
      const row = Math.min(rows - 1, Math.floor((y / height) * rows));
      cells[row][col] += 1;
    }
  }
  let diff = 0;
  let total = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns / 2; x += 1) {
      const left = cells[y][x];
      const right = cells[y][columns - 1 - x];
      diff += Math.abs(left - right);
      total += left + right;
    }
  }
  if (total === 0) return 1;
  return clamp01(1 - diff / total);
}

function neighborStats(
  pixels: Pixel[],
  ink: boolean[],
  nearBackground: boolean[],
  width: number,
  height: number,
): { averageDistance: number; edgeDensity: number; shadowScore: number; bandEdge: number[] } {
  let distance = 0;
  let distanceCount = 0;
  let edge = 0;
  let edgeCount = 0;
  let soft = 0;
  let hard = 0;
  const bands = 8;
  const bandEdge = Array.from({ length: bands }, () => 0);
  const bandCount = Array.from({ length: bands }, () => 0);

  const at = (x: number, y: number) => pixels[y * width + x];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = at(x, y);
      const band = Math.min(bands - 1, Math.floor((y / height) * bands));
      if (x + 1 < width) {
        const right = at(x + 1, y);
        const dist = colorDistance(pixel, right);
        distance += dist;
        distanceCount += 1;
        const lumaDelta = Math.abs(pixel.y - right.y);
        edge += lumaDelta;
        edgeCount += 1;
        bandEdge[band] += lumaDelta;
        bandCount[band] += 1;
        const index = y * width + x;
        const rightIndex = y * width + x + 1;
        if (ink[index] !== ink[rightIndex] || nearBackground[index] !== nearBackground[rightIndex]) {
          if (lumaDelta > 0.08 && lumaDelta < 0.28) soft += 1;
          else if (lumaDelta >= 0.28) hard += 1;
        }
      }
      if (y + 1 < height) {
        const below = at(x, y + 1);
        const lumaDelta = Math.abs(pixel.y - below.y);
        edge += lumaDelta;
        edgeCount += 1;
      }
    }
  }

  return {
    averageDistance: distanceCount ? distance / distanceCount : 0,
    edgeDensity: edgeCount ? edge / edgeCount : 0,
    shadowScore: soft + hard === 0 ? 0 : soft / (soft + hard),
    bandEdge: bandEdge.map((value, index) => (bandCount[index] ? value / bandCount[index] : 0)),
  };
}

function textStats(bandEdge: number[], photoScore: number): { textScore: number; titleDominance: number } {
  const mean = bandEdge.reduce((sum, value) => sum + value, 0) / Math.max(1, bandEdge.length);
  const max = Math.max(...bandEdge, 0);
  const titleDominance = max / (mean + 0.01);
  let peaks = 0;
  for (let index = 0; index < bandEdge.length; index += 1) {
    const value = bandEdge[index];
    const previous = bandEdge[index - 1] ?? 0;
    const next = bandEdge[index + 1] ?? 0;
    if (value > mean * 1.35 && value >= previous && value >= next) peaks += 1;
  }
  const raw =
    clamp01(mean / 0.16) * 0.4 +
    clamp01(peaks / 3) * 0.35 +
    clamp01((titleDominance - 1) / 1.8) * 0.25;
  return {
    titleDominance,
    textScore: clamp01(raw * (1 - photoScore * 0.75)),
  };
}

function gradientOf(pixels: Pixel[], width: number, height: number, neighborDistance: number): number {
  const sample = (x0: number, y0: number, x1: number, y1: number): Rgb => {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const pixel = pixels[y * width + x];
        if (pixel.a < 20) continue;
        r += pixel.r;
        g += pixel.g;
        b += pixel.b;
        count += 1;
      }
    }
    if (count === 0) return { r: 255, g: 255, b: 255 };
    return { r: r / count, g: g / count, b: b / count };
  };
  const sx = Math.max(1, Math.round(width * 0.18));
  const sy = Math.max(1, Math.round(height * 0.18));
  const corners = [
    sample(0, 0, sx, sy),
    sample(width - sx, 0, width, sy),
    sample(0, height - sy, sx, height),
    sample(width - sx, height - sy, width, height),
  ];
  let spread = 0;
  let pairs = 0;
  for (let i = 0; i < corners.length; i += 1) {
    for (let j = i + 1; j < corners.length; j += 1) {
      spread += colorDistance(corners[i], corners[j]);
      pairs += 1;
    }
  }
  const averageSpread = pairs ? spread / pairs : 0;
  const smooth = clamp01((26 - neighborDistance) / 26);
  return clamp01(averageSpread / 90) * smooth;
}

function borderOf(ink: boolean[], width: number, height: number, photoScore: number): number {
  const frame = Math.max(1, Math.round(Math.min(width, height) * 0.08));
  let frameInk = 0;
  let frameCount = 0;
  let innerInk = 0;
  let innerCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onFrame = x < frame || y < frame || x >= width - frame || y >= height - frame;
      if (onFrame) {
        frameCount += 1;
        if (ink[y * width + x]) frameInk += 1;
      } else {
        innerCount += 1;
        if (ink[y * width + x]) innerInk += 1;
      }
    }
  }
  const frameRatio = frameCount ? frameInk / frameCount : 0;
  const innerRatio = innerCount ? innerInk / innerCount : 0;
  if (frameRatio > 0.08 && frameRatio < 0.65 && innerRatio < 0.35 && photoScore < 0.5) {
    return clamp01(frameRatio * 1.4);
  }
  return clamp01(frameRatio * 0.3);
}
