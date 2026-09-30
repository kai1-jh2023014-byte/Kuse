"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useStudio } from "./studio-provider";
import { deckFingerprint } from "@/services/ai/slide-roles";

const INTENTS = [
  { label: "YouTubeサムネイル", purpose: "YouTubeサムネイルを作りたい", size: "1280×720（YouTubeサムネイル）" },
  { label: "イベントポスター", purpose: "イベントの告知ポスターを作りたい", size: "A3縦（ポスター）" },
  { label: "Instagram投稿", purpose: "Instagramの投稿画像を作りたい", size: "1080×1080（Instagram投稿）" },
  { label: "ゲームの告知画像", purpose: "ゲームの告知画像を作りたい", size: "1920×1080（ゲーム告知）" },
];

const SIZES = [
  "1280×720（YouTubeサムネイル）",
  "1920×1080（ゲーム告知）",
  "1080×1080（Instagram投稿）",
  "1080×1920（ストーリー）",
  "A3縦（ポスター）",
  "A4縦",
  "1920×1080（スライド）",
];

const MARKS = [
  { value: 0, label: "一般的なデザイン" },
  { value: 25, label: "少し自分らしく" },
  { value: 50, label: "自分のスタイルを反映" },
  { value: 75, label: "強く自分らしく" },
  { value: 100, label: "できる限り自分のデザインスタイルを再現" },
];

const REFINEMENTS = ["もっと自分らしく", "もっとシンプルに", "もっとインパクトを強く", "文字を目立たせる", "余白を増やす"];

