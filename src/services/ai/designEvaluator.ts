import { describeColor, hexDistance } from "./color";
import type { DesignBrief, DesignProfile, RawImageSignals } from "./types";
import type { DesignEvaluation, DesignImprovement, DesignInterpretation, MatchLevel } from "./evaluation-types";

export type { DesignEvaluation, DesignInterpretation } from "./evaluation-types";

const CLOSE_HEX = 72;

/**
 * Compares a generated design with the saved profile.
 * style_similarity is how close the image is to that profile, not whether the design is good.
 * Pixel measurements decide the scores. An optional interpretation may only add wording.
 */
export function evaluateGeneratedDesign(input: {
  signals: RawImageSignals;
  profile: DesignProfile;
  brief: DesignBrief;
  prompt: string;
  interpretation?: DesignInterpretation | null;
}): DesignEvaluation {
  const { signals, profile } = input;
  const background = closeness(signals.background.hex, profile.color.background);
  const accent = accentCloseness(signals.accentColors, profile.color.accent);
  const contrast = closenessNumber(signals.contrast, profile.metrics.contrast, 0.28);
  const alignment = alignmentScore(signals.horizontalBalance, profile);
  const vertical = verticalScore(signals.verticalBalance, profile);
  const whitespace = closenessNumber(signals.whitespace, profile.metrics.whitespace, 0.28);
  const title = closenessNumber(signals.titleDominance, profile.metrics.titleDominance, 0.9);
  const decoration = closenessNumber(
    signals.borderScore + signals.shadowScore + signals.gradientScore,
    profile.metrics.border + profile.metrics.shadow + profile.metrics.gradient,
    0.8,
  );

  const colorScore = average([background, accent, contrast, closenessNumber(signals.brightness, profile.metrics.brightness, 0.35)]);
  const layoutScore = average([alignment, vertical, whitespace]);
  const typeScore = average([title, closenessNumber(signals.textScore, profile.metrics.text, 0.35)]);
  const visualScore = average([
    decoration,
    contrast,
    closenessNumber(signals.photoScore, profile.metrics.photo, 0.4),
  ]);

  const style_similarity = Math.round(
    clamp01(colorScore * 0.34 + layoutScore * 0.28 + typeScore * 0.18 + visualScore * 0.2) * 100,
  );

  const parts = {
    background,
    accent,
    contrast,
    alignment,
    vertical,
    whitespace,
    title,
    decoration,
  };
  const matches = matchLabels(parts, profile, signals);
  const gaps = gapLabels(parts);
  const improvements = improvementsFrom(parts, profile, signals);

  const layoutReason = joinSentences([
    alignmentSentence(alignment, profile, signals),
    verticalSentence(vertical, profile, signals),
    whitespaceSentence(whitespace, profile, signals),
    input.interpretation?.layout ? `構図の読み: ${cleanSentence(input.interpretation.layout)}` : "",
    input.interpretation?.gaze ? `視線: ${cleanSentence(input.interpretation.gaze)}` : "",
    input.interpretation?.density ? `情報密度: ${cleanSentence(input.interpretation.density)}` : "",
  ]);
  const typeReason = joinSentences([
    titleSentence(title, profile, signals),
    input.interpretation?.typography ? `文字の関係: ${cleanSentence(input.interpretation.typography)}` : "",
  ]);

  const requirement = requirementMatch(signals, input.brief, input.prompt);

  return {
    style_similarity,
    requirement_match: requirement.score,
    analysis: {
      color: { match: level(colorScore), reason: colorSentence(parts, profile, signals) },
      layout: { match: level(layoutScore), reason: layoutReason },
      typography: { match: level(typeScore), reason: typeReason },
      visual: { match: level(visualScore), reason: visualSentence(parts, profile) },
    },
    matches,
    gaps,
    improvements,
    requirement_note: requirement.note,
    mode: input.interpretation ? "measured+vision" : "measured",
  };
}

function requirementMatch(signals: RawImageSignals, brief: DesignBrief, prompt: string): { score: number; note: string } {
  const scores: number[] = [];
  const notes: string[] = [];
  const size = `${brief.size} ${prompt}`;
  const wantsPortrait = /縦|ポスター|ストーリー|A3|A4/.test(size);
  const wantsLandscape = /横|サムネ|1920|1280|YouTube|ゲーム告知/.test(size);
  if (wantsPortrait) {
    scores.push(signals.orientation === "portrait" ? 1 : 0.35);
    notes.push(signals.orientation === "portrait" ? "希望サイズの縦方向に合っている" : "希望は縦長だが、画像の比率が違う");
  } else if (wantsLandscape) {
    scores.push(signals.orientation === "landscape" ? 1 : 0.35);
    notes.push(signals.orientation === "landscape" ? "希望サイズの横方向に合っている" : "希望は横長だが、画像の比率が違う");
  }
  if (brief.copyText.trim()) {
    scores.push(signals.textScore > 0.18 ? 0.75 : 0.45);
    notes.push("掲載文字そのものは画像から読まず、文字量の計測だけを見ている");
  }
  const mood = `${brief.mood} ${brief.purpose}`;
  if (/夜|暗|黒/.test(mood)) {
    scores.push(signals.brightness < 0.45 ? 1 : 0.3);
    notes.push(signals.brightness < 0.45 ? "暗い雰囲気の指定に明度が合っている" : "暗い雰囲気の指定より画像が明るい");
  } else if (/明る|白|ポップ/.test(mood)) {
    scores.push(signals.brightness > 0.55 ? 1 : 0.35);
  }
  if (scores.length === 0) {
    return { score: 60, note: "サイズや雰囲気の指定が少ないため、要求への一致は一部しか見ていない。" };
  }
  return { score: Math.round(average(scores) * 100), note: notes.join("。") };
}

