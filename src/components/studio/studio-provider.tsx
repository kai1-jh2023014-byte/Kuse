"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  clearStudio,
  deleteStoredImage,
  emptyBrief,
  loadImages,
  loadSnapshot,
  saveImages,
  saveSnapshot,
  type StoredImage,
} from "@/lib/idb";
import { ingestFiles } from "@/lib/ingest";
import { MAX_LIBRARY, VISION_THUMBNAIL_LIMIT } from "@/lib/library";
import { postJson } from "@/lib/http";
import { extractSignals, makeThumbnail } from "@/lib/read-image";
import { createSamplePosters } from "@/lib/samples";
import { TEST_TALK_BRIEF, TEST_TALK_MANUSCRIPT } from "@/lib/test-fixture";
import { applyTasteTurn, asTasteMemory, emptyTasteMemory, type TasteKind, type TasteMemory } from "@/services/ai/taste-memory";
import { clampLoopLimit, DEFAULT_LOOP_LIMIT } from "@/services/canva/loop-policy";
import { deckFingerprint, MAX_SLIDES, type DeckRolePlan, type SlideDraft, type SlideRole } from "@/services/ai/slide-roles";
import type { DesignBrief, DesignProfile, ImageAnalysis, PromptResult } from "@/services/ai/types";

type AnalyzeStage = "" | "read" | "layout" | "compare" | "words";
type AiMode = "unknown" | "heuristic" | "vision";

interface AnalyzeResponse {
  analyses: ImageAnalysis[];
  profile: DesignProfile;
  mode: "heuristic" | "vision";
}

