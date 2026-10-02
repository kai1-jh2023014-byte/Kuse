"use client";

import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LearningProposal } from "@/services/ai/evaluation-types";
import type { PublicVersion } from "@/services/canva/types";

export function EvaluationPanel({
  version,
  hasProfile,
  connected,
  busy,
  childIndex,
  editNote,
  onAnalyze,
  onSaveFeedback,
  onLearn,
  onApprove,
  onRegenerate,
  tasteNotes,
}: {
  version: PublicVersion;
  hasProfile: boolean;
  connected: boolean;
  busy: boolean;
  childIndex: number | null;
  editNote: string | null;
  onAnalyze: () => void;
  onSaveFeedback: (input: { feelsLikeMe: boolean; difference: string }) => void;
  onLearn: () => void;
  onApprove: () => void;
  onRegenerate: () => void;
  tasteNotes?: import("@/services/ai/taste-memory").TasteNote[];
}) {
  const [like, setLike] = useState(version.feedback?.feelsLikeMe ?? false);
  const [difference, setDifference] = useState(version.feedback?.difference ?? "");
  const [copied, setCopied] = useState(false);
  const analysis = version.analysis;
  const proposal = version.learningProposal;
  const blocked = Boolean(version.parentVersionId || childIndex);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-10" disabled={busy || !hasProfile} onClick={onAnalyze}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          KUSE分析
        </Button>
        <Button type="button" variant="outline" className="h-10" disabled={busy || !hasProfile} onClick={onAnalyze}>
          自動改善
        </Button>
      </div>
      {!hasProfile ? <p className="text-sm text-muted-foreground">先に作品を分析して、デザインスタイルを作ってください。</p> : null}
      <p className="text-xs leading-relaxed text-muted-foreground">
        自動改善は、評価と改善プロンプトの作成までです。既存デザインの自動編集は行いません。再生成は1回までです。
      </p>

      {analysis ? (
        <div className="space-y-4 rounded-2xl border border-border px-4 py-4">
          <div>
            <p className="text-xs tracking-[0.16em] text-muted-foreground">KUSEスタイル一致度</p>
            <p className="mt-1 font-display text-4xl">{analysis.style_similarity}%</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              デザインの良し悪しではありません。保存されているデザインスタイルとの近さです。
            </p>
          </div>
          <List title="一致している部分" items={analysis.matches} empty="計測上、強く一致した項目はありません。" />
          <List title="改善したい部分" items={analysis.gaps} empty="計測上の大きなずれはありません。" />
          <div>
            <p className="text-sm font-medium">ずれの内訳</p>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed">
              <Axis label="色" match={analysis.analysis.color.match} reason={analysis.analysis.color.reason} />
              <Axis label="レイアウト" match={analysis.analysis.layout.match} reason={analysis.analysis.layout.reason} />
              <Axis label="タイポグラフィ" match={analysis.analysis.typography.match} reason={analysis.analysis.typography.reason} />
              <Axis label="ビジュアル" match={analysis.analysis.visual.match} reason={analysis.analysis.visual.reason} />
            </ul>
          </div>
          {analysis.improvements.length ? (
            <ul className="space-y-2 text-sm">
              {analysis.improvements.map((item) => (
                <li key={`${item.category}-${item.problem}`} className="rounded-xl bg-secondary px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    {item.priority} · {item.category}
                  </span>
                  <p>{item.problem}</p>
                  <p className="text-muted-foreground">{item.suggestion}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs leading-relaxed text-muted-foreground">
            要求への一致 {analysis.requirement_match}%。{analysis.requirement_note}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">KUSE分析を押すと、この生成結果とデザインスタイルの差を見ます。</p>
      )}

      {version.improvementPrompt ? (
        <div className="rounded-2xl border border-border px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-2xl">改善プロンプト</h3>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => void copyText(version.improvementPrompt ?? "", setCopied)}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "コピーしました" : "コピー"}
            </Button>
          </div>
          <pre className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{version.improvementPrompt}</pre>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{editNote}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" className="h-10" disabled={busy || !connected || blocked} onClick={onRegenerate}>
              Canvaで改善版を生成
            </Button>
            {childIndex ? <p className="self-center text-sm text-muted-foreground">改善版は Version {childIndex} です。</p> : null}
            {version.parentVersionId ? <p className="self-center text-sm text-muted-foreground">改善の再生成は1回までです。</p> : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border px-4 py-4">
        <Button
          type="button"
          variant={like ? "default" : "outline"}
          className="h-10"
          onClick={() => setLike((current) => !current)}
        >
          このデザインは自分らしい
        </Button>
        <label className="mt-4 block text-sm" htmlFor={`difference-${version.id}`}>
          ここが違う
        </label>
        <Textarea
          id={`difference-${version.id}`}
          value={difference}
          onChange={(event) => setDifference(event.target.value)}
          placeholder="色は好きだけど、文字が大きすぎる"
          className="mt-2 min-h-20 bg-background"
        />
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-10"
          disabled={busy}
          onClick={() => onSaveFeedback({ feelsLikeMe: like, difference })}
        >
          フィードバックを積み上げる
        </Button>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          同じ指摘を繰り返すほど、次の生成でその項目が先に直されます。1回ではプロファイルを置き換えません。
        </p>
        {tasteNotes && tasteNotes.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs leading-relaxed">
            {tasteNotes.map((note) => (
              <li key={note.id}>
                {note.kind === "fix" ? "直す" : "残す"} · {note.count}回 · {note.text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-2xl border border-dashed border-border px-4 py-4">
        <Button type="button" variant="outline" className="h-10" disabled={busy || !analysis} onClick={onLearn}>
          このデザインを自分のスタイルとして学習
        </Button>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          候補を見るだけです。承認するまでデザインスタイルは変わりません。
        </p>
        {proposal ? <Proposal proposal={proposal} busy={busy} onApprove={onApprove} /> : null}
      </div>
    </div>
  );
}

function Proposal({ proposal, busy, onApprove }: { proposal: LearningProposal; busy: boolean; onApprove: () => void }) {
  return (
    <div className="mt-3 text-sm leading-relaxed">
      <p>{proposal.message}</p>
      {proposal.traits.length ? (
        <ul className="mt-2 space-y-2">
          {proposal.traits.map((trait) => (
            <li key={trait.id}>
              <span className="font-medium">{trait.label}</span>
              <span className="mt-1 block text-muted-foreground">{trait.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {proposal.traits.length && !proposal.approvedAt ? (
        <Button type="button" className="mt-3 h-10" disabled={busy} onClick={onApprove}>
          承認してプロファイルを更新
        </Button>
      ) : null}
      {proposal.approvedAt ? <p className="mt-2 text-xs text-muted-foreground">この候補は承認済みです。</p> : null}
    </div>
  );
}

function List({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      {items.length ? (
        <ul className="mt-1 list-disc pl-5 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Axis({ label, match, reason }: { label: string; match: string; reason: string }) {
  const word = match === "high" ? "近い" : match === "medium" ? "一部近い" : "ずれている";
  return (
    <li>
      <span className="font-medium">
        {label} · {word}
      </span>
      <span className="mt-1 block text-muted-foreground">{reason}</span>
    </li>
  );
}

async function copyText(value: string, setCopied: (copied: boolean) => void) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  setCopied(true);
  window.setTimeout(() => setCopied(false), 2000);
}
