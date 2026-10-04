import { MAX_SLIDES, planSlideRoles, segmentManuscript, type DeckRolePlan, type SlideDraft } from "./slide-roles";
import { reviewDeck, type DeckReview } from "./deck-review";
import { wrapJapanese } from "./japanese-wrap";

export type StoryAct = "intro" | "problem" | "development" | "turn" | "climax" | "landing";
export type EndingMode = "answer" | "question";
export type ClaimKind = "question" | "problem" | "claim" | "evidence" | "example" | "counter" | "other";

export type SlideType =
  | "title"
  | "question"
  | "claim"
  | "explain"
  | "compare"
  | "example"
  | "diagram"
  | "process"
  | "climax"
  | "chapter"
  | "landing";

export interface TalkClaim {
  text: string;
  score: number;
  themes: string[];
  kind: ClaimKind;
}

export interface TalkDirection {
  id: string;
  label: string;
  centralMessage: string;
  audience: string;
  structure: string;
  keep: string[];
  drop: string[];
  trait: string;
  question: string;
  ending: EndingMode;
}

export interface DesignedSlide extends SlideDraft {
  act: StoryAct;
  slideType: SlideType;
  oneMessage: string;
  visualWhy: string;
  connectsFrom: string;
  layoutHint: string;
}

export interface TalkArchitecture {
  claims: TalkClaim[];
  directions: TalkDirection[];
  chosen: TalkDirection;
  kept: string[];
  dropped: string[];
  story: string;
  slides: DesignedSlide[];
  review: DeckReview;
}

const THEMES: Array<{ id: string; label: string; keys: string[] }> = [
  { id: "school", label: "学校教育の目的", keys: ["学校", "教育", "授業", "教科"] },
  { id: "knowledge", label: "知識を学ぶ意味", keys: ["知識", "暗記", "覚える", "テスト", "試験"] },
  { id: "ai", label: "AI時代", keys: ["AI", "人工知能", "生成", "代替"] },
  { id: "teacher", label: "教師の役割", keys: ["教師", "先生", "教員"] },
  { id: "collab", label: "問題発見と協働", keys: ["問題発見", "協働", "チーム", "対話"] },
  { id: "english", label: "英語", keys: ["英語"] },
  { id: "code", label: "プログラミング", keys: ["プログラミング", "コード", "プログラム"] },
  { id: "data", label: "データリテラシー", keys: ["データ", "統計", "読む力"] },
  { id: "practice", label: "現場での使い方", keys: ["個別", "教材", "効率", "活用"] },
];

export function extractClaims(manuscript: string): TalkClaim[] {
  const units = manuscript
    .replace(/\r\n/g, "\n")
    .split(/\n+|(?<=[。！？])/)
    .map((line) => line.trim().replace(/^[・\-*•]\s*/, ""))
    .filter((line) => line.length >= 8 && line.length <= 180);
  const unique: string[] = [];
  for (const unit of units) {
    if (unique.some((item) => item === unit || (item.includes(unit) && unit.length > 20))) continue;
    unique.push(unit);
  }
  const raw = unique.slice(0, 80);
  return raw.map((text, index) => {
    const themes = THEMES.filter((theme) => theme.keys.some((key) => text.includes(key))).map((theme) => theme.id);
    let score = Math.min(8, Math.round(text.length / 18));
    if (/だから|つまり|べき|必要|残|重要|一番|高まる|鍛える|判断/.test(text)) score += 4;
    if (/結論|持ち帰る|結局/.test(text)) score += 3;
    if (/例えば|など/.test(text)) score -= 1;
    return { text, score, themes, kind: kindOf(text, index, raw.length) };
  });
}

