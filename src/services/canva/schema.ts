import { extractDeckOutline } from "@/services/ai/presentation-craft";

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  title?: string;
  enum?: unknown[];
  maxLength?: number;
}

export type ArgBuild =
  | { ok: true; arguments: Record<string, unknown> }
  | { ok: false; reason: string };

const PROMPT_HINT = /prompt|brief|query|instruction|request|description/i;
const TYPE_FIELD = /^(design_)?type$/i;
const SKIP_PROMPT_FIELD = /^(user_intent|length|verbatim|outline)$/i;

function isObjectSchema(schema: unknown): schema is JsonSchema {
  return Boolean(schema) && typeof schema === "object" && !Array.isArray(schema);
}

function isStringSchema(schema: JsonSchema | undefined): boolean {
  if (!schema) return false;
  const type = schema.type;
  if (Array.isArray(type)) return type.includes("string");
  return type === "string" || Boolean(stringEnum(schema).length);
}

function stringEnum(schema: JsonSchema | undefined): string[] {
  if (!schema?.enum) return [];
  return schema.enum.filter((value): value is string => typeof value === "string");
}

const FALLBACK_DESIGN_TYPES = [
  "business_card",
  "card",
  "desktop_wallpaper",
  "doc",
  "document",
  "email",
  "facebook_cover",
  "facebook_post",
  "flyer",
  "infographic",
  "instagram_post",
  "invitation",
  "logo",
  "phone_wallpaper",
  "photo_collage",
  "pinterest_pin",
  "postcard",
  "poster",
  "presentation",
  "proposal",
  "report",
  "resume",
  "twitter_post",
  "your_story",
  "youtube_banner",
  "youtube_thumbnail",
];

function looksLikeDesignTypes(values: string[]): boolean {
  return values.includes("presentation") || values.includes("poster") || values.includes("instagram_post");
}

export function purposeBlock(prompt: string): string {
  const match = /【目的】([\s\S]*?)(?=\n【|$)/.exec(prompt);
  return match?.[1]?.trim() ?? "";
}

export function extractRequiredCopy(prompt: string): string[] {
  const purpose = purposeBlock(prompt);
  const split = purpose.split(/文言は改変しないでください[。.]?\s*/);
  const rest = (split[1] ?? "").split(/\nその他の要望/)[0];
  return rest
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^サイズ|^想定する読み手/.test(line));
}

export function composeCanvaQuery(prompt: string, _designType: string): string {
  const copy = extractRequiredCopy(prompt);
  const format =
    "Create exactly one 16:9 presentation slide (one page). Do not generate a multi-page deck. Do not invent other slides. This is a talk, not a YouTube thumbnail, poster, or social post.";
  const copyRule = copy.length
    ? `Place these strings exactly, unaltered. Do not replace them with placeholders such as 「タイトル」「大見出し」 or lorem:\n${copy.map((line) => `- ${line}`).join("\n")}`
    : "Do not use placeholder labels such as タイトル, 大見出し, Slide 1, or lorem as the main text.";
  return `${format}\n${copyRule}\nFollow the Japanese instructions below for layout, color, and type.\n\n${prompt}`;
}

export function inferCanvaDesignType(_prompt: string): string {
  return "presentation";
}

export function pickDesignType(_prompt: string, allowed: string[]): string {
  if (allowed.includes("presentation")) return "presentation";
  return allowed[0] ?? "presentation";
}

function isPromptField(name: string, schema: JsonSchema): boolean {
  if (stringEnum(schema).length) return false;
  if (TYPE_FIELD.test(name) || SKIP_PROMPT_FIELD.test(name)) return false;
  return isStringSchema(schema);
}

function hintScore(name: string, schema: JsonSchema): number {
  let score = 0;
  if (/^brief$/i.test(name)) score += 8;
  if (PROMPT_HINT.test(name)) score += 5;
  if (schema.title && PROMPT_HINT.test(schema.title)) score += 4;
  if (schema.description && PROMPT_HINT.test(schema.description)) score += 4;
  return score;
}

function propertyNames(schema: JsonSchema): string {
  return Object.keys(schema.properties ?? {}).join(", ") || "（なし）";
}

