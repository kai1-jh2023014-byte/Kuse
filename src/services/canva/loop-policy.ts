import type { DesignEvaluation } from "@/services/ai/evaluation-types";

/** One user-visible run generates at most this many times. */
export const LOOP_LIMIT = 3;

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
}): "show" | "improve" {
  if (!input.hasProfile || !input.analysis) return "show";
  if (readyToShow(input.analysis)) return "show";
  if (input.round >= LOOP_LIMIT) return "show";
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
