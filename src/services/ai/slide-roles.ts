import type { DesignBrief } from "./types";

/** What a slide does to the audience. Visual design follows this, it does not lead. */

export type SlideRoleKind = "title" | "empathy" | "parallel" | "impact" | "turn" | "proof" | "landing" | "context";

export interface SlideDraft {
  id: string;
  text: string;
}

export interface SlideRole {
  id: string;
  index: number;
  text: string;
  role: SlideRoleKind;
  roleLabel: string;
  audienceBefore: string;
  audienceAfter: string;
  job: string;
  logic: string;
  expression: string;
  designConsequence: string;
}

export interface DeckRolePlan {
  arc: string;
  feelingStart: string;
  feelingEnd: string;
  slides: SlideRole[];
  warnings: string[];
  fingerprint: string;
}

const ROLE_LABEL: Record<SlideRoleKind, string> = {
  title: "表紙",
  empathy: "感情の先回り",
  parallel: "並列",
  impact: "インパクト",
  turn: "転換",
  proof: "根拠",
  landing: "着地",
  context: "説明",
};

export function deckFingerprint(slides: SlideDraft[]): string {
  return slides
    .map((slide) => slide.text.trim())
    .filter((text) => text.length > 0)
    .join("\n");
}

export function planSlideRoles(slides: SlideDraft[], brief: Pick<DesignBrief, "purpose" | "audience">): DeckRolePlan {
  const filled = slides.map((slide) => ({ ...slide, text: slide.text.trim() })).filter((slide) => slide.text);
  const fingerprint = deckFingerprint(filled);
  const opening = brief.audience
    ? `${brief.audience}は、まだ自分の話だと思っていない`
    : "見る人は、まだ自分の話だと思っていない";

  if (filled.length === 0) {
    return {
      arc: "スライドがありません。全体の感情の流れは、1枚目から最終枚まで並べてから決めます。",
      feelingStart: opening,
      feelingEnd: opening,
      slides: [],
      warnings: ["スライドを1枚以上書いてください。"],
      fingerprint,
    };
  }

  const kinds = filled.map((slide, index) =>
    chooseKind(slide.text, index, filled.length),
  );
  const slidesOut: SlideRole[] = [];
  let incoming = opening;
  for (let index = 0; index < filled.length; index += 1) {
    const kind = kinds[index] ?? "context";
    const text = filled[index]?.text ?? "";
    const outgoing = feelingAfter(kind, text, incoming);
    const previous = index > 0 ? kinds[index - 1] : null;
    const next = index < kinds.length - 1 ? kinds[index + 1] : null;
    slidesOut.push({
      id: filled[index]?.id ?? `slide-${index + 1}`,
      index,
      text,
      role: kind,
      roleLabel: ROLE_LABEL[kind],
      audienceBefore: incoming,
      audienceAfter: outgoing,
      job: jobFor(kind, text),
      logic: logicFor(kind, index, filled.length, previous, next, text),
      expression: expressionFor(kind, text),
      designConsequence: designFor(kind),
    });
    incoming = outgoing;
  }

  const warnings = collectWarnings(slidesOut, filled.length);
  const feelingEnd = slidesOut[slidesOut.length - 1]?.audienceAfter ?? opening;
  return {
    arc: arcSentence(slidesOut, opening, feelingEnd, brief.purpose),
    feelingStart: opening,
    feelingEnd,
    slides: slidesOut,
    warnings,
    fingerprint,
  };
}

export function roleSection(role: SlideRole, total: number): string {
  return [
    "【このスライドの役割】",
    `全${total}枚のうち${role.index + 1}枚目。見た目を考える前に、この1枚が相手の感情をどこからどこへ動かすかを守ってください。`,
    `役割は「${role.roleLabel}」。`,
    `見る人は「${role.audienceBefore}」から入り、「${role.audienceAfter}」になって出ていきます。`,
    `この1枚の仕事: ${role.job}`,
    `なぜこの役割か: ${role.logic}`,
    `言い方: ${role.expression}`,
    `見せ方はこの役割に従うこと。${role.designConsequence}`,
    "スライド全体の感情の順番を、この1枚の装飾で壊さないでください。",
  ].join("\n");
}

function chooseKind(text: string, index: number, count: number): SlideRoleKind {
  const signal = contentSignal(text);
  if (count === 1) return signal === "context" ? "title" : signal;
  if (signal !== "context") return signal;
  if (index === 0) return "title";
  if (index === count - 1) return "landing";
  return "context";
}

