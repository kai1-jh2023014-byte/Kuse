import { CANVA_MCP_SERVER, MCP_PROTOCOL_VERSION } from "./metadata";
import { CanvaError } from "./errors";
import { parseMcpMessage } from "./parse";

const sessions = new Map<string, { mcpSessionId?: string; protocolVersion: string }>();

let nextId = 1;

function rpcId(): number {
  nextId += 1;
  return nextId;
}

async function postRpc(input: {
  fetchImpl: typeof fetch;
  accessToken: string;
  mcpSessionId?: string;
  protocolVersion?: string;
  message: Record<string, unknown>;
  timeoutMs: number;
  expectId: number | null;
}): Promise<{ message: unknown; mcpSessionId?: string; status: number }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (input.mcpSessionId) headers["Mcp-Session-Id"] = input.mcpSessionId;
  if (input.protocolVersion) headers["MCP-Protocol-Version"] = input.protocolVersion;

  const response = await input.fetchImpl(CANVA_MCP_SERVER, {
    method: "POST",
    headers,
    body: JSON.stringify(input.message),
    signal: AbortSignal.timeout(input.timeoutMs),
  }).catch((error: unknown) => {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new CanvaError("Canvaの応答が時間切れになりました。もう一度試してください。", 504, "timeout");
    }
    throw new CanvaError("Canva MCPに接続できませんでした。", 502, "mcp_network");
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const mcpSessionId = response.headers.get("mcp-session-id") ?? input.mcpSessionId;
  if (response.status === 401) {
    throw new CanvaError("Canvaの接続が切れました。もう一度「Canvaと接続」を押してください。", 401, "unauthorized");
  }
  if (response.status >= 400) {
    const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    if (response.status >= 500) {
      throw new CanvaError(
        `Canva側が生成に失敗しました（${response.status}）。プロンプトを短くして、もう一度試してください。`,
        502,
        "mcp_http",
      );
    }
    throw new CanvaError(`Canva MCPが ${response.status} を返しました。${snippet}`.trim(), 502, "mcp_http");
  }
  let message: unknown = null;
  if (text.trim()) {
    try {
      message = parseMcpMessage(contentType, text, input.expectId);
    } catch {
      throw new CanvaError("Canva MCPの応答を解釈できませんでした。", 502, "mcp_parse");
    }
  }
  return { message, mcpSessionId, status: response.status };
}

function assertResult(message: unknown): unknown {
  if (!message || typeof message !== "object") {
    throw new CanvaError("Canva MCPの応答が空でした。", 502, "mcp_empty");
  }
  const record = message as { error?: { message?: string }; result?: unknown };
  if (record.error) {
    throw new CanvaError(record.error.message || "Canva MCPがエラーを返しました。", 502, "mcp_error");
  }
  return record.result;
}

async function handshake(input: {
  fetchImpl: typeof fetch;
  accessToken: string;
  cacheKey: string;
  timeoutMs: number;
}): Promise<void> {
  const initId = rpcId();
  const initialized = await postRpc({
    fetchImpl: input.fetchImpl,
    accessToken: input.accessToken,
    message: {
      jsonrpc: "2.0",
      id: initId,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "kuse", version: "0.1.0" },
      },
    },
    timeoutMs: input.timeoutMs,
    expectId: initId,
  });
  const result = assertResult(initialized.message);
  const protocolVersion =
    result && typeof result === "object" && typeof (result as { protocolVersion?: unknown }).protocolVersion === "string"
      ? (result as { protocolVersion: string }).protocolVersion
      : MCP_PROTOCOL_VERSION;
  sessions.set(input.cacheKey, { mcpSessionId: initialized.mcpSessionId, protocolVersion });

  const cached = sessions.get(input.cacheKey);
  await postRpc({
    fetchImpl: input.fetchImpl,
    accessToken: input.accessToken,
    mcpSessionId: cached?.mcpSessionId,
    protocolVersion,
    message: { jsonrpc: "2.0", method: "notifications/initialized" },
    timeoutMs: input.timeoutMs,
    expectId: null,
  });
}

export async function mcpRequest(input: {
  fetchImpl?: typeof fetch;
  accessToken: string;
  cacheKey: string;
  method: string;
  params?: Record<string, unknown>;
  timeoutMs: number;
}): Promise<unknown> {
  const fetchImpl = input.fetchImpl ?? fetch;
  if (!sessions.has(input.cacheKey)) {
    await handshake({ fetchImpl, accessToken: input.accessToken, cacheKey: input.cacheKey, timeoutMs: 20_000 });
  }
  const cached = sessions.get(input.cacheKey);
  const id = rpcId();
  try {
    const response = await postRpc({
      fetchImpl,
      accessToken: input.accessToken,
      mcpSessionId: cached?.mcpSessionId,
      protocolVersion: cached?.protocolVersion,
      message: {
        jsonrpc: "2.0",
        id,
        method: input.method,
        params: input.params ?? {},
      },
      timeoutMs: input.timeoutMs,
      expectId: id,
    });
    if (response.mcpSessionId && cached) cached.mcpSessionId = response.mcpSessionId;
    return assertResult(response.message);
  } catch (error) {
    if (error instanceof CanvaError && (error.code === "unauthorized" || error.code === "mcp_http")) {
      sessions.delete(input.cacheKey);
    }
    throw error;
  }
}

export function dropMcpSession(cacheKey: string) {
  sessions.delete(cacheKey);
}
