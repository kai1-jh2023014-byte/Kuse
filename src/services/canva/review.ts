import { evaluateGeneratedDesign } from "@/services/ai/designEvaluator";
import { decodeMeasuredRaster } from "@/services/ai/decode-image";
import { generateImprovementPrompt } from "@/services/ai/improvementGenerator";
import { applyApprovedTraits, proposeProfileAdditions } from "@/services/ai/profile-learning";
import { interpretGeneratedDesign, providerMode } from "@/services/ai/provider";
import { computeSignals } from "@/services/ai/signals";
import type { DesignBrief, DesignProfile } from "@/services/ai/types";
import { CanvaError } from "./errors";
import { editCapability } from "./edit-capability";
import { fetchCanvaThumbnail } from "./thumbnail";
import { sessionStore } from "./store";
import type { PublicVersion, StoredVersion } from "./types";
import { toPublicVersion } from "./public";
import type { VersionFeedback } from "@/services/ai/evaluation-types";

export async function evaluateVersion(input: {
  sessionId: string;
  versionId: string;
  profile: DesignProfile;
  brief: DesignBrief;
}): Promise<{ version: PublicVersion; edit: ReturnType<typeof editCapability> }> {
  const session = await sessionStore.read(input.sessionId);
  const version = session?.versions.find((item) => item.id === input.versionId);
  if (!version) throw new CanvaError("その生成結果は見つかりません。", 404, "version");
  const thumbnail = pickThumbnail(version);
  if (!thumbnail) throw new CanvaError("生成結果を取得できませんでした。サムネイルがありません。", 502, "thumbnail");

  let image: { body: ArrayBuffer; contentType: string };
  try {
    image = await fetchCanvaThumbnail(thumbnail);
  } catch (error) {
    console.error("thumbnail fetch failed", error);
    throw new CanvaError("生成結果を取得できませんでした。サムネイルの期限が切れている可能性があります。", 502, "thumbnail_fetch");
  }

  let signals;
  try {
    const raster = decodeMeasuredRaster(new Uint8Array(image.body), image.contentType);
    signals = computeSignals(raster, {
      id: version.id,
      filename: `version-${version.index}`,
      width: raster.width,
      height: raster.height,
    });
  } catch (error) {
    console.error("thumbnail decode failed", error);
    throw new CanvaError("この画像形式は計測できないため、KUSEスタイル一致度を出せません。", 502, "thumbnail_decode");
  }

  let interpretation = null;
  if (providerMode() === "vision") {
    try {
      const dataUrl = `data:${image.contentType};base64,${Buffer.from(image.body).toString("base64")}`;
      if (dataUrl.length < 1_500_000) {
        interpretation = await interpretGeneratedDesign({
          signals,
          profile: input.profile,
          brief: input.brief,
          imageDataUrl: dataUrl,
        });
      }
    } catch (error) {
      console.error("vision interpretation failed", error);
    }
  }

  const analysis = evaluateGeneratedDesign({
    signals,
    profile: input.profile,
    brief: input.brief,
    prompt: version.prompt,
    interpretation,
  });
  const improvementPrompt = generateImprovementPrompt({
    profile: input.profile,
    originalPrompt: version.prompt,
    evaluation: analysis,
    feedback: version.feedback,
  });
  const saved = await sessionStore.mutate(input.sessionId, (current) => {
    const target = current.versions.find((item) => item.id === input.versionId);
    if (!target) return;
    target.signals = signals;
    target.brief = input.brief;
    target.analysis = analysis;
    target.improvementPrompt = improvementPrompt;
  });
  const updated = saved.versions.find((item) => item.id === input.versionId);
  if (!updated?.analysis) throw new CanvaError("評価を保存できませんでした。", 500, "store");
  return { version: toPublicVersion(updated), edit: editCapability(session?.tools?.list) };
}

export async function saveFeedback(input: {
  sessionId: string;
  versionId: string;
  profile: DesignProfile | null;
  feedback: VersionFeedback;
}): Promise<PublicVersion> {
  const session = await sessionStore.read(input.sessionId);
  const version = session?.versions.find((item) => item.id === input.versionId);
  if (!version) throw new CanvaError("その生成結果は見つかりません。", 404, "version");
  const improvementPrompt =
    version.analysis && input.profile
      ? generateImprovementPrompt({
          profile: input.profile,
          originalPrompt: version.prompt,
          evaluation: version.analysis,
          feedback: input.feedback,
        })
      : version.improvementPrompt;
  const saved = await sessionStore.mutate(input.sessionId, (current) => {
    const target = current.versions.find((item) => item.id === input.versionId);
    if (!target) return;
    target.feedback = input.feedback;
    if (improvementPrompt) target.improvementPrompt = improvementPrompt;
  });
  const updated = saved.versions.find((item) => item.id === input.versionId);
  if (!updated) throw new CanvaError("フィードバックを保存できませんでした。", 500, "store");
  return toPublicVersion(updated);
}

export async function previewLearning(input: {
  sessionId: string;
  versionId: string;
  profile: DesignProfile;
  approve: boolean;
}): Promise<{ version: PublicVersion; profile: DesignProfile }> {
  const session = await sessionStore.read(input.sessionId);
  const version = session?.versions.find((item) => item.id === input.versionId);
  if (!version) throw new CanvaError("その生成結果は見つかりません。", 404, "version");
  if (!version.signals) throw new CanvaError("先に「KUSE分析」を実行してください。", 400, "not_evaluated");
  const feedback = version.feedback ?? { feelsLikeMe: false, difference: "", updatedAt: new Date().toISOString() };
  const proposal = proposeProfileAdditions({ profile: input.profile, signals: version.signals, feedback });
  const nextProfile = input.approve ? applyApprovedTraits(input.profile, proposal.traits) : input.profile;
  const saved = await sessionStore.mutate(input.sessionId, (current) => {
    const target = current.versions.find((item) => item.id === input.versionId);
    if (!target) return;
    target.learningProposal = {
      ...proposal,
      approvedAt: input.approve ? new Date().toISOString() : target.learningProposal?.approvedAt,
    };
  });
  const updated = saved.versions.find((item) => item.id === input.versionId);
  if (!updated) throw new CanvaError("学習候補を保存できませんでした。", 500, "store");
  return { version: toPublicVersion(updated), profile: nextProfile };
}

export function assertCanRegenerate(versions: StoredVersion[], versionId: string): StoredVersion {
  const version = versions.find((item) => item.id === versionId);
  if (!version) throw new CanvaError("その生成結果は見つかりません。", 404, "version");
  if (!version.improvementPrompt?.trim()) {
    throw new CanvaError("先に「KUSE分析」で改善プロンプトを作ってください。", 400, "no_improvement");
  }
  if (version.parentVersionId) {
    throw new CanvaError("改善の再生成は1回までです。", 400, "improve_limit");
  }
  if (versions.some((item) => item.parentVersionId === version.id)) {
    throw new CanvaError("この版の改善はすでに生成しています。", 400, "improve_limit");
  }
  return version;
}

function pickThumbnail(version: StoredVersion): string | null {
  const selected = version.candidates.find((item) => item.candidateId === version.selectedCandidateId);
  const pool = selected ? [selected, ...version.candidates] : version.candidates;
  for (const candidate of pool) {
    const url = candidate.thumbnails[0]?.url;
    if (url) return url;
  }
  return null;
}
