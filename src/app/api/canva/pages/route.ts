import { resolveRedirectUri } from "@/services/canva/config";
import { CanvaError } from "@/services/canva/errors";
import { canvaError, canvaJson, ensureSessionId } from "@/services/canva/http";
import { CanvaService } from "@/services/canva/service";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(request: Request) {
  const session = ensureSessionId(request);
  try {
    if (session.isNew) throw new CanvaError("先に「Canvaと接続」を押してください。", 401, "disconnected");
    const body = (await request.json().catch(() => ({}))) as { versionId?: unknown };
    const versionId = typeof body.versionId === "string" ? body.versionId : undefined;
    const versions = await new CanvaService(session.id, resolveRedirectUri(request)).refreshVersionPages(versionId);
    return canvaJson(request, session, { versions });
  } catch (error) {
    return canvaError(request, session, error);
  }
}
