import { FEEDBACK_PRESETS } from "./phases";

/** Feedback is stored on the Canva version and passed into the next improvement prompt. */
export const FeedbackManager = {
  available: true as const,
  presets: FEEDBACK_PRESETS,
  note: "指摘は回数を数えて残す。同じ指摘が2回以上になると次の生成と避けたいことに入る。1回の生成では色のプロファイルは置き換えない。",
};
