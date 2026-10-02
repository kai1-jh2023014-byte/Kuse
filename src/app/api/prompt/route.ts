import { apiErrorResponse } from "@/lib/api";
import { PromptGenerator } from "@/services/agents/prompt-generator";
import { asDeckSummary, asProfile, asSlideCount, asSlideRole, clampStrength, sanitizeBrief } from "@/services/ai/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      profile?: unknown;
      brief?: unknown;
      styleStrength?: unknown;
      slideRole?: unknown;
      slideCount?: unknown;
      deck?: unknown;
      critique?: unknown;
    };
    const slideRole = asSlideRole(body.slideRole);
    const result = await PromptGenerator.generate({
      profile: asProfile(body.profile),
      brief: sanitizeBrief(body.brief),
      styleStrength: clampStrength(body.styleStrength),
      slideRole,
      slideCount: slideRole ? asSlideCount(body.slideCount, slideRole.index + 1) : undefined,
      deck: asDeckSummary(body.deck),
      critique: typeof body.critique === "string" ? body.critique.slice(0, 500) : undefined,
    });
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
