import { generateCanvaPrompt, refinePrompt } from "@/services/ai/prompt";

/** Builds the natural-language brief that Canva generation receives. */
export const PromptGenerator = {
  generate: generateCanvaPrompt,
  refine: refinePrompt,
};
