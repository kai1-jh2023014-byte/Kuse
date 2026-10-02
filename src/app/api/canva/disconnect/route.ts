import { resolveRedirectUri } from "@/services/canva/config";
import { canvaError, canvaJson, ensureSessionId } from "@/services/canva/http";
import { canvaOAuthReady } from "@/services/canva/mcp-oauth-client";
import { statusFrom } from "@/services/canva/public";
import { CanvaService } from "@/services/canva/service";
import { sessionStore } from "@/services/canva/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = ensureSessionId(request);
  try {
    if (!session.isNew) await new CanvaService(session.id, resolveRedirectUri(request)).disconnect();
    const record = session.isNew ? null : await sessionStore.read(session.id);
    return canvaJson(
      request,
      session,
      statusFrom({
        configured: await canvaOAuthReady(),
        redirectUri: resolveRedirectUri(request),
        session: record,
      }),
    );
  } catch (error) {
    return canvaError(request, session, error);
  }
}
