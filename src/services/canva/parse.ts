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
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (!Array.isArray(result.content)) return result;
  const text = result.content.find(
    (item) => isRecord(item) && item.type === "text" && typeof item.text === "string",
  );
  if (!isRecord(text) || typeof text.text !== "string") return result;
  try {
    return JSON.parse(text.text) as unknown;
  } catch {
    return { text: text.text };
  }
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
  collectThumbnails(value.thumbnails, into);
  collectThumbnails(value.thumbnail, into);
  collectThumbnails(value.previews, into);
  collectThumbnails(value.pages, into);
  collectThumbnails(value.design, into);
  collectThumbnails(value.design_summary, into);
  collectThumbnails(value.generated_designs, into);
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

  const thumbs: string[] = [];
  collectThumbnails(result, thumbs);
  collectThumbnails(root, thumbs);

  const rawList = isRecord(result) && Array.isArray(result.generated_designs) ? result.generated_designs : null;
  const fromList = (rawList ?? []).map(readCandidate).filter((item): item is ParsedCandidate => item !== null);

  const designValue =
    (isRecord(result) && (result.design ?? result.design_summary)) ??
    payload.design ??
    payload.design_summary;
  const design = designFromUnknown(designValue) ?? (isRecord(result) ? designFromUnknown(result) : null);
  const uniqueThumbs = [...new Set(thumbs.filter(Boolean))];

  let candidates = fromList;
  if (candidates.length === 0 && design) {
    candidates = [candidateFromDesign(design, uniqueThumbs)];
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
