"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/http";
import { cn } from "@/lib/utils";
import { PHASE_NOTES } from "@/services/agents/phases";
import { LOOP_LIMIT } from "@/services/canva/loop-policy";
import type { CanvaStatus, PublicVersion } from "@/services/canva/types";
import { EvaluationPanel } from "./evaluation-panel";
import { useStudio } from "./studio-provider";

const NOTICES: Record<string, { tone: "ok" | "bad"; text: string }> = {
  connected: { tone: "ok", text: "Canvaと接続しました。" },
  unconfigured: { tone: "bad", text: "クライアントIDとシークレットが未設定です。.env を確認してください。" },
  denied: { tone: "bad", text: "Canva側で接続が完了しませんでした。" },
  state: { tone: "bad", text: "接続の確認に失敗しました。もう一度「Canvaと接続」を押してください。" },
  failed: { tone: "bad", text: "Canvaとの接続に失敗しました。" },
  expired: { tone: "bad", text: "Canvaの接続期限が切れました。もう一度接続してください。" },
  mcp_auth: { tone: "bad", text: "Canvaの認可画面を開けませんでした。もう一度「Canvaと接続」を押してください。" },
  register: { tone: "bad", text: "Canva MCP用のクライアント登録に失敗しました。ネットワークを確認して、もう一度接続してください。" },
};

