import type { SlideRole, SlideRoleKind } from "./slide-roles";
import { canonBlock, canonFrameFor, frameLabel } from "./slide-canon";

export interface DeckSummary {
  arc: string;
  intent?: string;
  emphasis?: string;
  slides: Array<{
    id: string;
    index: number;
    roleLabel: string;
    role?: SlideRoleKind;
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

export function slideCountFromPrompt(prompt: string): number {
  const slides = prompt.match(/^Slide \d+/gm);
  if (slides?.length) return slides.length;
  const pages = prompt.match(/^\d+\. /gm);
  return pages?.length ?? 0;
}

export function extractDeckOutline(prompt: string): string {
  const slidePlan = /(?:\*\*)?Slide Plan(?:\*\*)?([\s\S]*?)$/i.exec(prompt);
  if (slidePlan?.[1]?.trim()) return slidePlan[1].trim();
  const pages = /【ページ】([\s\S]*?)(?=\n【|$)/.exec(prompt);
  if (pages?.[1]?.trim()) return pages[1].trim();
  const match = /【この発表の全体】([\s\S]*?)(?=\n【|$)/.exec(prompt);
  return match?.[1]?.trim() ?? "";
}

/**
 * Same shape ChatGPT / Gemini send to Canva MCP: Presentation Brief + Slide Plan,
 * not a wall of design theory. create-design uses brief vs outline separately.
 */
export function mcpDeckDocument(input: { deck: DeckSummary; purpose: string; audience?: string }): string {
  const title = stageCopy(input.deck.slides[0]?.text ?? input.purpose).title || input.purpose;
  const messages = input.deck.slides
    .slice(0, 5)
    .map((slide) => stageCopy(slide.text).title)
    .filter(Boolean);
  const slides = input.deck.slides.map((slide) => mcpSlideBlock(slide)).join("\n\n");
  return [
    "Presentation Brief",
    `Title: ${title}`,
    `Topic / Scope: ${input.purpose}${input.audience ? `。聞き手は${input.audience}` : ""}`,
    `Key Messages: ${messages.join(" / ")}`,
    `Constraints: 16:9 landscape presentation with EXACTLY ${input.deck.slides.length} pages — one distinct Canva page per slide in the Slide Plan. Do not collapse into one slide. Do not repeat the cover on later pages. Japanese. Break lines at 句読点. Never split a word mid-glyph (no 自/信).`,
    "Style Guide: In-app Canva AI quality. Huge Japanese type, wide whitespace, light slides. Photos are structure (half page or full bleed), not corner decoration. Equal-width cards for parallel points. No dark navy corporate template, water overlay, or tiny English footer.",
    "",
    "Narrative Arc",
    input.deck.arc,
    input.deck.intent ? `残したいこと: ${input.deck.intent}` : "",
    "",
    "Slide Plan",
    slides,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function mcpSlideBlock(slide: DeckSummary["slides"][number]): string {
  const frame = canonFrameFor(slide.role ?? "context", slide.text);
  const staged = stageCopy(slide.text);
  const n = slide.index + 1;
  return [
    `Slide ${n} — "${staged.title}"`,
    `Goal: ${frameLabel(frame)}`,
    staged.line ? `Bullets: ${staged.line}` : "Bullets: (headline only)",
    `Visuals: ${visualForFrame(frame, staged.title)}`,
  ].join("\n");
}

function visualForFrame(frame: ReturnType<typeof canonFrameFor>, topic: string): string {
  if (frame === "cover") return `Half-page or full-bleed photo about「${topic}」. Giant title. No bullets.`;
  if (frame === "toc") return "Photo on the left, numbered items of equal weight on the right.";
  if (frame === "parallel") return "Equal-width cards. Each card: short title, one line, a real photo. Same size.";
  if (frame === "impact") return `Full-bleed photo about「${topic}」. One huge headline. No extra paragraphs.`;
  if (frame === "explain") return "Large heading, one short block of text. Not a transcript.";
  return "Small label, then one huge sentence. Lots of whitespace.";
}

/**
 * Canonical composition first. Color themes are not part of the form.
 * Learned materials may break the form on purpose after it is established.
 */
export function fullDeckSection(deck: DeckSummary, purpose = "", audience = ""): string {
  return mcpDeckDocument({ deck, purpose: purpose || "発表", audience });
}

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
    `全${total}枚のうち${page}枚目（${input.slide.roleLabel}）を、同じ発表の1ページとして作ってください。`,
    "16:9の発表スライドです。",
  ].join("\n");
}

export function slideCopy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** Headlines Canva can set large without mid-word wraps. */
export function stageCopy(text: string): { title: string; line: string } {
  const lines = slideCopy(text).split("\n").filter(Boolean);
  const title = fitJapanese(lines[0] ?? "", 18);
  const rest = lines.slice(1).join("");
  const line = rest ? fitJapanese(rest, 32) : "";
  return { title, line };
}

function fitJapanese(text: string, max: number): string {
  const compact = text.replace(/\s+/g, "").trim();
  if (compact.length <= max) return compact;
  const window = compact.slice(0, max);
  const cut = window.match(/^(.*[。、！？])/);
  if (cut?.[1] && cut[1].length >= 8) return cut[1];
  return window;
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
