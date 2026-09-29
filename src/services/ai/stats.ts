export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function recencyWeights(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [1];
  return Array.from({ length: count }, (_, index) => 0.62 + (0.38 * index) / (count - 1));
}

export function weightedMean(values: number[], weights: number[]): number {
  let weighted = 0;
  let total = 0;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const weight = weights[index] ?? 0;
    weighted += value * weight;
    total += weight;
  });
  return total === 0 ? 0 : weighted / total;
}

export interface Support {
  ratio: number;
  count: number;
  total: number;
}

export function measureSupport(flags: boolean[], weights: number[]): Support {
  let weighted = 0;
  let totalWeight = 0;
  let count = 0;
  flags.forEach((flag, index) => {
    const weight = weights[index] ?? 0;
    totalWeight += weight;
    if (flag) {
      weighted += weight;
      count += 1;
    }
  });
  return {
    ratio: totalWeight === 0 ? 0 : weighted / totalWeight,
    count,
    total: flags.length,
  };
}

export function confidenceFrom(support: Support): number {
  const sampleFactor = 1 - Math.exp(-support.total / 2.2);
  return clamp01(support.ratio * sampleFactor);
}

export function evidenceFor(support: Support, provisional: boolean): string {
  if (provisional) return "1点のみ。まだ癖とは断定できない";
  return `${support.total}点中${support.count}点`;
}

export function isEstablished(support: Support): boolean {
  return support.total >= 2 && support.count >= 2 && support.ratio >= 0.6;
}

export function isProvisional(support: Support, flags: boolean[]): boolean {
  return support.total === 1 && Boolean(flags[0]);
}
