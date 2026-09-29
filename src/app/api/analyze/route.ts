import { apiErrorResponse } from "@/lib/api";
import { DesignAnalyzer } from "@/services/agents/design-analyzer";
import { asAnalyzeItems, asProfile } from "@/services/ai/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { items?: unknown; previousProfile?: unknown };
    const items = asAnalyzeItems(body.items);
    const previousProfile = asProfile(body.previousProfile);
    const result = await DesignAnalyzer.analyze({ items, previousProfile });
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
