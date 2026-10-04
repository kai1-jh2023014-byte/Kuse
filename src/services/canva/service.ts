import { randomBytes, randomUUID } from "node:crypto";
import { CanvaError } from "./errors";
import { dropMcpSession, mcpRequest } from "./mcp";
import { resolveMcpOAuthClient } from "./mcp-oauth-client";
import { authorizationCodeBody, buildAuthorizationUrl, refreshTokenBody, requestToken } from "./oauth";
import { codeChallengeS256, createCodeVerifier } from "./pkce";
import { slideCountFromPrompt } from "@/services/ai/presentation-craft";
import {
  continuationTokenFrom,
  extractDesignPages,
  extractToolPayload,
  isCanvaPreviewUrl,
  pageCountFromPayload,
  readAnyDesign,
  readAsyncDesignJob,
  readDesignSummary,
  readGeneratedDesigns,
  uniquePreviewUrls,
} from "./parse";
import { toPublicVersion } from "./public";
import {
  buildCreateArguments,
  buildCreateDesignArguments,
  buildDesignIdArguments,
  buildGenerateArguments,
  buildJobPollArguments,
  collapseRetryPrompt,
  createDesignArgumentAttempts,
} from "./schema";
import { sessionStore } from "./store";
import { fetchCanvaThumbnail } from "./thumbnail";
import type { PublicVersion, StoredCandidate, StoredThumbnail, StoredTool } from "./types";

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
    const oauth = await resolveMcpOAuthClient(this.redirectUri);
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
      clientId: oauth.clientId,
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
    const oauth = await resolveMcpOAuthClient(pending.redirectUri);
    const tokens = await requestToken(
      authorizationCodeBody({
        code: query.code,
        redirectUri: pending.redirectUri,
        codeVerifier: pending.codeVerifier,
      }),
      oauth.clientId,
      oauth.clientSecret,
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

  async generate(prompt: string, options?: { parentVersionId?: string; designType?: string; slideId?: string }): Promise<PublicVersion> {
    const text = prompt.trim();
    if (!text) throw new CanvaError("生成プロンプトが空です。", 400, "empty_prompt");
    if (text.length > 12_000) throw new CanvaError("プロンプトが長すぎます。12000文字以内にしてください。", 400, "prompt_too_long");

    const tools = await this.ensureTools();
    const create = tools.find((item) => item.name === "create-design");
    const generate = tools.find((item) => item.name === "generate-design");
    const pollCreate = tools.find((item) => item.name === "get-create-design-async-job");
    const pollGenerate = tools.find((item) => item.name === "get-generate-design-async-job");

    let parsed: ReturnType<typeof readGeneratedDesigns>;
    if (create) {
      parsed = await this.callCreateDesign(create, pollCreate, text, options?.designType);
    } else if (generate) {
      const built = buildGenerateArguments(generate.inputSchema, text, { designType: options?.designType });
      if (!built.ok) throw new CanvaError(built.reason, 501, "schema_unknown");
      const payload = await this.callTool("generate-design", built.arguments, 70_000);
      parsed = await this.awaitDesignJob(payload, pollGenerate, "generate-design");
    } else {
      const names = tools.map((item) => item.name).join(", ") || "なし";
      throw new CanvaError(
        `接続中のCanva MCPに create-design / generate-design がありません。公開ツール: ${names}`,
        502,
        "tool_missing",
      );
    }
    if (!parsed.ok) throw new CanvaError(parsed.reason, 502, parsed.code);
    const enriched = await this.enrichWithPageThumbnails(parsed);
    if (!enriched.ok) throw new CanvaError(enriched.reason, 502, enriched.code);
    parsed = await this.retryIfCollapsed(enriched, create, pollCreate, generate, pollGenerate, text, options?.designType);
    if (!parsed.ok) throw new CanvaError(parsed.reason, 502, parsed.code);

    const fetchedAt = new Date().toISOString();
    const generation = parsed.generation;
    const design = parsed.design;
    const candidates: StoredCandidate[] = [];
    for (const candidate of generation.candidates) {
      const urls = candidate.thumbnailUrls.filter(isCanvaPreviewUrl);
      candidates.push({
        candidateId: candidate.candidateId,
        url: candidate.url,
        thumbnails: await hydrateThumbnails(urls, fetchedAt),
      });
    }
    const versionId = randomUUID();
    const saved = await sessionStore.mutate(this.sessionId, (current) => {
      current.versions.push({
        id: versionId,
        index: current.versions.length + 1,
        createdAt: fetchedAt,
        prompt: text,
        jobId: generation.jobId,
        jobStatus: generation.status,
        candidates,
        parentVersionId: options?.parentVersionId,
        analysis: null,
        improvementPrompt: null,
        selectedCandidateId: candidates[0]?.candidateId,
        design,
        slideId: options?.slideId,
      });
    });
    const version = saved.versions.find((item) => item.id === versionId);
    if (!version) throw new CanvaError("生成結果を保存できませんでした。", 500, "store");
    return toPublicVersion(version);
  }

  async refreshVersionPages(versionId?: string): Promise<PublicVersion[]> {
    const session = await sessionStore.read(this.sessionId);
    const targets = (session?.versions ?? []).filter((item) => {
      if (!item.design?.id) return false;
      if (versionId) return item.id === versionId;
      return true;
    });
    const updated: PublicVersion[] = [];
    for (const version of targets) {
      const designId = version.design?.id;
      if (!designId) continue;
      try {
        const next = await this.enrichWithPageThumbnails({
          ok: true,
          generation: {
            jobId: version.jobId,
            status: version.jobStatus,
            candidates: version.candidates.map((item) => ({
              candidateId: item.candidateId,
              url: item.url,
              thumbnailUrls: item.thumbnails.map((thumb) => thumb.url),
            })),
          },
          design: version.design,
        });
        if (!next.ok) continue;
        const urls = uniquePreviewUrls(next.generation.candidates[0]?.thumbnailUrls ?? []);
        const thumbs = urls.length ? await hydrateThumbnails(urls, new Date().toISOString()) : null;
        const written = await sessionStore.mutate(this.sessionId, (current) => {
          const target = current.versions.find((item) => item.id === version.id);
          if (!target) return;
          if (next.design) target.design = next.design;
          if (!thumbs) return;
          if (!target.candidates[0]) {
            target.candidates = [{ candidateId: designId, thumbnails: thumbs }];
          } else {
            target.candidates[0].thumbnails = thumbs;
          }
        });
        const publicVersion = written.versions.find((item) => item.id === version.id);
        if (publicVersion) updated.push(toPublicVersion(publicVersion));
      } catch (error) {
        console.error("refresh page previews failed", error);
      }
    }
    return updated;
  }

  private async callCreateDesign(
    create: StoredTool,
    pollCreate: StoredTool | undefined,
    text: string,
    designType?: string,
  ): Promise<ReturnType<typeof readGeneratedDesigns>> {
    const attempts = createDesignArgumentAttempts(create.inputSchema, text, { designType });
    if (!attempts.length) {
      const built = buildCreateDesignArguments(create.inputSchema, text, { designType });
      throw new CanvaError(built.ok ? "create-design の引数を組み立てられませんでした。" : built.reason, 501, "schema_unknown");
    }
    let lastError: CanvaError | undefined;
    for (const args of attempts) {
      try {
        const payload = await this.callTool("create-design", args, 90_000);
        return this.awaitDesignJob(payload, pollCreate, "create-design");
      } catch (error) {
        const canva = error instanceof CanvaError ? error : new CanvaError("Canvaがこの操作を完了できませんでした。", 502, "tool_error");
        lastError = canva;
        if (!isUnreadableArguments(canva)) throw canva;
      }
    }
    throw lastError ?? new CanvaError("create-design could not read its arguments.", 502, "tool_error");
  }

  private async awaitDesignJob(
    payload: unknown,
    pollTool: StoredTool | undefined,
    source: string,
  ): Promise<ReturnType<typeof readGeneratedDesigns>> {
    let current = readAsyncDesignJob(payload);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (!current.ok) {
        return { ok: false, code: current.code, reason: current.reason };
      }
      if (!current.pending) {
        return { ok: true, generation: current.generation, design: current.design };
      }
      if (!pollTool) {
        return {
          ok: false,
          code: "generation_incomplete",
          reason: `${source} が未完了です。完了待ちの ${pollToolName(source)} が tools/list に無いため、ここでは再問い合わせできません。`,
        };
      }
      const built = buildJobPollArguments(pollTool.inputSchema, current.jobId, current.continuationToken);
      if (!built.ok) return { ok: false, code: "schema_unknown", reason: built.reason };
      await sleep(Math.round(current.waitSeconds * 1000));
      const next = await this.callTool(pollTool.name, built.arguments, 60_000);
      current = readAsyncDesignJob(next);
    }
    return { ok: false, code: "generation_incomplete", reason: `${source} の完了待ちが時間切れになりました。` };
  }

  async adoptCandidate(versionId: string, candidateId: string): Promise<PublicVersion> {
    const session = await sessionStore.read(this.sessionId);
    const version = session?.versions.find((item) => item.id === versionId);
    if (!version) throw new CanvaError("その生成結果は見つかりません。", 404, "version");
    if (!version.candidates.some((item) => item.candidateId === candidateId)) {
      throw new CanvaError("その候補はこの生成結果にありません。", 400, "candidate");
    }
    if (version.design && version.selectedCandidateId === candidateId) return toPublicVersion(version);
    if (version.design && version.candidates.some((item) => item.candidateId === candidateId)) {
      const saved = await sessionStore.mutate(this.sessionId, (current) => {
        const target = current.versions.find((item) => item.id === versionId);
        if (target) target.selectedCandidateId = candidateId;
      });
      const updated = saved.versions.find((item) => item.id === versionId);
      if (updated?.design) return toPublicVersion(updated);
    }

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
    const oauth = await resolveMcpOAuthClient(this.redirectUri);
    let session = await sessionStore.read(this.sessionId);
    if (!session?.tokens?.accessToken) {
      throw new CanvaError("先に「Canvaと接続」を押してください。", 401, "disconnected");
    }
    const expiring = session.tokens.expiresAt !== null && session.tokens.expiresAt < Date.now() + 60_000;
    if (expiring) {
      if (!session.tokens.refreshToken) {
        throw new CanvaError("Canvaの接続期限が切れました。もう一度接続してください。", 401, "expired");
      }
      const next = await requestToken(refreshTokenBody(session.tokens.refreshToken), oauth.clientId, oauth.clientSecret);
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

  private async enrichWithPageThumbnails(
    parsed: Extract<ReturnType<typeof readGeneratedDesigns>, { ok: true }>,
  ): Promise<ReturnType<typeof readGeneratedDesigns>> {
    const designId = parsed.design?.id;
    if (!designId) return parsed;
    const tools = await this.ensureTools();
    let design = parsed.design;
    let pageUrls: string[] = [];

    const lookup = tools.find((item) => item.name === "get-design");
    if (lookup) {
      try {
        const built = buildDesignIdArguments(lookup.inputSchema, designId);
        if (built.ok) {
          const payload = await this.callTool("get-design", built.arguments, 30_000);
          const meta = readAnyDesign(payload);
          if (meta) design = { ...design, ...meta, id: designId };
          else {
            const job = readAsyncDesignJob(payload);
            if (job.ok && !job.pending && job.design) design = { ...design, ...job.design };
          }
        }
      } catch (error) {
        console.error("get-design preview lookup failed", error);
      }
    }

    const pages = tools.find((item) => item.name === "get-design-pages");
    if (pages) {
      try {
        const collected = await this.collectPagePreviews(pages, designId, design?.pageCount);
        pageUrls = collected.urls;
        if (collected.pageCount) {
          const current = design?.pageCount ?? 0;
          if (collected.pageCount > current) {
            design = { ...design, id: designId, pageCount: collected.pageCount };
          }
        } else if (pageUrls.length > (design?.pageCount ?? 0)) {
          design = { ...design, id: designId, pageCount: pageUrls.length };
        }
      } catch (error) {
        console.error("get-design-pages preview lookup failed", error);
      }
    }

    const ordered = pageUrls.length
      ? uniquePreviewUrls(pageUrls)
      : uniquePreviewUrls(parsed.generation.candidates.flatMap((item) => item.thumbnailUrls));
    if (!ordered.length) return { ...parsed, design };
    const candidates = parsed.generation.candidates.map((item) => ({
      ...item,
      thumbnailUrls: ordered,
    }));
    return {
      ok: true,
      generation: { ...parsed.generation, candidates },
      design,
    };
  }

  private async collectPagePreviews(
    tool: StoredTool,
    designId: string,
    knownCount?: number,
  ): Promise<{ urls: string[]; pageCount?: number }> {
    const urls: string[] = [];
    let pageCount = knownCount;
    let offset = 1;
    let cursor: string | undefined;
    const limit = 50;
    for (let page = 0; page < 12; page += 1) {
      const built = buildDesignIdArguments(tool.inputSchema, designId, {
        continuationToken: cursor,
        offset,
        limit,
      });
      if (!built.ok) break;
      const payload = await this.callTool(tool.name, built.arguments, 30_000);
      const extracted = extractDesignPages(payload);
      urls.push(...extracted.urls);
      pageCount = pageCountFromPayload(payload) ?? pageCount;
      const next = continuationTokenFrom(payload);
      if (next && next !== cursor) {
        cursor = next;
        offset = (extracted.lastIndex ?? offset) + 1;
        continue;
      }
      if (extracted.urls.length === 0) break;
      const last = extracted.lastIndex ?? offset + extracted.urls.length - 1;
      if (extracted.urls.length < limit) break;
      if (pageCount && last >= pageCount) break;
      offset = last + 1;
      cursor = undefined;
    }
    return { urls: uniquePreviewUrls(urls), pageCount: pageCount ?? (urls.length || undefined) };
  }

  private async retryIfCollapsed(
    parsed: Extract<ReturnType<typeof readGeneratedDesigns>, { ok: true }>,
    create: StoredTool | undefined,
    pollCreate: StoredTool | undefined,
    generate: StoredTool | undefined,
    pollGenerate: StoredTool | undefined,
    text: string,
    designType?: string,
  ): Promise<ReturnType<typeof readGeneratedDesigns>> {
    const expected = Math.max(slideCountFromPrompt(text), 1);
    if (expected <= 1) return parsed;
    const thumbs = uniquePreviewUrls(parsed.generation.candidates.flatMap((item) => item.thumbnailUrls));
    const counted = parsed.design?.pageCount;
    if (counted && counted >= expected) return parsed;
    if (thumbs.length >= expected) return parsed;
    if (counted !== 1 && thumbs.length > 1) return parsed;
    const retryText = collapseRetryPrompt(text, counted ?? thumbs.length, expected);
    let next: ReturnType<typeof readGeneratedDesigns>;
    try {
      if (create) next = await this.callCreateDesign(create, pollCreate, retryText, designType);
      else if (generate) {
        const built = buildGenerateArguments(generate.inputSchema, retryText, { designType });
        if (!built.ok) return parsed;
        const payload = await this.callTool("generate-design", built.arguments, 70_000);
        next = await this.awaitDesignJob(payload, pollGenerate, "generate-design");
      } else {
        return parsed;
      }
    } catch (error) {
      console.error("collapsed-design retry failed", error);
      return parsed;
    }
    if (!next.ok) return parsed;
    return this.enrichWithPageThumbnails(next);
  }
}

function hydrateThumbnails(urls: string[], fetchedAt: string): Promise<StoredThumbnail[]> {
  return Promise.all(
    uniquePreviewUrls(urls).slice(0, 40).map(async (url) => {
      let dataUrl: string | undefined;
      try {
        const image = await fetchCanvaThumbnail(url);
        const encoded = Buffer.from(image.body).toString("base64");
        const next = `data:${image.contentType};base64,${encoded}`;
        if (next.length < 900_000) dataUrl = next;
      } catch (error) {
        console.error("thumbnail hydrate failed", error);
      }
      return { url, fetchedAt, ephemeral: true as const, dataUrl };
    }),
  );
}

function isUnreadableArguments(error: CanvaError): boolean {
  return /could not read its arguments|invalid arguments|invalid_type|unrecognized key/i.test(error.message);
}

function pollToolName(source: string): string {
  return source === "create-design" ? "get-create-design-async-job" : "get-generate-design-async-job";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
