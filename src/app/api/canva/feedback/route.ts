import { AnalysisError } from "@/services/ai/errors";
import { asProfile } from "@/services/ai/validate";
import { CanvaError } from "@/services/canva/errors";
import { canvaError, canvaJson, ensureSessionId } from "@/services/canva/http";
import { saveFeedback } from "@/services/canva/review";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = ensureSessionId(request);
  try {
    if (session.isNew) throw new CanvaError("生成結果がありません。", 404, "version");
    const body = (await request.json()) as {
      versionId?: unknown;
      profile?: unknown;
      feelsLikeMe?: unknown;
      difference?: unknown;
    };
    if (typeof body.versionId !== "string") throw new CanvaError("版の指定がありません。", 400, "version");
    const version = await saveFeedback({
      sessionId: session.id,
      versionId: body.versionId,
      profile: asProfile(body.profile),
      feedback: {
        feelsLikeMe: body.feelsLikeMe === true,
        difference: typeof body.difference === "string" ? body.difference.trim().slice(0, 500) : "",
        updatedAt: new Date().toISOString(),
      },
    });
    return canvaJson(request, session, { version });
  } catch (error) {
    if (error instanceof AnalysisError) return canvaJson(request, session, { error: error.message }, error.status);
    return canvaError(request, session, error);
  }
}
