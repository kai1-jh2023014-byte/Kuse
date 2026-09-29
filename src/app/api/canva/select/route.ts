import { resolveRedirectUri } from "@/services/canva/config";
import { CanvaError } from "@/services/canva/errors";
import { canvaError, canvaJson, ensureSessionId } from "@/services/canva/http";
import { CanvaService } from "@/services/canva/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = ensureSessionId(request);
  try {
    if (session.isNew) throw new CanvaError("先に「Canvaと接続」を押してください。", 401, "disconnected");
    const body = (await request.json()) as { versionId?: unknown; candidateId?: unknown };
    if (typeof body.versionId !== "string" || typeof body.candidateId !== "string") {
      throw new CanvaError("候補の指定が足りません。", 400, "candidate");
    }
    const version = await new CanvaService(session.id, resolveRedirectUri(request)).adoptCandidate(
      body.versionId,
      body.candidateId,
    );
    return canvaJson(request, session, { version });
  } catch (error) {
    return canvaError(request, session, error);
  }
}
