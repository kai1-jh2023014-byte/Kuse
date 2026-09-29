import type { DesignInterpretation } from "./evaluation-types";
import type { AnalyzeImageInput, DesignBrief, DesignProfile, DiscoveredTrait, RawImageSignals } from "./types";

export type ProviderMode = "heuristic" | "vision";

export function providerMode(): ProviderMode {
  const requested = (process.env.AI_PROVIDER ?? "auto").toLowerCase();
  if (requested === "heuristic") return "heuristic";
  if (!process.env.OPENAI_API_KEY) return "heuristic";
  return "vision";
}

export function configuredModel(): string | null {
  if (providerMode() !== "vision") return null;
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

interface VisionPayload {
  narrative?: string;
  mood?: string[];
  extra_tendencies?: Array<{ statement?: string; why?: string }>;
  discovered?: Array<{ label?: string; detail?: string }>;
  avoid?: string[];
  typography_style?: string;
  visual_notes?: string;
}

export async function enrichProfile(
  profile: DesignProfile,
  items: AnalyzeImageInput[],
): Promise<DesignProfile> {
  const thumbs = items
    .filter((item) => item.thumbnailDataUrl)
    .slice(-6)
    .map((item) => item.thumbnailDataUrl as string);
  const measured = items.map((item) => ({
    filename: item.signals.filename,
    background: item.signals.background.hex,
    main: item.signals.mainColors,
    accent: item.signals.accentColors,
    brightness: item.signals.brightness,
    whitespace: item.signals.whitespace,
    contrast: item.signals.contrast,
    photoScore: item.signals.photoScore,
    textScore: item.signals.textScore,
    verticalBalance: item.signals.verticalBalance,
    horizontalBalance: item.signals.horizontalBalance,
  }));

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: [
        "あなたは、複数のデザインを見比べて、作者が無意識に繰り返している癖を言語化するデザインディレクターです。",
        "計測値と矛盾する色や枚数を作らないでください。HEXは計測値を優先します。",
        "固定の形容詞リストに無理に当てはめず、作品同士に共通する行動を自由に見つけてください。",
        "日本語のJSONだけを返してください。",
        "形式: {\"narrative\":\"\",\"mood\":[],\"extra_tendencies\":[{\"statement\":\"\",\"why\":\"\"}],\"discovered\":[{\"label\":\"\",\"detail\":\"\"}],\"avoid\":[],\"typography_style\":\"\",\"visual_notes\":\"\"}",
        `作品数: ${profile.sampleCount}`,
        `計測の要約: ${JSON.stringify(measured)}`,
        `すでに抽出した癖: ${JSON.stringify(profile.personal_tendencies.map((item) => item.statement))}`,
      ].join("\n"),
    },
    ...thumbs.map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  ];

  const raw = await chat({
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You reply with JSON only." },
      { role: "user", content },
    ],
  });
  const parsed = parseJson(raw);
  return applyVision(profile, parsed);
}

export async function polishPrompt(input: {
  draft: string;
  brief: DesignBrief;
  styleStrength: number;
  profile: DesignProfile | null;
}): Promise<string> {
  const raw = await chat({
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content:
          "あなたはCanva AIに貼るデザイン指示を書く編集者です。出力は指示本文だけにしてください。見出し【目的】【このスライドの役割】【レイアウト】【カラー】【タイポグラフィ】【ビジュアル】【雰囲気】【避けること】【自分らしさの強度】は、下書きにあるものを残してください。【このスライドの役割】の順番、感情、言い方は書き換えないでください。",
      },
      {
        role: "user",
        content: [
          "下書きは画像計測に基づく事実です。HEX、枚数、支持（n点中m点）は改変しないでください。",
          "箇条書きの羅列ではなく、余白・文字サイズ・色の役割の関係が伝わる文章にしてください。",
          `自分らしさの強度は ${input.styleStrength} / 100 です。低いときは個人の癖を弱めてください。`,
          `目的: ${input.brief.purpose}`,
          `下書き:\n${input.draft}`,
        ].join("\n\n"),
      },
    ],
  });
  return raw.trim();
}

/**
 * Asks a vision model about composition only.
 * Callers must keep color, contrast, and spacing numbers from pixel measurement.
 */
