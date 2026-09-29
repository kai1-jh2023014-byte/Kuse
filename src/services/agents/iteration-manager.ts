import { AUTO_IMPROVE_OPTIONS, PHASE_NOTES } from "./phases";

/** Phase 4. Generate → analyze → improve, at most 3 times. Not started until edit args are known. */
export const IterationManager = {
  available: false as const,
  options: AUTO_IMPROVE_OPTIONS,
  defaultLimit: 3 as const,
  todo: PHASE_NOTES.loop,
  run() {
    return { started: false as const, todo: PHASE_NOTES.loop };
  },
};