export function CreateScreen() {
  const {
    ready,
    profile,
    brief,
    updateBrief,
    styleStrength,
    setStyleStrength,
    prompt,
    generating,
    error,
    generatePrompt,
    refine,
    slideDrafts,
    slidePlan,
    selectedSlideId,
  } = useStudio();
  const [copied, setCopied] = useState(false);
  const [instruction, setInstruction] = useState("");
  const router = useRouter();

  if (!ready) return <p className="px-8 py-20 text-sm text-muted-foreground">制作画面を開いています…</p>;

  const strength = nearestMark(styleStrength);
  const outline = deckFingerprint(slideDrafts);
  const roleFresh = Boolean(slidePlan && slidePlan.fingerprint === outline && slidePlan.slides.length > 0);
  const selectedRole = roleFresh ? slidePlan?.slides.find((slide) => slide.id === selectedSlideId) : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start md:px-8 md:py-14">
      <section>
        <p className="text-xs tracking-[0.22em] text-vermillion">03　CREATE</p>
        <h1 className="mt-3 font-display text-4xl leading-tight">作りたいものを書く</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          目的と、掲載する文字だけでも生成できます。自分らしさの強さで、過去の癖をどこまで指示に織り込むか決めます。
        </p>
        <Link href="/roles" className="mt-3 inline-block text-sm underline underline-offset-4">
          スライドなら、原稿をまとめて貼って役割を決める
        </Link>
        {selectedRole ? (
          <p className="mt-3 text-sm leading-relaxed">
            次のプロンプトには「{selectedRole.roleLabel}」の役割が入ります。見た目はその役に従います。
          </p>
        ) : selectedSlideId && slidePlan ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            選んだ役割は、スライドの文章が変わったので外れています。
            <Link href="/roles" className="ml-1 underline underline-offset-4">
              もう一度、全体を見る
            </Link>
          </p>
        ) : null}

        {!profile ? (
          <div className="mt-5 rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-relaxed">
            まだデザインの癖がありません。このまま作ると一般的な指示になります。
            <Link href="/" className="ml-2 underline underline-offset-4">
              先に作品を分析する
            </Link>
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">反映するスタイル: {profile.reading.signature}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {INTENTS.map((intent) => (
            <Button
              key={intent.label}
              type="button"
              variant={brief.purpose === intent.purpose ? "default" : "outline"}
              className="h-9"
              onClick={() => updateBrief({ purpose: intent.purpose, size: intent.size })}
            >
              {intent.label}
            </Button>
          ))}
        </div>

        <form
          className="mt-6 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void generatePrompt();
          }}
        >
          <Field label="デザインの目的" hint="何を作るか、一文で">
            <Textarea
              value={brief.purpose}
              onChange={(event) => updateBrief({ purpose: event.target.value })}
              placeholder="ゲームイベントの告知ポスターを作りたい"
              className="min-h-24 bg-background"
              required
            />
          </Field>
          <Field label="ターゲット">
            <Input
              value={brief.audience}
              onChange={(event) => updateBrief({ audience: event.target.value })}
              placeholder="20代のインディーゲームが好きな人"
              className="h-11 bg-background"
            />
          </Field>
          <Field label="掲載する文字" hint="改行すると、見出しと補足を分けて伝えます">
            <Textarea
              value={brief.copyText}
              onChange={(event) => updateBrief({ copyText: event.target.value })}
              placeholder={"NIGHT MARKET\n9.29 SAT 18:00\n入場無料"}
              className="min-h-28 bg-background"
            />
          </Field>
          <Field label="希望するサイズ">
            <Input
              list="kuse-sizes"
              value={brief.size}
              onChange={(event) => updateBrief({ size: event.target.value })}
              className="h-11 bg-background"
            />
            <datalist id="kuse-sizes">
              {SIZES.map((size) => (
                <option key={size} value={size} />
              ))}
            </datalist>
          </Field>
          <Field label="雰囲気">
            <Input
              value={brief.mood}
              onChange={(event) => updateBrief({ mood: event.target.value })}
              placeholder="夜の熱量。ただし自分のいつものトーンは崩さない"
              className="h-11 bg-background"
            />
          </Field>
          <Field label="入れたい画像">
            <Input
              value={brief.imagery}
              onChange={(event) => updateBrief({ imagery: event.target.value })}
              placeholder="会場の写真は使わず、タイトルだけで成立させたい"
              className="h-11 bg-background"
            />
          </Field>
          <Field label="その他の要望">
            <Textarea
              value={brief.notes}
              onChange={(event) => updateBrief({ notes: event.target.value })}
              placeholder="日付は必ず入れてください"
              className="min-h-20 bg-background"
            />
          </Field>

          <div className="rounded-3xl border border-border bg-card px-4 py-4">
            <div className="flex items-end justify-between gap-4">
              <Label htmlFor="style-strength">自分らしさ</Label>
              <p className="text-right text-sm">
                <span className="font-display text-2xl">{styleStrength}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{strength.label}</span>
              </p>
            </div>
            <Slider
              id="style-strength"
              min={0}
              max={100}
              step={1}
              value={[styleStrength]}
              onValueChange={(value) => setStyleStrength(Array.isArray(value) ? value[0] : value)}
              className="mt-4"
              aria-label="自分らしさの強度"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {MARKS.map((mark) => (
                <button
                  key={mark.value}
                  type="button"
                  onClick={() => setStyleStrength(mark.value)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs",
                    styleStrength === mark.value ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {mark.value}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="h-11 px-5" disabled={generating || !brief.purpose.trim()}>
            {generating ? <Loader2 className="animate-spin" /> : null}
            プロンプトを生成
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      </section>

      <section className="lg:sticky lg:top-24">
        <div className="rounded-3xl border border-border bg-card px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Canva AI用プロンプト</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                コピーして貼るか、
                <Link href="/canva" className="ml-1 underline underline-offset-4">
                  Canva連携
                </Link>
                から公式の生成へ渡せます。
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="h-10 px-3" disabled={!prompt} onClick={() => void copyPrompt(prompt, setCopied)}>
                {copied ? <Check /> : <Copy />}
                {copied ? "コピーしました" : "コピー"}
              </Button>
              <Button
                type="button"
                className="h-10 px-3"
                disabled={!prompt || !brief.purpose.trim()}
                onClick={() => {
                  sessionStorage.setItem("kuse-canva-loop", "1");
                  router.push("/canva");
                }}
              >
                Canvaで作る
              </Button>
            </div>
          </div>
          {prompt ? (
            <pre className={cn("mt-4 text-sm leading-relaxed whitespace-pre-wrap", generating && "opacity-60")}>
              {prompt}
            </pre>
          ) : (
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              目的を書いて生成すると、あなたの癖を織り込んだ文章がここに出ます。強度0は一般的な指示、100は過去の作品の関係性をできるだけ再現する指示です。
            </p>
          )}
          {generating ? <p className="mt-3 text-xs text-muted-foreground">文章を書いています…</p> : null}
        </div>

        <div className="mt-4 rounded-3xl border border-border px-5 py-5">
          <h3 className="text-sm font-medium">プロンプトを調整する</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            追加指示は、今のスタイルを消さずに差分として重ねます。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {REFINEMENTS.map((item) => (
              <Button
                key={item}
                type="button"
                variant="outline"
                className="h-9"
                disabled={!prompt || generating}
                onClick={() => void refine(item)}
              >
                {item}
              </Button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="日付をもっと小さく、など"
              className="h-11 bg-background"
              disabled={!prompt || generating}
            />
            <Button
              type="button"
              className="h-11 px-4"
              disabled={!prompt || generating || !instruction.trim()}
              onClick={() => {
                void refine(instruction).then((ok) => {
                  if (ok) setInstruction("");
                });
              }}
            >
              反映
            </Button>
          </div>
          {!profile ? (
            <p className="mt-3 text-xs text-muted-foreground">
              プロファイルがないときは、
              <Link href="/" className={cn(buttonVariants({ variant: "link" }), "h-auto px-1")}>
                学ぶ
              </Link>
              から作品を分析してください。
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

function nearestMark(value: number) {
  return MARKS.reduce((best, mark) => (Math.abs(mark.value - value) < Math.abs(best.value - value) ? mark : best));
}

async function copyPrompt(prompt: string, setCopied: (value: boolean) => void) {
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    const area = document.createElement("textarea");
    area.value = prompt;
    area.setAttribute("readonly", "");
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  setCopied(true);
  window.setTimeout(() => setCopied(false), 2000);
}
