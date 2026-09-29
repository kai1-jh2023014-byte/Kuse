import { FEEDBACK_PRESETS, PHASE_NOTES } from "./phases";

/** Phase 5. User feedback feeds the next prompt. Only an explicit "this is me" updates the profile. */
export const FeedbackManager = {
  available: false as const,
  presets: FEEDBACK_PRESETS,
  todo: PHASE_NOTES.feedback,
  record() {
    return { stored: false as const, todo: PHASE_NOTES.feedback };
  },
};