interface StudioContextValue {
  ready: boolean;
  images: StoredImage[];
  analyses: ImageAnalysis[];
  profile: DesignProfile | null;
  brief: DesignBrief;
  styleStrength: number;
  prompt: string;
  slideDrafts: SlideDraft[];
  slidePlan: DeckRolePlan | null;
  selectedSlideId: string | null;
  planning: boolean;
  aiMode: AiMode;
  analyzing: boolean;
  analyzeStage: AnalyzeStage;
  analyzeDetail: string;
  ingesting: boolean;
  ingestDetail: string;
  generating: boolean;
  error: string | null;
  addImages: (files: File[]) => Promise<void>;
  addSamples: () => Promise<void>;
  removeImage: (id: string) => Promise<void>;
  analyze: () => Promise<boolean>;
  updateBrief: (patch: Partial<DesignBrief>) => void;
  setStyleStrength: (value: number) => void;
  generatePrompt: (slideId?: string, critique?: string) => Promise<string | false>;
  refine: (instruction: string) => Promise<boolean>;
  updateSlide: (id: string, text: string) => void;
  addSlide: () => void;
  removeSlide: (id: string) => void;
  moveSlide: (id: string, direction: -1 | 1) => void;
  selectSlide: (id: string) => void;
  planRoles: () => Promise<boolean>;
  divideManuscript: (fetchMedia?: boolean) => Promise<boolean>;
  replaceSlides: (slides: SlideDraft[]) => void;
  acceptedSlideIds: string[];
  acceptSlide: (id: string, on: boolean) => void;
  loopLimit: number;
  setLoopLimit: (value: number) => void;
  tasteMemory: TasteMemory;
  recordTaste: (input: { kind: TasteKind; text: string; versionId?: string; slideId?: string }) => TasteMemory;
  loadTestTalk: () => Promise<void>;
  manuscript: string;
  auditNote: string;
  setManuscript: (value: string) => void;
  setAuditNote: (value: string) => void;
  adoptProfile: (profile: DesignProfile) => void;
  resetAll: () => Promise<void>;
  clearError: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [images, setImages] = useState<StoredImage[]>([]);
  const [analyses, setAnalyses] = useState<ImageAnalysis[]>([]);
  const [profile, setProfile] = useState<DesignProfile | null>(null);
  const [brief, setBrief] = useState<DesignBrief>(emptyBrief);
  const [styleStrength, setStyleStrengthState] = useState(75);
  const [prompt, setPrompt] = useState("");
  const [slideDrafts, setSlideDrafts] = useState<SlideDraft[]>([{ id: "draft-1", text: "" }]);
  const [slidePlan, setSlidePlan] = useState<DeckRolePlan | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [manuscript, setManuscript] = useState("");
  const [auditNote, setAuditNote] = useState("");
  const [acceptedSlideIds, setAcceptedSlideIds] = useState<string[]>([]);
  const [loopLimit, setLoopLimitState] = useState(DEFAULT_LOOP_LIMIT);
  const [tasteMemory, setTasteMemory] = useState<TasteMemory>(() => emptyTasteMemory());
  const [planning, setPlanning] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>("unknown");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStage, setAnalyzeStage] = useState<AnalyzeStage>("");
  const [analyzeDetail, setAnalyzeDetail] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestDetail, setIngestDetail] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readyRef = useRef(false);
  const tasteRef = useRef(tasteMemory);
  tasteRef.current = tasteMemory;

  useEffect(() => {
    let cancelled = false;
    const giveUp = window.setTimeout(() => {
      if (cancelled) return;
      readyRef.current = true;
      setReady(true);
    }, 3000);
    Promise.all([loadImages(), loadSnapshot()])
      .then(([storedImages, snapshot]) => {
        if (cancelled) return;
        setImages(storedImages);
        if (snapshot) {
          const alive = new Set(storedImages.map((image) => image.id));
          setAnalyses(snapshot.analyses.filter((item) => alive.has(item.id)));
          setProfile(snapshot.profile && snapshot.profile.sampleCount > 0 ? snapshot.profile : null);
          setBrief({ ...emptyBrief, ...snapshot.brief });
          setStyleStrengthState(snapshot.styleStrength ?? 75);
          setPrompt(snapshot.prompt ?? "");
          setSlideDrafts(normalizeDrafts(snapshot.slideDrafts));
          setSlidePlan(isDeckPlan(snapshot.slidePlan) ? snapshot.slidePlan : null);
          setSelectedSlideId(typeof snapshot.selectedSlideId === "string" ? snapshot.selectedSlideId : null);
          setManuscript(typeof snapshot.manuscript === "string" ? snapshot.manuscript : "");
          setAuditNote(typeof snapshot.auditNote === "string" ? snapshot.auditNote : "");
          setAcceptedSlideIds(Array.isArray(snapshot.acceptedSlideIds) ? snapshot.acceptedSlideIds.filter((id): id is string => typeof id === "string") : []);
          setLoopLimitState(clampLoopLimit(snapshot.loopLimit));
          setTasteMemory(asTasteMemory(snapshot.tasteMemory));
        }
      })
      .catch(() => {
        if (!cancelled) setError("このブラウザの保存データを開けませんでした。");
      })
      .finally(() => {
        window.clearTimeout(giveUp);
        if (!cancelled) {
          readyRef.current = true;
          setReady(true);
        }
      });
    fetch("/api/ai-status")
      .then((response) => response.json())
      .then((data: { mode?: AiMode }) => {
        if (data.mode === "vision" || data.mode === "heuristic") setAiMode(data.mode);
      })
      .catch(() => setAiMode("heuristic"));
    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
    };
  }, []);

  useEffect(() => {
    if (!readyRef.current) return;
    const timer = window.setTimeout(() => {
      void saveSnapshot({
        analyses,
        profile,
        brief,
        styleStrength,
        prompt,
        slideDrafts,
        slidePlan,
        selectedSlideId,
        manuscript,
        auditNote,
        acceptedSlideIds,
        loopLimit,
        tasteMemory,
      }).catch(() => {
        setError("作品の傾向をこのブラウザに保存できませんでした。");
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [analyses, profile, brief, styleStrength, prompt, slideDrafts, slidePlan, selectedSlideId, manuscript, auditNote, acceptedSlideIds, loopLimit, tasteMemory]);

  const addImages = async (files: File[]) => {
    const room = MAX_LIBRARY - images.length;
    if (room <= 0) {
      toast.error(`作品は${MAX_LIBRARY}点までです`);
      return;
    }
    setIngesting(true);
    setIngestDetail("資料を開いています");
    try {
      const result = await ingestFiles(files, {
        remaining: room,
        onProgress: (progress) => setIngestDetail(`${progress.label}（${progress.current}/${progress.total || room}）`),
      });
      if (result.images.length) {
        await saveImages(result.images);
        setImages((current) => [...current, ...result.images]);
        setError(null);
        toast.success(`${result.images.length}点を資料に加えました`);
      }
      if (result.skipped.length) {
        const sample = result.skipped.slice(0, 3).map((item) => `${item.name}: ${item.reason}`).join(" / ");
        toast.error(
          result.skipped.length === 1
            ? sample
            : `${result.skipped.length}件はスキップしました。${sample}`,
        );
      }
      if (!result.images.length && !result.skipped.length) toast.error("追加できる資料がありませんでした");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "資料を追加できませんでした");
    } finally {
      setIngesting(false);
      setIngestDetail("");
    }
  };

  const addSamples = async () => {
    const room = MAX_LIBRARY - images.length;
    if (room <= 0) {
      toast.error(`作品は${MAX_LIBRARY}点までです`);
      return;
    }
    const posters = createSamplePosters().slice(0, room);
    const stored: StoredImage[] = posters.map((poster) => ({
      id: crypto.randomUUID(),
      name: poster.name,
      createdAt: new Date().toISOString(),
      width: poster.width,
      height: poster.height,
      dataUrl: poster.dataUrl,
    }));
    await saveImages(stored);
    setImages((current) => [...current, ...stored]);
    setError(null);
    toast.success(`同じ癖を持つ見本を${stored.length}点置きました`);
  };

  const removeImage = async (id: string) => {
    const nextImages = images.filter((image) => image.id !== id);
    setImages(nextImages);
    await deleteStoredImage(id).catch(() => setError("画像の削除を保存できませんでした"));
    const nextAnalyses = analyses.filter((item) => item.id !== id);
    if (!profile) {
      setAnalyses(nextAnalyses);
      return;
    }
    if (nextAnalyses.length === 0) {
      setAnalyses([]);
      setProfile(null);
      toast("作品がなくなったので、プロファイルも外しました");
      return;
    }
    setAnalyzing(true);
    setAnalyzeStage("compare");
    setAnalyzeDetail("残った作品で傾向を組み直しています");
    try {
      const result = await postJson<AnalyzeResponse>("/api/analyze", {
        items: nextAnalyses.map((item) => ({ signals: item.signals, analyzedAt: item.analyzedAt })),
        previousProfile: profile,
      });
      setAnalyses(result.analyses);
      setProfile(result.profile);
      toast.success("残った作品で傾向を更新しました");
    } catch (cause) {
      setAnalyses(nextAnalyses);
      setError(cause instanceof Error ? cause.message : "傾向の更新に失敗しました");
    } finally {
      setAnalyzing(false);
      setAnalyzeStage("");
      setAnalyzeDetail("");
    }
  };

  const analyze = async () => {
    if (images.length === 0) {
      setError("作品を1点以上置いてください。");
      return false;
    }
    setAnalyzing(true);
    setError(null);
    setAnalyzeStage("read");
    try {
      let mode = aiMode;
      if (mode === "unknown") {
        try {
          const status = (await fetch("/api/ai-status").then((response) => response.json())) as { mode?: AiMode };
          mode = status.mode === "vision" ? "vision" : "heuristic";
          setAiMode(mode);
        } catch {
          mode = "heuristic";
        }
      }
      const known = new Map(analyses.map((item) => [item.id, item.analyzedAt]));
      const items: Array<{ signals: Awaited<ReturnType<typeof extractSignals>>; thumbnailDataUrl?: string; analyzedAt?: string }> = [];
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        setAnalyzeDetail(`${index + 1} / ${images.length}　${image.name}`);
        if (index > 0) setAnalyzeStage("layout");
        const signals = await extractSignals(image);
        const thumbnailDataUrl =
          mode === "vision" && index < VISION_THUMBNAIL_LIMIT ? await makeThumbnail(image.dataUrl) : undefined;
        items.push({ signals, thumbnailDataUrl, analyzedAt: known.get(image.id) });
      }
      setAnalyzeStage("compare");
      setAnalyzeDetail("作品同士で一致している行動を数えています");
      const result = await postJson<AnalyzeResponse>("/api/analyze", {
        items,
        previousProfile: profile,
      });
      setAnalyzeStage("words");
      setAnalyzeDetail("癖を文章にしています");
      setAnalyses(result.analyses);
      setProfile(result.profile);
      toast.success(`${result.profile.sampleCount}点からプロファイルを更新しました`);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "分析に失敗しました";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setAnalyzing(false);
      setAnalyzeStage("");
      setAnalyzeDetail("");
    }
  };

  const generatePrompt = async (slideId?: string, critique?: string) => {
    if (!brief.purpose.trim()) {
      setError("作りたいデザインの目的を書いてください。");
      return false;
    }
    const chosen = slideId ?? selectedSlideId ?? slidePlan?.slides[0]?.id;
    if (slideId) setSelectedSlideId(slideId);
    setGenerating(true);
    setError(null);
    try {
      const role = freshRole(slideDrafts, slidePlan, chosen ?? null);
      const result = await postJson<PromptResult>("/api/prompt", {
        profile,
        brief,
        styleStrength,
        slideRole: role?.role ?? null,
        slideCount: role?.count ?? slidePlan?.slides.length,
        deck: deckPayload(slidePlan),
        critique: critique?.trim() || undefined,
        tasteMemory,
      });
      setPrompt(result.prompt);
      setStyleStrengthState(result.styleStrength);
      return result.prompt;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "プロンプトを生成できませんでした";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setGenerating(false);
    }
  };

  const refine = async (instruction: string) => {
    if (!prompt) {
      setError("先にプロンプトを生成してください。");
      return false;
    }
    if (!brief.purpose.trim()) {
      setError("作りたいデザインの目的を書いてください。");
      return false;
    }
    setGenerating(true);
    setError(null);
    try {
      const role = freshRole(slideDrafts, slidePlan, selectedSlideId);
      const result = await postJson<PromptResult>("/api/refine", {
        profile,
        brief,
        styleStrength,
        currentPrompt: prompt,
        instruction,
        slideRole: role?.role ?? null,
        slideCount: role?.count ?? slidePlan?.slides.length,
        deck: deckPayload(slidePlan),
      });
      setPrompt(result.prompt);
      setStyleStrengthState(result.styleStrength);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "プロンプトを調整できませんでした";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setGenerating(false);
    }
  };

  const updateSlide = (id: string, text: string) => {
    setSlideDrafts((current) => current.map((slide) => (slide.id === id ? { ...slide, text } : slide)));
  };

  const addSlide = () => {
    setSlideDrafts((current) => (current.length >= MAX_SLIDES ? current : [...current, blankDraft()]));
  };

  const removeSlide = (id: string) => {
    setSlideDrafts((current) => {
      const next = current.filter((slide) => slide.id !== id);
      return next.length ? next : [blankDraft()];
    });
    if (selectedSlideId === id) setSelectedSlideId(null);
  };

  const moveSlide = (id: string, direction: -1 | 1) => {
    setSlideDrafts((current) => {
      const index = current.findIndex((slide) => slide.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(target, 0, item);
      return next;
    });
  };

  const replaceSlides = (slides: SlideDraft[]) => {
    setSlideDrafts(slides.length ? slides.slice(0, MAX_SLIDES) : [blankDraft()]);
    setSelectedSlideId(null);
  };

  const planRoles = async () => {
    setPlanning(true);
    setError(null);
    try {
      const plan = await postJson<DeckRolePlan>("/api/roles", {
        brief: { purpose: brief.purpose, audience: brief.audience },
        slides: slideDrafts,
      });
      setSlidePlan(plan);
      if (selectedSlideId && !plan.slides.some((slide) => slide.id === selectedSlideId)) {
        setSelectedSlideId(null);
      }
      if (plan.slides.length === 0) toast.error(plan.warnings[0] ?? "スライドを1枚以上書いてください");
      else if (plan.warnings.length) toast("役割は決まりましたが、感情が止まる箇所があります");
      else toast.success("全体の感情の順番を決めました");
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "役割を決められませんでした";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setPlanning(false);
    }
  };

  const divideManuscript = async (fetchMedia = false) => {
    if (!manuscript.trim()) {
      setError("原稿をまとめて貼ってください。");
      return false;
    }
    setPlanning(true);
    setError(null);
    try {
      const plan = await postJson<DeckRolePlan>("/api/roles", {
        brief: { purpose: brief.purpose, audience: brief.audience },
        manuscript,
        audit: auditNote,
        fetchMedia,
      });
      setSlidePlan(plan);
      setSlideDrafts(plan.slides.length ? plan.slides.map((slide) => ({ id: slide.id, text: slide.text })) : [{ id: "draft-1", text: "" }]);
      setSelectedSlideId(null);
      if (plan.slides.length === 0) toast.error(plan.warnings[0] ?? "原稿からスライドを分けられませんでした");
      else if (plan.warnings.length) toast("分けました。感情が止まる箇所があるので、確認してください");
      else toast.success(`${plan.slides.length}枚に分けました。確認してください`);
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "原稿を分けられませんでした";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setPlanning(false);
    }
  };

  const loadTestTalk = async () => {
    setBrief(TEST_TALK_BRIEF);
    setManuscript(TEST_TALK_MANUSCRIPT);
    setAuditNote("");
    setAcceptedSlideIds([]);
    setError(null);
    setPlanning(true);
    try {
      const plan = await postJson<DeckRolePlan>("/api/roles", {
        brief: { purpose: TEST_TALK_BRIEF.purpose, audience: TEST_TALK_BRIEF.audience },
        manuscript: TEST_TALK_MANUSCRIPT,
        audit: "",
        fetchMedia: false,
      });
      setSlidePlan(plan);
      setSlideDrafts(plan.slides.length ? plan.slides.map((slide) => ({ id: slide.id, text: slide.text })) : [{ id: "draft-1", text: "" }]);
      setSelectedSlideId(null);
      toast.success(`テスト用の方針発表を入れ、${plan.slides.length}枚に分けました`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "テスト用の発表を入れられませんでした";
      setError(message);
      toast.error(message);
    } finally {
      setPlanning(false);
    }
  };

  const adoptProfile = (next: DesignProfile) => {
    setProfile(next);
    toast.success("承認した特徴をデザインスタイルに追加しました");
  };

  const resetAll = async () => {
    await clearStudio();
    setImages([]);
    setAnalyses([]);
    setProfile(null);
    setBrief(emptyBrief);
    setStyleStrengthState(75);
    setPrompt("");
    setSlideDrafts([blankDraft()]);
    setSlidePlan(null);
    setSelectedSlideId(null);
    setManuscript("");
    setAuditNote("");
    setAcceptedSlideIds([]);
    setLoopLimitState(DEFAULT_LOOP_LIMIT);
    setTasteMemory(emptyTasteMemory());
    setError(null);
    toast.success("このブラウザの学習データを消去しました");
  };

  const value: StudioContextValue = {
    ready,
    images,
    analyses,
    profile,
    brief,
    styleStrength,
    prompt,
    slideDrafts,
    slidePlan,
    selectedSlideId,
    planning,
    aiMode,
    analyzing,
    analyzeStage,
    analyzeDetail,
    ingesting,
    ingestDetail,
    generating,
    error,
    addImages,
    addSamples,
    removeImage,
    analyze,
    updateBrief: (patch) => setBrief((current) => ({ ...current, ...patch })),
    setStyleStrength: setStyleStrengthState,
    generatePrompt,
    refine,
    updateSlide,
    addSlide,
    removeSlide,
    moveSlide,
    selectSlide: setSelectedSlideId,
    planRoles,
    divideManuscript,
    replaceSlides,
    manuscript,
    auditNote,
    setManuscript,
    setAuditNote,
    acceptedSlideIds,
    acceptSlide: (id, on) => {
      setAcceptedSlideIds((current) => {
        if (on) return current.includes(id) ? current : [...current, id];
        return current.filter((item) => item !== id);
      });
      if (on) {
        const slide = slidePlan?.slides.find((item) => item.id === id);
        const label = slide ? `${slide.roleLabel}「${slide.text.split("\n")[0] ?? ""}」` : "この枚";
        setTasteMemory((current) => {
          const next = applyTasteTurn({
            memory: current,
            profile,
            kind: "keep",
            text: `${label}は残す`,
            slideId: id,
          });
          if (next.profile && next.profile !== profile) setProfile(next.profile);
          return next.memory;
        });
      }
    },
    loopLimit,
    setLoopLimit: (value) => setLoopLimitState(clampLoopLimit(value)),
    tasteMemory,
    recordTaste: (input) => {
      const next = applyTasteTurn({ memory: tasteRef.current, profile, ...input });
      tasteRef.current = next.memory;
      setTasteMemory(next.memory);
      if (next.profile && next.profile !== profile) setProfile(next.profile);
      return next.memory;
    },
    loadTestTalk,
    adoptProfile,
    resetAll,
    clearError: () => setError(null),
  };

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("StudioProvider の中で使ってください");
  return context;
}

function blankDraft(): SlideDraft {
  return { id: crypto.randomUUID(), text: "" };
}

function normalizeDrafts(value: unknown): SlideDraft[] {
  if (!Array.isArray(value)) return [{ id: "draft-1", text: "" }];
  const drafts = value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as { id?: unknown; text?: unknown };
      const id = typeof record.id === "string" && record.id ? record.id : crypto.randomUUID();
      const text = typeof record.text === "string" ? record.text : "";
      return [{ id, text }];
    })
    .slice(0, MAX_SLIDES);
  return drafts.length ? drafts : [{ id: "draft-1", text: "" }];
}

function deckPayload(plan: DeckRolePlan | null) {
  if (!plan || plan.slides.length === 0) return null;
  return {
    arc: plan.arc,
    intent: plan.intent,
    emphasis: plan.emphasis,
    slides: plan.slides.map((slide) => ({
      id: slide.id,
      index: slide.index,
      roleLabel: slide.roleLabel,
      text: slide.text,
    })),
  };
}

function isDeckPlan(value: unknown): value is DeckRolePlan {
  if (!value || typeof value !== "object") return false;
  const record = value as DeckRolePlan;
  return typeof record.fingerprint === "string" && typeof record.arc === "string" && Array.isArray(record.slides);
}

function freshRole(
  drafts: SlideDraft[],
  plan: DeckRolePlan | null,
  selectedId: string | null,
): { role: SlideRole; count: number } | null {
  if (!plan || !selectedId || plan.fingerprint !== deckFingerprint(drafts)) return null;
  const role = plan.slides.find((slide) => slide.id === selectedId);
  if (!role) return null;
  return { role, count: plan.slides.length };
}