/**
 * Choose the prompt argument from the tool's published inputSchema.
 * A single string input, a single required string, or one field whose own
 * name/description identifies it as the brief, is filled. Anything ambiguous
 * is left unsent.
 */
export function buildGenerateArguments(
  schema: unknown,
  prompt: string,
  options?: { designType?: string },
): ArgBuild {
  if (!isObjectSchema(schema) || !schema.properties) {
    return {
      ok: false,
      reason:
        "TODO: generate-design の入力スキーマが tools/list にありません。引数名はドキュメントに未掲載のため、推測では送りません。",
    };
  }
  const designType = options?.designType?.trim() || pickDesignType(prompt, FALLBACK_DESIGN_TYPES);
  const query = composeCanvaQuery(prompt, designType);
  if (typeof schema.maxLength === "number" && query.length > schema.maxLength) {
    return { ok: false, reason: `プロンプトがスキーマの最大長 ${schema.maxLength} を超えています。` };
  }

  const strings = Object.entries(schema.properties).filter(([name, value]) => isPromptField(name, value));
  if (strings.length === 0) {
    return {
      ok: false,
      reason: `TODO: generate-design に文字列の引数がありません（${propertyNames(schema)}）。推測では送りません。`,
    };
  }

  let chosen: [string, JsonSchema] | null = null;
  if (strings.length === 1) {
    chosen = strings[0];
  } else {
    const required = new Set(schema.required ?? []);
    const requiredStrings = strings.filter(([name]) => required.has(name));
    if (requiredStrings.length === 1) {
      chosen = requiredStrings[0];
    } else {
      const ranked = strings
        .map(([name, value]) => ({ name, value, score: hintScore(name, value) }))
        .sort((a, b) => b.score - a.score);
      if (ranked[0] && ranked[0].score > 0 && ranked[0].score > (ranked[1]?.score ?? 0)) {
        chosen = [ranked[0].name, ranked[0].value];
      }
    }
  }

  if (!chosen) {
    return {
      ok: false,
      reason: `TODO: generate-design のどの引数にプロンプトを入れるか、スキーマから一意に決まりません（${propertyNames(schema)}）。`,
    };
  }

  const [name, field] = chosen;
  if (typeof field.maxLength === "number" && query.length > field.maxLength) {
    return { ok: false, reason: `プロンプトが「${name}」の最大長 ${field.maxLength} を超えています。` };
  }

  const args: Record<string, unknown> = { [name]: query };
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (key === name) continue;
    const values = stringEnum(spec);
    if (looksLikeDesignTypes(values) || TYPE_FIELD.test(key) || /^format$/i.test(key)) {
      const allowed = values.length ? values : FALLBACK_DESIGN_TYPES;
      args[key] = allowed.includes(designType) ? designType : pickDesignType(prompt, allowed);
      continue;
    }
    if (key === "user_intent") {
      args[key] = `Create a ${designType.split("_").join(" ")} that uses the exact copy from the KUSE brief.`;
    }
    if (key === "outline") {
      const outline = extractDeckOutline(prompt);
      if (outline) args[key] = outline;
    }
  }

  const missing = (schema.required ?? []).filter((key) => args[key] === undefined);
  if (missing.length) {
    return {
      ok: false,
      reason: `TODO: generate-design の必須引数 ${missing.join(", ")} をスキーマから埋められません。`,
    };
  }
  return { ok: true, arguments: args };
}

function findCandidateKey(properties: Record<string, JsonSchema>): string | null {
  if (isStringSchema(properties.candidate_id)) return "candidate_id";
  for (const [name, schema] of Object.entries(properties)) {
    if (!isStringSchema(schema)) continue;
    const description = `${schema.title ?? ""} ${schema.description ?? ""}`;
    if (/candidate_id/i.test(name) || /candidate_id/i.test(description)) return name;
  }
  return null;
}

