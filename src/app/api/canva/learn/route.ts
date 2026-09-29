import { AnalysisError } from "@/services/ai/errors";
import { asProfile } from "@/services/ai/validate";
import { CanvaError } from "@/services/canva/errors";
import { canvaError, canvaJson, ensureSessionId } from "@/services/canva/http";
import { previewLearning } from "@/services/canva/review";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = ensureSessionId(request);
  try {
    if (session.isNew) throw new CanvaError("生成結果がありません。", 404, "version");
    const body = (await request.json()) as { versionId?: unknown; profile?: unknown; approve?: unknown };
    if (typeof body.versionId !== "string") throw new CanvaError("版の指定がありません。", 400, "version");
    const profile = asProfile(body.profile);
    if (!profile) throw new CanvaError("先にデザインスタイルを作ってください。", 400, "no_profile");
    const result = await previewLearning({
      sessionId: session.id,
      versionId: body.versionId,
      profile,
      approve: body.approve === true,
    });
    return canvaJson(request, session, result);
  } catch (error) {
    if (error instanceof AnalysisError) return canvaJson(request, session, { error: error.message }, error.status);
    return canvaError(request, session, error);
  }
}