export async function interpretGeneratedDesign(input: {
  signals: RawImageSignals;
  profile: DesignProfile;
  brief: DesignBrief;
  imageDataUrl: string;
}): Promise<DesignInterpretation> {
  const measured = {
    background: input.signals.background.hex,
    accent: input.signals.accentColors,
    main: input.signals.mainColors,
    brightness: input.signals.brightness,
    contrast: input.signals.contrast,
    whitespace: input.signals.whitespace,
    horizontalBalance: input.signals.horizontalBalance,
    verticalBalance: input.signals.verticalBalance,
    titleDominance: input.signals.titleDominance,
  };
  const raw = await chat({
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたはデザインの構図を読む人です。良し悪しは判定しないでください。色のHEXや明度の数値は計測値を書き換えないでください。日本語のJSONだけを返してください。",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "計測値が色と余白の事実です。あなたは構図、レイアウト、文字の大小関係、情報密度、視線、デザイン上の特徴だけを書いてください。",
              "形式: {\"layout\":\"\",\"typography\":\"\",\"density\":\"\",\"gaze\":\"\",\"features\":[],\"requirementNote\":\"\"}",
              `プロファイル: ${input.profile.reading.signature}`,
              `要求: ${input.brief.purpose}`,
              `計測: ${JSON.stringify(measured)}`,
            ].join("\n"),
          },
          { type: "image_url", image_url: { url: input.imageDataUrl } },
        ],
      },
    ],
  });
  const parsed = parseJson(raw) as DesignInterpretation & { requirementNote?: string };
  return {
    layout: clean(parsed.layout),
    typography: clean(parsed.typography),
    density: clean(parsed.density),
    gaze: clean(parsed.gaze),
    features: Array.isArray(parsed.features)
      ? parsed.features
          .map((item) => clean(String(item)))
          .filter((item): item is string => Boolean(item))
          .slice(0, 4)
      : [],
    requirementNote: clean(parsed.requirementNote),
  };
}

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 180) : undefined;
}

function applyVision(profile: DesignProfile, payload: VisionPayload): DesignProfile {
  const extra = (payload.extra_tendencies ?? [])
    .map((item) => (item.statement ?? "").trim())
    .filter((statement) => statement.length >= 8 && statement.length <= 160)
    .filter((statement) => !profile.personal_tendencies.some((item) => overlaps(item.statement, statement)))
    .slice(0, 4)
    .map((statement, index): DesignProfile["personal_tendencies"][number] => ({
      id: `vision.${index}-${hash(statement)}`,
      statement,
      evidence: "画像を見たモデルが、計測の共通点に加えて指摘",
      confidence: profile.sampleCount >= 2 ? 0.66 : 0.4,
      category: "vision",
      supportCount: profile.sampleCount,
      sampleCount: profile.sampleCount,
    }));

  const discovered: DiscoveredTrait[] = (payload.discovered ?? [])
    .map((item, index) => ({
      id: `vision.discovered.${index}-${hash(item.label ?? item.detail ?? "")}`,
      label: (item.label ?? "").trim() || "モデルが見つけた特徴",
      detail: (item.detail ?? "").trim(),
      confidence: profile.sampleCount >= 2 ? 0.62 : 0.38,
      evidence: `${profile.sampleCount}点の画像を照合`,
      source: "vision" as const,
    }))
    .filter((item) => item.detail.length >= 6)
    .slice(0, 5);

  const mood = unique([...(payload.mood ?? []).map((item) => item.trim()).filter(Boolean), ...profile.mood]).slice(0, 8);
  const avoid = unique([...profile.avoid, ...(payload.avoid ?? []).map((item) => item.trim()).filter(Boolean)]).slice(0, 8);

  return {
    ...profile,
    analysisMode: "vision",
    narrative: payload.narrative?.trim() || profile.narrative,
    mood,
    avoid,
    personal_tendencies: [...profile.personal_tendencies, ...extra].slice(0, 14),
    discovered: [...profile.discovered, ...discovered].slice(0, 12),
    typography: payload.typography_style?.trim()
      ? { ...profile.typography, style: payload.typography_style.trim() }
      : profile.typography,
    extensions: {
      ...profile.extensions,
      visualNotes: payload.visual_notes?.trim() || profile.extensions.visualNotes,
    },
  };
}

async function chat(body: Record<string, unknown>): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("missing api key");
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, ...body }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`vision request failed (${response.status})`);
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("empty vision response");
  return content;
}

function parseJson(raw: string): VisionPayload {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("vision json missing");
  return JSON.parse(raw.slice(start, end + 1)) as VisionPayload;
}

function overlaps(a: string, b: string): boolean {
  const left = a.replace(/\s/g, "");
  const right = b.replace(/\s/g, "");
  return left.includes(right.slice(0, 12)) || right.includes(left.slice(0, 12));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function hash(value: string): string {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result.toString(36);
}
