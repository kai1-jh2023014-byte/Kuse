import type { AnalyzeImageInput, DesignBrief, DesignProfile, RawImageSignals } from "./types";
import type { SlideDraft, SlideRole, SlideRoleKind } from "./slide-roles";
import { AnalysisError } from "./errors";

const ROLE_KINDS: SlideRoleKind[] = ["title", "empathy", "parallel", "impact", "turn", "proof", "landing", "context"];

const BRIEF_LIMIT = 1500;

export function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AnalysisError(message);
  }
  return value as Record<string, unknown>;
}

export function asSignals(value: unknown): RawImageSignals {
  const record = requireRecord(value, "画像の計測データが不正です");
  const numeric = [
    "width",
    "height",
    "brightness",
    "saturation",
    "contrast",
    "whitespace",
    "density",
    "symmetry",
    "verticalBalance",
    "horizontalBalance",
    "photoScore",
    "illustrationScore",
    "gradientScore",
    "shadowScore",
    "borderScore",
    "edgeDensity",
    "textScore",
    "titleDominance",
    "uniqueColorCount",
    "warmCool",
    "backgroundRatio",
  ] as const;
  if (typeof record.id !== "string" || typeof record.filename !== "string") {
    throw new AnalysisError("画像の計測データに識別子がありません");
  }
  for (const key of numeric) {
    if (typeof record[key] !== "number" || !Number.isFinite(record[key] as number)) {
      throw new AnalysisError("画像の計測データが欠けています");
    }
  }
  if (!Array.isArray(record.palette) || !Array.isArray(record.grid) || !record.background) {
    throw new AnalysisError("画像の色データが欠けています");
  }
  return record as unknown as RawImageSignals;
}

export function asAnalyzeItems(value: unknown): AnalyzeImageInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AnalysisError("分析する画像がありません");
  }
  if (value.length > 200) {
    throw new AnalysisError("一度に分析できるのは200点までです");
  }
  return value.map((item, index) => {
    const record = requireRecord(item, "画像の計測データが不正です");
    const signals = asSignals(record.signals);
    const thumbnail = typeof record.thumbnailDataUrl === "string" ? record.thumbnailDataUrl : undefined;
    const safeThumb =
      thumbnail && thumbnail.startsWith("data:image/") && thumbnail.length < 450_000 ? thumbnail : undefined;
    const analyzedAt = typeof record.analyzedAt === "string" ? record.analyzedAt : undefined;
    return {
      signals: { ...signals, id: signals.id || `image-${index + 1}` },
      thumbnailDataUrl: safeThumb,
      analyzedAt,
    };
  });
}

export function sanitizeBrief(value: unknown): DesignBrief {
  const record = requireRecord(value, "制作内容の形式が不正です");
  const text = (key: string) => {
    const raw = record[key];
    if (typeof raw !== "string") return "";
    return raw.trim().slice(0, BRIEF_LIMIT);
  };
  const purpose = text("purpose");
  if (!purpose) throw new AnalysisError("作りたいデザインの目的を書いてください");
  return {
    purpose,
    audience: text("audience"),
    copyText: text("copyText"),
    size: text("size"),
    mood: text("mood"),
    imagery: text("imagery"),
    notes: text("notes"),
  };
}

export function asSlideDrafts(value: unknown): SlideDraft[] {
  if (!Array.isArray(value)) throw new AnalysisError("スライドの一覧が不正です");
  if (value.length > 12) throw new AnalysisError("一度に見られるのは12枚までです");
  return value.map((item, index) => {
    const record = requireRecord(item, "スライドの形式が不正です");
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim().slice(0, 80) : `slide-${index + 1}`;
    const text = typeof record.text === "string" ? record.text.trim().slice(0, 800) : "";
    return { id, text };
  });
}

export function asSlideRole(value: unknown): SlideRole | null {
  if (value == null) return null;
  const record = requireRecord(value, "スライドの役割を読み取れませんでした");
  const role = record.role;
  if (typeof role !== "string" || !ROLE_KINDS.includes(role as SlideRoleKind)) {
    throw new AnalysisError("スライドの役割が不正です");
  }
  const text = (key: string) => {
    const raw = record[key];
    if (typeof raw !== "string" || !raw.trim()) throw new AnalysisError("スライドの役割が欠けています");
    return raw.trim().slice(0, 1500);
  };
  const index = record.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 11) {
    throw new AnalysisError("スライドの位置が不正です");
  }
  return {
    id: text("id"),
    index,
    text: text("text"),
    role: role as SlideRoleKind,
    roleLabel: text("roleLabel"),
    audienceBefore: text("audienceBefore"),
    audienceAfter: text("audienceAfter"),
    job: text("job"),
    logic: text("logic"),
    expression: text("expression"),
    designConsequence: text("designConsequence"),
    ...slideWeight(record),
    ...slideTransition(record),
    ...slideMedia(record),
  };
}