function colorSentence(
  parts: Record<string, number>,
  profile: DesignProfile,
  signals: RawImageSignals,
): string {
  const bg = describeColor(signals.background.hex);
  const expected = profile.color.background[0] ? describeColor(profile.color.background[0]) : "プロファイルの背景";
  const accentName = signals.accentColors[0] ? describeColor(signals.accentColors[0]) : "アクセント";
  return joinSentences([
    parts.background >= 0.72 ? `${bg}の背景は、プロファイルの${expected}に近い` : `背景は${bg}で、プロファイルの${expected}からずれている`,
    parts.accent >= 0.72 ? `${accentName}のアクセントはプロファイルに近い` : "アクセントカラーの色みか面積がプロファイルと違う",
    parts.contrast >= 0.72 ? "明度差の強さはプロファイルに近い" : "明度差の強さがプロファイルと違う",
  ]);
}

function alignmentSentence(score: number, profile: DesignProfile, signals: RawImageSignals): string {
  const expected = profile.layout.alignment;
  const actual = signals.horizontalBalance < -0.08 ? "左寄せ" : signals.horizontalBalance > 0.08 ? "右寄せ" : "中央寄り";
  return score >= 0.72 ? `${actual}は「${expected}」に合っている` : `揃えは${actual}で、「${expected}」からずれている`;
}

function verticalSentence(score: number, profile: DesignProfile, signals: RawImageSignals): string {
  const actual = signals.verticalBalance < -0.08 ? "上部" : signals.verticalBalance > 0.08 ? "下部" : "中央付近";
  return score >= 0.72
    ? `情報の上下位置（${actual}）は「${profile.layout.vertical}」に合っている`
    : `情報は${actual}にあり、「${profile.layout.vertical}」からずれている`;
}

function whitespaceSentence(score: number, profile: DesignProfile, signals: RawImageSignals): string {
  const delta = signals.whitespace - profile.metrics.whitespace;
  if (score >= 0.72) return `余白の量は「${profile.layout.spacing}」に近い`;
  return delta < 0 ? "余白が過去作品より狭い" : "余白が過去作品より広い";
}

function titleSentence(score: number, profile: DesignProfile, signals: RawImageSignals): string {
  if (score >= 0.72) return `見出しの大きさは「${profile.typography.title_size}」に近い`;
  return signals.titleDominance < profile.metrics.titleDominance
    ? "タイトルのサイズ差が過去作品より小さい"
    : "タイトルのサイズ差が過去作品より大きい";
}

function visualSentence(parts: Record<string, number>, profile: DesignProfile): string {
  return joinSentences([
    parts.decoration >= 0.72 ? `装飾量は「${profile.visual.decoration}」に近い` : "装飾の量がプロファイルと違う",
    parts.contrast >= 0.72 ? "コントラストの扱いが過去作品に近い" : "コントラストの扱いが過去作品と違う",
  ]);
}

function matchLabels(parts: Record<string, number>, profile: DesignProfile, signals: RawImageSignals): string[] {
  const labels: string[] = [];
  if (parts.background >= 0.72) labels.push(`${describeColor(signals.background.hex)}の背景`);
  if (parts.accent >= 0.72) {
    const name = signals.accentColors[0] ? describeColor(signals.accentColors[0]) : profile.color.accent[0] ? describeColor(profile.color.accent[0]) : "アクセント";
    labels.push(`${name}のアクセント`);
  }
  if (parts.alignment >= 0.72) labels.push(signals.horizontalBalance < -0.08 ? "左寄せ" : signals.horizontalBalance > 0.08 ? "右寄せ" : "中央揃え");
  if (parts.vertical >= 0.72) labels.push(signals.verticalBalance < -0.08 ? "上部配置" : signals.verticalBalance > 0.08 ? "下部配置" : "中央配置");
  if (parts.whitespace >= 0.72) labels.push(profile.metrics.whitespace >= 0.34 ? "余白の量" : "詰め具合");
  if (parts.contrast >= 0.72 && profile.metrics.contrast >= 0.22) labels.push("強いコントラスト");
  if (parts.title >= 0.72) labels.push("タイトルの大きさ");
  return labels;
}

