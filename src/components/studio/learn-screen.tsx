"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { summarizeSignals } from "@/services/ai/summarize";
import { DesktopHint } from "./desktop-hint";
import { useStudio } from "./studio-provider";

const STAGES = [
  { id: "read", label: "色と明暗を読み取る" },
  { id: "layout", label: "余白、構図、密度を見る" },
  { id: "compare", label: "作品を横断して共通点を探す" },
  { id: "words", label: "無意識の癖を言葉にする" },
] as const;

export function LearnScreen() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const {
    ready,
    images,
    analyses,
    profile,
    analyzing,
    analyzeStage,
    analyzeDetail,
    error,
    aiMode,
    addImages,
    addSamples,
    removeImage,
    analyze,
  } = useStudio();

  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  if (!ready) return <p className="px-8 py-20 text-sm text-muted-foreground">保存した作品を開いています…</p>;

  const analyzed = new Set(analyses.map((item) => item.id));
  const pending = images.filter((image) => !analyzed.has(image.id)).length;
  const stageIndex = STAGES.findIndex((stage) => stage.id === analyzeStage);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 md:grid-cols-[240px_minmax(0,1fr)] md:px-8 md:py-14">
      <aside className="md:pt-2">
        <p className="text-xs tracking-[0.22em] text-vermillion">01　LEARN</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-balance">過去のデザインを見せる</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          1枚だけの印象では、癖とは呼びません。複数の作品を並べ、繰り返している色の絞り方、余白、文字の置き場を拾います。
        </p>
        <ol className="mt-8 space-y-3 text-sm">
          {["作品を置く", "横断して読む", "癖をプロファイルにする"].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <DesktopHint />
      </aside>

      <section className="min-w-0">
        <div
          onDragEnter={() => setOver(true)}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            void addImages(Array.from(event.dataTransfer.files));
          }}
          className={cn(
            "rounded-3xl border border-dashed px-6 py-10 text-center transition-colors",
            over ? "border-vermillion bg-vermillion/5" : "border-border bg-card",
          )}
        >
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary">
            <Upload className="size-5" />
          </span>
          <h2 className="mt-4 font-display text-2xl">ここにドラッグ＆ドロップ</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            PNG、JPG、WEBP。ポスター、サムネイル、投稿画像など、自分で作ったものを混ぜてください。12点まで、このブラウザにだけ残ります。
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button type="button" className="h-11 px-4" onClick={() => inputRef.current?.click()} disabled={analyzing}>
              <ImagePlus />
              ファイルを選ぶ
            </Button>
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => void addSamples()} disabled={analyzing}>
              見本の作品で試す
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="sr-only"
            onChange={(event) => {
              void addImages(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </div>

        {images.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">まだ作品がありません。2点以上あると、偶然と癖を分けやすくなります。</p>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((image) => {
              const signals = analyses.find((item) => item.id === image.id)?.signals;
              return (
                <li key={image.id} className="group relative overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="relative aspect-[4/5]">
                    <Image src={image.dataUrl} alt={image.name} fill className="object-cover" unoptimized />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="absolute top-2 right-2 bg-background/90"
                    onClick={() => void removeImage(image.id)}
                    disabled={analyzing}
                    aria-label={`${image.name}を外す`}
                  >
                    <X />
                  </Button>
                  <div className="space-y-1 px-3 py-3">
                    <p className="truncate text-xs">{image.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {signals ? summarizeSignals(signals) : "未分析"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 rounded-3xl bg-foreground px-5 py-5 text-background">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-2xl">{images.length}点の作品</p>
              <p className="mt-1 text-sm text-background/70">
                {profile ? `前回の傾向を残したまま、${pending > 0 ? `未分析${pending}点を含めて` : ""}更新します。` : "分析すると、この人のデザインの癖がプロファイルになります。"}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-11 px-4"
              disabled={analyzing || images.length === 0}
              onClick={() => {
                void analyze().then((ok) => {
                  if (ok) router.push("/style");
                });
              }}
            >
              {analyzing ? <Loader2 className="animate-spin" /> : null}
              {profile ? "傾向を更新する" : "デザインを分析する"}
            </Button>
          </div>
          {analyzing ? (
            <ol className="mt-5 space-y-2 border-t border-background/15 pt-4" aria-live="polite">
              {STAGES.map((stage, index) => {
                const done = stageIndex > index;
                const current = stage.id === analyzeStage;
                return (
                  <li key={stage.id} className={cn("flex items-start gap-2 text-sm", !done && !current && "text-background/45")}>
                    {done ? <Check className="mt-0.5 size-4" /> : current ? <Loader2 className="mt-0.5 size-4 animate-spin" /> : <span className="mt-1 size-4 rounded-full border border-current" />}
                    <span>
                      {stage.label}
                      {current && analyzeDetail ? <span className="mt-0.5 block text-xs text-background/70">{analyzeDetail}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {aiMode === "vision"
            ? "色と構図は画像から計測し、文章化にビジョンモデルを使います。サムネイルだけがAPIへ送られます。"
            : "いまはAPIキーなしで動いています。色、構図、密度は画像そのものから計測し、共通点を言葉にします。キーを足すと、文字のニュアンスもモデルが見ます。"}
        </p>
      </section>
    </div>
  );
}
