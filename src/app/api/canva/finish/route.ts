import { resolveRedirectUri } from "@/services/canva/config";
import { CanvaError } from "@/services/canva/errors";
import { canvaError, canvaJson, ensureSessionId } from "@/services/canva/http";
import { CanvaService } from "@/services/canva/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = ensureSessionId(request);
  try {
    if (session.isNew) throw new CanvaError("生成結果がありません。", 404, "version");
    const body = (await request.json()) as { versionId?: unknown };
    if (typeof body.versionId !== "string") throw new CanvaError("版の指定がありません。", 400, "version");
    const version = await new CanvaService(session.id, resolveRedirectUri(request)).finishVersion(body.versionId);
    return canvaJson(request, session, { version });
  } catch (error) {
    return canvaError(request, session, error);
  }
}
