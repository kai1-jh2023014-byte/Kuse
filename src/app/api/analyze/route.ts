import { apiErrorResponse } from "@/lib/api";
import { analyzeDesign } from "@/services/ai/analyze";
import { asAnalyzeItems, asProfile } from "@/services/ai/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { items?: unknown; previousProfile?: unknown };
    const items = asAnalyzeItems(body.items);
    const previousProfile = asProfile(body.previousProfile);
    const result = await analyzeDesign({ items, previousProfile });
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
