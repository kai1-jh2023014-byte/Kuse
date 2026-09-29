import { NextResponse } from "next/server";
import { resolveRedirectUri } from "@/services/canva/config";
import { CanvaError } from "@/services/canva/errors";
import { applySessionCookie, canvaError, ensureSessionId } from "@/services/canva/http";
import { CanvaService } from "@/services/canva/service";
import { fetchCanvaThumbnail } from "@/services/canva/thumbnail";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = ensureSessionId(request);
  try {
    const url = new URL(request.url).searchParams.get("url") ?? "";
    if (session.isNew) throw new CanvaError("このサムネイルは表示できません。", 404, "thumbnail");
    const service = new CanvaService(session.id, resolveRedirectUri(request));
    if (!(await service.ownsThumbnail(url))) {
      throw new CanvaError("このサムネイルは今回の生成結果に含まれていません。", 404, "thumbnail");
    }
    const image = await fetchCanvaThumbnail(url);
    const response = new NextResponse(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
    return applySessionCookie(response, request, session);
  } catch (error) {
    return canvaError(request, session, error);
  }
}
