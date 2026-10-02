import type { RawImageSignals } from "./types";

export type RhetoricJob =
  | "open"
  | "rest"
  | "explain-list"
  | "explain-diagram"
  | "peak-photo"
  | "peak-type"
  | "land";

export interface DeckBeat {
  index: number;
  job: RhetoricJob;
  jobLabel: string;
  feeling: string;
  treatment: string;
  why: string;
}

const JOB_LABEL: Record<RhetoricJob, string> = {
  open: "入口",
  rest: "間",
  "explain-list": "整理",
  "explain-diagram": "図解",
  "peak-photo": "山（写真）",
  "peak-type": "山（文字）",
  land: "着地",
};

const FEELING: Record<RhetoricJob, string> = {
  open: "まだ自分の話だと思っていない",
  rest: "息を吸っている",
  "explain-list": "整理して理解している",
  "explain-diagram": "関係が見えている",
  "peak-photo": "一点に動かされている",
  "peak-type": "一点に動かされている",
  land: "持って帰るものが残る",
};

export function emphasisScore(signal: RawImageSignals): number {
  return signal.titleDominance * 0.35 + signal.contrast * 1.1 + (1 - signal.whitespace) * 0.45 + signal.textScore * 0.2 + signal.photoScore * 0.15;
}

export function isPhotoSparse(signal: RawImageSignals): boolean {
  return signal.photoScore > 0.52 && signal.textScore < 0.4 && signal.whitespace > 0.36;
}

export function isTypePeak(signal: RawImageSignals): boolean {
  return signal.titleDominance > 1.7 && signal.contrast > 0.22 && signal.photoScore < 0.45;
}

export function isListExplain(signal: RawImageSignals): boolean {
  return signal.textScore > 0.4 && signal.density > 0.4 && signal.photoScore < 0.48 && signal.edgeDensity < 0.38;
}

export function isDiagramExplain(signal: RawImageSignals): boolean {
  return signal.edgeDensity > 0.28 && signal.textScore >= 0.2 && signal.textScore <= 0.55 && (signal.illustrationScore > 0.28 || signal.photoScore > 0.28);
}

export function classifySlide(
  signal: RawImageSignals,
  index: number,
  total: number,
  scores: number[],
): RhetoricJob {
  const peak = Math.max(...scores);
  const loud = scores[index] >= peak - 0.08 && peak - Math.min(...scores) >= 0.18;
  const first = index === 0;
  const last = index === total - 1;

  if (isPhotoSparse(signal) && (!first || loud)) return "peak-photo";
  if (loud && isTypePeak(signal)) return "peak-type";
  if (first && signal.whitespace > 0.48 && !loud) return "open";
  if (last && scores[index] <= peak - 0.14) return "land";
  if (isDiagramExplain(signal)) return "explain-diagram";
  if (isListExplain(signal)) return "explain-list";
  if (signal.whitespace > 0.52 && !loud) return first ? "open" : last ? "land" : "rest";
  return "rest";
}

export function readDeckBeats(signals: RawImageSignals[]): DeckBeat[] {
  if (signals.length === 0) return [];
  const scores = signals.map(emphasisScore);
  return signals.map((signal, index) => {
    const job = classifySlide(signal, index, signals.length, scores);
    return {
      index,
      job,
      jobLabel: JOB_LABEL[job],
      feeling: FEELING[job],
      treatment: treatmentLine(job),
      why: whyLine(job, signal),
    };
  });
}

export function arcSentence(beats: DeckBeat[]): string {
  if (beats.length === 0) return "";
  const steps = beats.map((beat) => `${beat.index + 1}枚目は${beat.feeling}（${beat.jobLabel}）`);
  return `見る人は、${steps.join("→")}と動く。この起伏を1枚の装飾で均さない。`;
}

export function jobsVary(beats: DeckBeat[]): boolean {
  return new Set(beats.map((beat) => beat.job)).size >= 2;
}

function treatmentLine(job: RhetoricJob): string {
  if (job === "peak-photo") return "背景を写真にし、文字は少なく大きく";
  if (job === "peak-type") return "写真より文字の大小とコントラストで山を置く";
  if (job === "explain-list") return "箇条書きや短い行で、一度に理解させる";
  if (job === "explain-diagram") return "図・線・配置で関係を見せる";
  if (job === "open") return "余白を残し、説明を始めない";
  if (job === "land") return "要約リストにせず、余韻を残す";
  return "力を入れず、前後の気持ちを渡す";
}

function whyLine(job: RhetoricJob, signal: RawImageSignals): string {
  if (job === "peak-photo") {
    return "強調したいところで写真を全面に近い背景にし、文字量を落としている。情報を増やすのではなく、一点だけ残すため。";
  }
  if (job === "peak-type") {
    return "強調したいところで文字を大きくし、コントラストを上げている。写真で盛り上げるのではなく、読む強さで動かしている。";
  }
  if (job === "explain-list") {
    return "理解させたいところで文字の塊（箇条書きに近い密度）を使っている。雰囲気より、項目が同時に見えることを優先している。";
  }
  if (job === "explain-diagram") {
    return "理解させたいところで線や図の密度が上がっている。文章を増やすより、関係を一目で渡すため。";
  }
  if (job === "open") {
    return "入口は余白が多く、文字も写真も主張しすぎない。相手がまだ自分の話だと思っていない状態を壊さないため。";
  }
  if (job === "land") {
    return "最後は山より余白を戻している。箇条書きの要約で埋めず、持って帰る気持ちを一つ残すため。";
  }
  return signal.whitespace > 0.45
    ? "この枚は余白を残して力を抜いている。前後の感情を渡すための間。"
    : "この枚は情報を渡しているが、山にはしていない。";
}