export function CanvaScreen() {
  const params = useSearchParams();
  const { ready, profile, brief, prompt, generating, generatePrompt, adoptProfile } = useStudio();
  const [status, setStatus] = useState<CanvaStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "generate" | "select" | "finish" | "disconnect" | "review" | "loop">("");
  const [editNote, setEditNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [loopMessage, setLoopMessage] = useState("");
  const [critique, setCritique] = useState("");
  const [loopArmed, setLoopArmed] = useState(false);
  const loopStarted = useRef(false);
  const startLoopRef = useRef<(text: string, from?: { versionId: string; critique: string }) => Promise<void>>(
    async () => {},
  );

  const reload = useCallback(async () => {
    const response = await fetch("/api/canva/status");
    const data = (await response.json().catch(() => null)) as (CanvaStatus & { error?: string }) | null;
    if (!response.ok || !data || data.error) throw new Error(data?.error || "接続状態を読み取れませんでした");
    setStatus(data);
    setLoadError(null);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/canva/status")
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as (CanvaStatus & { error?: string }) | null;
        if (!response.ok || !data || data.error) throw new Error(data?.error || "接続状態を読み取れませんでした");
        return data;
      })
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "接続状態を読み取れませんでした");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const notice = params.get("notice");
  useEffect(() => {
    if (!notice) return;
    const known = NOTICES[notice];
    if (!known) return;
    if (known.tone === "ok") toast.success(known.text);
    else toast.error(known.text);
  }, [notice]);

  const startLoop = useCallback(async (text: string, from?: { versionId: string; critique: string }) => {
    setBusy("loop");
    setActionError(null);
    setLoopMessage(`1 / ${LOOP_LIMIT}　Canvaにプロンプトを渡しています`);
    try {
      const response = await fetch("/api/canva/loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          profile,
          brief,
          critique: from?.critique ?? "",
          fromVersionId: from?.versionId,
        }),
      });
      if (!response.ok || !response.body) {
        const type = response.headers.get("content-type") ?? "";
        if (type.includes("json")) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error || `サーバーが ${response.status} を返しました`);
        }
        const text = await response.text();
        const stripped = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        throw new Error(stripped.slice(0, 180) || `サーバーが ${response.status} を返しました`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let outcome: { versionId: string; reached: boolean; reason: string } | null = null;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type?: string; message?: string; error?: string; versionId?: string; reached?: boolean; reason?: string };
          if (event.type === "error") throw new Error(event.error || "Canvaとの通信に失敗しました");
          if (event.type === "status" && event.message) setLoopMessage(event.message);
          if (event.type === "done" && event.versionId && event.reason) {
            outcome = { versionId: event.versionId, reached: Boolean(event.reached), reason: event.reason };
          }
        }
      }
      if (!outcome) throw new Error("自動改善の結果を読み取れませんでした");
      setFocusId(outcome.versionId);
      setLoopMessage(outcome.reason);
      setCritique("");
      await reload();
      toast.success(outcome.reached ? "基準に届いたので表示します" : "ここまでの結果を表示します");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "自動改善に失敗しました");
    } finally {
      setBusy("");
    }
  }, [profile, brief, reload]);

  useEffect(() => {
    startLoopRef.current = startLoop;
  }, [startLoop]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoopArmed(sessionStorage.getItem("kuse-canva-loop") === "1");
    });
    return () => {
      cancelled = true;
    };
  }, [status?.connected]);

  useEffect(() => {
    if (!ready || !status?.connected || !prompt.trim()) return;
    if (sessionStorage.getItem("kuse-canva-loop") !== "1") return;
    if (loopStarted.current) return;
    loopStarted.current = true;
    sessionStorage.removeItem("kuse-canva-loop");
    const text = prompt;
    queueMicrotask(() => {
      setLoopArmed(false);
      void startLoopRef.current(text);
    });
  }, [ready, status, prompt]);

  if (!ready || !status) {
    return (
      <div className="px-8 py-20">
        <p className="text-sm text-muted-foreground">{loadError ?? "Canva連携を開いています…"}</p>
        {loadError ? (
          <Button type="button" variant="outline" className="mt-4 h-10" onClick={() => void reload()}>
            再読み込み
          </Button>
        ) : null}
      </div>
    );
  }

  const draft = override ?? prompt;
  const versions = status.versions;
  const visible = versions.filter((item) => item.presented !== false);
  const folded = versions.filter((item) => item.presented === false);
  const focus = versions.find((item) => item.id === focusId) ?? visible.at(-1) ?? versions.at(-1) ?? null;
  const previous = focus ? visible[visible.findIndex((item) => item.id === focus.id) - 1] : undefined;
  const waitingForConnection = loopArmed && !status.connected;

  const generate = async () => {
    setBusy("generate");
    setActionError(null);
    try {
      const result = await postJson<{ version: PublicVersion }>("/api/canva/generate", { prompt: draft });
      setFocusId(result.version.id);
      await reload();
      toast.success("候補が返りました。使うものを選んでください。");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "生成に失敗しました");
    } finally {
      setBusy("");
    }
  };

  const selectCandidate = async (versionId: string, candidateId: string) => {
    setBusy("select");
    setActionError(null);
    try {
      await postJson("/api/canva/select", { versionId, candidateId });
      setFocusId(versionId);
      await reload();
      toast.success("Canvaにデザインを保存しました。編集はCanva上で行います。");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "候補の保存に失敗しました");
    } finally {
      setBusy("");
    }
  };

  const finish = async (versionId: string) => {
    setBusy("finish");
    setActionError(null);
    try {
      await postJson("/api/canva/finish", { versionId });
      await reload();
      toast.success("この版を完成にしました。デザインプロファイルは変えていません。");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "完成の記録に失敗しました");
    } finally {
      setBusy("");
    }
  };

  const analyzeVersion = async () => {
    if (!focus) return;
    setBusy("review");
    setActionError(null);
    try {
      const result = await postJson<{ version: PublicVersion; edit: { reason: string } }>("/api/canva/evaluate", {
        versionId: focus.id,
        profile,
        brief,
      });
      setEditNote(result.edit.reason);
      setFocusId(focus.id);
      await reload();
      toast.success("改善プロンプトを生成しました。");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "評価に失敗しました");
    } finally {
      setBusy("");
    }
  };

  const saveFeedback = async (input: { feelsLikeMe: boolean; difference: string }) => {
    if (!focus) return;
    setBusy("review");
    setActionError(null);
    try {
      await postJson("/api/canva/feedback", { versionId: focus.id, profile, ...input });
      await reload();
      toast.success("フィードバックを次の改善プロンプトに反映しました。");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "フィードバックを保存できませんでした");
    } finally {
      setBusy("");
    }
  };

  const learn = async (approve: boolean) => {
    if (!focus) return;
    setBusy("review");
    setActionError(null);
    try {
      const result = await postJson<{ version: PublicVersion; profile: typeof profile }>("/api/canva/learn", {
        versionId: focus.id,
        profile,
        approve,
      });
      if (approve && result.profile && (result.version.learningProposal?.traits.length ?? 0) > 0) adoptProfile(result.profile);
      else if (approve) toast("追加する新しい特徴はありませんでした。スタイルはそのままです。");
      await reload();
      if (!approve) toast("学習候補を表示しました。承認するまでスタイルは変わりません。");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "学習候補を作れませんでした");
    } finally {
      setBusy("");
    }
  };

  const regenerate = async () => {
    if (!focus) return;
    setBusy("review");
    setActionError(null);
    try {
      const result = await postJson<{ version: PublicVersion }>("/api/canva/regenerate", { versionId: focus.id });
      setFocusId(result.version.id);
      await reload();
      toast.success("改善プロンプトで新しい候補を生成しました。");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Canvaとの通信に失敗しました");
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await postJson("/api/canva/disconnect", {});
      await reload();
      toast("Canvaとの接続を外しました");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "切断に失敗しました");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-10 md:px-8 md:py-14">
      <header>
        <p className="text-xs tracking-[0.22em] text-vermillion">04　CANVA</p>
        <h1 className="mt-3 font-display text-4xl leading-tight">Canvaで生成する</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          「Canvaで作る」は、公式の生成に渡してから癖への近さを測り、ずれが大きければ改善プロンプトで最大{LOOP_LIMIT}回まで作り直します。基準に届いたものだけを表示します。候補をCanvaのデザインにする操作は、表示したあとに選びます。
        </p>
      </header>

      <Step index="01" title="Canva接続状態">
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot on={status.connected} />
          <p className="text-sm">
            {status.connected ? "接続済み" : status.configured ? "未接続" : "資格情報が未設定"}
          </p>
        </div>
        {status.connected ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-10" disabled={busy !== ""} onClick={() => void disconnect()}>
              {busy === "disconnect" ? <Loader2 className="animate-spin" /> : null}
              接続を外す
            </Button>
          </div>
        ) : (
          <a href="/api/canva/connect" className={cn(buttonVariants(), "mt-4 h-11 px-5")}>
            Canvaと接続
          </a>
        )}
        {!status.configured ? (
          <div className="mt-4 rounded-2xl bg-secondary px-4 py-3 text-sm leading-relaxed">
            <p>サーバーの .env に CANVA_CLIENT_ID と CANVA_CLIENT_SECRET を入れてください。トークンはブラウザに置きません。</p>
            <p className="mt-2 text-muted-foreground">{status.portal.selfServiceNote}</p>
            <p className="mt-2">
              <a className="underline underline-offset-4" href={status.portal.docsUrl} target="_blank" rel="noreferrer">
                公式のアクセス手順
              </a>
              <span className="mx-2 text-muted-foreground">/</span>
              <a className="underline underline-offset-4" href={status.portal.waitlistUrl} target="_blank" rel="noreferrer">
                ウェイトリスト
              </a>
            </p>
          </div>
        ) : null}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Developer Portal のリダイレクトURLに、次をそのまま登録します。
        </p>
        <code className="mt-2 block overflow-x-auto rounded-xl bg-secondary px-3 py-2 text-xs">{status.redirectUri}</code>
      </Step>

      <Step index="02" title="今回のデザイン要求">
        {brief.purpose.trim() ? (
          <dl className="space-y-2 text-sm">
            <Row label="目的" value={brief.purpose} />
            {brief.audience ? <Row label="ターゲット" value={brief.audience} /> : null}
            {brief.copyText ? <Row label="掲載内容" value={brief.copyText} /> : null}
            {brief.size ? <Row label="サイズ" value={brief.size} /> : null}
            {brief.mood ? <Row label="雰囲気" value={brief.mood} /> : null}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">まだ要求がありません。目的を書くと、プロンプトに織り込めます。</p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          {profile ? `反映するスタイル: ${profile.reading.signature}` : "プロファイルはまだありません。一般的な指示になります。"}
        </p>
        <Link href="/create" className={cn(buttonVariants({ variant: "outline" }), "mt-4 h-10")}>
          要求を編集
        </Link>
      </Step>

      <Step index="03" title="生成プロンプト">
        <Textarea
          value={draft}
          onChange={(event) => setOverride(event.target.value)}
          placeholder="ゲームイベントの告知ポスターを作りたい"
          className="min-h-48 bg-background"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            disabled={generating || !brief.purpose.trim()}
            onClick={() => {
              setOverride(null);
              void generatePrompt();
            }}
          >
            {generating ? <Loader2 className="animate-spin" /> : null}
            要求からプロンプトを作る
          </Button>
        </div>
      </Step>

      <Step index="04" title="Canvaで作る">
        {waitingForConnection ? (
          <p className="mb-3 text-sm">接続すると、今のプロンプトで自動改善を始めます。</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-11 px-5"
            disabled={!status.connected || !draft.trim() || !brief.purpose.trim() || busy !== ""}
            onClick={() => void startLoop(draft)}
          >
            {busy === "loop" ? <Loader2 className="animate-spin" /> : null}
            基準まで自動で作る
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-5"
            disabled={!status.connected || !draft.trim() || busy !== ""}
            onClick={() => void generate()}
          >
            {busy === "generate" ? <Loader2 className="animate-spin" /> : null}
            1回だけ生成
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {loopMessage || `最大${LOOP_LIMIT}回です。既存のデザインは自動では編集せず、新しい候補を作ります。KUSEスタイル一致度は出来の点数ではありません。`}
        </p>
        {!status.connected ? <p className="mt-2 text-xs text-muted-foreground">生成するには、先にCanvaと接続します。</p> : null}
        {actionError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
      </Step>

      <Step index="05" title="生成結果">
        {focus ? (
          <ResultCards
            version={focus}
            busy={busy === "select"}
            onSelect={(candidateId) => void selectCandidate(focus.id, candidateId)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">まだ生成結果はありません。</p>
        )}
        {focus?.design ? (
          <div className="mt-4 rounded-2xl border border-border px-4 py-4">
            <p className="text-xs tracking-[0.16em] text-muted-foreground">CANVAに保存したデザイン</p>
            <p className="mt-2 font-display text-2xl">{focus.design.title || "無題のデザイン"}</p>
            <dl className="mt-3 space-y-1 text-sm">
              <Row label="デザインID" value={focus.design.id} />
              {typeof focus.design.pageCount === "number" ? <Row label="ページ" value={String(focus.design.pageCount)} /> : null}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {focus.design.editUrl ? (
                <a className={cn(buttonVariants(), "h-10")} href={focus.design.editUrl} target="_blank" rel="noreferrer">
                  Canvaで編集
                </a>
              ) : null}
              {focus.design.viewUrl ? (
                <a className={cn(buttonVariants({ variant: "outline" }), "h-10")} href={focus.design.viewUrl} target="_blank" rel="noreferrer">
                  表示
                </a>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={busy !== "" || Boolean(focus.finishedAt)}
                onClick={() => void finish(focus.id)}
              >
                {focus.finishedAt ? "完成済み" : "この結果で完成"}
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              編集内容の確定はCanvaの画面で行います。完成にしても、デザインプロファイルは更新しません。
            </p>
          </div>
        ) : null}
      </Step>

      <Step index="06" title="KUSE分析と改善">
        {focus ? (
          <EvaluationPanel
            key={`${focus.id}-${focus.feedback?.updatedAt ?? "new"}`}
            version={focus}
            hasProfile={Boolean(profile)}
            connected={status.connected}
            busy={busy === "review"}
            childIndex={versions.find((item) => item.parentVersionId === focus.id)?.index ?? null}
            editNote={editNote}
            onAnalyze={() => void analyzeVersion()}
            onSaveFeedback={(input) => void saveFeedback(input)}
            onLearn={() => void learn(false)}
            onApprove={() => void learn(true)}
            onRegenerate={() => void regenerate()}
          />
        ) : (
          <p className="text-sm text-muted-foreground">生成結果が出てから、KUSEスタイルとの差を見ます。</p>
        )}
        {actionError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {actionError}
          </p>
        ) : null}
      </Step>

      <Step index="07" title="批評してもう一度回す">
        <p className="text-sm leading-relaxed text-muted-foreground">{PHASE_NOTES.loop}</p>
        <Textarea
          value={critique}
          onChange={(event) => setCritique(event.target.value)}
          placeholder="並列が一つに寄っている。表紙で説明しすぎ。"
          className="mt-3 min-h-24 bg-background"
        />
        <Button
          type="button"
          className="mt-3 h-10"
          disabled={!status.connected || !focus || !critique.trim() || !brief.purpose.trim() || busy !== ""}
          onClick={() => focus && void startLoop(focus.improvementPrompt || focus.prompt, { versionId: focus.id, critique: critique.trim() })}
        >
          {busy === "loop" ? <Loader2 className="animate-spin" /> : null}
          この批評で、もう一度回す
        </Button>
      </Step>

      <Step index="09" title="バージョン">
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">生成すると、Version 1 からここに残ります。</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {visible.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setFocusId(version.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm",
                    focus?.id === version.id ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
                  )}
                >
                  Version {version.index}
                  {version.finishedAt ? " · 完成" : ""}
                  {version.presented ? " · 表示" : ""}
                </button>
              ))}
            </div>
            {folded.length ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-muted-foreground">基準前の途中結果 {folded.length} 回</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  {folded.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => setFocusId(version.id)}
                      className="rounded-full bg-secondary px-3 py-1.5 text-sm text-muted-foreground"
                    >
                      Version {version.index}
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
            {previous && focus ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <CompareCard label="前回" version={previous} />
                <CompareCard label="今回" version={focus} />
              </div>
            ) : focus ? (
              <div className="mt-4">
                <CompareCard label="今回" version={focus} />
              </div>
            ) : null}
          </>
        )}
      </Step>
    </div>
  );
}