function slideMedia(record: Record<string, unknown>): Partial<Pick<SlideRole, "media">> {
  const media = record.media;
  if (!media || typeof media !== "object") return {};
  const item = media as Record<string, unknown>;
  const kind = item.kind;
  if (kind !== "image" && kind !== "video" && kind !== "sound" && kind !== "none") return {};
  const text = (key: string, max: number) => (typeof item[key] === "string" ? item[key].trim().slice(0, max) : "");
  const placement = text("placement", 400);
  if (!placement) return {};
  const sound = text("sound", 200);
  const base: NonNullable<SlideRole["media"]> = {
    kind,
    label: text("label", 20) || (kind === "image" ? "画像" : kind === "video" ? "動画" : kind === "sound" ? "効果音" : "素材なし"),
    placement,
    query: text("query", 80),
    ...(sound ? { sound } : {}),
  };
  const citation = item.citation;
  if (!citation || typeof citation !== "object") return { media: base };
  const source = citation as Record<string, unknown>;
  const sourceUrl = typeof source.sourceUrl === "string" ? source.sourceUrl.trim().slice(0, 400) : "";
  const creator = typeof source.creator === "string" ? source.creator.trim().slice(0, 120) : "";
  const license = typeof source.license === "string" ? source.license.trim().slice(0, 80) : "";
  if (!sourceUrl || !creator || !license) return { media: base };
  return {
    media: {
      ...base,
      citation: {
        title: typeof source.title === "string" ? source.title.trim().slice(0, 120) : sourceUrl,
        creator,
        license,
        sourceUrl,
        fileUrl: typeof source.fileUrl === "string" ? source.fileUrl.trim().slice(0, 400) : sourceUrl,
        ...(typeof source.thumbUrl === "string" ? { thumbUrl: source.thumbUrl.trim().slice(0, 400) } : {}),
      },
    },
  };
}

function slideTransition(
  record: Record<string, unknown>,
): Partial<Pick<SlideRole, "transition" | "transitionGroup" | "transitionAdds" | "transitionNote">> {
  const transition = record.transition;
  if (transition !== "hold" && transition !== "reveal") return {};
  const note = typeof record.transitionNote === "string" ? record.transitionNote.trim().slice(0, 500) : "";
  if (!note) return {};
  const adds = typeof record.transitionAdds === "string" ? record.transitionAdds.trim().slice(0, 200) : "";
  const group = record.transitionGroup;
  return {
    transition,
    transitionNote: note,
    ...(adds ? { transitionAdds: adds } : {}),
    ...(typeof group === "number" && Number.isInteger(group) && group > 0 ? { transitionGroup: group } : {}),
  };
}

function slideWeight(record: Record<string, unknown>): Partial<Pick<SlideRole, "weight" | "weightLabel" | "weightReason" | "deckIntent">> {
  const weight = record.weight;
  if (weight !== "force" && weight !== "even" && weight !== "quiet") return {};
  const optional = (key: string) => (typeof record[key] === "string" ? record[key].trim().slice(0, 500) : "");
  const weightLabel = optional("weightLabel") || (weight === "force" ? "力を入れる" : weight === "even" ? "同じ強さ" : "力を入れない");
  const weightReason = optional("weightReason");
  const deckIntent = optional("deckIntent");
  if (!weightReason) return {};
  return { weight, weightLabel, weightReason, deckIntent };
}

export function asDeckSummary(value: unknown): import("./presentation-craft").DeckSummary | null {
  if (value == null) return null;
  const record = requireRecord(value, "発表の全体像を読み取れませんでした");
  const arc = typeof record.arc === "string" ? record.arc.trim().slice(0, 800) : "";
  if (!Array.isArray(record.slides) || !arc) throw new AnalysisError("発表の全体像が不正です");
  const slides = record.slides.slice(0, 12).map((item, index) => {
    const slide = requireRecord(item, "発表の枚の情報が不正です");
    const id = typeof slide.id === "string" && slide.id.trim() ? slide.id.trim().slice(0, 80) : `slide-${index + 1}`;
    const roleLabel = typeof slide.roleLabel === "string" ? slide.roleLabel.trim().slice(0, 40) : "説明";
    const text = typeof slide.text === "string" ? slide.text.trim().slice(0, 800) : "";
    const position = typeof slide.index === "number" && Number.isInteger(slide.index) ? slide.index : index;
    return { id, index: Math.max(0, Math.min(11, position)), roleLabel, text };
  });
  return {
    arc,
    intent: typeof record.intent === "string" ? record.intent.trim().slice(0, 400) : undefined,
    emphasis: typeof record.emphasis === "string" ? record.emphasis.trim().slice(0, 400) : undefined,
    slides,
  };
}

export function asSlideCount(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 12) {
    throw new AnalysisError("スライドの枚数が不正です");
  }
  return number;
}

export function clampStrength(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 75;
  return Math.min(100, Math.max(0, Math.round(number)));
}

export function asProfile(value: unknown): DesignProfile | null {
  if (value == null) return null;
  const record = requireRecord(value, "プロファイルの形式が不正です");
  if (record.version !== 1 || !Array.isArray(record.personal_tendencies)) {
    throw new AnalysisError("保存済みのプロファイルを読み取れませんでした");
  }
  return record as unknown as DesignProfile;
}
