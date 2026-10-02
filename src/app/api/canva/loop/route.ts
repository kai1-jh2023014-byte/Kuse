import { NextResponse } from "next/server";
import { resolveRedirectUri } from "@/services/canva/config";
import { CanvaError, toCanvaError } from "@/services/canva/errors";
import { applySessionCookie, canvaError, ensureSessionId } from "@/services/canva/http";
import { runGenerationLoop, type LoopStep } from "@/services/canva/loop";
import { AnalysisError } from "@/services/ai/errors";
import { asProfile, sanitizeBrief } from "@/services/ai/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = ensureSessionId(request);
  try {
    if (session.isNew) return canvaError(request, session, new CanvaError("先に「Canvaと接続」を押してください。", 401, "disconnected"));

    let body: {
      prompt?: unknown;
      profile?: unknown;
      brief?: unknown;
      critique?: unknown;
      fromVersionId?: unknown;
      loopLimit?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return canvaError(request, session, new CanvaError("リクエストを読み取れませんでした。", 400, "body"));
    }

    let profile: ReturnType<typeof asProfile>;
    let brief: ReturnType<typeof sanitizeBrief>;
    try {
      profile = asProfile(body.profile);
      brief = sanitizeBrief(body.brief);
    } catch (error) {
      if (error instanceof AnalysisError) {
        return canvaError(request, session, new CanvaError(error.message, 400, "brief"));
      }
      return canvaError(request, session, error);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: LoopStep | { type: "done"; versionId: string; rounds: number; reached: boolean; reason: string } | { type: "error"; error: string }) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        try {
          const result = await runGenerationLoop({
            sessionId: session.id,
            redirectUri: resolveRedirectUri(request),
            prompt: typeof body.prompt === "string" ? body.prompt : "",
            profile,
            brief,
            critique: typeof body.critique === "string" ? body.critique.slice(0, 500) : "",
            fromVersionId: typeof body.fromVersionId === "string" ? body.fromVersionId : undefined,
            limit: body.loopLimit,
            onStep: send,
          });
          send({
            type: "done",
            versionId: result.version.id,
            rounds: result.rounds,
            reached: result.reached,
            reason: result.reason,
          });
        } catch (error) {
          const mapped = toCanvaError(error);
          if (!(error instanceof CanvaError)) console.error(error);
          send({ type: "error", error: mapped.message });
        } finally {
          controller.close();
        }
      },
    });

    return applySessionCookie(
      new NextResponse(stream, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
      }),
      request,
      session,
    );
  } catch (error) {
    return canvaError(request, session, error);
  }
}
