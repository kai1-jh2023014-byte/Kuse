import type { RawImageSignals } from "./types";

export function summarizeSignals(signals: RawImageSignals): string {
  const parts: string[] = [];
  if (signals.brightness < 0.38) parts.push("暗め");
  else if (signals.brightness > 0.72) parts.push("明るめ");
  else parts.push("中間の明度");

  if (signals.verticalBalance < -0.14) parts.push("上寄り");
  else if (signals.verticalBalance > 0.14) parts.push("下寄り");

  if (signals.horizontalBalance < -0.14) parts.push("左寄り");
  else if (signals.horizontalBalance > 0.14) parts.push("右寄り");
  else if (signals.symmetry > 0.8) parts.push("中央");

  if (signals.whitespace > 0.45) parts.push("余白が大きい");
  else if (signals.whitespace < 0.28) parts.push("密度が高い");

  if (signals.photoScore > 0.58) parts.push("写真寄り");
  else parts.push("フラット");

  return parts.slice(0, 4).join(" · ");
}
