import { resolveRedirectUri } from "@/services/canva/config";
import { CanvaError } from "@/services/canva/errors";
import { canvaError, canvaJson, ensureSessionId } from "@/services/canva/http";
import { assertCanRegenerate } from "@/services/canva/review";
import { CanvaService } from "@/services/canva/service";
import { sessionStore } from "@/services/canva/store";

export const dynamic = "force-dynamic";
export const maxDuration = 70;

export async function POST(request: Request) {
  const session = ensureSessionId(request);
  try {
    if (session.isNew) throw new CanvaError("先に「Canvaと接続」を押してください。", 401, "disconnected");
    const body = (await request.json()) as { versionId?: unknown };
    if (typeof body.versionId !== "string") throw new CanvaError("版の指定がありません。", 400, "version");
    const record = await sessionStore.read(session.id);
    const source = assertCanRegenerate(record?.versions ?? [], body.versionId);
    const version = await new CanvaService(session.id, resolveRedirectUri(request)).generate(source.improvementPrompt ?? "", {
      parentVersionId: source.id,
    });
    return canvaJson(request, session, { version });
  } catch (error) {
    return canvaError(request, session, error);
  }
}
