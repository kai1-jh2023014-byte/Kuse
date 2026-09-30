import type { DesignBrief } from "./types";

/** What a slide does to the audience. Visual design follows this, it does not lead. */

export type SlideRoleKind = "title" | "empathy" | "parallel" | "impact" | "turn" | "proof" | "landing" | "context";

/** Force is the one slide that carries the deck. Even keeps items level. Quiet must not compete. */
export type SlideWeight = "force" | "even" | "quiet";

/** A Canva slide transition: the next frame keeps the layout and adds one piece. */
export type TransitionBeat = "hold" | "reveal";

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
  weight?: SlideWeight;
  weightLabel?: string;
  weightReason?: string;
  deckIntent?: string;
  transition?: TransitionBeat;
  transitionGroup?: number;
  /** The words that appear on the transition, not the whole frame. */
  transitionAdds?: string;
  transitionNote?: string;
}

export interface ManuscriptSegmentation {
  summary: string;
  reasons: string[];
  mode: "heuristic" | "vision";
}

export interface DeckRolePlan {
  arc: string;
  feelingStart: string;
  feelingEnd: string;
  slides: SlideRole[];
  warnings: string[];
  fingerprint: string;
  /** What the whole deck is trying to leave behind. */
  intent?: string;
  /** Where the deck spends force, and where it holds back. */
  emphasis?: string;
  sourceText?: string;
  segmentation?: ManuscriptSegmentation;
}

export interface ManuscriptCut {
  slides: SlideDraft[];
  reasons: string[];
  summary: string;
}

const WEIGHT_LABEL: Record<SlideWeight, string> = {
  force: "力を入れる",
  even: "同じ強さ",
  quiet: "力を入れない",
};

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

const MAX_SLIDES = 12;

export function segmentManuscript(manuscript: string, audit = "", purpose = ""): ManuscriptCut {
  const source = manuscript.replace(/\r\n/g, "\n").replace(/\n---+\n/g, "\n\n").trim().slice(0, 8000);
  const note = audit.trim().slice(0, 500);
  const intent = purpose.trim().slice(0, 400);
  if (!source) {
    return { slides: [], reasons: [], summary: "原稿がありません。" };
  }
  const finer = /細かく|分けて|分割|一枚|ばらして|独立/.test(note);
  const packed = capSlides(expandTransitions(foldQuiet(applyAudit(packUnits(unitsFrom(source), finer, intent), note), intent)));
  const reasons = packed.map((text, index) => cutReason(text, index, packed.length, intent, packed[index - 1]));
  const summaryBase = note
    ? `${packed.length}枚に分け直しました。監査「${note.slice(0, 80)}」を、切る位置に反映しています。`
    : intent
      ? `${packed.length}枚に分けました。全体で残したいことに合わせて、力を入れる文だけを独立させ、説明はまとめています。違うところは監査に書いて、もう一度戻してください。`
      : `${packed.length}枚に分けました。感情が動く境目で切っています。違うところは監査に書いて、もう一度戻してください。`;
  const summary = reasons.some((reason) => reason.includes("切り替え"))
    ? summaryBase.replace("違うところは", "結論は次の枚の切り替えで足しています。違うところは")
    : summaryBase;
  return {
    slides: packed.map((text, index) => ({ id: `cut-${index + 1}`, text })),
    reasons,
    summary,
  };
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
      intent: brief.purpose.trim(),
      emphasis: "スライドが無いので、どこに力を入れるかはまだ置けません。",
    };
  }

  const kinds = filled.map((slide, index) =>
    chooseKind(slide.text, index, filled.length),
  );
  const slidesOut: Array<Omit<SlideRole, "weight" | "weightLabel" | "weightReason" | "deckIntent">> = [];
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

  const shaped = assignEmphasis(slidesOut, brief.purpose);
  const staged = markTransitions(shaped.slides);
  const warnings = collectWarnings(staged, filled.length);
  const feelingEnd = staged[staged.length - 1]?.audienceAfter ?? opening;
  return {
    arc: arcSentence(staged, opening, feelingEnd, brief.purpose),
    feelingStart: opening,
    feelingEnd,
    slides: staged,
    warnings,
    fingerprint,
    intent: shaped.intent,
    emphasis: shaped.emphasis,
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
    role.weightReason
      ? `この1枚の強弱は「${role.weightLabel}」。${role.weightReason}`
      : "",
    role.transitionNote ? `切り替え: ${role.transitionNote}` : "",
    `見せ方はこの役割に従うこと。${role.designConsequence}`,
    "スライド全体の感情の順番と強弱を、この1枚の装飾で壊さないでください。力を入れる枚と、引く枚を同じ強さにしないでください。",
  ]
    .filter(Boolean)
    .join("\n");
}

