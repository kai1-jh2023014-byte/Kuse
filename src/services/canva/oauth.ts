import {
  CANVA_AUTHORIZATION_ENDPOINT,
  CANVA_RESOURCE,
  CANVA_SCOPES,
  CANVA_TOKEN_ENDPOINT,
} from "./metadata";

export function buildAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(CANVA_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", CANVA_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", CANVA_RESOURCE);
  return url.toString();
}

export function authorizationCodeBody(input: { code: string; redirectUri: string; codeVerifier: string }): URLSearchParams {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", input.code);
  body.set("redirect_uri", input.redirectUri);
  body.set("code_verifier", input.codeVerifier);
  body.set("resource", CANVA_RESOURCE);
  return body;
}

export function refreshTokenBody(refreshToken: string): URLSearchParams {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("resource", CANVA_RESOURCE);
  return body;
}

/** client_secret_basic, which the authorization server metadata lists. */
export function basicAuthorizationHeader(clientId: string, clientSecret: string): string {
  const encoded = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString("base64");
  return `Basic ${encoded}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number | null;
  scope?: string;
  tokenType: string;
}

export function readTokenResponse(payload: unknown, now = Date.now()): TokenSet {
  if (!payload || typeof payload !== "object") {
    throw new Error("トークン応答を読めませんでした");
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string") {
    const description = typeof record.error_description === "string" ? record.error_description : record.error;
    throw new Error(`Canvaのトークン取得に失敗しました: ${description}`);
  }
  if (typeof record.access_token !== "string" || !record.access_token) {
    throw new Error("トークン応答に access_token がありません");
  }
  const expiresIn = typeof record.expires_in === "number" ? record.expires_in : null;
  return {
    accessToken: record.access_token,
    refreshToken: typeof record.refresh_token === "string" ? record.refresh_token : undefined,
    expiresAt: expiresIn === null ? null : now + expiresIn * 1000,
    scope: typeof record.scope === "string" ? record.scope : undefined,
    tokenType: typeof record.token_type === "string" ? record.token_type : "Bearer",
  };
}

export async function requestToken(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  const response = await fetchImpl(CANVA_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuthorizationHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok && (payload === null || typeof payload !== "object" || !("error" in payload))) {
    throw new Error(`Canvaのトークンエンドポイントが ${response.status} を返しました`);
  }
  return readTokenResponse(payload);
}
