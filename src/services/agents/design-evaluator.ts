import { evaluateGeneratedDesign } from "@/services/ai/designEvaluator";

/** Scores likeness to the current design profile. The number is not a quality rating. */
export const DesignEvaluator = {
  available: true as const,
  evaluate: evaluateGeneratedDesign,
};
