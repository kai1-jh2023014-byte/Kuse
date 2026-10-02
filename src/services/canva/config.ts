import path from "node:path";

export interface CanvaCredentials {
  clientId: string;
  clientSecret: string;
  configured: boolean;
  redirectUriOverride: string | null;
}

export function dataDirectory(): string {
  const override = process.env.KUSE_DATA_DIR?.trim();
  if (override) return override;
  return path.join(process.cwd(), "data");
}

export function canvaCredentials(): CanvaCredentials {
  const clientId = process.env.CANVA_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.CANVA_CLIENT_SECRET?.trim() ?? "";
  const redirect = process.env.CANVA_REDIRECT_URI?.trim() ?? "";
  return {
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret),
    redirectUriOverride: redirect || null,
  };
}

export function resolveRedirectUri(request: Request): string {
  const override = canvaCredentials().redirectUriOverride;
  if (override) return override;
  return `${browserOrigin(request)}/api/canva/callback`;
}

/** Origin the browser used. Next's request.url can be the bind address, 0.0.0.0. */
export function browserOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const proto = forwardedProto || url.protocol.replace(":", "");
  const headerHost = forwardedHost || request.headers.get("host");
  if (headerHost && !headerHost.startsWith("0.0.0.0")) return `${proto}://${headerHost}`;
  if (url.hostname === "0.0.0.0") return `${proto}://127.0.0.1${url.port ? `:${url.port}` : ""}`;
  return `${proto}://${url.host}`;
}

export function browserUrl(request: Request, pathname: string): URL {
  return new URL(pathname, browserOrigin(request));
}
