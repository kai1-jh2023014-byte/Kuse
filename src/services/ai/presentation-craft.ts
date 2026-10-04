import type { SlideRole, SlideRoleKind } from "./slide-roles";
import { canonBlock, canonFrameFor, frameLabel } from "./slide-canon";
import { wrapJapanese } from "./japanese-wrap";

export interface DeckSummary {
  arc: string;
  intent?: string;
  emphasis?: string;
  centralMessage?: string;
  architectureSummary?: string;
  droppedClaims?: string[];
  slides: Array<{
    id: string;
    index: number;
    roleLabel: string;
    role?: SlideRoleKind;
    text: string;
    act?: string;
    slideType?: string;
    oneMessage?: string;
    visualWhy?: string;
    connectsFrom?: string;
    layoutHint?: string;
    weight?: string;
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
  const title = wrapTitle(input.deck.slides[0]?.text ?? input.purpose);
  const message = input.deck.centralMessage || input.deck.intent || input.purpose;
  const slides = input.deck.slides.map((slide) => mcpSlideBlock(slide, input.deck.slides)).join("\n\n");
  return [
    "Presentation Brief",
    `Title: ${title.replace(/\n/g, " ")}`,
    `Topic / Scope: ${input.purpose}${input.audience ? `。聞き手は${input.audience}` : ""}`,
    `Central message: ${message}`,
    `Key Messages: ${message}`,
    `Constraints: 16:9 landscape presentation with EXACTLY ${input.deck.slides.length} pages — one distinct Canva page per slide. Do not collapse. Japanese. Break lines only at は/が/を/に/で/と/、/。 Never split a word (禁止: 変わ / る, 学校 / 教育).`,
    "Style Guide: One visual theme for the whole deck. Light slides, Huge Japanese type, wide whitespace. Photos only if they argue the claim. No plants, furniture, waves, or empty cards. Never write 例とイラスト. If a photo is unavailable, switch to a diagram, table, number, quote, or typography — never a blank placeholder.",
    "Deck rhythm: quiet intro → problem → denser development → sparse turn → climax (biggest type, most whitespace, one sentence) → landing that restates the central message. Do not keep the same template on every page. Choose layout from the slide type.",
    "",
    "Narrative Arc",
    input.deck.architectureSummary || "",
    input.deck.arc,
    input.deck.droppedClaims?.length ? `捨てた論点（スライドにしない）: ${input.deck.droppedClaims.join(" / ")}` : "",
    input.deck.intent ? `残したいこと: ${input.deck.intent}` : "",
    "",
    "Typography",
    "Suggested title breaks are already in the Slide Plan. Do not reflow mid-bunsetsu. One line must not be a leftover mora.",
    "",
    "Slide Plan",
    slides,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function wrapTitle(text: string): string {
  const first = text.split("\n")[0]?.trim() || text;
  return first.includes("\n") ? first : wrapJapanese(first, 12);
}

function mcpSlideBlock(
  slide: DeckSummary["slides"][number],
  all: DeckSummary["slides"],
): string {
  const frame = canonFrameFor(slide.role ?? "context", slide.text, slide.slideType);
  const staged = stageCopy(slide.text);
  const title = wrapJapanese(staged.title, 12);
  const n = slide.index + 1;
  const previous = all[slide.index - 1];
  const next = all[slide.index + 1];
  const type = slide.slideType || frame;
  const climax = type === "climax" || slide.weight === "force";
  return [
    `Slide ${n} — "${title.replace(/\n/g, " / ")}"`,
    `Act: ${slide.act || "development"}`,
    `Type: ${type}`,
    `One message (5 seconds): ${slide.oneMessage || staged.title}`,
    `Connects from: ${slide.connectsFrom || (previous ? previous.roleLabel : "opening")}`,
    next ? `Leads to: ${next.oneMessage || next.roleLabel}` : "Leads to: end",
    `Goal: ${frameLabel(frame)}`,
    staged.line ? `Support: ${staged.line}` : "Support: headline only",
    `Layout: ${slide.layoutHint || layoutFor(type, climax)}`,
    `Visuals: ${slide.visualWhy || visualForFrame(frame, staged.title, type)}`,
    `Title break (keep these lines): ${title.replace(/\n/g, " | ")}`,
    climax ? "This is the deck climax: fewer words, larger type, more whitespace than neighbors." : "",
    type === "landing" ? "Restate the central message. Do not add a new list of tactics." : "",
    "Forbidden: 例とイラスト, empty photo cards, plants, furniture, mid-word line breaks, two messages on one page.",
  ]
    .filter(Boolean)
    .join("\n");
}

function layoutFor(type: string, climax: boolean): string {
  if (climax) return "Biggest type, most whitespace, one sentence, full-bleed or type-only.";
  if (type === "compare") return "Before/After or two equal columns.";
  if (type === "diagram" || type === "process") return "Three equal steps. No empty cards. Type and lines if no photo.";
  if (type === "title") return "Giant title + question subtitle + photo that previews the conflict.";
  if (type === "landing") return "Central message, large. No catalog.";
  if (type === "question") return "Huge question. Almost no body.";
  return "Heading then one block. Not a transcript.";
}

function visualForFrame(frame: ReturnType<typeof canonFrameFor>, topic: string, type = ""): string {
  if (type === "diagram" || type === "process") {
    return `Three-step diagram of「${topic}」. If no photo, use type and rules — never 例とイラスト.`;
  }
  if (type === "compare") return `Comparison of「${topic}」. Table or equal cards. No empty illustration slot.`;
  if (frame === "cover") return `Photo that previews the conflict in「${topic}」. Giant title with safe Japanese breaks. Subtitle is the question. No bullets.`;
  if (frame === "toc") return "Photo on the left, numbered items of equal weight on the right.";
  if (frame === "parallel") return "Equal-width cards. Each card: short title, one line. Photo only if it names the item. Same size. No blank cards.";
  if (frame === "impact") return `Full-bleed photo about「${topic}」or type-only. One huge headline. No extra paragraphs.`;
  if (frame === "explain") return "Large heading, one short block. Diagram/table/number if it clarifies. Not a transcript.";
  return "Small label, then one huge sentence. Lots of whitespace. No decorative objects.";
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
  const title = wrapJapanese(fitJapanese(lines[0] ?? "", 22), 12).split("\n")[0] ?? "";
  const rest = lines.slice(1).join("");
  const line = rest ? fitJapanese(rest, 32) : "";
  return { title, line };
}

function fitJapanese(text: string, max: number): string {
  const compact = text.replace(/\s+/g, "").trim();
  if (compact.length <= max) return compact;
  const units = wrapJapanese(compact, max).split("\n");
  return units[0] ?? compact.slice(0, max);
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
