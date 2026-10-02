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
  try {
    const url = await new CanvaService(session.id, resolveRedirectUri(request)).startAuthorization();
    return applySessionCookie(NextResponse.redirect(url), request, session);
  } catch (error) {
    const code = error instanceof CanvaError ? error.code : "failed";
    return back(code === "unconfigured" ? "failed" : code);
  }
}
