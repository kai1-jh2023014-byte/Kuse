export interface ParsedCandidate {
  candidateId: string;
  url?: string;
  thumbnailUrls: string[];
}

export interface ParsedGeneration {
  jobId: string;
  status: string;
  candidates: ParsedCandidate[];
}

export interface ParsedDesign {
  id: string;
  title?: string;
  editUrl?: string;
  viewUrl?: string;
  createdAt?: number;
  updatedAt?: number;
  pageCount?: number;
}

export type GenerationRead =
  | { ok: true; generation: ParsedGeneration; design?: ParsedDesign }
  | { ok: false; code: string; reason: string };

export type AsyncJobRead =
  | { ok: true; pending: true; jobId: string; waitSeconds: number; continuationToken?: string }
  | { ok: true; pending: false; generation: ParsedGeneration; design?: ParsedDesign }
  | { ok: false; code: string; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseMcpMessage(contentType: string, body: string, id: number | null): unknown {
  const trimmed = body.trim();
  if (!trimmed) {
    if (id === null) return null;
    throw new Error("Canva MCPの応答が空でした");
  }
  const looksLikeSse =
    contentType.includes("text/event-stream") || trimmed.startsWith("data:") || trimmed.startsWith("event:");
  if (!looksLikeSse) return JSON.parse(trimmed) as unknown;

  const messages: unknown[] = [];
  for (const block of trimmed.split(/\n\n+/)) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    messages.push(JSON.parse(data) as unknown);
  }
  if (id === null) return messages.at(-1) ?? null;
  const match = messages.find((item) => isRecord(item) && item.id === id);
  if (!match) throw new Error("Canva MCPの応答に対応するメッセージがありません");
  return match;
}

/** Tool results arrive as text content, and sometimes as structuredContent. */
export function extractToolPayload(result: unknown): unknown {
  if (!isRecord(result)) return result;
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    const structured = result.structuredContent;
    if (!isRecord(structured) || Object.keys(structured).length > 0) return structured;
  }
  if (!Array.isArray(result.content)) return result;
  const texts = result.content.filter(
    (item) => isRecord(item) && item.type === "text" && typeof item.text === "string",
  );
  let parsed: unknown = result;
  for (const item of texts) {
    if (!isRecord(item) || typeof item.text !== "string") continue;
    try {
      const value = JSON.parse(item.text) as unknown;
      parsed = value;
      if (isRecord(value) && (Array.isArray(value.items) || Array.isArray(value.pages))) return value;
    } catch {
      parsed = { text: item.text };
    }
  }
  return parsed;
}

function readThumbnails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    if (isRecord(item) && typeof item.url === "string" && item.url) urls.push(item.url);
  }
  return urls;
}

function readCandidate(value: unknown): ParsedCandidate | null {
  if (!isRecord(value)) return null;
  const id =
    (typeof value.candidate_id === "string" && value.candidate_id) ||
    (typeof value.id === "string" && value.id) ||
    "";
  if (!id) return null;
  return {
    candidateId: id,
    url: typeof value.url === "string" ? value.url : undefined,
    thumbnailUrls: [...readThumbnails(value.thumbnails), ...readThumbnails(value.preview)],
  };
}

function collectThumbnails(value: unknown, into: string[]): void {
  if (!value) return;
  if (typeof value === "string" && /^https?:\/\//.test(value)) {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectThumbnails(item, into);
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.url === "string") into.push(value.url);
  if (typeof value.thumbnail_url === "string") into.push(value.thumbnail_url);
  if (typeof value.thumbnailUrl === "string") into.push(value.thumbnailUrl);
  if (typeof value.preview_url === "string") into.push(value.preview_url);
  collectThumbnails(value.thumbnails, into);
  collectThumbnails(value.thumbnail, into);
  collectThumbnails(value.preview, into);
  collectThumbnails(value.previews, into);
  collectThumbnails(value.urls, into);
  collectThumbnails(value.items, into);
  collectThumbnails(value.pages, into);
  collectThumbnails(value.design, into);
  collectThumbnails(value.design_summary, into);
  collectThumbnails(value.generated_designs, into);
}

/** Image hosts Canva signs for previews. Edit/view pages on www.canva.com are not previews. */
export function isCanvaPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !isAllowedCanvaHost(parsed.hostname)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "www.canva.com" || host === "canva.com") {
      return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(parsed.pathname);
    }
    return true;
  } catch {
    return false;
  }
}

export function extractPreviewUrls(payload: unknown): string[] {
  const thumbs: string[] = [];
  collectThumbnails(payload, thumbs);
  return uniquePreviewUrls(thumbs);
}

