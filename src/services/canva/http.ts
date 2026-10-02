import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { CanvaError, toCanvaError } from "./errors";

export const SESSION_COOKIE = "kuse_sid";

export interface BrowserSession {
  id: string;
  isNew: boolean;
}

export function readSessionId(request: Request): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
    }
  }
  return null;
}

export function ensureSessionId(request: Request): BrowserSession {
  const existing = readSessionId(request);
  if (existing) return { id: existing, isNew: false };
  return { id: randomBytes(32).toString("base64url"), isNew: true };
}

export function applySessionCookie(response: NextResponse, request: Request, session: BrowserSession) {
  if (!session.isNew) return response;
  const secure = new URL(request.url).protocol === "https:";
  response.cookies.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export function canvaJson(request: Request, session: BrowserSession, body: unknown, status = 200) {
  return applySessionCookie(NextResponse.json(body, { status }), request, session);
}

export function canvaError(request: Request, session: BrowserSession, error: unknown) {
  const mapped = toCanvaError(error);
  if (!(error instanceof CanvaError)) console.error(error);
  return canvaJson(request, session, { error: mapped.message, code: mapped.code }, mapped.status);
}
