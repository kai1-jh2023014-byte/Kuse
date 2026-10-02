import type { SlideRole } from "./slide-roles";

export interface DeckSummary {
  arc: string;
  intent?: string;
  emphasis?: string;
  slides: Array<{
    id: string;
    index: number;
    roleLabel: string;
    text: string;
  }>;
}

/**
 * Soft presentation craft. These are defaults for a talk, not a template.
 * Learned materials and this manuscript's order outrank them.
 */
export function isPresentationJob(purpose: string, size = "", slideCount = 0): boolean {
  const blob = `${purpose} ${size}`;
  if (/サムネ|YouTube|youtube|ポスター|名刺|ロゴ|バナー/i.test(blob)) return false;
  if (slideCount >= 2) return true;
  return /スライド|プレゼン|発表|deck|presentation/i.test(blob);
}

export function deckOutline(deck: DeckSummary): string {
  const lines = deck.slides.map((slide) => {
    const head = slide.text.split("\n")[0]?.trim().slice(0, 42) || slide.roleLabel;
    return `${slide.index + 1}. ${slide.roleLabel}「${head}」`;
  });
  return [
    deck.intent ? `残したいこと: ${deck.intent}` : "",
    deck.emphasis ? `強弱: ${deck.emphasis}` : "",
    deck.arc,
    ...lines,
  ]
    .filter(Boolean)
    .join("\n");
}

export function extractDeckOutline(prompt: string): string {
  const match = /【この発表の全体】([\s\S]*?)(?=\n【|$)/.exec(prompt);
  return match?.[1]?.trim() ?? "";
}

export function craftSection(input: {
  deck: DeckSummary;
  slide: Pick<SlideRole, "index" | "roleLabel" | "text">;
}): string {
  const total = input.deck.slides.length;
  const page = input.slide.index + 1;
  const outline = deckOutline(input.deck);
  return [
    "【発表の型】",
    "これは発表の弱い既定です。読み込んだ資料に繰り返し出る癖と、この原稿の順番が矛盾したら、癖と原稿を優先してください。教科書どおりに均さないでください。",
    "1枚に載せる主張は一つ。読み上げ原稿をスライドに写さない。文字は少なく、後ろの席でも読める大きさ。",
    "表紙は説明を始めない。相手が既に思っていることは先に認める。並べる項目は同じ強さ。山は発表全体で一度だけ。",
    "前提と結論を同じ枚に載せない。着地は要約の箇条書きではなく、持って帰る気持ちを一つ。",
    "全枚で余白・文字の家族・色の役割を揃える。直しているのはこの1枚だけでも、マスターは崩さない。",
    "",
    "【この発表の全体】",
    outline,
    "",
    "【この1枚だけ】",
    `全${total}枚のうち${page}枚目（${input.slide.roleLabel}）だけを1ページで作ってください。他のページは作らないでください。前後の枚の文言をここに足さないでください。`,
    "16:9の発表スライド1枚です。複数枚のデッキとして書き出さないでください。",
  ].join("\n");
}

export function slideCopy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function slidesToRegenerate(input: {
  slideIds: string[];
  acceptedIds: string[];
  existingIds: string[];
  dirtyIds?: string[];
}): string[] {
  const accepted = new Set(input.acceptedIds);
  const existing = new Set(input.existingIds);
  const dirty = new Set(input.dirtyIds ?? []);
  return input.slideIds.filter((id) => {
    if (dirty.has(id)) return true;
    if (!existing.has(id)) return true;
    if (accepted.has(id)) return false;
    return false;
  });
}
