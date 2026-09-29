import { PHASE_NOTES } from "./phases";

/** Phase 3. Turns an evaluation into structured edits and the next Canva prompt. */
export const ImprovementGenerator = {
  available: false as const,
  todo: PHASE_NOTES.improvement,
};
