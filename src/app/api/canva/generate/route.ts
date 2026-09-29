import { resolveRedirectUri } from "@/services/canva/config";
import { canvaError, canvaJson, ensureSessionId } from "@/services/canva/http";
import { CanvaError } from "@/services/canva/errors";
import { CanvaService } from "@/services/canva/service";

export const dynamic = "force-dynamic";
export const maxDuration = 70;

export async function POST(request: Request) {
  const session = ensureSessionId(request);
  try {
    if (session.isNew) throw new CanvaError("先に「Canvaと接続」を押してください。", 401, "disconnected");
    const body = (await request.json()) as { prompt?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const version = await new CanvaService(session.id, resolveRedirectUri(request)).generate(prompt);
    return canvaJson(request, session, { version });
  } catch (error) {
    return canvaError(request, session, error);
  }
}