export function proposeDirections(
  manuscript: string,
  purpose = "",
  audience = "",
): TalkDirection[] {
  const claims = extractClaims(manuscript);
  const present = new Set(claims.flatMap((claim) => claim.themes));
  const hearer = audience.trim() || "この話を聞く人";
  const school = present.has("school") || present.has("ai") || /学校|教育/.test(manuscript);
  const baseKeep = pickKeep(claims, [...present], 16);
  const baseDrop = rankedDrop(claims, baseKeep);

  if (school) {
    return [
      direction("a", "AI時代に学校は何を教えるべきか", hearer, claims, [
        "school",
        "knowledge",
        "ai",
        "collab",
        "english",
        "code",
        "data",
        "practice",
      ]),
      direction("b", "AIによって教師の役割はどう変わるか", hearer, claims, ["teacher", "ai", "school", "practice"]),
      direction("c", "知識を学ぶ意味はAI時代にどう変わるか", hearer, claims, ["knowledge", "ai", "school", "code", "data"]),
    ];
  }

  const written = purpose.trim() || firstLine(manuscript) || "この話で相手の見方を一つ動かす";
  const answer = answerFrom(claims) || written;
  const ending = chooseEnding(claims);
  return [
    {
      id: "a",
      label: written.slice(0, 32),
      centralMessage: ending === "answer" ? answer : written,
      audience: hearer,
      structure: "問い → 探究 → 発見 → 主張 → 根拠 → 具体 → 結論",
      keep: baseKeep,
      drop: baseDrop,
      trait: "原稿の答えまで運び、問いで途中下車しない",
      question: asQuestion(written),
      ending,
    },
    {
      id: "b",
      label: `${hearer}が決めること`,
      centralMessage: ending === "answer" ? answer : `${hearer}が、次に取る行動を一つ決められるようにする`,
      audience: hearer,
      structure: "相手の誤解 → 本当の仕事 → 根拠 → 最初の一歩",
      keep: baseKeep,
      drop: baseDrop,
      trait: "聴衆の決断まで閉じる",
      question: `${hearer}は、何を変えるのか`,
      ending,
    },
    {
      id: "c",
      label: "なぜ今それが必要か",
      centralMessage: claims.find((claim) => claim.kind === "claim")?.text.slice(0, 42) || answer,
      audience: hearer,
      structure: "通説 → しかし → 根拠 → 結論",
      keep: baseKeep,
      drop: baseDrop,
      trait: "転換と因果を最後まで回収する",
      question: asQuestion(claims.find((claim) => claim.kind === "question")?.text || written),
      ending,
    },
  ];
}

export function composeTalk(
  manuscript: string,
  input: { purpose?: string; audience?: string; audit?: string; directionId?: string },
): TalkArchitecture {
  const plan = planFromManuscript(manuscript, input);
  const chosen = plan.directions?.find((item) => item.id === plan.chosenDirectionId) ?? plan.directions?.[0];
  return {
    claims: extractClaims(manuscript),
    directions: (plan.directions ?? []) as TalkDirection[],
    chosen: (chosen ?? proposeDirections(manuscript, input.purpose, input.audience)[0]) as TalkDirection,
    kept: plan.keptClaims ?? [],
    dropped: plan.droppedClaims ?? [],
    story: plan.arc,
    slides: plan.slides.map((slide) => ({
      id: slide.id,
      text: slide.text,
      act: slide.act ?? "development",
      slideType: (slide.slideType as SlideType) || "explain",
      oneMessage: slide.oneMessage ?? slide.text.split("\n")[0] ?? slide.text,
      visualWhy: slide.visualWhy ?? "",
      connectsFrom: slide.connectsFrom ?? "",
      layoutHint: slide.layoutHint ?? "",
    })),
    review: (plan.review as DeckReview | undefined) ?? {
      scores: { content: 0, story: 0, density: 0, readability: 0, design: 0, delivery: 0, connection: 0 },
      issues: [],
      slideNotes: [],
    },
  };
}

