export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) => clampByte(value).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function hexDistance(a: string, b: string): number {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return colorDistance(left, right);
}

export function nearHex(a: string, b: string, threshold = 42): boolean {
  return hexDistance(a, b) < threshold;
}

export function hueDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}

export function hueOf(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (s < 0.25) return null;
  return h;
}

/** Dark edges of a red bar are the same accent, not a second color. */
export function sameHueFamily(a: string, b: string): boolean {
  const left = hueOf(a);
  const right = hueOf(b);
  if (left == null || right == null) return false;
  return hueDistance(left, right) < 32;
}

export function collapseHueFamily(colors: string[]): string[] {
  const kept: string[] = [];
  for (const hex of colors) {
    const index = kept.findIndex((existing) => sameHueFamily(existing, hex));
    if (index === -1) {
      kept.push(hex);
      continue;
    }
    if (lightnessOf(hex) > lightnessOf(kept[index])) kept[index] = hex;
  }
  return kept;
}

function lightnessOf(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return rgbToHsl(rgb.r, rgb.g, rgb.b).l;
}

export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / delta + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  return { h: h * 60, s, l };
}

export function describeColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "不明な色";
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (l > 0.93) return "ほぼ白";
  if (l < 0.08) return "ほぼ黒";
  if (s < 0.12) {
    if (l > 0.82) return "生成りに近い白";
    if (l > 0.62) return "明るいグレー";
    if (l > 0.38) return "グレー";
    return "暗いグレー";
  }
  if (h >= 35 && h <= 70 && s < 0.4 && l > 0.75) return "生成り";

  let name = "赤";
  if (h < 18 || h >= 345) name = "赤";
  else if (h < 42) name = "橙";
  else if (h < 70) name = "黄";
  else if (h < 160) name = "緑";
  else if (h < 190) name = "青緑";
  else if (h < 255) name = "青";
  else if (h < 295) name = "紫";
  else name = "赤紫";

  const tone = l < 0.32 ? "暗い" : l > 0.74 ? "明るい" : "";
  const muted = s < 0.38 ? "くすんだ" : "";
  return [muted, tone, name].filter(Boolean).join("");
}

export function quantizeChannel(value: number, step = 24): number {
  return Math.max(0, Math.min(255, Math.round(value / step) * step));
}
