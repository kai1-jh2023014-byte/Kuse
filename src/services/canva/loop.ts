import { randomUUID } from "node:crypto";
import type { DesignBrief, DesignProfile } from "@/services/ai/types";
import { CanvaError } from "./errors";
import { clampLoopLimit, DEFAULT_LOOP_LIMIT, loopReason, nextLoopAction, readyToShow } from "./loop-policy";
import { toPublicVersion } from "./public";
import { evaluateVersion, saveFeedback, selectClosestCandidate } from "./review";
import { inferCanvaDesignType } from "./schema";
import { CanvaService } from "./service";
import { sessionStore } from "./store";
import type { PublicVersion, StoredVersion } from "./types";

export interface LoopStep {
  type: "status";
  round: number;
  limit: number;
  phase: "generate" | "measure" | "improve";
  message: string;
  similarity?: number;
}

export interface LoopResult {
  version: PublicVersion;
  rounds: number;
  reached: boolean;
  reason: string;
}

export async function runGenerationLoop(input: {
  sessionId: string;
  redirectUri: string;
  prompt: string;
  profile: DesignProfile | null;
  brief: DesignBrief;
  critique?: string;
  fromVersionId?: string;
  limit?: unknown;
  tasteMemory?: import("@/services/ai/taste-memory").TasteMemory | null;
  onStep?: (step: LoopStep) => void;
}): Promise<LoopResult> {
  const limit = clampLoopLimit(input.limit ?? DEFAULT_LOOP_LIMIT);
  const service = new CanvaService(input.sessionId, input.redirectUri);
  if (input.tasteMemory) {
    await sessionStore.mutate(input.sessionId, (current) => {
      current.tasteMemory = input.tasteMemory ?? current.tasteMemory;
    });
  }
  const loopId = randomUUID();
  let prompt = input.prompt.trim();
  let parentId = input.fromVersionId;
  const critique = input.critique?.trim() ?? "";

  if (parentId) {
    prompt = await promptFromCritique({
      sessionId: input.sessionId,
      versionId: parentId,
      profile: input.profile,
      brief: input.brief,
      critique,
    });
  }
  if (!prompt) throw new CanvaError("生成プロンプトが空です。", 400, "empty_prompt");
  const originalPrompt = prompt;
  const designType = inferCanvaDesignType(originalPrompt);

  let shown: PublicVersion | null = null;
  let reached = false;
  let stoppedEarly = false;
  let rounds = 0;

  for (let round = 1; round <= limit; round += 1) {
    input.onStep?.({
      type: "status",
      round,
      limit,
      phase: "generate",
      message: `${round} / ${limit}　Canvaにプロンプトを渡しています`,
    });
    let version: PublicVersion;
    try {
      version = await service.generate(prompt, {
        parentVersionId: parentId,
        designType,
      });
    } catch (error) {
      if (!shown) throw error;
      stoppedEarly = true;
      break;
    }
    rounds = round;
    await tagRound(input.sessionId, version.id, loopId, round);
    shown = version;

    if (!input.profile) break;

    input.onStep?.({
      type: "status",
      round,
      limit,
      phase: "measure",
      message: `${round} / ${limit}　保存した癖への近さを見ています`,
    });
    await selectClosestCandidate({
      sessionId: input.sessionId,
      versionId: version.id,
      profile: input.profile,
      brief: input.brief,
    });
    const measured = await evaluateVersion({
      sessionId: input.sessionId,
      versionId: version.id,
      profile: input.profile,
      brief: input.brief,
    });
    shown = measured.version;
    if (nextLoopAction({ round, hasProfile: true, analysis: measured.version.analysis, limit }) === "show") break;
    const nextPrompt = measured.version.improvementPrompt?.trim();
    if (!nextPrompt) break;
    input.onStep?.({
      type: "status",
      round,
      limit,
      phase: "improve",
      similarity: measured.version.analysis?.style_similarity,
      message: `${round} / ${limit}　ずれが大きいので、改善プロンプトを書き直しています`,
    });
    prompt = nextPrompt;
    parentId = version.id;
  }

  if (!shown) throw new CanvaError("生成結果を保存できませんでした。", 500, "store");
  const sessionAfter = await sessionStore.read(input.sessionId);
  const preferred = pickBestLoopVersion(sessionAfter?.versions ?? [], loopId, shown.id);
  shown = toPublicVersion(preferred);
  const similarity = shown.analysis?.style_similarity ?? null;
  reached = Boolean(input.profile && shown.analysis && readyToShow(shown.analysis));
  await sessionStore.mutate(input.sessionId, (current) => {
    const target = current.versions.find((item) => item.id === shown?.id);
    if (target) target.presented = true;
    for (const item of current.versions) {
      if (item.loopId === loopId && item.id !== shown?.id) item.presented = false;
    }
  });
  const session = await sessionStore.read(input.sessionId);
  const published = session?.versions.find((item) => item.id === shown?.id);
  return {
    version: published ? toPublicVersion(published) : shown,
    rounds,
    reached,
    reason: loopReason({
      reached,
      rounds,
      similarity,
      hasProfile: Boolean(input.profile),
      stoppedEarly,
    }),
  };
}

export function pickBestLoopVersion(versions: StoredVersion[], loopId: string, fallbackId: string): StoredVersion {
  const items = versions.filter((item) => item.loopId === loopId);
  const fallback = versions.find((item) => item.id === fallbackId) ?? items.at(-1);
  if (!fallback) {
    throw new CanvaError("生成結果を保存できませんでした。", 500, "store");
  }
  return items.reduce((best, item) => {
    const score = item.analysis?.style_similarity;
    const bestScore = best.analysis?.style_similarity;
    if (score == null) return best;
    if (bestScore == null || score >= bestScore) return item;
    return best;
  }, fallback);
}

async function tagRound(sessionId: string, versionId: string, loopId: string, round: number) {
  await sessionStore.mutate(sessionId, (current) => {
    const target = current.versions.find((item) => item.id === versionId);
    if (!target) return;
    target.loopId = loopId;
    target.loopRound = round;
    target.presented = false;
  });
}

async function promptFromCritique(input: {
  sessionId: string;
  versionId: string;
  profile: DesignProfile | null;
  brief: DesignBrief;
  critique: string;
}): Promise<string> {
  if (!input.critique) throw new CanvaError("批評を書いてから、もう一度回してください。", 400, "critique");
  const session = await sessionStore.read(input.sessionId);
  const version = session?.versions.find((item) => item.id === input.versionId);
  if (!version) throw new CanvaError("その生成結果は見つかりません。", 404, "version");
  if (input.profile && !version.analysis) {
    await evaluateVersion({
      sessionId: input.sessionId,
      versionId: input.versionId,
      profile: input.profile,
      brief: input.brief,
    });
  }
  if (input.profile) {
    const saved = await saveFeedback({
      sessionId: input.sessionId,
      versionId: input.versionId,
      profile: input.profile,
      feedback: { feelsLikeMe: false, difference: input.critique, updatedAt: new Date().toISOString() },
    });
    if (saved.improvementPrompt?.trim()) return saved.improvementPrompt;
  }
  return `${version.prompt}\n\n【批評】\n${input.critique}\nこの批評を優先して、新しい候補を作ってください。`;
}
