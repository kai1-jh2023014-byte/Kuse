"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  clearStudio,
  deleteStoredImage,
  emptyBrief,
  loadImages,
  loadSnapshot,
  saveImage,
  saveSnapshot,
  type StoredImage,
} from "@/lib/idb";
import { postJson } from "@/lib/http";
import { extractSignals, fileToStoredImage, makeThumbnail } from "@/lib/read-image";
import { createSamplePosters } from "@/lib/samples";
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
  aiMode: AiMode;
  analyzing: boolean;
  analyzeStage: AnalyzeStage;
  analyzeDetail: string;
  generating: boolean;
  error: string | null;
  addImages: (files: File[]) => Promise<void>;
  addSamples: () => Promise<void>;
  removeImage: (id: string) => Promise<void>;
  analyze: () => Promise<boolean>;
  updateBrief: (patch: Partial<DesignBrief>) => void;
  setStyleStrength: (value: number) => void;
  generatePrompt: () => Promise<boolean>;
  refine: (instruction: string) => Promise<boolean>;
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
  const [aiMode, setAiMode] = useState<AiMode>("unknown");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStage, setAnalyzeStage] = useState<AnalyzeStage>("");
  const [analyzeDetail, setAnalyzeDetail] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
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
        }
      })
      .catch(() => {
        if (!cancelled) setError("このブラウザの保存データを開けませんでした。");
      })
      .finally(() => {
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
    };
  }, []);

  useEffect(() => {
    if (!readyRef.current) return;
    const timer = window.setTimeout(() => {
      void saveSnapshot({ analyses, profile, brief, styleStrength, prompt }).catch(() => {
        setError("作品の傾向をこのブラウザに保存できませんでした。");
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [analyses, profile, brief, styleStrength, prompt]);

  const addImages = async (files: File[]) => {
    const room = 12 - images.length;
    if (room <= 0) {
      toast.error("作品は12点までです");
      return;
    }
    const accepted = files.slice(0, room);
    if (files.length > room) toast.error("12点を超えた分は追加していません");
    const stored: StoredImage[] = [];
    for (const file of accepted) {
      try {
        const image = await fileToStoredImage(file);
        await saveImage(image);
        stored.push(image);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "画像を追加できませんでした");
      }
    }
    if (stored.length) {
      setImages((current) => [...current, ...stored]);
      setError(null);
    }
  };

  const addSamples = async () => {
    const room = 12 - images.length;
    if (room <= 0) {
      toast.error("作品は12点までです");
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
    for (const image of stored) await saveImage(image);
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
        const thumbnailDataUrl = mode === "vision" ? await makeThumbnail(image.dataUrl) : undefined;
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

  const generatePrompt = async () => {
    if (!brief.purpose.trim()) {
      setError("作りたいデザインの目的を書いてください。");
      return false;
    }
    setGenerating(true);
    setError(null);
    try {
      const result = await postJson<PromptResult>("/api/prompt", {
        profile,
        brief,
        styleStrength,
      });
      setPrompt(result.prompt);
      setStyleStrengthState(result.styleStrength);
      return true;
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
      const result = await postJson<PromptResult>("/api/refine", {
        profile,
        brief,
        styleStrength,
        currentPrompt: prompt,
        instruction,
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

  const resetAll = async () => {
    await clearStudio();
    setImages([]);
    setAnalyses([]);
    setProfile(null);
    setBrief(emptyBrief);
    setStyleStrengthState(75);
    setPrompt("");
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
    aiMode,
    analyzing,
    analyzeStage,
    analyzeDetail,
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