export function planFromManuscript(
  manuscript: string,
  input: { purpose?: string; audience?: string; audit?: string; directionId?: string },
): DeckRolePlan {
  const claims = extractClaims(manuscript);
  const architect = claims.length >= 6 || manuscript.trim().length >= 500;
  const directions = proposeDirections(manuscript, input.purpose, input.audience);
  const chosen = directions.find((item) => item.id === input.directionId) ?? directions[0]!;
  const designed = architect
    ? designSlides(claims, chosen, input.audit ?? "")
    : fromLegacyCuts(manuscript, chosen, input.audit ?? "");
  const plan = planSlideRoles(
    designed.map((slide) => ({ id: slide.id, text: slide.text })),
    { purpose: chosen.centralMessage || input.purpose || "", audience: chosen.audience || input.audience || "" },
  );
  const withDesign = overlayDesign(plan, designed, chosen, directions, claims);
  return reviewDeck(withDesign).plan;
}

function fromLegacyCuts(manuscript: string, chosen: TalkDirection, audit: string): DesignedSlide[] {
  const cut = segmentManuscript(manuscript, audit, chosen.centralMessage);
  return cut.slides.map((slide, index) =>
    decorateSlide(slide, index, cut.slides.length, chosen, {
      act: actForIndex(index, cut.slides.length),
      slideType: typeForLegacy(index, cut.slides.length, slide.text),
    }),
  );
}

