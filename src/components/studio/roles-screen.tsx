"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { wantsWebMedia, type SlideMedia } from "@/services/ai/slide-media";
import { deckFingerprint, type SlideRole, type SlideRoleKind, type SlideWeight } from "@/services/ai/slide-roles";
import { cn } from "@/lib/utils";
import { useStudio } from "./studio-provider";

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
    loadTestTalk,
  } = useStudio();
  const [fetchMedia, setFetchMedia] = useState(false);

  if (!ready) return <p className="px-8 py-20 text-sm text-muted-foreground">役割の画面を開いています…</p>;

  const outline = deckFingerprint(slideDrafts);
  const fresh = Boolean(slidePlan && slidePlan.fingerprint === outline && slidePlan.slides.length > 0);
  const manuscriptStale = Boolean(slidePlan?.sourceText && slidePlan.sourceText !== manuscript.trim());
  const hasCuts = slideDrafts.some((slide) => slide.text.trim());
  const canPrompt = fresh && !manuscriptStale;

  const useSample = () => {
    void loadTestTalk();
  };

  const makeAllInCanva = () => {
    if (!canPrompt || !brief.purpose.trim()) return;
    sessionStorage.setItem("kuse-canva-deck", "1");
    router.push("/canva");
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <p className="text-xs tracking-[0.22em] text-vermillion">04　ROLE</p>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h1 className="max-w-3xl font-display text-4xl leading-tight md:text-5xl">原稿を分けて、発表にする</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          目的と通しの原稿から枚に分け、確認したあと、Canvaで発表全体を一度に作ります。2周目から、直す枚だけを改善します。
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
          <label className="flex items-start gap-2 text-sm leading-relaxed">
            <input
              type="checkbox"
              className="mt-1"
              checked={fetchMedia}
              onChange={(event) => setFetchMedia(event.target.checked)}
            />
            <span>ネットから画像と動画を探す。取るときは Wikimedia Commons だけを使い、作者とライセンスを書く。</span>
          </label>
          {wantsWebMedia(auditNote) ? (
            <p className="text-xs leading-relaxed text-muted-foreground">監査にネットから取る指示があるので、分け直すときに探します。</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-10" onClick={useSample} disabled={planning}>
              {planning ? <Loader2 className="animate-spin" /> : null}
              テスト用の発表を入れる
            </Button>
            <Button
              type="button"
              className="h-11 px-5"
              disabled={planning || manuscript.trim().length === 0}
              onClick={() => void divideManuscript(fetchMedia || wantsWebMedia(auditNote))}
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
            <details key={fresh ? "cuts-fresh" : "cuts-stale"} open={!fresh} className="border-t border-border pt-4">
              <summary className="cursor-pointer text-sm font-medium">言葉を直す</summary>
              <div className="mt-3 space-y-3">
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
                  <Button type="button" variant="outline" className="h-10" disabled={slideDrafts.length >= 24} onClick={addSlide}>
                    <Plus />
                    一枚足す
                  </Button>
                  <Button type="button" variant="outline" className="h-10" disabled={planning || !hasCuts} onClick={() => void planRoles()}>
                    {planning ? <Loader2 className="animate-spin" /> : null}
                    この分け方で役割を見なおす
                  </Button>
                </div>
              </div>
            </details>
          ) : null}
        </section>

        <section className="min-w-0">
          {!slidePlan || slidePlan.slides.length === 0 ? (
            <EmptyBoard />
          ) : (
            <div className="space-y-4">
              {manuscriptStale ? (
                <p role="status" className="rounded-2xl border border-vermillion/40 bg-card px-4 py-3 text-sm">
                  原稿が変わっています。もう一度、流れを読んで分けてください。
                </p>
              ) : null}
              {!fresh && !manuscriptStale ? (
                <p role="status" className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm">
                  分けた文章を直しています。役割を見なおすか、監査に書いて分け直してください。
                </p>
              ) : null}

              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <h2 className="font-display text-2xl">感情の順番</h2>
                  <p className="text-xs text-muted-foreground">{slidePlan.slides.length}枚</p>
                </div>
                {slidePlan.intent ? <p className="mb-2 text-sm leading-relaxed">全体で残したいこと: {slidePlan.intent}</p> : null}
                {slidePlan.emphasis ? <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{slidePlan.emphasis}</p> : null}
                {slidePlan.segmentation ? <p className="mb-3 text-sm text-muted-foreground">{slidePlan.segmentation.summary}</p> : null}
                <ol className="flex gap-2 overflow-x-auto pb-2">
                  <li className="flex w-28 shrink-0 flex-col justify-center rounded-2xl bg-secondary px-3 py-3">
                    <span className="text-[10px] tracking-[0.16em] text-muted-foreground">入る</span>
                    <span className="mt-1 line-clamp-3 text-xs leading-relaxed">{slidePlan.feelingStart}</span>
                  </li>
                  {slidePlan.slides.map((slide) => (
                    <li key={slide.id} className="shrink-0">
                      <button
                        type="button"
                        className={cn(
                          "flex h-full w-32 flex-col rounded-2xl border bg-card p-3 text-left",
                          slide.weight === "force" ? "border-vermillion" : "border-border",
                        )}
                        onClick={() => document.getElementById(`role-card-${slide.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
                      >
                        <span className="flex items-center justify-between text-[10px] tracking-[0.16em] text-muted-foreground">
                          <span>{String(slide.index + 1).padStart(2, "0")}</span>
                          <span>{weightMark(slide.weight)}</span>
                        </span>
                        <span className="mt-1 text-sm font-medium">{slide.roleLabel}</span>
                        {slide.media && slide.media.kind !== "none" ? (
                          <span className="mt-1 text-[10px] tracking-[0.14em] text-muted-foreground">{slide.media.label}</span>
                        ) : null}
                        <span className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {slide.transition === "reveal" && slide.transitionAdds ? `＋${slide.transitionAdds}` : headline(slide.text)}
                        </span>
                      </button>
                    </li>
                  ))}
                  <li className="flex w-28 shrink-0 flex-col justify-center rounded-2xl bg-foreground px-3 py-3 text-background">
                    <span className="text-[10px] tracking-[0.16em] opacity-70">出る</span>
                    <span className="mt-1 line-clamp-3 text-xs leading-relaxed">{slidePlan.feelingEnd}</span>
                  </li>
                </ol>
              </div>

              {slidePlan.warnings.length ? (
                <details className="rounded-2xl border border-vermillion/40 bg-card px-4 py-3">
                  <summary className="cursor-pointer text-sm">確認したい箇所が {slidePlan.warnings.length} つあります</summary>
                  <ul className="mt-3 space-y-2 text-sm leading-relaxed">
                    {slidePlan.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className="rounded-3xl border border-border bg-card px-4 py-4">
                <Label htmlFor="audit-note">この分け方への監査</Label>
                <Textarea
                  id="audit-note"
                  value={auditNote}
                  onChange={(event) => setAuditNote(event.target.value)}
                  placeholder="表紙が説明になっている。先回りの一文を独立させて。"
                  className="mt-2 min-h-20 bg-background"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-10"
                  disabled={planning || manuscript.trim().length === 0 || auditNote.trim().length === 0}
                  onClick={() => void divideManuscript(fetchMedia || wantsWebMedia(auditNote))}
                >
                  {planning ? <Loader2 className="animate-spin" /> : null}
                  監査を反映して、もう一度分ける
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="h-12 px-5"
                  disabled={!canPrompt || !brief.purpose.trim() || generating}
                  onClick={makeAllInCanva}
                >
                  この分け方で発表全体をCanvaで作る
                </Button>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                1枚ずつ候補を選ぶのではなく、まず全枚を作ります。できたあと、残す枚と直す枚を分けます。
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {slidePlan.slides.map((slide) => (
                  <RoleCard
                    key={slide.id}
                    slide={slide}
                    reason={slidePlan.segmentation?.reasons[slide.index]}
                    selected={selectedSlideId === slide.id && canPrompt}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const GHOSTS = [
  { label: "表紙", hint: "名前だけ" },
  { label: "先回り", hint: "相手の声" },
  { label: "並列", hint: "同じ強さ" },
  { label: "インパクト", hint: "一文" },
  { label: "着地", hint: "持って帰る" },
];

function EmptyBoard() {
  return (
    <div>
      <h2 className="font-display text-2xl">まだ、原稿を読んでいません</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">貼った原稿は、この並びのどこかに落ちます。</p>
      <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {GHOSTS.map((ghost, index) => (
          <li key={ghost.label} className="flex aspect-[4/5] flex-col justify-between rounded-2xl border border-dashed border-border bg-card/70 p-3">
            <span className="font-mono text-[10px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <span>
              <span className="block text-sm font-medium">{ghost.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{ghost.hint}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoleCard({
  slide,
  reason,
  selected,
}: {
  slide: SlideRole;
  reason?: string;
  selected: boolean;
}) {
  return (
    <article id={`role-card-${slide.id}`} className={cn("flex flex-col rounded-3xl border bg-card p-3", selected ? "border-foreground" : "border-border")}>
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">{String(slide.index + 1).padStart(2, "0")}</p>
        <div className="flex flex-wrap justify-end gap-1">
          {slide.weightLabel ? (
            <p className={cn("rounded-full px-2.5 py-1 text-xs", slide.weight === "force" ? "bg-vermillion text-primary-foreground" : "bg-secondary text-foreground")}>
              {slide.weightLabel}
            </p>
          ) : null}
          <p className={cn("rounded-full px-2.5 py-1 text-xs", slide.role === "impact" ? "bg-vermillion text-primary-foreground" : "bg-foreground text-background")}>
            {slide.roleLabel}
          </p>
          {slide.transition ? (
            <p className="rounded-full bg-secondary px-2.5 py-1 text-xs">{slide.transition === "reveal" ? "切り替えで足す" : "切り替えの前"}</p>
          ) : null}
        </div>
      </div>
      <SlideFace role={slide.role} text={slide.text} />
      {slide.media ? <MediaNote media={slide.media} /> : null}
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-1 text-xs leading-relaxed">
        <p className="text-muted-foreground">
          <span className="mb-1 block text-[10px] tracking-[0.14em]">入る</span>
          <span className="line-clamp-3">{slide.audienceBefore}</span>
        </p>
        <span aria-hidden="true" className="pt-4 text-muted-foreground">→</span>
        <p>
          <span className="mb-1 block text-[10px] tracking-[0.14em] text-muted-foreground">出る</span>
          <span className="line-clamp-3">{slide.audienceAfter}</span>
        </p>
      </div>
      <details className="mt-3 px-1">
        <summary className="cursor-pointer text-xs text-muted-foreground">この役の中身</summary>
        <dl className="mt-3 space-y-2 text-sm leading-relaxed">
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
          {slide.weightReason ? (
            <div>
              <dt className="text-xs text-muted-foreground">全体の中の強弱</dt>
              <dd>{slide.weightReason}</dd>
            </div>
          ) : null}
          {slide.transitionAdds ? (
            <div>
              <dt className="text-xs text-muted-foreground">切り替えで出す言葉</dt>
              <dd>{slide.transitionAdds}</dd>
            </div>
          ) : null}
          {reason ? (
            <div>
              <dt className="text-xs text-muted-foreground">切った理由</dt>
              <dd>{reason}</dd>
            </div>
          ) : null}
        </dl>
      </details>
    </article>
  );
}

function MediaNote({ media }: { media: SlideMedia }) {
  const citation = media.citation;
  return (
    <div className="mt-3 px-1">
      <p className="text-xs leading-relaxed">
        <span className="mr-2 rounded-full bg-secondary px-2 py-0.5">{media.label}</span>
        {media.placement}
      </p>
      {media.sound ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{media.sound}</p> : null}
      {citation ? (
        <a className="mt-2 block text-xs leading-relaxed underline underline-offset-4" href={citation.sourceUrl} target="_blank" rel="noreferrer">
          {citation.thumbUrl ? (
            // Commons thumbnails are cited on the next line. They are not part of the app bundle.
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={citation.thumbUrl} className="mb-2 h-24 w-full rounded-xl object-cover" />
          ) : null}
          引用: {citation.creator}（{citation.license}）
        </a>
      ) : null}
    </div>
  );
}

function SlideFace({ role, text }: { role: SlideRoleKind; text: string }) {
  const lines = text
    .split(/\n|／/)
    .map((line) => line.trim())
    .filter(Boolean);
  const shell = "min-h-40 rounded-2xl border border-border p-5";

  if (role === "parallel" && lines.length >= 2) {
    return (
      <div className={cn(shell, "grid gap-2 bg-background")} style={{ gridTemplateColumns: `repeat(${Math.min(lines.length, 3)}, minmax(0, 1fr))` }}>
        {lines.slice(0, 6).map((line, index) => (
          <p key={`${index}-${line}`} className="flex items-center justify-center rounded-xl bg-secondary px-2 py-4 text-center text-sm leading-snug">
            {line}
          </p>
        ))}
      </div>
    );
  }
  if (role === "impact") {
    return (
      <div className={cn(shell, "flex flex-col items-center justify-center bg-foreground text-background")}>
        <p className="text-center font-display text-2xl leading-snug">{headline(text)}</p>
      </div>
    );
  }
  if (role === "empathy") {
    return (
      <div className={cn(shell, "flex flex-col justify-center bg-background")}>
        <p className="font-display text-lg leading-relaxed">「{headline(text)}」</p>
      </div>
    );
  }
  if (role === "title" || role === "landing") {
    return (
      <div className={cn(shell, "flex flex-col items-center justify-center bg-background")}>
        <p className="text-center font-display text-3xl leading-snug">{headline(text)}</p>
      </div>
    );
  }
  if (role === "turn") {
    const [left, right] = splitTurn(text);
    return (
      <div className={cn(shell, "grid grid-cols-2 gap-2 bg-background")}>
        <p className="flex items-center rounded-xl bg-secondary px-3 py-4 text-sm leading-relaxed text-muted-foreground">{left}</p>
        <p className="flex items-center rounded-xl bg-foreground px-3 py-4 text-sm leading-relaxed text-background">{right}</p>
      </div>
    );
  }
  return (
    <div className={cn(shell, "flex flex-col justify-center border-dashed bg-background")}>
      <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function weightMark(weight: SlideWeight | undefined): string {
  if (weight === "force") return "力";
  if (weight === "even") return "揃";
  if (weight === "quiet") return "控";
  return "";
}

function headline(text: string): string {
  return text.split("\n")[0]?.trim() || text;
}

function splitTurn(text: string): [string, string] {
  const match = text.split(/しかし|でも|一方|ところが|実は/);
  const hinge = /しかし|でも|一方|ところが|実は/.exec(text)?.[0] ?? "";
  const left = match[0]?.trim() || "前の見方";
  const right = `${hinge} ${match[1]?.trim() ?? ""}`.trim() || "次の見方";
  return [left, right];
}
