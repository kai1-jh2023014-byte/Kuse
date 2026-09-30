"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deckFingerprint } from "@/services/ai/slide-roles";
import { cn } from "@/lib/utils";
import { useStudio } from "./studio-provider";

const SAMPLE_MANUSCRIPT =
  "感情の順番。みなさんはきっと、スライドは見た目が大事だと思っている。伝わる。覚えない。動かない。一番伝えたいのは、相手の気持ちを一つ動かすこと。次の1枚で、相手の気持ちを一つだけ動かす。";

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
    aiMode,
    updateSlide,
    addSlide,
    removeSlide,
    moveSlide,
    planRoles,
    divideManuscript,
    manuscript,
    auditNote,
    setManuscript,
    setAuditNote,
    generatePrompt,
  } = useStudio();
  const [making, setMaking] = useState<string | null>(null);

  if (!ready) return <p className="px-8 py-20 text-sm text-muted-foreground">役割の画面を開いています…</p>;

  const outline = deckFingerprint(slideDrafts);
  const fresh = Boolean(slidePlan && slidePlan.fingerprint === outline && slidePlan.slides.length > 0);
  const manuscriptStale = Boolean(slidePlan?.sourceText && slidePlan.sourceText !== manuscript.trim());
  const hasCuts = slideDrafts.some((slide) => slide.text.trim());
  const canPrompt = fresh && !manuscriptStale;

  const useSample = () => {
    setManuscript(SAMPLE_MANUSCRIPT);
    updateBrief({
      purpose: brief.purpose.trim() || "スライドは見た目ではなく、相手の感情を動かす順番だと伝える",
      audience: brief.audience.trim() || "発表を作っている人",
      size: brief.size.includes("スライド") ? brief.size : "1920×1080（スライド）",
    });
  };

  const makePrompt = async (id: string) => {
    if (!canPrompt || !brief.purpose.trim()) return;
    setMaking(id);
    const ok = await generatePrompt(id);
    setMaking(null);
    if (ok) router.push("/create");
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <p className="text-xs tracking-[0.22em] text-vermillion">04　ROLE</p>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h1 className="max-w-3xl font-display text-4xl leading-tight md:text-5xl">原稿を貼ると、流れで切る</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          一枚ずつ貼る必要はありません。通しの原稿から、相手の感情が動く境目でスライドに分けます。分けたあとは、あなたが確認して戻します。
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
              className="min-h-20 bg-background"
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
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <Label htmlFor="manuscript">原稿</Label>
              <p className="text-xs text-muted-foreground">{manuscript.trim().length} 文字</p>
            </div>
            <Textarea
              id="manuscript"
              value={manuscript}
              onChange={(event) => setManuscript(event.target.value)}
              placeholder="通しの文章を、そのまま貼ってください。枚の指定はいりません。"
              className="min-h-64 bg-background"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {aiMode === "vision"
                ? "モデルが原稿の文だけを使って、感情の境目で切ります。"
                : "文の切れ目と、気持ちが動く箇所から切ります。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-10" onClick={useSample}>
              見本の原稿を置く
            </Button>
            <Button
              type="button"
              className="h-11 px-5"
              disabled={planning || manuscript.trim().length === 0}
              onClick={() => void divideManuscript()}
            >
              {planning ? <Loader2 className="animate-spin" /> : null}
              流れを読んで分ける
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {hasCuts ? (
            <div className="space-y-3 border-t border-border pt-5">
              <div className="flex items-end justify-between gap-3">
                <Label>分けた結果</Label>
                <p className="text-xs text-muted-foreground">言葉を直したら、役割だけ見なおせます</p>
              </div>
              {slideDrafts.map((slide, index) => (
                <div key={slide.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</p>
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="icon" aria-label={`${index + 1}枚目を前へ`} disabled={index === 0} onClick={() => moveSlide(slide.id, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" aria-label={`${index + 1}枚目を後ろへ`} disabled={index === slideDrafts.length - 1} onClick={() => moveSlide(slide.id, 1)}>
                        <ArrowDown />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" aria-label={`${index + 1}枚目を消す`} onClick={() => removeSlide(slide.id)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={slide.text}
                    onChange={(event) => updateSlide(slide.id, event.target.value)}
                    className="min-h-16 bg-background"
                  />
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="h-10" disabled={slideDrafts.length >= 12} onClick={addSlide}>
                  <Plus />
                  一枚足す
                </Button>
                <Button type="button" variant="outline" className="h-10" disabled={planning || !hasCuts} onClick={() => void planRoles()}>
                  {planning ? <Loader2 className="animate-spin" /> : null}
                  この分け方で役割を見なおす
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section>
          {!slidePlan ? (
            <div className="rounded-3xl border border-dashed border-border px-5 py-8">
              <h2 className="font-display text-2xl">まだ、原稿を読んでいません</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                貼った原稿を、表紙、先回り、並列、インパクト、着地の順に切ります。切った結果を見て、違うところだけ監査に書いて戻してください。自動では次へ進みません。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {manuscriptStale ? (
                <p role="status" className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm leading-relaxed">
                  原稿が変わっています。もう一度、流れを読んで分けてください。
                </p>
              ) : null}
              {!fresh && !manuscriptStale ? (
                <p role="status" className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm leading-relaxed">
                  分けた文章を直しています。役割を見なおすか、監査に書いて分け直してください。
                </p>
              ) : null}
              <div className="rounded-3xl border border-border bg-card px-5 py-5">
                <h2 className="font-display text-2xl">感情の順番</h2>
                {slidePlan.segmentation ? <p className="mt-3 text-sm leading-relaxed">{slidePlan.segmentation.summary}</p> : null}
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
                <p className="text-sm text-muted-foreground">役割の抜けは見当たりません。この分け方でよければ、一枚を選んでプロンプトにします。</p>
              )}
              <div className="rounded-3xl border border-border px-5 py-5">
                <Label htmlFor="audit-note">この分け方への監査</Label>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  違うところだけ書いて戻すと、同じ原稿を切り直して、またここに戻ってきます。
                </p>
                <Textarea
                  id="audit-note"
                  value={auditNote}
                  onChange={(event) => setAuditNote(event.target.value)}
                  placeholder="表紙が説明になっている。先回りの一文を独立させて。"
                  className="mt-3 min-h-24 bg-background"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-10"
                  disabled={planning || manuscript.trim().length === 0 || auditNote.trim().length === 0}
                  onClick={() => void divideManuscript()}
                >
                  {planning ? <Loader2 className="animate-spin" /> : null}
                  監査を反映して、もう一度分ける
                </Button>
              </div>
              {slidePlan.slides.map((slide) => {
                const selected = selectedSlideId === slide.id && canPrompt;
                const reason = slidePlan.segmentation?.reasons[slide.index];
                return (
                  <article key={slide.id} className={cn("rounded-3xl border px-5 py-5", selected ? "border-foreground bg-card" : "border-border")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs tracking-[0.18em] text-muted-foreground">{String(slide.index + 1).padStart(2, "0")}</p>
                      <p className="rounded-full bg-foreground px-3 py-1 text-xs text-background">{slide.roleLabel}</p>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{slide.text}</p>
                    {reason ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{reason}</p> : null}
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
                      disabled={!canPrompt || !brief.purpose.trim() || generating || making === slide.id}
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
              })}
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
