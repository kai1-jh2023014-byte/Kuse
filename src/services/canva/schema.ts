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

function isObjectSchema(schema: unknown): schema is JsonSchema {
  return Boolean(schema) && typeof schema === "object" && !Array.isArray(schema);
}

function isStringSchema(schema: JsonSchema | undefined): boolean {
  if (!schema) return false;
  const type = schema.type;
  if (Array.isArray(type)) return type.includes("string");
  return type === "string";
}

function hintScore(name: string, schema: JsonSchema): number {
  let score = 0;
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
export function buildGenerateArguments(schema: unknown, prompt: string): ArgBuild {
  if (!isObjectSchema(schema) || !schema.properties) {
    return {
      ok: false,
      reason:
        "TODO: generate-design の入力スキーマが tools/list にありません。引数名はドキュメントに未掲載のため、推測では送りません。",
    };
  }
  if (typeof schema.maxLength === "number" && prompt.length > schema.maxLength) {
    return { ok: false, reason: `プロンプトがスキーマの最大長 ${schema.maxLength} を超えています。` };
  }

  const strings = Object.entries(schema.properties).filter(([, value]) => isStringSchema(value));
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
  if (typeof field.maxLength === "number" && prompt.length > field.maxLength) {
    return { ok: false, reason: `プロンプトが「${name}」の最大長 ${field.maxLength} を超えています。` };
  }
  return { ok: true, arguments: { [name]: prompt } };
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
