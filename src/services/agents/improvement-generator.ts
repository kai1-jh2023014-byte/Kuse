import { generateImprovementPrompt } from "@/services/ai/improvementGenerator";

/** Turns an evaluation into a revision prompt that keeps the matching parts. */
export const ImprovementGenerator = {
  available: true as const,
  generate: generateImprovementPrompt,
};
