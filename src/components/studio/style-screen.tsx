"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeColor } from "@/services/ai/color";
import type { PersonalTendency } from "@/services/ai/types";
import { cn } from "@/lib/utils";
import { useStudio } from "./studio-provider";

export function StyleScreen() {
  const { ready, profile, error, resetAll } = useStudio();
  if (!ready) return <p className="px-8 py-20 text-sm text-muted-foreground">プロファイルを開いています…</p>;
  if (!profile) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <p className="text-xs tracking-[0.22em] text-vermillion">02　STYLE</p>
        <h1 className="mt-3 font-display text-4xl">まだプロファイルがありません</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          過去の作品を数点置くと、色や構図の共通点がここに残ります。1点だけなら、癖ではなくその作品の特徴として表示します。
        </p>
        <Link href="/" className={cn(buttonVariants({ variant: "default" }), "mt-8 inline-flex h-11 px-4")}>
          作品をアップロード
        </Link>
      </div>
    );
  }

  const visionNote = typeof profile.extensions.visionNote === "string" ? profile.extensions.visionNote : "";

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">
      <p className="text-xs tracking-[0.22em] text-vermillion">02　STYLE</p>
      <div className="mt-3 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <h1 className="max-w-3xl font-display text-4xl leading-tight text-balance md:text-5xl">自分のデザインスタイル</h1>
        <p className="text-sm text-muted-foreground">
          {profile.sampleCount}点　·　{new Date(profile.updatedAt).toLocaleString("ja-JP")}
          <span className="mt-1 block">{profile.analysisMode === "vision" ? "計測＋ビジョンモデル" : "画像計測"}</span>
        </p>
      </div>

      {profile.sampleCount < 2 ? (
        <p className="mt-6 rounded-2xl border border-vermillion/30 bg-vermillion/5 px-4 py-3 text-sm leading-relaxed">
          まだ作品が1点です。下は癖ではなく、この1枚から読める特徴です。もう数点あると、偶然と共通点を分けられます。
        </p>
      ) : null}

      <p className="mt-8 max-w-3xl font-display text-2xl leading-relaxed text-balance">{profile.narrative}</p>
      <p className="mt-4 text-sm text-muted-foreground">署名のように残っている形: {profile.reading.signature}</p>

      {profile.changelog.length > 0 ? (
        <ul className="mt-6 max-w-3xl space-y-1 text-sm text-muted-foreground">
          {profile.changelog.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {visionNote ? <p className="mt-4 text-sm text-muted-foreground">{visionNote}</p> : null}

      <DeckFlow tendencies={profile.personal_tendencies} sampleCount={profile.sampleCount} />

      <section className="mt-10">
        <h2 className="font-display text-3xl">1枚ごとのデザインの癖</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          色、余白、文字の大小など、1枚の中で繰り返している行動です。確信度は、何点で一致しているかと作品数から置いています。
        </p>
        {surfaceTendencies(profile.personal_tendencies).length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">まだ、作品をまたいで言える癖はありません。</p>
        ) : (
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {surfaceTendencies(profile.personal_tendencies).map((item) => (
              <li key={item.id} className="rounded-2xl border border-border bg-card px-4 py-4">
                <p className="text-sm leading-relaxed">{item.statement}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{item.evidence}</span>
                  <span className="h-1 w-20 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full bg-foreground" style={{ width: `${Math.round(item.confidence * 100)}%` }} />
                  </span>
                  <span>確信度 {confidenceLabel(item.confidence)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <ProfileCard title="カラースタイル" description={profile.reading.relationships.color}>
          <Swatches label="背景" colors={profile.color.background} />
          <Swatches label="メイン" colors={profile.color.main} />
          <Swatches label="アクセント" colors={profile.color.accent} />
          <Facts
            items={[
              ["明度", profile.color.brightness],
              ["彩度", profile.color.saturation],
              ["コントラスト", profile.color.contrast],
            ]}
          />
          {profile.color.notes.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {profile.color.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </ProfileCard>
        <ProfileCard title="レイアウト" description={profile.reading.relationships.layout}>
          <Facts
            items={[
              ["揃え", profile.layout.alignment],
              ["左右", profile.layout.horizontal],
              ["上下", profile.layout.vertical],
              ["余白", profile.layout.spacing],
              ["密度", profile.layout.density],
              ["構図", profile.layout.composition],
              ["グリッド", profile.layout.grid],
            ]}
          />
        </ProfileCard>
        <ProfileCard title="タイポグラフィ" description={profile.reading.relationships.typography}>
          <Facts
            items={[
              ["雰囲気", profile.typography.style],
              ["太さ", profile.typography.weight],
              ["タイトル", profile.typography.title_size],
              ["本文との比", profile.typography.body_size],
              ["配置", profile.typography.title_placement],
              ["字間", profile.typography.spacing],
              ["行間", profile.typography.line_height],
            ]}
          />
        </ProfileCard>
        <ProfileCard title="ビジュアル" description={profile.reading.relationships.visual}>
          <Facts
            items={[
              ["写真", profile.visual.photo],
              ["イラスト", profile.visual.illustration],
              ["アイコン", profile.visual.icon],
              ["図形", profile.visual.shape],
              ["グラデーション", profile.visual.gradient],
              ["シャドウ", profile.visual.shadow],
              ["枠線", profile.visual.border],
              ["装飾", profile.visual.decoration],
            ]}
          />
        </ProfileCard>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-2xl">全体の印象</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.mood.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだ印象を一言にはしていません。</p>
          ) : (
            profile.mood.map((item) => (
              <span key={item} className="rounded-full border border-border bg-card px-3 py-1 text-sm">
                {item}
              </span>
            ))
          )}
        </div>
      </section>

      {profile.discovered.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">計測が新たに見つけた特徴</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {profile.discovered.map((item) => (
              <li key={item.id} className="rounded-2xl bg-secondary/70 px-4 py-4">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.evidence}　·　{item.source === "vision" ? "ビジョンモデル" : "作品の比較"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {profile.avoid.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">避けること</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {profile.avoid.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-vermillion" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link href="/create" className={cn(buttonVariants({ variant: "default" }), "inline-flex h-11 px-4")}>
          このスタイルでプロンプトを作る
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "inline-flex h-11 px-4")}>
          作品を追加する
        </Link>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            if (window.confirm("このブラウザに保存した作品とプロファイルを消去します。")) void resetAll();
          }}
        >
          学習データを消去
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <details className="mt-10 rounded-2xl border border-border bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm">保存しているプロファイル（JSON）</summary>
        <pre className="mt-3 max-h-80 overflow-auto text-xs leading-relaxed">{JSON.stringify(profile, null, 2)}</pre>
      </details>
    </div>
  );
}

function ProfileCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="font-display text-2xl">{title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Swatches({ label, colors }: { label: string; colors: string[] }) {
  if (colors.length === 0) {
    return <p className="text-sm text-muted-foreground">{label}: 安定した色としては取り出していません</p>;
  }
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <ul className="mt-2 flex flex-wrap gap-3">
        {colors.map((hex) => (
          <li key={`${label}-${hex}`} className="flex items-center gap-2">
            <span className="size-8 rounded-full border border-border" style={{ backgroundColor: hex }} />
            <span>
              <span className="block font-mono text-xs">{hex}</span>
              <span className="block text-xs text-muted-foreground">{describeColor(hex)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Facts({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm leading-relaxed">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function surfaceTendencies(items: PersonalTendency[]): PersonalTendency[] {
  return items.filter((item) => item.category !== "flow");
}

function DeckFlow({ tendencies, sampleCount }: { tendencies: PersonalTendency[]; sampleCount: number }) {
  const flow = tendencies.filter((item) => item.category === "flow");
  return (
    <section className="mt-10">
      <h2 className="font-display text-3xl">スライド全体の強弱</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        1枚の色や余白ではなく、作品を発表の順番のまま見たときの流れです。どこで力を入れ、どこで引いているかを分けています。
      </p>
      {flow.length > 0 ? (
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {flow.map((item, index) => (
            <li key={item.id} className="rounded-2xl border border-foreground bg-card px-4 py-4">
              <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">{String(index + 1).padStart(2, "0")}</p>
              <p className="mt-2 text-sm leading-relaxed">{item.statement}</p>
              <p className="mt-3 text-xs text-muted-foreground">{item.evidence}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {sampleCount < 3
            ? "3枚以上を、発表の順番のまま置くと、入口・山・着地の強弱を分けて読めます。"
            : "並びとしての強弱はまだ読めていません。点ごとの見た目が揃っていても、どこで力を入れてどこで引くかは、枚のあいだに差がないと出ません。"}
        </p>
      )}
    </section>
  );
}

function confidenceLabel(value: number): string {
  if (value >= 0.72) return "高";
  if (value >= 0.5) return "中";
  return "暫定";
}
