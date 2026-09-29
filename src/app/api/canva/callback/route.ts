import { NextResponse } from "next/server";
import { browserUrl, resolveRedirectUri } from "@/services/canva/config";
import { CanvaError } from "@/services/canva/errors";
import { applySessionCookie, ensureSessionId } from "@/services/canva/http";
import { CanvaService } from "@/services/canva/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = ensureSessionId(request);
  const back = (notice: string) => {
    const url = browserUrl(request, "/canva");
    url.searchParams.set("notice", notice);
    return applySessionCookie(NextResponse.redirect(url), request, session);
  };
  if (session.isNew) return back("state");
  const query = new URL(request.url).searchParams;
  try {
    await new CanvaService(session.id, resolveRedirectUri(request)).finishAuthorization({
      code: query.get("code"),
      state: query.get("state"),
      error: query.get("error"),
      errorDescription: query.get("error_description"),
    });
    return back("connected");
  } catch (error) {
    const notice = error instanceof CanvaError ? error.code : "failed";
    return back(notice);
  }
}
