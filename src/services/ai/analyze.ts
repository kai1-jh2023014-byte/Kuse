import { createDesignProfile } from "./profile";
import { enrichProfile, providerMode } from "./provider";
import type { AnalyzeImageInput, DesignProfile, ImageAnalysis } from "./types";

export async function analyzeDesign(input: {
  items: AnalyzeImageInput[];
  previousProfile?: DesignProfile | null;
}): Promise<{ analyses: ImageAnalysis[]; profile: DesignProfile; mode: "heuristic" | "vision" }> {
  const now = Date.now();
  const analyses: ImageAnalysis[] = input.items.map((item, index) => ({
    id: item.signals.id,
    filename: item.signals.filename,
    width: item.signals.width,
    height: item.signals.height,
    analyzedAt: item.analyzedAt ?? new Date(now + index).toISOString(),
    signals: item.signals,
  }));

  let profile = createDesignProfile(analyses, input.previousProfile ?? null, { mode: "heuristic" });
  let mode: "heuristic" | "vision" = "heuristic";

  if (providerMode() === "vision" && input.items.some((item) => item.thumbnailDataUrl)) {
    try {
      profile = await enrichProfile(profile, input.items);
      mode = "vision";
    } catch {
      profile = {
        ...profile,
        analysisMode: "heuristic",
        extensions: {
          ...profile.extensions,
          visionNote: "ビジョンモデルには接続できなかったため、画像の計測結果だけでプロファイルを作っています。",
        },
      };
    }
  }

  return { analyses, profile, mode };
}
