import { createDesignProfile } from "@/services/ai/profile";
import { PHASE_NOTES } from "./phases";

/** Owns design_profile updates. Generated Canva designs are not training data. */
export const StyleProfileManager = {
  create: createDesignProfile,
  learnFromApprovedDesign() {
    return { updated: false as const, todo: PHASE_NOTES.approval };
  },
};
