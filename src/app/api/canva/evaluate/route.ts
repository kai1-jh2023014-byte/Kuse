import { AnalysisError } from "@/services/ai/errors";
import { asProfile, sanitizeBrief } from "@/services/ai/validate";
import type { DesignBrief } from "@/services/ai/types";
import { CanvaError } from "@/services/canva/errors";
import { canvaError, canvaJson, ensureSessionId } from "@/services/canva/http";
import { evaluateVersion } from "@/services/canva/review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = ensureSessionId(request);
  try {
    if (session.isNew) throw new CanvaError("先にCanvaで生成してください。", 404, "version");
    const body = (await request.json()) as { versionId?: unknown; profile?: unknown; brief?: unknown };
    if (typeof body.versionId !== "string") throw new CanvaError("版の指定がありません。", 400, "version");
    const profile = asProfile(body.profile);
    if (!profile) throw new CanvaError("先に作品を分析して、デザインスタイルを作ってください。", 400, "no_profile");
    const result = await evaluateVersion({
      sessionId: session.id,
      versionId: body.versionId,
      profile,
      brief: briefFrom(body.brief),
    });
    return canvaJson(request, session, result);
  } catch (error) {
    if (error instanceof AnalysisError) return canvaJson(request, session, { error: error.message }, error.status);
    return canvaError(request, session, error);
  }
}

function briefFrom(value: unknown): DesignBrief {
  try {
    return sanitizeBrief(value);
  } catch {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const text = (key: string) => (typeof record[key] === "string" ? record[key].trim().slice(0, 1500) : "");
    return {
      purpose: text("purpose"),
      audience: text("audience"),
      copyText: text("copyText"),
      size: text("size"),
      mood: text("mood"),
      imagery: text("imagery"),
      notes: text("notes"),
    };
  }
}
