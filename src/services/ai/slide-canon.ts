import type { SlideRole, SlideRoleKind } from "./slide-roles";

/**
 * Canonical slide compositions from the user's "基礎プレゼンテーションの形".
 * Remember structure, never a house palette (no obligatory blue–purple gradient).
 * Deliberate breaks are allowed after the form is in place.
 */
export type CanonFrame = "cover" | "toc" | "statement" | "parallel" | "impact" | "explain";

export function canonFrameFor(role: SlideRoleKind, text = ""): CanonFrame {
  if (role === "title") return "cover";
  if (role === "parallel") return "parallel";
  if (role === "impact") return "impact";
  if (role === "context" && looksLikeToc(text)) return "toc";
  if (role === "context" || role === "proof") return "explain";
  return "statement";
}

export function canonBlock(slide: Pick<SlideRole, "role" | "roleLabel" | "text" | "index">): string {
  const frame = canonFrameFor(slide.role, slide.text);
  return [
    "【基本の構成】",
    "これが最優先です。色の統一（毎回同じ青と紫のグラデーションなど）は守らないでください。守るのは組み立てです。崩すのは、この形を踏まえたうえでの意図があるときに限ります。",
    `この1枚の基本形は「${frameLabel(frame)}」。`,
    ...frameRules(frame),
  ].join("\n");
}

function frameLabel(frame: CanonFrame): string {
  if (frame === "cover") return "表紙";
  if (frame === "toc") return "目次";
  if (frame === "statement") return "見出し＋宣言";
  if (frame === "parallel") return "並列";
  if (frame === "impact") return "全面インパクト";
  return "説明";
}

function frameRules(frame: CanonFrame): string[] {
  if (frame === "cover") {
    return [
      "上にタイトル。その下に会社名・名前など、小さな一行。",
      "画面の半分、または全面を、あとから写真を入れる空枠にする。いちばん目立つ置き方を選ぶ。枠の中に写真を描かない。",
      "端的に、一目で分かる。説明を始めない。箇条書きにしない。",
    ];
  }
  if (frame === "toc") {
    return [
      "目次はあってもなくてもよい。置くときは、左側に写真、右側に番号つきの項目、がオーソドックス。",
      "項目は同じ強さ。表紙のように一文を巨大にしない。",
    ];
  }
  if (frame === "statement") {
    return [
      "基本はこの形。上に見出し。その下に、今回の宣言や本文を大きく置く。",
      "見出しは目立つこと。後ろに図形を足して目立たせてもよいが、色のテーマは固定しない。",
      "情報を左右に分けすぎない。まず見出し、次に一言。",
    ];
  }
  if (frame === "parallel") {
    return [
      "並列で紹介するときに使う。",
      "上にこの塊のタイトル。その下に、同じ幅の欄を並べる。各欄は番号または見出し、短い説明、必要なら写真。",
      "欄の大きさ・余白・文字の強さを揃える。ヒーローを一つ作らない。",
    ];
  }
  if (frame === "impact") {
    return [
      "一番説明したいこと、またはインパクトを残すときに使う。",
      "写真を背景いっぱいに置いたように見える空枠を先に作る。中身は描かない。その上に、短い見出しを大きく。",
      "補足を足して写真を殺さない。周囲の情報と競争させない。",
    ];
  }
  return [
    "説明の枚は、見出しを上に、本文を読みやすい塊で置く。",
    "写真を多用する旅行・グルメ向けのコラージュにはしない。かしこまった発表は、表紙・見出し＋宣言・並列・全面インパクトの形式を使う。",
  ];
}

function looksLikeToc(text: string): boolean {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const numbered = lines.filter((line) => /^(0?\d|[①-⑩]|・)/.test(line)).length;
  return numbered >= 3 || lines.length >= 5;
}