function Step({ index, title, children }: { index: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card px-5 py-5">
      <h2 className="font-display text-2xl">
        <span className="mr-3 font-mono text-xs text-vermillion">{index}</span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusDot({ on }: { on: boolean }) {
  return <span className={cn("size-2.5 rounded-full", on ? "bg-vermillion" : "bg-muted-foreground/40")} aria-hidden />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function ResultCards({
  version,
  busy,
  onSelect,
}: {
  version: PublicVersion;
  busy: boolean;
  onSelect: (candidateId: string) => void;
}) {
  if (version.candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">候補が空でした。ジョブID: {version.jobId}</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {version.candidates.map((candidate, index) => {
        const thumb = candidate.thumbnails[0]?.url;
        const selected = version.selectedCandidateId === candidate.candidateId;
        return (
          <article key={candidate.candidateId} className="overflow-hidden rounded-2xl border border-border">
            {thumb ? (
              <Image
                src={`/api/canva/thumbnail?url=${encodeURIComponent(thumb)}`}
                alt={`Version ${version.index} の候補 ${index + 1}`}
                width={640}
                height={800}
                unoptimized
                className="h-56 w-full bg-secondary object-contain"
              />
            ) : (
              <div className="grid h-40 place-items-center bg-secondary px-4 text-center text-xs text-muted-foreground">
                サムネイルは返ってきませんでした
              </div>
            )}
            <div className="space-y-2 px-3 py-3">
              <p className="text-sm">候補 {index + 1}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">{candidate.candidateId}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-9" disabled={busy || selected} onClick={() => onSelect(candidate.candidateId)}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {selected ? "この候補を保存済み" : "この候補を使う"}
                </Button>
                {candidate.url ? (
                  <a className={cn(buttonVariants({ variant: "outline" }), "h-9")} href={candidate.url} target="_blank" rel="noreferrer">
                    Canvaで見る
                  </a>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CompareCard({ label, version }: { label: string; version: PublicVersion }) {
  const thumb = version.candidates.find((item) => item.candidateId === version.selectedCandidateId)?.thumbnails[0]?.url
    ?? version.candidates[0]?.thumbnails[0]?.url;
  const similarity = version.analysis ? `${version.analysis.style_similarity}%` : "未分析";
  return (
    <article className="rounded-2xl border border-border px-4 py-4">
      <p className="text-xs tracking-[0.16em] text-vermillion">
        {label} · Version {version.index}
      </p>
      {thumb ? (
        <Image
          src={`/api/canva/thumbnail?url=${encodeURIComponent(thumb)}`}
          alt={`Version ${version.index}`}
          width={640}
          height={480}
          unoptimized
          className="mt-3 h-40 w-full bg-secondary object-contain"
        />
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">KUSEスタイル一致度</p>
      <p className="font-display text-3xl">{similarity}</p>
      <p className="mt-2 line-clamp-5 text-sm leading-relaxed whitespace-pre-wrap">{version.prompt}</p>
      {version.design?.editUrl ? (
        <a className="mt-2 inline-block text-sm underline underline-offset-4" href={version.design.editUrl} target="_blank" rel="noreferrer">
          Canvaで開く
        </a>
      ) : null}
      {version.improvementPrompt ? <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{version.improvementPrompt}</p> : null}
    </article>
  );
}