/** Drop only the same asset with a new signature. Keep query ids so page 1 and page 2 stay distinct. */
export function uniquePreviewUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!isCanvaPreviewUrl(url)) continue;
    const key = thumbnailAssetKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export function thumbnailAssetKey(url: string): string {
  try {
    const parsed = new URL(url);
    const params = new URLSearchParams(parsed.search);
    for (const key of [...params.keys()]) {
      if (/^(sig|signature|token|expires|expiry|exp|ttl|x-amz-|x-goog-)/i.test(key)) params.delete(key);
    }
    params.sort();
    const query = params.toString();
    return `${parsed.hostname.toLowerCase()}${parsed.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function pageItemsFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.pages)) return value.pages;
  if (Array.isArray(value.design_pages)) return value.design_pages;
  for (const key of ["result", "job", "pages", "design"] as const) {
    const nested: unknown = value[key];
    if (nested && nested !== value) {
      const found = pageItemsFrom(nested);
      if (found.length) return found;
    }
  }
  return [];
}

function pageThumbUrl(item: unknown): string | undefined {
  if (!isRecord(item)) return undefined;
  const thumb = item.thumbnail;
  if (isRecord(thumb) && typeof thumb.url === "string" && isCanvaPreviewUrl(thumb.url)) return thumb.url;
  if (typeof item.thumbnail_url === "string" && isCanvaPreviewUrl(item.thumbnail_url)) return item.thumbnail_url;
  const urls = extractPreviewUrls(item);
  return urls[0];
}

function pageIndexOf(item: unknown, fallback: number): number {
  if (!isRecord(item)) return fallback;
  if (typeof item.index === "number") return item.index;
  if (typeof item.page_number === "number") return item.page_number;
  if (typeof item.pageNumber === "number") return item.pageNumber;
  return fallback;
}

/** Ordered page thumbnails from get-design-pages. Do not mix in the design cover. */
export function extractDesignPages(payload: unknown): { urls: string[]; lastIndex?: number } {
  const items = pageItemsFrom(payload);
  const rows = items
    .map((item, position) => {
      const url = pageThumbUrl(item);
      if (!url) return null;
      return { url, index: pageIndexOf(item, position + 1) };
    })
    .filter((row): row is { url: string; index: number } => Boolean(row));
  rows.sort((a, b) => a.index - b.index);
  const urls = uniquePreviewUrls(rows.map((row) => row.url));
  const lastIndex = rows.at(-1)?.index;
  return { urls, lastIndex };
}

export function readAnyDesign(payload: unknown): ParsedDesign | null {
  if (!isRecord(payload)) return null;
  return (
    designFromUnknown(payload.design_summary) ??
    designFromUnknown(payload.design) ??
    (typeof payload.id === "string" ? designFromUnknown(payload) : null)
  );
}

function readToken(value: Record<string, unknown>): string | undefined {
  if (typeof value.continuation_token === "string") return value.continuation_token;
  if (typeof value.continuationToken === "string") return value.continuationToken;
  if (typeof value.next_cursor === "string") return value.next_cursor;
  if (typeof value.nextCursor === "string") return value.nextCursor;
  return undefined;
}

export function continuationTokenFrom(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const direct = readToken(payload);
  if (direct) return direct;
  for (const key of ["job", "result", "pages"]) {
    const nested = payload[key];
    if (isRecord(nested)) {
      const inner = readToken(nested);
      if (inner) return inner;
    }
  }
  return undefined;
}

export function pageCountFromPayload(payload: unknown): number | undefined {
  if (!isRecord(payload)) return undefined;
  if (typeof payload.page_count === "number") return payload.page_count;
  if (typeof payload.pageCount === "number") return payload.pageCount;
  const design = payload.design ?? payload.design_summary;
  if (isRecord(design) && typeof design.page_count === "number") return design.page_count;
  if (isRecord(design) && typeof design.pageCount === "number") return design.pageCount;
  return undefined;
}

function candidateFromDesign(design: ParsedDesign, extraThumbs: string[]): ParsedCandidate {
  return {
    candidateId: design.id,
    url: design.editUrl ?? design.viewUrl,
    thumbnailUrls: extraThumbs,
  };
}

function readJobId(root: Record<string, unknown>): string {
  if (typeof root.id === "string") return root.id;
  if (typeof root.job_id === "string") return root.job_id;
  if (isRecord(root.job) && typeof root.job.id === "string") return root.job.id;
  return "";
}

function readWaitSeconds(payload: Record<string, unknown>): number {
  const policy = isRecord(payload.polling_policy) ? payload.polling_policy : payload;
  const wait = policy.wait_seconds ?? policy.waitSeconds;
  return typeof wait === "number" && wait > 0 && wait < 20 ? wait : 2;
}

function readContinuation(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.continuation_token === "string") return payload.continuation_token;
  if (typeof payload.continuationToken === "string") return payload.continuationToken;
  return undefined;
}

function designFromUnknown(value: unknown): ParsedDesign | null {
  const summary = readDesignSummary({ design_summary: value });
  if (summary.ok) return summary.design;
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const urls = isRecord(value.urls) ? value.urls : value;
  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : undefined,
    editUrl:
      (typeof urls.edit_url === "string" && urls.edit_url) ||
      (typeof value.edit_url === "string" && value.edit_url) ||
      undefined,
    viewUrl:
      (typeof urls.view_url === "string" && urls.view_url) ||
      (typeof value.view_url === "string" && value.view_url) ||
      undefined,
    pageCount: typeof value.page_count === "number" ? value.page_count : undefined,
  };
}

export function readGeneratedDesigns(payload: unknown): GenerationRead {
  const parsed = readAsyncDesignJob(payload);
  if (!parsed.ok) return parsed;
  if (parsed.pending) {
    return {
      ok: false,
      code: "generation_incomplete",
      reason: `generate-design のジョブ状態が未完了です。完了待ちツールがあれば再問い合わせします。`,
    };
  }
  return { ok: true, generation: parsed.generation, design: parsed.design };
}

export function readAsyncDesignJob(payload: unknown): AsyncJobRead {
  if (!isRecord(payload)) {
    return { ok: false, code: "unexpected_generation", reason: "Canvaの生成応答が空です。" };
  }
  const root = isRecord(payload.job) ? payload.job : payload;
  if (!isRecord(root)) {
    return { ok: false, code: "unexpected_generation", reason: "生成ジョブの応答に job がありません。" };
  }
  const status = typeof root.status === "string" ? root.status : typeof payload.status === "string" ? payload.status : "";
  const jobId = readJobId(root) || readJobId(payload);
  const result = isRecord(root.result) ? root.result : isRecord(payload.result) ? payload.result : payload;
  const failed = /fail|error|cancel/i.test(status);
  if (failed) {
    const detail = root.error === undefined ? "" : ` ${JSON.stringify(root.error).slice(0, 180)}`;
    return { ok: false, code: "generation_failed", reason: `Canva AIの生成が失敗しました。${detail}`.trim() };
  }

  const thumbs = extractPreviewUrls(result).concat(extractPreviewUrls(root)).concat(extractPreviewUrls(payload));

  const rawList = isRecord(result) && Array.isArray(result.generated_designs) ? result.generated_designs : null;
  const fromList = (rawList ?? []).map(readCandidate).filter((item): item is ParsedCandidate => item !== null);

  const designValue =
    (isRecord(result) && (result.design ?? result.design_summary)) ??
    payload.design ??
    payload.design_summary;
  const design = designFromUnknown(designValue) ?? (isRecord(result) ? designFromUnknown(result) : null);
  const uniqueThumbs = uniquePreviewUrls(thumbs);

    let candidates = fromList.map((item) => ({
      ...item,
      thumbnailUrls: item.thumbnailUrls.filter(isCanvaPreviewUrl),
    }));
  if (candidates.length === 0 && design) {
    candidates = [candidateFromDesign(design, uniqueThumbs)];
  } else if (uniqueThumbs.length) {
    candidates = candidates.map((item) => ({
      ...item,
      thumbnailUrls: [...new Set([...item.thumbnailUrls, ...uniqueThumbs])],
    }));
  }

  if (candidates.length > 0) {
    return {
      ok: true,
      pending: false,
      generation: { jobId: jobId || candidates[0].candidateId, status: status || "success", candidates },
      design: design ?? undefined,
    };
  }

  const pending =
    !status ||
    /progress|pending|queued|running|in_progress|processing/i.test(status) ||
    Boolean(payload.polling_policy) ||
    Boolean(readContinuation(payload));
  if (pending && jobId) {
    return {
      ok: true,
      pending: true,
      jobId,
      waitSeconds: readWaitSeconds(payload),
      continuationToken: readContinuation(payload),
    };
  }

  return {
    ok: false,
    code: "unexpected_generation",
    reason: "Canva AIの応答からデザインまたは候補を読めませんでした。",
  };
}

export function readDesignSummary(payload: unknown): { ok: true; design: ParsedDesign } | { ok: false; reason: string } {
  if (!isRecord(payload) || !isRecord(payload.design_summary)) {
    return { ok: false, reason: "create-design-from-candidate の応答に design_summary がありません。" };
  }
  const summary = payload.design_summary;
  if (typeof summary.id !== "string" || !summary.id) {
    return { ok: false, reason: "design_summary.id がありません。" };
  }
  const urls = isRecord(summary.urls) ? summary.urls : {};
  return {
    ok: true,
    design: {
      id: summary.id,
      title: typeof summary.title === "string" ? summary.title : undefined,
      editUrl: typeof urls.edit_url === "string" ? urls.edit_url : undefined,
      viewUrl: typeof urls.view_url === "string" ? urls.view_url : undefined,
      createdAt: typeof summary.created_at === "number" ? summary.created_at : undefined,
      updatedAt: typeof summary.updated_at === "number" ? summary.updated_at : undefined,
      pageCount: typeof summary.page_count === "number" ? summary.page_count : undefined,
    },
  };
}

export function isAllowedCanvaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "canva.com" || host.endsWith(".canva.com") || host === "canva.ai" || host.endsWith(".canva.ai");
}
