import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canvaCredentials } from "./config";
import { CanvaError } from "./errors";

const REGISTER = "https://mcp.canva.com/register";

export interface McpOAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function cacheFile(): string {
  return path.join(process.cwd(), "data", "canva-mcp-client.json");
}

export function needsMcpRegistration(clientId: string): boolean {
  return clientId.startsWith("OC-");
}

function siblingRedirect(redirectUri: string): string | null {
  try {
    const url = new URL(redirectUri);
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      return url.toString();
    }
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export async function registerMcpOAuthClient(
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<McpOAuthClient> {
  const redirects = [redirectUri];
  const extra = siblingRedirect(redirectUri);
  if (extra) redirects.push(extra);
  const response = await fetchImpl(REGISTER, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "KUSE",
      redirect_uris: redirects,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch((error: unknown) => {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new CanvaError("Canva MCPのクライアント登録が時間切れになりました。", 504, "register");
    }
    throw new CanvaError("Canva MCPのクライアント登録に接続できませんでした。", 502, "register");
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload || typeof payload.client_id !== "string" || typeof payload.client_secret !== "string") {
    throw new CanvaError("Canva MCPのクライアントを登録できませんでした。", 502, "register");
  }
  return { clientId: payload.client_id, clientSecret: payload.client_secret, redirectUri };
}

async function readCache(): Promise<McpOAuthClient | null> {
  try {
    const raw = JSON.parse(await readFile(cacheFile(), "utf8")) as Partial<McpOAuthClient>;
    if (typeof raw.clientId !== "string" || typeof raw.clientSecret !== "string" || typeof raw.redirectUri !== "string") {
      return null;
    }
    return { clientId: raw.clientId, clientSecret: raw.clientSecret, redirectUri: raw.redirectUri };
  } catch {
    return null;
  }
}

async function writeCache(client: McpOAuthClient): Promise<void> {
  await mkdir(path.dirname(cacheFile()), { recursive: true });
  await writeFile(cacheFile(), JSON.stringify(client));
}

/**
 * Developer Portal client IDs (OC-…) currently make mcp.canva.com/authorize
 * return Internal Server Error. MCP's register endpoint issues a client that
 * the authorize page accepts.
 */
export async function resolveMcpOAuthClient(
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<McpOAuthClient> {
  const env = canvaCredentials();
  if (!env.configured) {
    throw new CanvaError("CanvaのクライアントIDとシークレットが .env にありません。", 503, "unconfigured");
  }
  if (!needsMcpRegistration(env.clientId)) {
    return { clientId: env.clientId, clientSecret: env.clientSecret, redirectUri };
  }
  const cached = await readCache();
  if (cached && cached.redirectUri === redirectUri) return cached;
  const registered = await registerMcpOAuthClient(redirectUri, fetchImpl);
  await writeCache(registered);
  return registered;
}
