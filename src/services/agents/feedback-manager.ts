import { FEEDBACK_PRESETS } from "./phases";

/** Feedback is stored on the Canva version and passed into the next improvement prompt. */
export const FeedbackManager = {
  available: true as const,
  presets: FEEDBACK_PRESETS,
  note: "「自分らしい」と「ここが違う」はバージョンに保存する。design_profile は承認まで更新しない。",
};