function gapLabels(parts: Record<string, number>): string[] {
  const labels: string[] = [];
  if (parts.whitespace < 0.55) labels.push("余白");
  if (parts.vertical < 0.55) labels.push("タイトル位置");
  if (parts.title < 0.55) labels.push("タイトルサイズ");
  if (parts.alignment < 0.55) labels.push("揃え");
  if (parts.accent < 0.55 || parts.background < 0.55) labels.push("色");
  if (parts.contrast < 0.55) labels.push("コントラスト");
  if (parts.decoration < 0.55) labels.push("装飾");
  return labels;
}

function improvementsFrom(
  parts: Record<string, number>,
  profile: DesignProfile,
  signals: RawImageSignals,
): DesignImprovement[] {
  const items: DesignImprovement[] = [];
  if (parts.alignment < 0.72) {
    items.push(item("layout", parts.alignment, "揃えがプロファイルと違う", profile.layout.alignment, `揃えを「${profile.layout.alignment}」に戻す`));
  }
  if (parts.vertical < 0.72) {
    items.push(item("layout", parts.vertical, `情報の位置が「${profile.layout.vertical}」からずれている`, profile.layout.vertical, `主要情報を「${profile.layout.vertical}」に戻す`));
  }
  if (parts.whitespace < 0.72) {
    const narrower = signals.whitespace < profile.metrics.whitespace;
    items.push(
      item(
        "spacing",
        parts.whitespace,
        narrower ? "余白が少ない" : "余白が広すぎる",
        profile.layout.spacing,
        narrower ? "主要要素間の余白を増やす" : "余白をプロファイルの量まで戻す",
      ),
    );
  }
  if (parts.title < 0.72) {
    const smaller = signals.titleDominance < profile.metrics.titleDominance;
    items.push(
      item(
        "typography",
        parts.title,
        smaller ? "タイトルのサイズ差が小さい" : "タイトルが過去作品より大きい",
        profile.typography.title_size,
        smaller ? "タイトルをさらに大きくする" : "タイトルの大きさをもとの差まで戻す",
      ),
    );
  }
  if (parts.background < 0.72 || parts.accent < 0.72) {
    const accent = profile.color.accent[0] ? describeColor(profile.color.accent[0]) : "アクセント";
    items.push(
      item(
        "color",
        Math.min(parts.background, parts.accent),
        "色の役割がプロファイルからずれている",
        `${describeColor(profile.color.background[0] ?? "#000000")}の背景と${accent}のアクセント`,
        "背景とアクセントの色の役割をプロファイルに戻す",
      ),
    );
  }
  if (parts.contrast < 0.72) {
    items.push(item("visual", parts.contrast, "コントラストの強さが違う", profile.color.contrast, "明度差をプロファイルの強さに戻す"));
  }
  return items.sort((a, b) => rank(a.priority) - rank(b.priority)).slice(0, 6);
}

function item(category: string, score: number, problem: string, desired: string, suggestion: string): DesignImprovement {
  const priority = score < 0.4 ? "high" : score < 0.62 ? "medium" : "low";
  return { category, priority, problem, suggestion, desired };
}

function alignmentScore(balance: number, profile: DesignProfile): number {
  const text = `${profile.layout.alignment} ${profile.layout.horizontal}`;
  if (text.includes("左")) return balance < -0.08 ? 1 : balance < 0.08 ? 0.45 : 0.15;
  if (text.includes("右")) return balance > 0.08 ? 1 : balance > -0.08 ? 0.45 : 0.15;
  if (text.includes("中央")) return Math.abs(balance) < 0.12 ? 1 : 0.35;
  return 0.7;
}

function verticalScore(balance: number, profile: DesignProfile): number {
  const text = profile.layout.vertical;
  if (text.includes("上")) return balance < -0.08 ? 1 : balance < 0.08 ? 0.45 : 0.15;
  if (text.includes("下")) return balance > 0.08 ? 1 : balance > -0.08 ? 0.45 : 0.15;
  if (text.includes("中央")) return Math.abs(balance) < 0.12 ? 1 : 0.4;
  return 0.7;
}

function accentCloseness(actual: string[], expected: string[]): number {
  if (expected.length === 0) return actual.length === 0 ? 1 : 0.55;
  if (actual.length === 0) return 0.2;
  let best = 0;
  for (const color of actual) {
    for (const target of expected) {
      best = Math.max(best, 1 - Math.min(1, hexDistance(color, target) / CLOSE_HEX));
    }
  }
  return best;
}

function closeness(actual: string, expected: string[]): number {
  if (expected.length === 0) return 0.6;
  const distance = Math.min(...expected.map((color) => hexDistance(actual, color)));
  return 1 - Math.min(1, distance / CLOSE_HEX);
}

function closenessNumber(actual: number, expected: number, tolerance: number): number {
  if (!Number.isFinite(expected)) return 0.6;
  return 1 - Math.min(1, Math.abs(actual - expected) / tolerance);
}

function level(score: number): MatchLevel {
  if (score >= 0.72) return "high";
  if (score >= 0.48) return "medium";
  return "low";
}

function rank(priority: DesignImprovement["priority"]): number {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function joinSentences(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("。")
    .replace(/。+/g, "。");
}

function cleanSentence(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}