function designSlides(claims: TalkClaim[], chosen: TalkDirection, audit: string): DesignedSlide[] {
  const keepSet = new Set(chosen.keep);
  const body = claims.filter((claim) => keepSet.has(claim.text) || matchesDirection(claim, chosen));
  const pool = body.length >= 5 ? body : claims;
  const used = new Set<string>();
  const take = (predicate: (claim: TalkClaim) => boolean): TalkClaim | undefined => {
    const found = pool.find((claim) => !used.has(claim.text) && predicate(claim));
    if (found) used.add(found.text);
    return found;
  };
  const takeAll = (predicate: (claim: TalkClaim) => boolean): TalkClaim[] => {
    const found = pool.filter((claim) => !used.has(claim.text) && predicate(claim));
    found.forEach((claim) => used.add(claim.text));
    return found;
  };

  const target = targetSlideCount(pool.length);
  const finer = /細かく|分けて/.test(audit);
  const problem = take((claim) => claim.kind === "problem") ?? take((claim) => claim.kind === "question" && claim !== pool[0]);
  const inquiry = take((claim) => /意味|なぜ|必要/.test(claim.text) && claim.kind !== "claim");
  const evidence = takeAll((claim) => claim.kind === "evidence");
  const examples = takeAll((claim) => claim.kind === "example");
  const counter = take((claim) => claim.kind === "counter");
  const climaxClaim =
    take((claim) => claim.kind === "claim" && /高まる|鍛える|伴走|判断/.test(claim.text)) ??
    take((claim) => claim.kind === "claim") ??
    pool.slice().sort((a, b) => b.score - a.score)[0];
  if (climaxClaim) used.add(climaxClaim.text);
  const leftover = pool.filter((claim) => !used.has(claim.text) && claim.kind !== "question");

  const slides: DesignedSlide[] = [];
  const push = (
    act: StoryAct,
    slideType: SlideType,
    text: string,
    oneMessage: string,
    visualWhy: string,
    layoutHint: string,
    connectsFrom: string,
  ) => {
    slides.push(makeSlide(slides.length, chosen, { act, slideType, text, oneMessage, visualWhy, layoutHint, connectsFrom }));
  };

  const titleText = wrapJapanese(chosen.question.replace(/のか$/, "か"), 12);
  push(
    "intro",
    "title",
    titleText,
    chosen.question,
    "表紙の写真は現状とこれからの対立を予告する。飾りではない。",
    "巨大タイトル。説明の箇条書きは置かない。",
    "まだ何の話か分からない状態から、問いだけを開く。",
  );
  if (problem) {
    push("problem", "question", problem.text, problem.text, "相手の前提を文字で先に出す。図は不要。", "見出し＋宣言。余白を広く。", "表紙の問いを、現状のずれに落とす。");
  }
  if (inquiry) {
    push("problem", "explain", inquiry.text, inquiry.text, "探究の入口。余白を残し、答えはまだ書かない。", "見出し＋一文。", "ずれを見たあと、なぜ変えるのかを問う。");
  }

  const codeGroup = examples.filter((item) => item.themes.includes("code") || /指示|作るのか/.test(item.text));
  const otherExamples = examples.filter((item) => !codeGroup.includes(item));
  if (evidence[0]) {
    push("development", "explain", evidence[0].text, evidence[0].text, visualForType("explain", evidence[0].text), layoutForType("explain"), "問いのあと、原稿にある根拠を置く。");
  }
  for (const item of leftover) {
    if (slides.length >= target - 4) break;
    push("development", chooseType([item]), item.text, item.text, visualForType("explain", item.text), layoutForType("explain"), "前の根拠を受けて、論点を一つ進める。");
  }
  for (const item of evidence.slice(1)) {
    if (slides.length >= target - 4) break;
    if (slides.some((slide) => slide.text === item.text)) continue;
    push("development", "explain", item.text, item.text, visualForType("explain", item.text), layoutForType("explain"), "別の根拠で、同じ主張を支える。");
  }
  for (const item of otherExamples) {
    if (slides.length >= target - 3) break;
    push("development", "example", item.text, item.text, visualForType("example", item.text), layoutForType("example"), "主張の前に、原稿の具体を置く。");
  }
  if (codeGroup.length) {
    const merged = (finer ? codeGroup.map((item) => item.text) : [codeGroup.map((item) => item.text).join("\n")]).filter(Boolean);
    push(
      "development",
      codeGroup.length >= 2 ? "diagram" : "example",
      merged[0] ?? codeGroup[0]!.text,
      "AI時代のプログラミングに必要な能力",
      visualForType("diagram", "評価する / 何を作るか決める / 指示する"),
      layoutForType("diagram"),
      "具体例を、必要な能力の図解に畳む。",
    );
  }
  if (counter) {
    push("turn", "claim", counter.text, counter.text, "転換は対比。飾りは置かない。", layoutForType("claim"), "具体のあと、対立しないという見方へ折る。");
  }
  if (climaxClaim) {
    push("climax", "climax", climaxClaim.text, climaxClaim.text, "山は情報を減らす。前後より余白を広くする。", layoutForType("climax"), "ここまでの具体を、一本の主張に畳む。");
  }

  const landingText =
    chosen.ending === "answer"
      ? chosen.centralMessage
      : `${chosen.question}\n（原稿は答えを急がない。聴衆に残す問いとして閉じる）`;
  push(
    "landing",
    "landing",
    landingText,
    chosen.centralMessage,
    chosen.ending === "answer"
      ? "結論は中心メッセージに戻る。新しいカタログを足さない。"
      : "問いで閉じるのは意図。後半の答えを捨てた結果ではない。",
    layoutForType("landing"),
    chosen.ending === "answer" ? "山の主張を、結局何を教えるかに回収する。" : "答えを急がず、問いを持って帰らせる。",
  );

  return capDesigned(reverseFromLanding(ensureStoryComplete(slides, pool, chosen), chosen), MAX_SLIDES);
}

function reverseFromLanding(slides: DesignedSlide[], chosen: TalkDirection): DesignedSlide[] {
  if (slides.length < 3) return slides;
  const title = slides.find((slide) => slide.slideType === "title") ?? slides[0]!;
  const landing =
    slides.find((slide) => slide.slideType === "landing") ??
    makeSlide(slides.length, chosen, {
      act: "landing",
      slideType: "landing",
      text: chosen.centralMessage,
      oneMessage: chosen.centralMessage,
      visualWhy: visualForType("landing", chosen.centralMessage),
      layoutHint: layoutForType("landing"),
      connectsFrom: "山の主張を回収する。",
    });
  const climax =
    slides.find((slide) => slide.slideType === "climax") ??
    slides.find((slide) => slide.act === "climax");
  const middle = slides.filter((slide) => slide !== title && slide !== landing && slide !== climax);
  const ordered = [title, ...middle, ...(climax ? [climax] : []), landing];
  const blob = ordered.map((slide) => slide.text).join("\n");
  if (chosen.ending === "answer" && !/高まる|判断|鍛える|伴走|教える/.test(blob.split("\n").slice(-3).join("\n"))) {
    ordered[ordered.length - 1] = {
      ...landing,
      text: chosen.centralMessage,
      oneMessage: chosen.centralMessage,
    };
  }
  return ordered.map((slide, index) => ({ ...slide, id: `cut-${index + 1}` }));
}

