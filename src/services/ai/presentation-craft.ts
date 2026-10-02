import type { SlideRole } from "./slide-roles";
import { canonBlock } from "./slide-canon";

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

export function isPresentationJob(_purpose = "", _size = "", _slideCount = 0): boolean {
  return true;
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

/**
 * Canonical composition first. Color themes are not part of the form.
 * Learned materials may break the form on purpose after it is established.
 */
export function craftSection(input: {
  deck: DeckSummary;
  slide: Pick<SlideRole, "index" | "role" | "roleLabel" | "text">;
}): string {
  const total = input.deck.slides.length;
  const page = input.slide.index + 1;
  const outline = deckOutline(input.deck);
  return [
    canonBlock(input.slide),
    "",
    "【発表の型】",
    "基本の構成のあとで守る。原稿の順番と読み込んだ癖が矛盾したら、癖と原稿を優先してよい。欄の揃えと1枚1主張は崩さない。",
    "1枚に載せる主張は一つ。読み上げ原稿をスライドに写さない。文字は少なく、後ろの席でも読める大きさ。",
    "表紙は説明を始めない。並べる項目は同じ強さ。山は発表全体で一度だけ。",
    "前提と結論を同じ枚に載せない。着地は要約の箇条書きではなく、持って帰る気持ちを一つ。",
    "全枚で余白・文字の家族を揃える。特定のグラデーションで毎回統一しない。",
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
