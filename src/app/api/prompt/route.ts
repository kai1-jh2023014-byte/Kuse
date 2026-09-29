import { apiErrorResponse } from "@/lib/api";
import { PromptGenerator } from "@/services/agents/prompt-generator";
import { asProfile, clampStrength, sanitizeBrief } from "@/services/ai/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { profile?: unknown; brief?: unknown; styleStrength?: unknown };
    const result = await PromptGenerator.generate({
      profile: asProfile(body.profile),
      brief: sanitizeBrief(body.brief),
      styleStrength: clampStrength(body.styleStrength),
    });
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
