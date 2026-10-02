import { extractRequiredCopy } from "@/services/canva/schema";
import type { DesignProfile } from "./types";
import type { DesignEvaluation, VersionFeedback } from "./evaluation-types";

/**
 * Writes the next Canva prompt as a revision.
 * Matching parts stay. Only the measured gaps move, back toward the current profile.
 */
export function generateImprovementPrompt(input: {
  profile: DesignProfile;
  originalPrompt: string;
  evaluation: DesignEvaluation;
  feedback?: Pick<VersionFeedback, "feelsLikeMe" | "difference"> | null;
}): string {
  const keep = input.evaluation.matches;
  const changes = input.evaluation.improvements.filter((item) => item.priority !== "low");
  const lines: string[] = [];

  lines.push("今のデザインを一から作り直さないでください。一致している部分は維持し、ずれている部分だけを直してください。");
  if (keep.length) {
    lines.push(`維持するもの: ${keep.join("、")}。これらは現在のKUSEスタイルプロファイルに近いので、変えないでください。`);
  }
  if (input.profile.color.background[0] || input.profile.color.accent[0]) {
    const bg = input.profile.color.background[0];
    const accent = input.profile.color.accent[0];
    const bits = [bg ? `背景色 ${bg}` : "", accent ? `アクセント ${accent}` : ""].filter(Boolean);
    if (bits.length) lines.push(`色の基準はプロファイルの ${bits.join("、")} です。別の配色へ寄せないでください。`);
  }
  if (changes.length) {
    lines.push("直すところ:");
    for (const change of changes) {
      lines.push(`- ${change.suggestion}（現状: ${change.problem}。目標: ${change.desired}）`);
    }
  } else {
    lines.push("計測上の大きなずれはありません。構図と色の役割をそのまま保ってください。");
  }
  lines.push(`揃えは「${input.profile.layout.alignment}」、上下は「${input.profile.layout.vertical}」、余白は「${input.profile.layout.spacing}」を基準にしてください。`);

  const difference = input.feedback?.difference.trim();
  if (difference) {
    lines.push(`ユーザーの指摘を優先してください: ${difference}`);
  }
  if (input.feedback?.feelsLikeMe) {
    lines.push("ユーザーはこの方向性を自分らしいと判断しています。指摘された点以外は維持してください。");
  }

  const purpose = excerptPurpose(input.originalPrompt);
  if (purpose) lines.push(`掲載内容と目的は元の指示のままです。${purpose}`);
  const copy = extractRequiredCopy(input.originalPrompt);
  if (copy.length) {
    lines.push(`次の文言は一字一句そのまま置いてください。タイトルや大見出しなどの仮の文字に置き換えないでください: ${copy.join(" / ")}`);
  }
  lines.push("デザインスタイルそのものは変えないでください。生成結果を、今のプロファイルに近づけてください。");
  lines.push("");
  lines.push("【元の指示】");
  lines.push(input.originalPrompt);
  return lines.join("\n");
}

function excerptPurpose(prompt: string): string {
  const match = /【目的】\s*([^\n【]{0,180})/.exec(prompt);
  if (!match?.[1]?.trim()) return "";
  return `目的: ${match[1].trim()}`;
}
