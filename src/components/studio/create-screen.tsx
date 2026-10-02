"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useStudio } from "./studio-provider";

const INTENTS = [
  { label: "方針発表", purpose: "新規事業の方針発表で、現場が自分ごととして動き出せるようにする", size: "16:9（発表）" },
  { label: "進捗共有", purpose: "四半期の進捗を、数字ではなく次に止める仕事で共有する", size: "16:9（発表）" },
  { label: "提案", purpose: "一つの提案で、相手が持ち帰れる決断を一つ残す", size: "16:9（発表）" },
];

const SIZES = ["16:9（発表）", "1920×1080（スライド）"];

const MARKS = [
  { value: 0, label: "一般的なデザイン" },
  { value: 25, label: "少し自分らしく" },
  { value: 50, label: "自分のスタイルを反映" },
  { value: 75, label: "強く自分らしく" },
  { value: 100, label: "できる限り自分のデザインスタイルを再現" },
];

export function CreateScreen() {
  const {
    ready,
    profile,
    brief,
    updateBrief,
    styleStrength,
    setStyleStrength,
    error,
    planning,
    loadTestTalk,
  } = useStudio();
  const router = useRouter();

  if (!ready) return <p className="px-8 py-20 text-sm text-muted-foreground">制作画面を開いています…</p>;

  const strength = nearestMark(styleStrength);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start md:px-8 md:py-14">
      <section>
        <p className="text-xs tracking-[0.22em] text-vermillion">03　CREATE</p>
        <h1 className="mt-3 font-display text-4xl leading-tight">発表で起こしたいことを書く</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          ここは目的と相手だけです。原稿の分け方と枚の役は、次の「役割」で決めます。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/roles" className="inline-block text-sm underline underline-offset-4">
            原稿を分けて役割を決める
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={planning}
            onClick={() => {
              void loadTestTalk().then(() => router.push("/roles"));
            }}
          >
            {planning ? <Loader2 className="animate-spin" /> : null}
            テスト用の発表を入れる
          </Button>
        </div>

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
            router.push("/roles");
          }}
        >
          <Field label="デザインの目的" hint="何を作るか、一文で">
            <Textarea
              value={brief.purpose}
              onChange={(event) => updateBrief({ purpose: event.target.value })}
              placeholder="方針発表で、現場が最初に止める仕事を一つ決められるようにする"
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

          <Button type="submit" className="h-11 px-5" disabled={!brief.purpose.trim()}>
            原稿を分けに進む
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
              <h2 className="font-display text-2xl">次は役割</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                通しの原稿を貼ると枚に分け、確認したあと発表全体をCanvaで作ります。
              </p>
            </div>
            <Button type="button" className="h-10 px-3" disabled={!brief.purpose.trim()} onClick={() => router.push("/roles")}>
              役割へ
            </Button>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            毎回書くのが面倒なときは「テスト用の発表を入れる」で、中規模の方針発表が入った状態から役割画面に進めます。
          </p>
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
