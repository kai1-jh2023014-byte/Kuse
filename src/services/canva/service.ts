import { randomBytes, randomUUID } from "node:crypto";
import { canvaCredentials } from "./config";
import { CanvaError } from "./errors";
import { dropMcpSession, mcpRequest } from "./mcp";
import { authorizationCodeBody, buildAuthorizationUrl, refreshTokenBody, requestToken } from "./oauth";
import { codeChallengeS256, createCodeVerifier } from "./pkce";
import { extractToolPayload, isAllowedCanvaHost, readDesignSummary, readGeneratedDesigns } from "./parse";
import { toPublicVersion } from "./public";
import { buildCreateArguments, buildGenerateArguments } from "./schema";
import { sessionStore } from "./store";
import type { PublicVersion, StoredCandidate, StoredTool } from "./types";

const TOOL_CACHE_MS = 30 * 60 * 1000;

function readTools(result: unknown): StoredTool[] {
  if (!result || typeof result !== "object" || !Array.isArray((result as { tools?: unknown }).tools)) return [];
  return (result as { tools: unknown[] }).tools.flatMap((item) => {
    if (!item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string") return [];
    const record = item as { name: string; description?: unknown; inputSchema?: unknown };
    const tool: StoredTool = { name: record.name };
    if (typeof record.description === "string") tool.description = record.description;
    if (record.inputSchema && typeof record.inputSchema === "object") {
      tool.inputSchema = record.inputSchema as StoredTool["inputSchema"];
    }
    return [tool];
  });
}

export class CanvaService {
  constructor(
    private readonly sessionId: string,
    private readonly redirectUri: string,
  ) {}

  async startAuthorization(): Promise<string> {
    const creds = canvaCredentials();
    if (!creds.configured) {
      throw new CanvaError("CanvaのクライアントIDとシークレットが .env にありません。", 503, "unconfigured");
    }
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = createCodeVerifier();
    await sessionStore.mutate(this.sessionId, (session) => {
      session.pending = {
        state,
        codeVerifier,
        redirectUri: this.redirectUri,
        createdAt: Date.now(),
      };
    });
    return buildAuthorizationUrl({
      clientId: creds.clientId,
      redirectUri: this.redirectUri,
      state,
      codeChallenge: codeChallengeS256(codeVerifier),
    });
  }

  async finishAuthorization(query: {
    code?: string | null;
    state?: string | null;
    error?: string | null;
    errorDescription?: string | null;
  }) {
    const session = await sessionStore.read(this.sessionId);
    const pending = session?.pending;
    if (!pending || !query.state || pending.state !== query.state) {
      throw new CanvaError("接続の確認に失敗しました。もう一度「Canvaと接続」を押してください。", 400, "state");
    }
    if (query.error) {
      await sessionStore.mutate(this.sessionId, (current) => {
        delete current.pending;
      });
      const detail = (query.errorDescription || query.error).slice(0, 180);
      throw new CanvaError(`Canvaが接続を完了しませんでした（${detail}）。`, 400, "denied");
    }
    if (!query.code) throw new CanvaError("認可コードがありません。", 400, "missing_code");
    const creds = canvaCredentials();
    if (!creds.configured) {
      throw new CanvaError("CanvaのクライアントIDとシークレットが .env にありません。", 503, "unconfigured");
    }
    const tokens = await requestToken(
      authorizationCodeBody({
        code: query.code,
        redirectUri: pending.redirectUri,
        codeVerifier: pending.codeVerifier,
      }),
      creds.clientId,
      creds.clientSecret,
    );
    await sessionStore.mutate(this.sessionId, (current) => {
      delete current.pending;
      current.tokens = tokens;
      delete current.tools;
    });
    dropMcpSession(this.sessionId);
  }

  async disconnect() {
    dropMcpSession(this.sessionId);
    await sessionStore.mutate(this.sessionId, (current) => {
      delete current.tokens;
      delete current.pending;
      delete current.tools;
    });
    // TODO: revocation_endpoint is the same URL as the token endpoint.
    // A separate revocation body is not documented, so the token is only deleted on this server.
  }

  async generate(prompt: string, options?: { parentVersionId?: string }): Promise<PublicVersion> {
    const text = prompt.trim();
    if (!text) throw new CanvaError("生成プロンプトが空です。", 400, "empty_prompt");
    if (text.length > 12_000) throw new CanvaError("プロンプトが長すぎます。12000文字以内にしてください。", 400, "prompt_too_long");

    const tools = await this.ensureTools();
    const tool = tools.find((item) => item.name === "generate-design");
    if (!tool) {
      const names = tools.map((item) => item.name).join(", ") || "なし";
      throw new CanvaError(`接続中のCanva MCPに generate-design がありません。公開ツール: ${names}`, 502, "tool_missing");
    }
    const built = buildGenerateArguments(tool.inputSchema, text);
    if (!built.ok) throw new CanvaError(built.reason, 501, "schema_unknown");

    const payload = await this.callTool("generate-design", built.arguments, 70_000);
    const parsed = readGeneratedDesigns(payload);
    if (!parsed.ok) throw new CanvaError(parsed.reason, 502, parsed.code);

    const fetchedAt = new Date().toISOString();
    const candidates: StoredCandidate[] = parsed.generation.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      url: candidate.url,
      thumbnails: candidate.thumbnailUrls.filter(isHttpsCanva).map((url) => ({ url, fetchedAt, ephemeral: true as const })),
    }));
    const versionId = randomUUID();
    const saved = await sessionStore.mutate(this.sessionId, (current) => {
      current.versions.push({
        id: versionId,
        index: current.versions.length + 1,
        createdAt: fetchedAt,
        prompt: text,
        jobId: parsed.generation.jobId,
        jobStatus: parsed.generation.status,
        candidates,
        parentVersionId: options?.parentVersionId,
        analysis: null,
        improvementPrompt: null,
      });
    });
    const version = saved.versions.find((item) => item.id === versionId);
    if (!version) throw new CanvaError("生成結果を保存できませんでした。", 500, "store");
    return toPublicVersion(version);
  }

  async adoptCandidate(versionId: string, candidateId: string): Promise<PublicVersion> {
    const session = await sessionStore.read(this.sessionId);
    const version = session?.versions.find((item) => item.id === versionId);
    if (!version) throw new CanvaError("その生成結果は見つかりません。", 404, "version");
    if (!version.candidates.some((item) => item.candidateId === candidateId)) {
      throw new CanvaError("その候補はこの生成結果にありません。", 400, "candidate");
    }
    if (version.design && version.selectedCandidateId === candidateId) return toPublicVersion(version);

    const tools = await this.ensureTools();
    const tool = tools.find((item) => item.name === "create-design-from-candidate");
    if (!tool) {
      throw new CanvaError("接続中のCanva MCPに create-design-from-candidate がありません。", 502, "tool_missing");
    }
    const built = buildCreateArguments(tool.inputSchema, candidateId, version.jobId);
    if (!built.ok) throw new CanvaError(built.reason, 501, "schema_unknown");

    const payload = await this.callTool("create-design-from-candidate", built.arguments, 60_000);
    const parsed = readDesignSummary(payload);
    if (!parsed.ok) throw new CanvaError(parsed.reason, 502, "unexpected_design");

    const saved = await sessionStore.mutate(this.sessionId, (current) => {
      const target = current.versions.find((item) => item.id === versionId);
      if (!target) return;
      target.selectedCandidateId = candidateId;
      target.design = parsed.design;
    });
    const updated = saved.versions.find((item) => item.id === versionId);
    if (!updated?.design) throw new CanvaError("デザインの保存結果を記録できませんでした。", 500, "store");
    return toPublicVersion(updated);
  }

  /** Marks the version finished. Does not update design_profile. */
  async finishVersion(versionId: string): Promise<PublicVersion> {
    const session = await sessionStore.read(this.sessionId);
    const version = session?.versions.find((item) => item.id === versionId);
    if (!version) throw new CanvaError("その生成結果は見つかりません。", 404, "version");
    if (!version.design) {
      throw new CanvaError("先に候補を選んで、Canva上のデザインとして保存してください。", 400, "not_saved");
    }
    const saved = await sessionStore.mutate(this.sessionId, (current) => {
      const target = current.versions.find((item) => item.id === versionId);
      if (target && !target.finishedAt) target.finishedAt = new Date().toISOString();
    });
    const updated = saved.versions.find((item) => item.id === versionId);
    if (!updated) throw new CanvaError("完成の記録に失敗しました。", 500, "store");
    return toPublicVersion(updated);
  }

  async ownsThumbnail(url: string): Promise<boolean> {
    const session = await sessionStore.read(this.sessionId);
    return Boolean(
      session?.versions.some((version) =>
        version.candidates.some((candidate) => candidate.thumbnails.some((thumb) => thumb.url === url)),
      ),
    );
  }

  private async ensureTools(): Promise<StoredTool[]> {
    const session = await sessionStore.read(this.sessionId);
    const fetchedAt = session?.tools ? Date.parse(session.tools.fetchedAt) : 0;
    if (session?.tools && Date.now() - fetchedAt < TOOL_CACHE_MS) return session.tools.list;
    const list = await this.withToken((token) => this.listAllTools(token));
    await sessionStore.mutate(this.sessionId, (current) => {
      current.tools = { fetchedAt: new Date().toISOString(), list };
    });
    return list;
  }

  private async listAllTools(token: string): Promise<StoredTool[]> {
    const all: StoredTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const result = await mcpRequest({
        accessToken: token,
        cacheKey: this.sessionId,
        method: "tools/list",
        params: cursor ? { cursor } : {},
        timeoutMs: 20_000,
      });
      all.push(...readTools(result));
      const next = result && typeof result === "object" ? (result as { nextCursor?: unknown }).nextCursor : undefined;
      if (typeof next !== "string" || !next || next === cursor) break;
      cursor = next;
    }
    return all;
  }

  private async callTool(name: string, args: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const result = await this.withToken((token) =>
      mcpRequest({
        accessToken: token,
        cacheKey: this.sessionId,
        method: "tools/call",
        params: { name, arguments: args },
        timeoutMs,
      }),
    );
    if (result && typeof result === "object" && (result as { isError?: boolean }).isError) {
      const payload = extractToolPayload(result);
      const text =
        payload && typeof payload === "object" && "text" in payload
          ? String((payload as { text: unknown }).text)
          : "Canvaがこの操作を完了できませんでした。";
      throw new CanvaError(text.slice(0, 300), 502, "tool_error");
    }
    return extractToolPayload(result);
  }

  private async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const creds = canvaCredentials();
    if (!creds.configured) {
      throw new CanvaError("CanvaのクライアントIDとシークレットが .env にありません。", 503, "unconfigured");
    }
    let session = await sessionStore.read(this.sessionId);
    if (!session?.tokens?.accessToken) {
      throw new CanvaError("先に「Canvaと接続」を押してください。", 401, "disconnected");
    }
    const expiring = session.tokens.expiresAt !== null && session.tokens.expiresAt < Date.now() + 60_000;
    if (expiring) {
      if (!session.tokens.refreshToken) {
        throw new CanvaError("Canvaの接続期限が切れました。もう一度接続してください。", 401, "expired");
      }
      const next = await requestToken(refreshTokenBody(session.tokens.refreshToken), creds.clientId, creds.clientSecret);
      const refreshToken = next.refreshToken ?? session.tokens.refreshToken;
      session = await sessionStore.mutate(this.sessionId, (current) => {
        current.tokens = {
          accessToken: next.accessToken,
          refreshToken,
          expiresAt: next.expiresAt,
          scope: next.scope ?? current.tokens?.scope,
          tokenType: next.tokenType,
        };
      });
    }
    if (!session.tokens?.accessToken) throw new CanvaError("Canvaの接続を確認できませんでした。", 401, "disconnected");
    return fn(session.tokens.accessToken);
  }
}

function isHttpsCanva(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && isAllowedCanvaHost(parsed.hostname);
  } catch {
    return false;
  }
}
