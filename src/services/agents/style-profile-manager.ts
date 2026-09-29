import { applyApprovedTraits, proposeProfileAdditions } from "@/services/ai/profile-learning";
import { createDesignProfile } from "@/services/ai/profile";

/** Owns design_profile updates. Generated designs are not training data until the user approves. */
export const StyleProfileManager = {
  create: createDesignProfile,
  propose: proposeProfileAdditions,
  applyApproved: applyApprovedTraits,
};
