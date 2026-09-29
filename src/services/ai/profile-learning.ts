import type { DesignProfile, RawImageSignals } from "./types";
import type { LearningProposal, LearningTrait, VersionFeedback } from "./evaluation-types";

/**
 * Suggests traits from a generated design the user explicitly called their own.
 * Nothing here writes the profile. Approval is a separate step.
 */
export function proposeProfileAdditions(input: {
  profile: DesignProfile;
  signals: RawImageSignals;
  feedback: Pick<VersionFeedback, "feelsLikeMe" | "difference">;
}): LearningProposal {
  if (!input.feedback.feelsLikeMe) {
    return {
      traits: [],
      message: "「このデザインは自分らしい」と押したときだけ、学習候補を作ります。生成結果だけではプロファイルを変えません。",
    };
  }

  const difference = input.feedback.difference;
  const traits: LearningTrait[] = [];
  const whitespaceDelta = input.signals.whitespace - input.profile.metrics.whitespace;
  if (Math.abs(whitespaceDelta) >= 0.12 && !rejected(difference, ["余白", "間隔", "スペース"])) {
    traits.push(
      trait(
        "余白の量",
        whitespaceDelta > 0
          ? "自分らしいと承認した生成結果は、これまでの作品より余白が広い。"
          : "自分らしいと承認した生成結果は、これまでの作品より余白が狭い。",
      ),
    );
  }
  const titleDelta = input.signals.titleDominance - input.profile.metrics.titleDominance;
  if (Math.abs(titleDelta) >= 0.35 && !rejected(difference, ["文字", "タイトル", "見出し"])) {
    traits.push(
      trait(
        "タイトルの大きさ",
        titleDelta > 0 ? "承認した生成結果では、見出しのサイズ差がこれまでの作品より大きい。" : "承認した生成結果では、見出しのサイズ差がこれまでの作品より小さい。",
      ),
    );
  }
  if (!rejected(difference, ["色", "カラー", "アクセント", "背景"])) {
    const accent = input.signals.accentColors[0];
    const known = input.profile.color.accent.some((color) => color.toLowerCase() === accent?.toLowerCase());
    if (accent && !known) {
      traits.push(trait("アクセントの色", `承認した生成結果のアクセント ${accent} は、今のプロファイルのアクセント一覧にない。`));
    }
  }

  if (traits.length === 0) {
    return {
      traits: [],
      message: "計測上、プロファイルに足す新しい特徴はありません。既存の色と癖はそのままです。",
    };
  }
  return {
    traits,
    message: "これは学習候補です。承認するまで design_profile は変わりません。",
  };
}

export function applyApprovedTraits(profile: DesignProfile, traits: LearningTrait[], now = new Date().toISOString()): DesignProfile {
  if (traits.length === 0) return profile;
  const discovered = [
    ...traits.map((item) => ({
      id: item.id,
      label: item.label,
      detail: item.detail,
      confidence: item.confidence,
      evidence: "ユーザーが自分らしいと承認した生成結果",
      source: "comparison" as const,
    })),
    ...profile.discovered.filter((item) => !traits.some((trait) => trait.id === item.id)),
  ].slice(0, 12);
  return {
    ...profile,
    updatedAt: now,
    discovered,
    changelog: [
      `${now.slice(0, 10)}: 承認した生成結果から ${traits.map((item) => item.label).join("、")} を追加。既存の色と癖は置き換えていない。`,
      ...profile.changelog,
    ].slice(0, 8),
  };
}

function trait(label: string, detail: string): LearningTrait {
  return {
    id: `approved.${label}`,
    label,
    detail,
    confidence: 0.7,
  };
}

function rejected(difference: string, keys: string[]): boolean {
  if (!difference.trim()) return false;
  const complains = /違う|嫌|大き|小さ|多い|少な|変|ずれ|直し/.test(difference);
  if (!complains) return false;
  return keys.some((key) => difference.includes(key));
}