function ensureStoryComplete(slides: DesignedSlide[], pool: TalkClaim[], chosen: TalkDirection): DesignedSlide[] {
  const blob = slides.map((slide) => slide.text).join("\n");
  const missingAnswers = pool.filter(
    (claim) =>
      (claim.kind === "claim" || claim.kind === "example") &&
      !blob.includes(claim.text.slice(0, 10)) &&
      chosen.keep.includes(claim.text),
  );
  if (!missingAnswers.length) return slides;
  const landing = slides[slides.length - 1];
  const extra = missingAnswers.slice(0, 4).map((claim, index) =>
    makeSlide(slides.length + index, chosen, {
      act: "development",
      slideType: claim.kind === "example" ? "example" : "claim",
      text: claim.text,
      oneMessage: claim.text,
      visualWhy: visualForType(claim.kind === "example" ? "example" : "explain", claim.text),
      layoutHint: layoutForType("explain"),
      connectsFrom: "後半の原稿を回収する。問いで終わらせない。",
    }),
  );
  if (!landing) return [...slides, ...extra];
  return [...slides.slice(0, -1), ...extra, landing];
}

function overlayDesign(
  plan: DeckRolePlan,
  designed: DesignedSlide[],
  chosen: TalkDirection,
  directions: TalkDirection[],
  claims: TalkClaim[],
): DeckRolePlan {
  const byId = new Map(designed.map((slide) => [slide.id, slide]));
  const slides = plan.slides.map((slide, index) => {
    const extra = byId.get(slide.id) ?? designed[index];
    return extra
      ? {
          ...slide,
          act: extra.act,
          slideType: extra.slideType,
          oneMessage: extra.oneMessage,
          visualWhy: extra.visualWhy,
          connectsFrom: extra.connectsFrom,
          layoutHint: extra.layoutHint,
          text: extra.text || slide.text,
        }
      : slide;
  });
  return {
    ...plan,
    slides,
    intent: chosen.centralMessage,
    directions,
    chosenDirectionId: chosen.id,
    centralMessage: chosen.centralMessage,
    keptClaims: chosen.keep,
    droppedClaims: chosen.drop,
    architectureSummary: [
      `中心メッセージ: ${chosen.centralMessage}`,
      `終わり方: ${chosen.ending === "answer" ? "原稿の答えで閉じる" : "意図して問いを残す"}`,
      `構成: ${chosen.structure}`,
      chosen.drop.length ? `捨てた論点: ${chosen.drop.slice(0, 4).join(" / ")}` : "主要な後半論点は残している",
      `原稿の論点${claims.length}から、${slides.length}枚。枚数は少ないほど良い、ではない。`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function direction(id: string, label: string, audience: string, claims: TalkClaim[], themeIds: string[]): TalkDirection {
  const keep = pickKeep(claims, themeIds, 18);
  const drop = rankedDrop(claims, keep);
  const ending = chooseEnding(claims.filter((claim) => keep.includes(claim.text)));
  const answer = answerFrom(claims.filter((claim) => keep.includes(claim.text))) || label;
  return {
    id,
    label,
    centralMessage: ending === "answer" ? answer : label,
    audience,
    structure: "問い → 探究 → 意外な発見 → 主張 → 根拠 → 具体例 → 結論",
    keep,
    drop,
    trait: ending === "answer" ? `${label}の問いに、原稿の後半で答える` : `${label}は、原稿が答えを急がないので問いを残す`,
    question: asQuestion(label),
    ending,
  };
}

function pickKeep(claims: TalkClaim[], themeIds: string[], maxKeep: number): string[] {
  const matching = claims.filter((claim) => claim.themes.some((theme) => themeIds.includes(theme)) || themeIds.length === 0);
  const pool = matching.length ? matching : claims;
  const must = pool.filter((claim) => claim.kind === "claim" || claim.kind === "example" || claim.kind === "counter" || claim.kind === "evidence");
  const rest = pool.filter((claim) => !must.includes(claim));
  return [...must, ...rest].slice(0, maxKeep).map((claim) => claim.text);
}

function rankedDrop(claims: TalkClaim[], keep: string[]): string[] {
  const kept = new Set(keep);
  return claims.filter((claim) => !kept.has(claim.text) && claim.kind !== "claim" && claim.kind !== "example").map((claim) => claim.text);
}

function matchesDirection(claim: TalkClaim, chosen: TalkDirection): boolean {
  return chosen.keep.includes(claim.text) || claim.kind === "claim" || claim.kind === "example";
}

function kindOf(text: string, index: number, total: number): ClaimKind {
  if (/対立させない|しかし|一方|ところが/.test(text)) return "counter";
  if (/英語|プログラミング|コード|指示|データ|個別|教材|効率/.test(text)) return "example";
  if (/代替|社会では|試験で再現|暗記が中心/.test(text)) return "evidence";
  if (/高まる|鍛える|伴走|決める|判断する|結論|教えるべき/.test(text) && !/[？?]$/.test(text)) return "claim";
  if (/[？?]|べきか|何か|なぜ/.test(text) && index < total * 0.5) return "question";
  if (/暗記|現状|中心になっている|疑問|意味とは/.test(text)) return "problem";
  if (index > total * 0.55 && /べき|必要/.test(text)) return "claim";
  return "other";
}

function answerFrom(claims: TalkClaim[]): string {
  const hit =
    claims.find((claim) => claim.kind === "claim" && /高まる|鍛える|伴走/.test(claim.text)) ??
    claims.find((claim) => claim.kind === "claim") ??
    claims.find((claim) => claim.kind === "example" && /判断|決める|指示/.test(claim.text));
  return hit?.text.replace(/[。．]$/, "") ?? "";
}

function chooseEnding(claims: TalkClaim[]): EndingMode {
  const answers = claims.filter((claim) => claim.kind === "claim" || claim.kind === "example" || claim.kind === "counter");
  const questions = claims.filter((claim) => claim.kind === "question");
  if (answers.length >= 2) return "answer";
  if (answers.length === 0 && questions.length > 0) return "question";
  return "answer";
}

function targetSlideCount(claimCount: number): number {
  if (claimCount <= 5) return Math.max(5, claimCount);
  if (claimCount <= 8) return 7;
  if (claimCount <= 12) return 10;
  if (claimCount <= 16) return 15;
  return 20;
}

function chooseType(group: TalkClaim[]): SlideType {
  const text = group.map((item) => item.text).join(" ");
  if (group.length >= 3) return "diagram";
  if (group.length === 2) return "compare";
  if (/手順|ステップ|まず|次に/.test(text)) return "process";
  if (/例えば/.test(text)) return "example";
  if (/？|\?/.test(text)) return "question";
  return "explain";
}

function visualForType(type: SlideType, topic: string): string {
  if (type === "compare") return `比較表か Before/After。「例とイラスト」は禁止。主題は「${topic.slice(0, 18)}」。`;
  if (type === "diagram" || type === "process") return "3段階の図解かフロー。空カードを置かない。";
  if (type === "example") return "具体は数字・引用・短い語。挿絵のプレースホルダーは置かない。";
  if (type === "question") return "問いを巨大に。答えはまだ書かない。";
  if (type === "climax") return "一文だけ。余白を最大に。";
  if (type === "landing") return "中心メッセージ。新しいリストを足さない。";
  return `この枚のビジュアルは「${topic.slice(0, 24)}」を補強するためだけに置く。`;
}

function layoutForType(type: SlideType): string {
  if (type === "compare") return "左右または上下の比較。同じ強さ。";
  if (type === "diagram") return "横並び3欄。見出し・一行。写真が無いならタイポと線だけ。";
  if (type === "process") return "左から右の3ステップ。";
  if (type === "climax") return "余白最大。字最大。一メッセージ。";
  if (type === "title") return "タイトル＋問い＋予告ビジュアル。";
  if (type === "landing") return "中心メッセージに戻る。新規リストを足さない。";
  if (type === "claim") return "見出し＋宣言。";
  return "見出し＋本文一塊。1メッセージ。";
}

function typeForLegacy(index: number, count: number, text: string): SlideType {
  if (index === 0) return "title";
  if (index === count - 1) return "landing";
  if (index === Math.max(1, Math.floor(count * 0.7))) return "climax";
  if (/？|\?/.test(text)) return "question";
  if (text.split("\n").length >= 3) return "diagram";
  return "explain";
}

function actForIndex(index: number, count: number): StoryAct {
  if (index === 0) return "intro";
  if (index === 1) return "problem";
  if (index === count - 1) return "landing";
  if (index >= Math.floor(count * 0.7)) return "climax";
  if (index >= Math.floor(count * 0.55)) return "turn";
  return "development";
}

function decorateSlide(
  slide: SlideDraft,
  index: number,
  count: number,
  chosen: TalkDirection,
  extra: { act: StoryAct; slideType: SlideType },
): DesignedSlide {
  return makeSlide(index, chosen, {
    ...extra,
    text: slide.text,
    oneMessage: slide.text.split("\n")[0] ?? slide.text,
    visualWhy: visualForType(extra.slideType, slide.text),
    layoutHint: layoutForType(extra.slideType),
    connectsFrom: index === 0 ? "入口" : "前の枚の感情を受けて進める",
    id: slide.id,
  });
}

function makeSlide(
  index: number,
  _chosen: TalkDirection,
  input: {
    act: StoryAct;
    slideType: SlideType;
    text: string;
    oneMessage: string;
    visualWhy: string;
    layoutHint: string;
    connectsFrom: string;
    id?: string;
  },
): DesignedSlide {
  return {
    id: input.id ?? `cut-${index + 1}`,
    text: input.text,
    act: input.act,
    slideType: input.slideType,
    oneMessage: input.oneMessage,
    visualWhy: input.visualWhy,
    layoutHint: input.layoutHint,
    connectsFrom: input.connectsFrom,
  };
}

function capDesigned(slides: DesignedSlide[], max: number): DesignedSlide[] {
  if (slides.length <= max) return slides.map((slide, index) => ({ ...slide, id: `cut-${index + 1}` }));
  const locked = new Set(["title", "climax", "landing", "diagram"]);
  const next = slides.slice();
  while (next.length > max) {
    const index = next.findIndex((slide, position) => position > 1 && !locked.has(slide.slideType) && slide.act === "development" && slide.slideType === "explain");
    if (index < 0) break;
    next.splice(index, 1);
  }
  return next.slice(0, max).map((slide, index) => ({ ...slide, id: `cut-${index + 1}` }));
}

function asQuestion(text: string): string {
  const compact = text.replace(/[。．]$/, "").trim();
  if (/[？?]$/.test(compact)) return compact;
  if (/べきか|のか|何か/.test(compact)) return compact.endsWith("か") ? compact : `${compact}か`;
  return `${compact}のか`;
}

function firstLine(text: string): string {
  return text.split(/\n|[。]/).map((line) => line.trim()).find(Boolean) ?? "";
}