function findJobArgs(
  properties: Record<string, JsonSchema>,
  jobId: string,
): Record<string, unknown> | null {
  if (isStringSchema(properties.job_id)) return { job_id: jobId };
  const job = properties.job;
  if (job?.properties?.id && isStringSchema(job.properties.id)) return { job: { id: jobId } };
  for (const [name, schema] of Object.entries(properties)) {
    if (!isStringSchema(schema)) continue;
    const description = `${schema.title ?? ""} ${schema.description ?? ""}`;
    if (/^job_?id$/i.test(name) || /job\.id|job id/i.test(description)) return { [name]: jobId };
  }
  return null;
}

/**
 * Canva AI (Magic Studio) on MCP: create-design.
 * Official required field is `brief`. Send the full KUSE prompt — do not summarize.
 */
export function buildCreateDesignArguments(
  schema: unknown,
  prompt: string,
  options?: { designType?: string },
): ArgBuild {
  const built = buildGenerateArguments(schema, prompt, options);
  if (!built.ok) {
    return {
      ok: false,
      reason: built.reason.replaceAll("generate-design", "create-design"),
    };
  }
  if (!isObjectSchema(schema) || !schema.properties) return built;
  const args = { ...built.arguments };
  if (isPromptField("brief", schema.properties.brief) && args.brief === undefined) {
    const designType = options?.designType?.trim() || pickDesignType(prompt, FALLBACK_DESIGN_TYPES);
    args.brief = composeCanvaQuery(prompt, designType);
  }
  const missing = (schema.required ?? []).filter((key) => args[key] === undefined);
  if (missing.length) {
    return {
      ok: false,
      reason: `TODO: create-design の必須引数 ${missing.join(", ")} をスキーマから埋められません。`,
    };
  }
  return { ok: true, arguments: args };
}

export function buildJobPollArguments(
  schema: unknown,
  jobId: string,
  continuationToken?: string,
): ArgBuild {
  if (!isObjectSchema(schema) || !schema.properties) {
    return {
      ok: false,
      reason: "TODO: 非同期ジョブ取得ツールの入力スキーマが tools/list にありません。",
    };
  }
  const args: Record<string, unknown> = {};
  if (isStringSchema(schema.properties.job_id)) args.job_id = jobId;
  else if (isStringSchema(schema.properties.jobId)) args.jobId = jobId;
  else if (schema.properties.job?.properties?.id && isStringSchema(schema.properties.job.properties.id)) {
    args.job = { id: jobId };
  }
  if (continuationToken) {
    if (isStringSchema(schema.properties.continuation_token)) args.continuation_token = continuationToken;
    else if (isStringSchema(schema.properties.continuationToken)) args.continuationToken = continuationToken;
  }
  const missing = (schema.required ?? []).filter((key) => args[key] === undefined);
  if (missing.length || (args.job_id === undefined && args.jobId === undefined && args.job === undefined)) {
    return {
      ok: false,
      reason: `TODO: ジョブIDの引数がスキーマから特定できません（${propertyNames(schema)}）。`,
    };
  }
  return { ok: true, arguments: args };
}

/**
 * create-design-from-candidate documents `candidate_id` and the generate job's `job.id`.
 * Those values are sent only when the live inputSchema has a matching field.
 */
export function buildCreateArguments(schema: unknown, candidateId: string, jobId: string): ArgBuild {
  if (!isObjectSchema(schema) || !schema.properties) {
    return {
      ok: false,
      reason:
        "TODO: create-design-from-candidate の入力スキーマが tools/list にありません。candidate_id と job.id の送り方を推測では確定しません。",
    };
  }

  const candidateKey = findCandidateKey(schema.properties);
  const jobArgs = findJobArgs(schema.properties, jobId);
  if (!candidateKey || !jobArgs) {
    return {
      ok: false,
      reason: `TODO: 候補IDまたはジョブIDの引数がスキーマから特定できません（${propertyNames(schema)}）。`,
    };
  }

  const args: Record<string, unknown> = { [candidateKey]: candidateId, ...jobArgs };
  const missing = (schema.required ?? []).filter((key) => args[key] === undefined);
  if (missing.length) {
    return {
      ok: false,
      reason: `TODO: create-design-from-candidate の必須引数 ${missing.join(", ")} の値がドキュメントにありません。`,
    };
  }
  return { ok: true, arguments: args };
}