function contentSignal(text: string): SlideRoleKind {
  if (/しかし|でも|一方|ところが|実は/.test(text)) return "turn";
  if (/思う|感じて|不安|面倒|無理|わからない|分からない|？|\?|みなさん|皆さん/.test(text)) return "empathy";
  const chunks = chunksOf(text);
  if (chunks.length >= 3 || /並べ|比較|それぞれ|どちらも|並列/.test(text)) return "parallel";
  if (/重要|一番|核心|つまり|だから|絶対|ここだけ|伝えたい|インパクト/.test(text)) return "impact";
  if (/例えば|事例|理由|根拠|データ|%|％/.test(text)) return "proof";
  return "context";
}

function chunksOf(text: string): string[] {
  return text
    .split(/\n|、|・|\/|／/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function feelingAfter(kind: SlideRoleKind, text: string, incoming: string): string {
  switch (kind) {
    case "title":
      return "これは自分に関係あるかもしれない、と感じている";
    case "empathy":
      return "自分の気持ちを言い当てられて、聞く姿勢になっている";
    case "parallel":
      return "状況を一度に見比べられて、頭の中が整理されている";
    case "impact":
      return "一つの結論が、ほかの情報より強く残っている";
    case "turn":
      return "さっきまでと違う見方に、体が向いている";
    case "proof":
      return "動いた気持ちに、理由が追いついている";
    case "landing":
      return landingFeeling(text);
    default:
      return incoming.includes("情報") ? incoming : "情報は増えたが、気持ちはほとんど動いていない";
  }
}

function landingFeeling(text: string): string {
  const line = text.split("\n")[0]?.trim() || "次に何をするか";
  return `「${line.slice(0, 42)}」を持って帰れる`;
}

function jobFor(kind: SlideRoleKind, text: string): string {
  switch (kind) {
    case "title":
      return "説明を始めない。この話が自分に関係ある、とだけ開く。";
    case "empathy":
      return "主張の前に、相手がすでに感じていることを先に言う。";
    case "parallel":
      return `「${chunksOf(text).slice(0, 4).join(" / ") || text}」を同じ強さで並べ、一度に見比べられるようにする。`;
    case "impact":
      return "このスライドで、相手の気持ちを一段大きく動かす。ほかの情報は乗せない。";
    case "turn":
      return "前の見方を折って、次の見方へ渡す。";
    case "proof":
      return "すでに動いた感情を、静かに裏付けする。";
    case "landing":
      return "説明の要約ではなく、帰るときに残す感情を一つだけ置く。";
    default:
      return "情報を渡しているだけで、感情の役割がまだない。";
  }
}

function logicFor(
  kind: SlideRoleKind,
  index: number,
  count: number,
  previous: SlideRoleKind | null,
  next: SlideRoleKind | null,
  text: string,
): string {
  const place = `${index + 1}枚目 / ${count}枚`;
  if (count === 1) {
    return "1枚だけでは感情の流れが作れません。開く気持ちと、残す気持ちのどちらか一つに役を限ってください。";
  }
  if (kind === "title") {
    return `${place}。全体の入口です。ここで説明を終えると、後ろのスライドが感情を動かす余地がなくなります。`;
  }
  if (kind === "empathy") {
    return `${place}。${previous === "title" ? "表紙で関係が開いた直後なので、" : ""}相手の内心を先に言うと、次の主張が押しつけに聞こえません。`;
  }
  if (kind === "parallel") {
    return `${place}。項目を上下に序列すると、見ている人は一番上しか覚えません。同じ重さで置くと、関係が一度に分かります。`;
  }
  if (kind === "impact") {
    const afterEmpathy = previous === "empathy" || previous === "parallel";
    return `${place}。${afterEmpathy ? "前のスライドで受け取る準備ができたので、" : ""}ここで感情を大きく動かします。${next === "impact" ? "次も同じ強さだと、どちらも残りません。" : ""}`;
  }
  if (kind === "turn") {
    return `${place}。「${hinge(text)}」が、前までの見方と次の見方の境目です。`;
  }
  if (kind === "proof") {
    return `${place}。感情を動かしたあとに置く根拠です。ここを先に見せると、相手は説明を聞かされていると感じます。`;
  }
  if (kind === "landing") {
    return `${place}。最後は復習ではなく、持って帰る気持ちです。これまでの枚数を要約すると感情が薄まります。`;
  }
  return `${place}。前後の感情がここで止まっています。説明のままにするか、先回り・並列・インパクトのどれかに役を寄せてください。`;
}

function expressionFor(kind: SlideRoleKind, text: string): string {
  if (kind === "empathy") {
    const body = text
      .replace(/みなさんはきっとこう思ってますよね[。.?？]?/g, "")
      .replace(/^みなさん(は|が)きっと[、,]?\s*/g, "")
      .trim();
    return `みなさんはきっとこう思ってますよね。${body || "（相手が心の中で既に言っている一文）"}`;
  }
  if (kind === "parallel") {
    const chunks = chunksOf(text).slice(0, 4);
    return chunks.length >= 2 ? `同じ大きさで並べる: ${chunks.join(" ／ ")}` : "三つ以上を、番号の強弱をつけずに並べる。";
  }
  if (kind === "impact") return `一文だけ残す。候補: ${text.split("\n")[0]?.trim() || text}`;
  if (kind === "title") return `名前か問いを一つ。本文の説明は書かない。候補: ${text.split("\n")[0]?.trim() || text}`;
  if (kind === "landing") return `帰るときの一文。候補: ${text.split("\n")[0]?.trim() || text}`;
  if (kind === "turn") return `境目の言葉「${hinge(text)}」を、説明より先に置く。`;
  if (kind === "proof") return "感情のあとに、短い事実を一つ。";
  return text.split("\n")[0]?.trim() || text;
}

function designFor(kind: SlideRoleKind): string {
  switch (kind) {
    case "title":
      return "要素は一つ。余白で「まだ説明しない」ことを見せる。並列や箇条書きにしない。";
    case "empathy":
      return "図解にしない。相手の声として読める一文を、説明文より前に置く。";
    case "parallel":
      return "ヒーローを一つ作らない。項目の大きさ、余白、強さを同じにして、同時に目に入るようにする。";
    case "impact":
      return "ほかの情報と競争させない。一文を大きくし、周囲を空ける。装飾で勢いを足さない。";
    case "turn":
      return "前半と後半が画面の中で分かれて見えること。境目の言葉だけを強くする。";
    case "proof":
      return "静かで読める大きさ。インパクト用の巨大な文字にしない。";
    case "landing":
      return "要約リストにしない。残す一文だけを、表紙と同じくらいの余白で置く。";
    default:
      return "役割が説明のままなので、情報を盛るデザインにしない。役が決まるまで要素を増やさない。";
  }
}

function collectWarnings(slides: SlideRole[], count: number): string[] {
  const warnings: string[] = [];
  if (count === 1) warnings.push("1枚だけでは、相手の感情を段階的に動かせません。");
  if (count >= 3 && !slides.some((slide) => slide.role === "empathy")) {
    warnings.push("主張の前に、相手の気持ちを言い当てるスライドがありません。重要なことを先に言うと、押しつけに聞こえます。");
  }
  if (slides.filter((slide) => slide.role === "impact").length >= 2) {
    warnings.push("インパクトの役が複数あります。大きく動かす瞬間は、全体で一つに絞った方が残ります。");
  }
  for (let index = 1; index < slides.length; index += 1) {
    if (slides[index]?.role === "impact" && slides[index - 1]?.role === "impact") {
      warnings.push(`${index}枚目と${index + 1}枚目が連続でインパクトです。間に、受け取るスライドを置いてください。`);
    }
  }
  const title = slides[0];
  if (title?.role === "title" && chunksOf(title.text).length >= 3) {
    warnings.push("表紙に項目が並んでいます。表紙は開く役にして、並列は次のスライドへ分けてください。");
  }
  if (slides.some((slide) => slide.role === "context")) {
    warnings.push("役割が「説明」のままのスライドがあります。情報は増えますが、相手の感情はそこでは動きません。");
  }
  return warnings;
}

function arcSentence(slides: SlideRole[], start: string, end: string, purpose: string): string {
  const steps = slides.map((slide) => {
    const headline = slide.text.split("\n")[0]?.trim().slice(0, 28) || slide.roleLabel;
    return `${slide.index + 1}. ${slide.roleLabel}「${headline}」（${slide.audienceAfter}）`;
  });
  const about = purpose.trim() ? `「${purpose.trim()}」では、` : "";
  const closing = end.startsWith("「") ? end : `「${end}」`;
  return `${about}見る人は「${start}」から始まり、${steps.join(" → ")} を通って、${closing}まで連れていきます。各スライドのデザインは、この順番の中の役に従ってください。`;
}

function hinge(text: string): string {
  const match = /しかし|でも|一方|ところが|実は/.exec(text);
  return match?.[0] ?? "しかし";
}
