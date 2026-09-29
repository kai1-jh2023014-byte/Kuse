import { apiErrorResponse } from "@/lib/api";
import { PromptGenerator } from "@/services/agents/prompt-generator";
import { asProfile, clampStrength, sanitizeBrief } from "@/services/ai/validate";
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
    };
    if (typeof body.instruction !== "string") throw new AnalysisError("調整の内容を書いてください");
    const result = await PromptGenerator.refine({
      profile: asProfile(body.profile),
      brief: sanitizeBrief(body.brief),
      styleStrength: clampStrength(body.styleStrength),
      currentPrompt: typeof body.currentPrompt === "string" ? body.currentPrompt : "",
      instruction: body.instruction,
    });
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