function assignEmphasis(
  slides: Array<Omit<SlideRole, "weight" | "weightLabel" | "weightReason" | "deckIntent">>,
  purpose: string,
): { slides: SlideRole[]; intent: string; emphasis: string } {
  const peak = choosePeak(slides, purpose);
  const intent = deckIntent(purpose, slides, peak);
  const weighted = slides.map((slide) => {
    const weight = weightFor(slide, peak);
    return {
      ...slide,
      weight,
      weightLabel: WEIGHT_LABEL[weight],
      deckIntent: intent,
      weightReason: weightReason(slide, weight, peak, intent, slides.length),
    };
  });
  return { slides: weighted, intent, emphasis: emphasisSentence(weighted, peak, intent) };
}

function choosePeak(
  slides: Array<Pick<SlideRole, "text" | "role">>,
  purpose: string,
): number {
  let best = -1;
  let bestScore = 0;
  slides.forEach((slide, index) => {
    const score = peakScore(slide, purpose);
    if (score <= 0) return;
    const current = best >= 0 ? slides[best] : undefined;
    if (best < 0 || score > bestScore || (score === bestScore && current && betterPeak(slide, current))) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

function peakScore(slide: Pick<SlideRole, "text" | "role">, purpose: string): number {
  let score = 0;
  if (carriesIntent(slide.text, purpose)) score += 6;
  if (slide.role === "impact") score += 5;
  if (slide.role === "turn") score += 2;
  return score;
}

function betterPeak(candidate: Pick<SlideRole, "role">, current: Pick<SlideRole, "role">): boolean {
  const rank = (role: SlideRoleKind) => {
    if (role === "impact") return 4;
    if (role === "title" || role === "landing") return 0;
    return 2;
  };
  return rank(candidate.role) > rank(current.role);
}

function deckIntent(
  purpose: string,
  slides: Array<Pick<SlideRole, "text">>,
  peak: number,
): string {
  const written = purpose.trim().replace(/。$/, "");
  if (written) return written;
  const line = slides[peak]?.text.split("\n")[0]?.trim();
  return line ? line.slice(0, 42) : "この並びで相手に残す気持ち";
}

function weightFor(slide: Pick<SlideRole, "role" | "index">, peak: number): SlideWeight {
  if (peak >= 0 && slide.index === peak) return "force";
  if (slide.role === "parallel") return "even";
  return "quiet";
}

function weightReason(
  slide: Pick<SlideRole, "role" | "index">,
  weight: SlideWeight,
  peak: number,
  intent: string,
  count: number,
): string {
  const place = peak >= 0 ? `${peak + 1}枚目` : "";
  if (weight === "force") {
    return `全体で残したいのは「${intent}」です。${count}枚のうち、山はこの${slide.index + 1}枚目だけに置きます。前後の枚は、この一文と競争させません。`;
  }
  if (weight === "even") {
    return place
      ? `ここは見比べる役です。項目の中では同じ強さにします。全体の山は${place}にあり、この枚はその山より前に出ません。`
      : "ここは見比べる役です。項目の中では同じ強さにし、どれか一つをヒーローにしません。";
  }
  if (slide.role === "title") {
    return place
      ? `入口では説明を始めません。全体の山は${place}に残し、ここでは関係が開くことだけを見せます。`
      : "入口では説明を始めません。全体で残す一文がまだ無いので、ここでも力を入れません。";
  }
  if (slide.role === "landing") {
    return place
      ? `最後は復習で埋めません。山は${place}に置いたので、ここでは持って帰る気持ちだけを静かに残します。`
      : "最後は復習で埋めません。残す一文がまだ一つに絞れていないので、ここでも力を入れません。";
  }
  if (slide.role === "impact") {
    return `大きく動かす瞬間は全体で一つです。山は${place}に寄せ、この枚は引きます。`;
  }
  return place
    ? `全体で残したい「${intent}」の山は${place}です。この枚は感情を準備するか、情報を添えるだけにして、大きさでは勝負しません。`
    : `全体で残す一文がまだ一つに絞れていません。この枚に力を入れて、説明を同じ強さで並べないでください。`;
}

function emphasisSentence(slides: SlideRole[], peak: number, intent: string): string {
  const marks = slides.map((slide) => (slide.weight === "force" ? "力" : slide.weight === "even" ? "揃" : "控"));
  if (peak < 0) {
    return `強弱は ${marks.join(" → ")}。全体で力を入れる一文がまだありません。残したいことを一つに絞ってから、そこ以外は引いてください。`;
  }
  return `強弱は ${marks.join(" → ")}。力を入れるのは${peak + 1}枚目だけです。全体で残したい「${intent}」を、ほかの枚は競争させません。`;
}

const INTENT_STOP = new Set([
  "スライド",
  "こと",
  "ため",
  "よう",
  "もの",
  "これ",
  "それ",
  "全体",
  "伝える",
  "について",
  "ではなく",
  "見た目",
  "デザイン",
  "気持ち",
]);

function intentTokens(purpose: string): string[] {
  const raw = purpose.match(/[一-龯ぁ-んァ-ヶーa-zA-Z0-9]{3,}/g) ?? [];
  return [...new Set(raw.filter((token) => token.length <= 16 && !INTENT_STOP.has(token)))];
}

function carriesIntent(text: string, purpose: string): boolean {
  const tokens = intentTokens(purpose);
  if (tokens.length === 0 || !text.trim()) return false;
  return tokens.some((token) => text.includes(token));
}

const PAYOFF = /^(だから|すると|その結果|つまり|そこで|よって|なので)[、,]?\s*/;

function expandTransitions(slides: string[]): string[] {
  const exploded: string[] = [];
  for (const slide of slides) exploded.push(...explodeMarkers(slide));
  const stitched: string[] = [];
  let carryArrow = false;
  for (const slide of exploded) {
    if (isArrowOnly(slide)) {
      carryArrow = true;
      continue;
    }
    const previous = stitched[stitched.length - 1];
    if (previous && (carryArrow || isPayoff(slide))) {
      const adds = slide.replace(PAYOFF, "").replace(/^[⇓⇒⇛]\s*/, "").trim();
      stitched.push(adds ? `${previous}\n${adds}` : previous);
      carryArrow = false;
      continue;
    }
    const device = splitDevice(slide);
    if (device && contentSignal(slide) !== "empathy" && contentSignal(slide) !== "parallel" && contentSignal(slide) !== "impact") {
      stitched.push(device[0]);
      stitched.push(`${device[0]}\n${device[1]}`);
      carryArrow = false;
      continue;
    }
    stitched.push(slide);
    carryArrow = false;
  }
  return stitched.filter((slide) => slide.trim().length > 0);
}

function explodeMarkers(text: string): string[] {
  if (!/[⇓⇒⇛]/.test(text)) return [text];
  const parts = text
    .split(/\s*[⇓⇒⇛]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return [text];
  const out: string[] = [];
  parts.forEach((part, index) => {
    if (index > 0) out.push("⇓");
    out.push(part);
  });
  return out;
}

function isArrowOnly(text: string): boolean {
  return /^[⇓⇒⇛]+$/.test(text.trim());
}

function isPayoff(text: string): boolean {
  const trimmed = text.trim();
  return PAYOFF.test(trimmed) || /^[⇓⇒⇛]/.test(trimmed);
}

function splitDevice(text: string): [string, string] | null {
  const match = text.trim().match(/^(.{12,}?)(?:と、|ことで、)(.{8,})$/);
  if (!match) return null;
  const left = match[1]?.trim() ?? "";
  const right = match[2]?.replace(/[。．]\s*$/, "").trim() ?? "";
  if (!left || !right || chunksOf(text).length >= 3) return null;
  return [left, right];
}

function markTransitions(slides: SlideRole[]): SlideRole[] {
  const addsAt = slides.map((slide, index) => (index === 0 ? null : addedText(slides[index - 1]?.text ?? "", slide.text)));
  let group = 0;
  return slides.map((slide, index) => {
    const adds = addsAt[index];
    const nextAdds = addsAt[index + 1] ?? null;
    if (adds) {
      return {
        ...slide,
        transition: "reveal" as const,
        transitionGroup: group,
        transitionAdds: adds,
        transitionNote: `前の枚と同じ配置を保ち、新しく出すのは「${adds}」だけです。ほかの文字や図の位置は動かさないでください。Canvaのスライド切り替えで、この要素が後から出現するようにしてください。1枚に結論まで載せないでください。`,
      };
    }
    if (nextAdds) {
      group += 1;
      return {
        ...slide,
        transition: "hold" as const,
        transitionGroup: group,
        transitionAdds: nextAdds,
        transitionNote: `これは切り替えの前の枚です。「${nextAdds}」は、この枚に置かないでください。次の枚で同じ位置関係のまま足し、Canvaのスライド切り替えで後から出してください。`,
      };
    }
    return slide;
  });
}

function addedText(previous: string, next: string): string | null {
  const base = previous.trim();
  const full = next.trim();
  if (!base || full.length <= base.length || !full.startsWith(base)) return null;
  const adds = full.slice(base.length).replace(/^[\s\n]+/, "").trim();
  if (adds.length < 2 || adds.length > 80) return null;
  return adds;
}

function foldQuiet(slides: string[], purpose: string): string[] {
  if (!purpose.trim()) return slides;
  const next: string[] = [];
  slides.forEach((text, index) => {
    const previous = next[next.length - 1];
    const signal = contentSignal(text);
    const quietBody = signal === "context" && !carriesIntent(text, purpose) && index !== 0 && index !== slides.length - 1;
    const previousQuiet = previous ? contentSignal(previous) === "context" && !carriesIntent(previous, purpose) : false;
    if (previous && quietBody && previousQuiet) next[next.length - 1] = `${previous}\n${text}`;
    else next.push(text);
  });
  return next;
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

function unitsFrom(text: string): string[] {
  const units: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;
    const bits = trimmed
      .split(/(?<=[。！？!?])/)
      .map((part) => part.trim())
      .filter(Boolean);
    units.push(...(bits.length ? bits : [trimmed]));
  }
  return units;
}

function packUnits(units: string[], finer: boolean, purpose = ""): string[] {
  const slides: string[] = [];
  let shorts: string[] = [];
  const flushShorts = () => {
    if (shorts.length === 0) return;
    if (finer && shorts.length >= 2) slides.push(...shorts);
    else slides.push(shorts.join("\n"));
    shorts = [];
  };
  units.forEach((unit, index) => {
    const signal = contentSignal(unit);
    const last = index === units.length - 1;
    const strong =
      signal === "empathy" ||
      signal === "impact" ||
      signal === "turn" ||
      signal === "proof" ||
      signal === "parallel" ||
      carriesIntent(unit, purpose);
    if (strong) {
      flushShorts();
      slides.push(cleanCut(unit));
      return;
    }
    if (index === 0 && unit.length <= 28) {
      slides.push(cleanCut(unit));
      return;
    }
    if (unit.length <= 18 && !(last && shorts.length < 2 && slides.length > 0)) {
      shorts.push(cleanCut(unit));
      if (!finer && shorts.length >= 3) flushShorts();
      if (last) flushShorts();
      return;
    }
    if (last && (slides.length > 0 || shorts.length > 0)) {
      flushShorts();
      slides.push(cleanCut(unit));
      return;
    }
    flushShorts();
    slides.push(cleanCut(unit));
  });
  flushShorts();
  return slides.filter((slide) => slide.trim().length > 0);
}

function applyAudit(slides: string[], audit: string): string[] {
  if (!audit) return slides;
  let next = slides.slice();
  if (/細かく|分けて|分割|一枚|ばらして|独立/.test(audit)) {
    next = next.flatMap((slide) => {
      const lines = slide
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length >= 2) return lines;
      const parts = unitsFrom(slide);
      return parts.length >= 2 ? parts.map(cleanCut) : [slide];
    });
  }
  if (/まとめ|くっつけ|減ら|長く/.test(audit)) {
    const merged: string[] = [];
    for (const slide of next) {
      const previous = merged[merged.length - 1];
      const mergeTitle = merged.length === 1 && /表紙/.test(audit);
      const bothContext = previous ? contentSignal(previous) === "context" && contentSignal(slide) === "context" : false;
      if (previous && (bothContext || mergeTitle)) merged[merged.length - 1] = `${previous}\n${slide}`;
      else merged.push(slide);
    }
    next = merged;
  }
  if (/分け|独立|一枚/.test(audit)) {
    for (const quote of [...audit.matchAll(/「([^」]{2,40})」/g)].map((match) => match[1] ?? "")) {
      if (!quote) continue;
      next = next.flatMap((slide) => {
        if (!slide.includes(quote) || slide.trim() === quote) return [slide];
        const rest = slide
          .replace(quote, "")
          .replace(/\n{2,}/g, "\n")
          .trim();
        return rest ? [quote, rest] : [quote];
      });
    }
  }
  return next.map((slide) => slide.trim()).filter(Boolean);
}

function capSlides(slides: string[]): string[] {
  const next = slides.slice();
  while (next.length > MAX_SLIDES) {
    const mergeAt = next.findIndex(
      (slide, index) => index > 0 && contentSignal(slide) === "context" && contentSignal(next[index - 1] ?? "") === "context",
    );
    const index = mergeAt > 0 ? mergeAt : Math.max(1, next.length - 2);
    const previous = next[index - 1] ?? "";
    next[index - 1] = `${previous}\n${next[index] ?? ""}`.trim();
    next.splice(index, 1);
  }
  return next;
}

function cleanCut(text: string): string {
  return text.replace(/^[・\-*•]\s*/, "").replace(/[。．]\s*$/, "").trim();
}

function cutReason(text: string, index: number, count: number, purpose = "", previous = ""): string {
  const signal = contentSignal(text);
  const added = previous ? addedText(previous, text) : null;
  if (added) return `「${added}」は、前の枚から切り替えて足します。1枚目にはまだ置きません。`;
  if (carriesIntent(text, purpose)) return "全体で残したい文なので、説明と分けて一枚にしました。前後はここに力を奪わせません。";
  if (index === 0 && signal === "context") return "最初の一文は表紙として切りました。説明が始まる前で止めています。";
  if (signal === "empathy") return "相手の気持ちが出てきたので、主張と分けて一枚にしました。";
  if (signal === "parallel") return "同じ重さの項目が続いたので、一枚に並べました。";
  if (signal === "impact") return "気持ちが大きく動く文なので、前後と分けて一枚にしました。";
  if (signal === "turn") return "見方が折れる語で切りました。";
  if (signal === "proof") return "感情のあとの根拠として、一枚に分けました。";
  if (index === count - 1) return "最後に持って帰る文として切りました。";
  return "全体の山ではない説明なので、近くの文とまとめ、力を入れていません。";
}

function hinge(text: string): string {
  const match = /しかし|でも|一方|ところが|実は/.exec(text);
  return match?.[0] ?? "しかし";
}
