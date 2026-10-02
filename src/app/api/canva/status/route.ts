import { resolveRedirectUri } from "@/services/canva/config";
import { canvaJson, ensureSessionId } from "@/services/canva/http";
import { canvaOAuthReady } from "@/services/canva/mcp-oauth-client";
import { statusFrom } from "@/services/canva/public";
import { sessionStore } from "@/services/canva/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = ensureSessionId(request);
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
}
