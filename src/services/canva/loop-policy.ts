import type { DesignEvaluation } from "@/services/ai/evaluation-types";

/** Default generations in one user-visible run. The user can pick another count. */
export const DEFAULT_LOOP_LIMIT = 1;
export const MIN_LOOP_LIMIT = 1;
export const MAX_LOOP_LIMIT = 10;
export const LOOP_LIMIT_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10] as const;
/** @deprecated Use DEFAULT_LOOP_LIMIT or a user-chosen clampLoopLimit value. */
export const LOOP_LIMIT = DEFAULT_LOOP_LIMIT;

export function clampLoopLimit(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : DEFAULT_LOOP_LIMIT;
  if (!Number.isFinite(n)) return DEFAULT_LOOP_LIMIT;
  return Math.min(MAX_LOOP_LIMIT, Math.max(MIN_LOOP_LIMIT, Math.round(n)));
}

/**
 * Stop when likeness is high and nothing is badly off the saved habits.
 * style_similarity is closeness to the profile, not a quality score.
 */
export const LIKENESS_BAR = 72;

export function readyToShow(analysis: Pick<DesignEvaluation, "style_similarity" | "improvements">): boolean {
  const badlyOff = analysis.improvements.some((item) => item.priority === "high");
  return analysis.style_similarity >= LIKENESS_BAR && !badlyOff;
}

export function nextLoopAction(input: {
  round: number;
  hasProfile: boolean;
  analysis: Pick<DesignEvaluation, "style_similarity" | "improvements"> | null;
  limit?: number;
}): "show" | "improve" {
  const limit = clampLoopLimit(input.limit ?? DEFAULT_LOOP_LIMIT);
  if (!input.hasProfile || !input.analysis) return "show";
  if (readyToShow(input.analysis)) return "show";
  if (input.round >= limit) return "show";
  return "improve";
}

export function loopReason(input: {
  reached: boolean;
  rounds: number;
  similarity: number | null;
  hasProfile: boolean;
  stoppedEarly: boolean;
}): string {
  if (!input.hasProfile) return "デザインプロファイルがないので近さを測れず、最初の結果を表示します。";
  if (input.stoppedEarly) return "次の生成ができなかったので、そこまでの結果を表示します。";
  if (input.reached) {
    return `高い優先度のずれがなく、KUSEスタイル一致度が${input.similarity ?? 0}だったので表示します。これは出来ではなく、保存した癖への近さです。`;
  }
  return `${input.rounds}回まで改善しました。まだ癖からずれる箇所があるので、ここまでのいちばん近い結果を表示します。一致度は出来の点数ではありません。`;
}
