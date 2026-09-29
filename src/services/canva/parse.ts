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
  | { ok: true; generation: ParsedGeneration }
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
  if (!isRecord(value) || typeof value.candidate_id !== "string" || !value.candidate_id) return null;
  return {
    candidateId: value.candidate_id,
    url: typeof value.url === "string" ? value.url : undefined,
    thumbnailUrls: readThumbnails(value.thumbnails),
  };
}

export function readGeneratedDesigns(payload: unknown): GenerationRead {
  const root = isRecord(payload) && isRecord(payload.job) ? payload.job : payload;
  if (!isRecord(root)) {
    return { ok: false, code: "unexpected_generation", reason: "generate-design の応答に job がありません。" };
  }
  const status = typeof root.status === "string" ? root.status : "";
  const jobId = typeof root.id === "string" ? root.id : "";
  const result = isRecord(root.result) ? root.result : null;
  const rawList = result && Array.isArray(result.generated_designs) ? result.generated_designs : null;
  const candidates = (rawList ?? []).map(readCandidate).filter((item): item is ParsedCandidate => item !== null);

  if (candidates.length > 0 && jobId) {
    return { ok: true, generation: { jobId, status: status || "success", candidates } };
  }

  if (status && status !== "success") {
    const detail = root.error === undefined ? "" : ` ${JSON.stringify(root.error).slice(0, 180)}`;
    return {
      ok: false,
      code: "generation_incomplete",
      reason: `TODO: generate-design のジョブ状態が「${status}」です。完了待ちの公式な取得APIはドキュメントに無いため、ここでは再問い合わせしません。${detail}`,
    };
  }

  return {
    ok: false,
    code: "unexpected_generation",
    reason: "generate-design の応答から候補（candidate_id）を読めませんでした。",
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
