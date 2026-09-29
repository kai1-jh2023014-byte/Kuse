"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deckFingerprint, type SlideDraft } from "@/services/ai/slide-roles";
import { cn } from "@/lib/utils";
import { useStudio } from "./studio-provider";

const SAMPLE: SlideDraft[] = [
  { id: "sample-title", text: "感情の順番" },
  { id: "sample-empathy", text: "みなさんはきっと、スライドは見た目が大事だと思っている" },
  { id: "sample-parallel", text: "伝わる\n覚えない\n動かない" },
  { id: "sample-impact", text: "一番伝えたいのは、相手の気持ちを一つ動かすこと" },
  { id: "sample-landing", text: "次の1枚で、相手の気持ちを一つだけ動かす" },
];

export function RolesScreen() {
  const router = useRouter();
  const {
    ready,
    brief,
    updateBrief,
    slideDrafts,
    slidePlan,
    selectedSlideId,
    planning,
    generating,
    error,
    updateSlide,
    addSlide,
    removeSlide,
    moveSlide,
    planRoles,
    replaceSlides,
    generatePrompt,
  } = useStudio();
  const [making, setMaking] = useState<string | null>(null);

  if (!ready) return <p className="px-8 py-20 text-sm text-muted-foreground">役割の画面を開いています…</p>;

  const outline = deckFingerprint(slideDrafts);
  const fresh = Boolean(slidePlan && slidePlan.fingerprint === outline);
  const filled = slideDrafts.filter((slide) => slide.text.trim()).length;

  const useSample = () => {
    replaceSlides(SAMPLE.map((slide) => ({ ...slide })));
    updateBrief({
      purpose: brief.purpose.trim() || "スライドは見た目ではなく、相手の感情を動かす順番だと伝える",
      audience: brief.audience.trim() || "発表を作っている人",
      size: brief.size.includes("スライド") ? brief.size : "1920×1080（スライド）",
    });
  };

  const makePrompt = async (id: string) => {
    if (!fresh || !brief.purpose.trim()) return;
    setMaking(id);
    const ok = await generatePrompt(id);
    setMaking(null);
    if (ok) router.push("/create");
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <p className="text-xs tracking-[0.22em] text-vermillion">04　ROLE</p>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h1 className="max-w-3xl font-display text-4xl leading-tight md:text-5xl">相手の感情を、どこで動かすか</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          1枚の見た目を先に決めると、全体の役割がばらばらになります。先に通しで読み、表紙・先回り・並列・インパクトの役を置きます。
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <section className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="role-purpose">この発表で起こしたいこと</Label>
            <Textarea
              id="role-purpose"
              value={brief.purpose}
              onChange={(event) => updateBrief({ purpose: event.target.value })}
              placeholder="見た目の話ではなく、相手の気持ちが一段動く順番を伝える"
              className="min-h-24 bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-audience">見ている人</Label>
            <Input
              id="role-audience"
              value={brief.audience}
              onChange={(event) => updateBrief({ audience: event.target.value })}
              placeholder="発表スライドを作っている人"
              className="h-11 bg-background"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <Label>スライドの文言</Label>
              <p className="text-xs text-muted-foreground">{filled} / 12 枚に文章</p>
            </div>
            {slideDrafts.map((slide, index) => (
              <div key={slide.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</p>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${index + 1}枚目を前へ`}
                      disabled={index === 0}
                      onClick={() => moveSlide(slide.id, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${index + 1}枚目を後ろへ`}
                      disabled={index === slideDrafts.length - 1}
                      onClick={() => moveSlide(slide.id, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${index + 1}枚目を消す`}
                      onClick={() => removeSlide(slide.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={slide.text}
                  onChange={(event) => updateSlide(slide.id, event.target.value)}
                  placeholder={index === 0 ? "表紙に置く名前か問い" : "この1枚で相手に渡す一文"}
                  className="min-h-20 bg-background"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-10" disabled={slideDrafts.length >= 12} onClick={addSlide}>
              <Plus />
              スライドを足す
            </Button>
            <Button type="button" variant="outline" className="h-10" onClick={useSample}>
              見本の流れを置く
            </Button>
          </div>
          <Button type="button" className="h-11 px-5" disabled={planning || filled === 0} onClick={() => void planRoles()}>
            {planning ? <Loader2 className="animate-spin" /> : null}
            全体を見て役割を決める
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </section>

        <section className="lg:sticky lg:top-24">
          {!slidePlan ? (
            <div className="rounded-3xl border border-dashed border-border px-5 py-8">
              <h2 className="font-display text-2xl">まだ、全体を見ていません</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                表紙は説明を始めない。並列は同じ強さで一度に見せる。重要な一点は周囲を空ける。相手がすでに感じていることは、「みなさんはきっとこう思ってますよね」と先に言う。デザインは、その役が決まってから従います。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {!fresh ? (
                <p role="status" className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm leading-relaxed">
                  文章が変わっています。もう一度、全体を見て役割を決めてください。
                </p>
              ) : null}
              <div className="rounded-3xl border border-border bg-card px-5 py-5">
                <h2 className="font-display text-2xl">感情の順番</h2>
                <p className="mt-3 text-sm leading-relaxed">{slidePlan.arc}</p>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  入るとき: {slidePlan.feelingStart}
                  <span className="mt-1 block">出るとき: {slidePlan.feelingEnd}</span>
                </p>
              </div>
              {slidePlan.warnings.length ? (
                <ul className="space-y-2 rounded-2xl border border-border px-4 py-3 text-sm leading-relaxed">
                  {slidePlan.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">役割の抜けは見当たりません。各枚の見せ方は、下の役に従ってください。</p>
              )}
              {slidePlan.slides.length === 0 ? (
                <p className="text-sm text-muted-foreground">文章のあるスライドがありません。</p>
              ) : (
                slidePlan.slides.map((slide) => {
                  const selected = selectedSlideId === slide.id && fresh;
                  return (
                    <article
                      key={slide.id}
                      className={cn("rounded-3xl border px-5 py-5", selected ? "border-foreground bg-card" : "border-border")}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs tracking-[0.18em] text-muted-foreground">
                          {String(slide.index + 1).padStart(2, "0")}
                        </p>
                        <p className="rounded-full bg-foreground px-3 py-1 text-xs text-background">{slide.roleLabel}</p>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{slide.text}</p>
                      <p className="mt-3 text-sm leading-relaxed">
                        {slide.audienceBefore}
                        <span className="mx-1 text-muted-foreground">→</span>
                        {slide.audienceAfter}
                      </p>
                      <dl className="mt-4 space-y-3 text-sm leading-relaxed">
                        <div>
                          <dt className="text-xs text-muted-foreground">仕事</dt>
                          <dd>{slide.job}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">なぜこの役か</dt>
                          <dd>{slide.logic}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">言い方</dt>
                          <dd>{slide.expression}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">見せ方</dt>
                          <dd>{slide.designConsequence}</dd>
                        </div>
                      </dl>
                      <Button
                        type="button"
                        className="mt-4 h-10"
                        disabled={!fresh || !brief.purpose.trim() || generating || making === slide.id}
                        onClick={() => void makePrompt(slide.id)}
                      >
                        {making === slide.id ? <Loader2 className="animate-spin" /> : null}
                        この役割でプロンプトを作る
                      </Button>
                      {!brief.purpose.trim() ? (
                        <p className="mt-2 text-xs text-muted-foreground">プロンプトにするには、上の「起こしたいこと」を書いてください。</p>
                      ) : null}
                    </article>
                  );
                })
              )}
              <Link href="/create" className={cn(buttonVariants({ variant: "outline" }), "inline-flex h-10")}>
                つくる画面で確認
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
