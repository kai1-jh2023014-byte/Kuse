import type { DeckRolePlan } from "./slide-roles";

export interface DeckReview {
  scores: {
    content: number;
    story: number;
    density: number;
    readability: number;
    design: number;
    delivery: number;
    connection: number;
  };
  issues: string[];
  slideNotes: string[];
}

export function reviewDeck(plan: DeckRolePlan): { plan: DeckRolePlan; review: DeckReview } {
  const issues: string[] = [];
  const slideNotes: string[] = [];
  const slides = plan.slides.map((slide) => ({ ...slide }));

  for (const slide of slides) {
    const notes: string[] = [];
    if (/例とイラスト|プレースホルダー|lorem|ここに画像/i.test(slide.text)) {
      notes.push("プレースホルダーを本文から外した");
      slide.text = slide.text
        .replace(/例とイラスト/g, "")
        .replace(/プレースホルダー/g, "")
        .trim();
    }
    const lines = slide.text.split("\n").filter(Boolean);
    if (lines.length >= 5 && slide.slideType !== "diagram" && slide.slideType !== "compare") {
      notes.push("メッセージが複数あるので先頭の主張だけ残した");
      slide.text = lines.slice(0, 2).join("\n");
      slide.oneMessage = lines[0];
    }
    if (slide.role === "title" && /変わ\nる/.test(slide.text)) {
      slide.text = slide.text.replace("変わ\nる", "変わる");
      notes.push("単語途中の改行を直した");
    }
    if (slide.slideType === "landing" && plan.centralMessage && !slide.text.includes(plan.centralMessage.slice(0, 10))) {
      slide.text = `${plan.centralMessage}\n${slide.text}`;
      notes.push("結論を中心メッセージに戻した");
    }
    if (notes.length) slideNotes.push(`${slide.index + 1}枚目: ${notes.join(" / ")}`);
  }

  const hasClimax = slides.some((slide) => slide.slideType === "climax" || slide.weight === "force");
  if (!hasClimax) issues.push("山（クライマックス）が無い");
  const landing = slides[slides.length - 1];
  if (landing && plan.centralMessage && !landing.text.includes(plan.centralMessage.slice(0, 8))) {
    issues.push("結論が中心メッセージに戻っていない");
  }
  if (slides.filter((slide) => slide.weight === "force").length > 1) {
    issues.push("山が複数ある");
  }
  const tail = slides.slice(-Math.max(2, Math.ceil(slides.length * 0.3)));
  const tailIsOnlyQuestions = tail.every(
    (slide) => slide.slideType === "question" || (/べきか|何か|なぜ/.test(slide.text) && !/高まる|鍛える|判断|伴走|決める/.test(slide.text)),
  );
  if (tailIsOnlyQuestions && slides.length >= 5) {
    issues.push("後半が問題提起のまま終わっている。原稿の答えを回収していない");
  }
  const blob = slides.map((slide) => slide.text).join("");
  if (plan.keptClaims?.some((claim) => /高まる|プログラミング|データ|英語|個別/.test(claim) && !blob.includes(claim.slice(0, 6)))) {
    issues.push("原稿の後半論点が必要以上に消えている");
  }
  if (/原稿の後半|この問いに、原稿/.test(slides[0]?.text ?? "")) {
    issues.push("1ページ目のタイトルがメタ説明になっている");
  }

  const scores = {
    content: clamp(90 - issues.length * 12),
    story: clamp(hasClimax && !tailIsOnlyQuestions ? 90 : 58),
    density: clamp(86 - slides.filter((slide) => slide.text.length > 90).length * 6),
    readability: clamp(slides.some((slide) => /変わ\nる/.test(slide.text)) ? 50 : 88),
    design: clamp(slides.every((slide) => slide.visualWhy) ? 84 : 70),
    delivery: clamp(slides.length >= 4 && slides.length <= 24 ? 86 : 70),
    connection: clamp(slides.every((slide, index) => index === 0 || slide.connectsFrom) ? 86 : 68),
  };

  const review: DeckReview = { scores, issues, slideNotes };
  return {
    plan: {
      ...plan,
      slides,
      review,
      warnings: [...plan.warnings, ...issues.map((issue) => `自己評価: ${issue}`)],
    },
    review,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
