import { apiErrorResponse } from "@/lib/api";
import { PromptGenerator } from "@/services/agents/prompt-generator";
import { asDeckSummary, asProfile, asReferences, asSlideCount, asSlideRole, clampStrength, sanitizeBrief } from "@/services/ai/validate";
import { AnalysisError } from "@/services/ai/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      profile?: unknown;
      brief?: unknown;
      styleStrength?: unknown;
      currentPrompt?: unknown;
      instruction?: unknown;
      slideRole?: unknown;
      slideCount?: unknown;
      deck?: unknown;
      references?: unknown;
    };
    if (typeof body.instruction !== "string") throw new AnalysisError("調整の内容を書いてください");
    const slideRole = asSlideRole(body.slideRole);
    const result = await PromptGenerator.refine({
      profile: asProfile(body.profile),
      brief: sanitizeBrief(body.brief),
      styleStrength: clampStrength(body.styleStrength),
      currentPrompt: typeof body.currentPrompt === "string" ? body.currentPrompt : "",
      instruction: body.instruction,
      slideRole,
      slideCount: slideRole ? asSlideCount(body.slideCount, slideRole.index + 1) : undefined,
      deck: asDeckSummary(body.deck),
      references: asReferences(body.references),
    });
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
