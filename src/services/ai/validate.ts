import type { AnalyzeImageInput, DesignBrief, DesignProfile, RawImageSignals } from "./types";
import { AnalysisError } from "./errors";

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
  if (value.length > 12) {
    throw new AnalysisError("一度に分析できるのは12点までです");
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
