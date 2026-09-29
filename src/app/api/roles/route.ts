import { apiErrorResponse } from "@/lib/api";
import { planSlideRoles } from "@/services/ai/slide-roles";
import { asSlideDrafts, requireRecord } from "@/services/ai/validate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { brief?: unknown; slides?: unknown };
    const brief = body.brief && typeof body.brief === "object" ? requireRecord(body.brief, "制作内容の形式が不正です") : {};
    const text = (key: string) => {
      const raw = brief[key];
      return typeof raw === "string" ? raw.trim().slice(0, 1500) : "";
    };
    const plan = planSlideRoles(asSlideDrafts(body.slides), {
      purpose: text("purpose"),
      audience: text("audience"),
    });
    return Response.json(plan);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
