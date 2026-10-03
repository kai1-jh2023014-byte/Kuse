"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hasEnoughTalk } from "@/lib/infer-brief";
import { cn } from "@/lib/utils";
import { useStudio } from "./studio-provider";

const KINDS = [
  { label: "方針", purpose: "方針を、現場が自分ごととして動き出せるようにする" },
  { label: "進捗", purpose: "進捗を、次に止める仕事で共有する" },
  { label: "提案", purpose: "提案で、持ち帰れる決断を一つ残す" },
];

export function MakeScreen() {
  const router = useRouter();
  const {
    ready,
    profile,
    brief,
    updateBrief,
    manuscript,
    setManuscript,
    slidePlan,
    planning,
    error,
    divideManuscript,
    loadTestTalk,
  } = useStudio();
  const [openMore, setOpenMore] = useState(false);

  if (!ready) return <p className="px-8 py-20 text-sm text-muted-foreground">開いています…</p>;

  const slides = slidePlan?.slides ?? [];
  const readyToMake = slides.length > 0 && (!slidePlan?.sourceText || slidePlan.sourceText === manuscript.trim());

  const split = async () => {
    const ok = await divideManuscript(false);
    return ok;
  };

  const makeInCanva = async () => {
    if (!readyToMake) {
      const ok = await divideManuscript(false);
      if (!ok) return;
    }
    sessionStorage.setItem("kuse-canva-deck", "1");
    router.push("/canva");
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
      <p className="text-xs tracking-[0.22em] text-vermillion">SLIDES</p>
      <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">話すことを貼って、スライドにする</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        目的文は書かなくて大丈夫です。原稿から枚に分け、Canva で空の写真枠つきの発表を作ります。写真はできたあと自分で入れます。
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {KINDS.map((kind) => (
          <button
            key={kind.label}
            type="button"
            onClick={() => updateBrief({ purpose: kind.purpose, size: "16:9（発表）" })}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              brief.purpose === kind.purpose ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
            )}
          >
            {kind.label}
          </button>
        ))}
        <button
          type="button"
          className="rounded-full px-3 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
          disabled={planning}
          onClick={() => void loadTestTalk()}
        >
          見本の発表を入れる
        </button>
      </div>

      <label className="mt-6 block">
        <span className="sr-only">原稿</span>
        <Textarea
          value={manuscript}
          onChange={(event) => setManuscript(event.target.value)}
          placeholder={"例:\n終わらせる仕事を決める\n数字は後からついてくる\n今日持ち帰るのは、止める仕事が一つあること"}
          className="min-h-56 bg-background text-base leading-relaxed"
        />
      </label>
      <p className="mt-2 text-xs text-muted-foreground">{manuscript.trim().length} 文字 · 通しで貼るだけで十分です</p>

      {openMore || brief.audience ? (
        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-muted-foreground">誰に話すか（任意）</span>
          <Input
            value={brief.audience}
            onChange={(event) => updateBrief({ audience: event.target.value })}
            placeholder="現場のリーダー"
            className="h-11 bg-background"
          />
        </label>
      ) : (
        <button type="button" className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setOpenMore(true)}>
          相手を指定する
        </button>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button type="button" className="h-12 px-6" disabled={planning || !hasEnoughTalk(manuscript)} onClick={() => void split()}>
          {planning ? <Loader2 className="animate-spin" /> : null}
          枚に分ける
        </Button>
        <Button
          type="button"
          variant={readyToMake ? "default" : "outline"}
          className="h-12 px-6"
          disabled={planning || (!readyToMake && !hasEnoughTalk(manuscript))}
          onClick={() => void makeInCanva()}
        >
          {planning ? <Loader2 className="animate-spin" /> : null}
          Canvaでつくる
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {profile ? (
        <p className="mt-4 text-sm text-muted-foreground">
          自分の癖: {profile.reading.signature}　
          <Link href="/learn" className="underline underline-offset-4">
            変えたい
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          癖がなくても作れます。過去資料があれば{" "}
          <Link href="/learn" className="underline underline-offset-4">
            ここに置く
          </Link>
          。
        </p>
      )}

      {slides.length > 0 ? (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="font-display text-2xl">{slides.length}枚になりました</h2>
            <p className="text-xs text-muted-foreground">言葉が違う枚だけ、タップして直せます</p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {slides.map((slide) => (
              <li key={slide.id} className="rounded-3xl border border-border bg-card p-4">
                <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
                  {String(slide.index + 1).padStart(2, "0")}　{slide.roleLabel}
                </p>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{slide.text}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <ol className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {["表紙", "先回り", "並べる", "一点", "持ち帰る"].map((label, index) => (
            <li key={label} className="rounded-2xl border border-dashed border-border px-3 py-4">
              <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              <p className="mt-2 text-sm">{label}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
