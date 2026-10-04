import { MAX_SLIDES, planSlideRoles, segmentManuscript, type DeckRolePlan, type SlideDraft } from "./slide-roles";
import { reviewDeck, type DeckReview } from "./deck-review";
import { wrapJapanese } from "./japanese-wrap";

export type StoryAct = "intro" | "problem" | "development" | "turn" | "climax" | "landing";

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
  { id: "knowledge", label: "知識を学ぶ意味", keys: ["知識", "暗記", "覚える", "テスト"] },
  { id: "ai", label: "AI時代", keys: ["AI", "人工知能", "生成", "代替"] },
  { id: "teacher", label: "教師の役割", keys: ["教師", "先生", "教員"] },
  { id: "collab", label: "問題発見と協働", keys: ["問題発見", "協働", "チーム", "対話"] },
  { id: "english", label: "英語", keys: ["英語"] },
  { id: "code", label: "プログラミング", keys: ["プログラミング", "コード", "プログラム"] },
  { id: "data", label: "データリテラシー", keys: ["データ", "統計", "読む力"] },
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
  return unique.slice(0, 80).map((text) => {
    const themes = THEMES.filter((theme) => theme.keys.some((key) => text.includes(key))).map((theme) => theme.id);
    let score = Math.min(8, Math.round(text.length / 18));
    if (/だから|つまり|べき|必要|残|重要|一番/.test(text)) score += 4;
    if (/例えば|など/.test(text)) score -= 1;
    return { text, score, themes };
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
  const baseKeep = rankedKeep(claims, 6);
  const baseDrop = rankedDrop(claims, baseKeep, 5);

  const specific: TalkDirection[] = [];
  if (school) {
    specific.push(
      direction("a", "AI時代に学校は何を教えるべきか", hearer, claims, [
        "school",
        "knowledge",
        "ai",
        "collab",
      ]),
    );
    specific.push(
      direction("b", "AIによって教師の役割はどう変わるか", hearer, claims, ["teacher", "ai", "school"]),
    );
    specific.push(
      direction("c", "知識を学ぶ意味はAI時代にどう変わるか", hearer, claims, ["knowledge", "ai", "school"]),
    );
    if (present.has("code") || present.has("data") || present.has("english")) {
      specific[0] = direction("a", "AI時代に学校は何を教えるべきか", hearer, claims, [
        "school",
        "ai",
        "code",
        "data",
        "english",
        "collab",
      ]);
    }
  }
  if (specific.length >= 3) return specific.slice(0, 3);

  const written = purpose.trim() || firstLine(manuscript) || "この話で相手の見方を一つ動かす";
  return [
    {
      id: "a",
      label: written.slice(0, 32),
      centralMessage: written,
      audience: hearer,
      structure: "問い → 現状のずれ → 主張 → 具体 → 山 → 持ち帰り",
      keep: baseKeep,
      drop: baseDrop,
      trait: "原稿の中心を一本に絞り、説明の枝を落とす",
      question: asQuestion(written),
    },
    {
      id: "b",
      label: `${hearer}が決めること`,
      centralMessage: `${hearer}が、次に取る行動を一つ決められるようにする`,
      audience: hearer,
      structure: "相手の誤解 → 本当の仕事 → 手順 → 最初の一歩",
      keep: baseKeep.slice(0, 4),
      drop: [...baseDrop, ...baseKeep.slice(4)],
      trait: "聴衆の決断に寄せ、背景説明は最小にする",
      question: `${hearer}は、何を変えるのか`,
    },
    {
      id: "c",
      label: "なぜ今それが必要か",
      centralMessage: claims.find((claim) => /だから|つまり/.test(claim.text))?.text.slice(0, 42) || written,
      audience: hearer,
      structure: "通説 → しかし → 根拠 → 結論",
      keep: claims.filter((claim) => /しかし|でも|実は|だから/.test(claim.text)).map((claim) => claim.text).slice(0, 6),
      drop: baseDrop,
      trait: "転換と因果を先に置き、カタログ的な列挙を避ける",
      question: asQuestion(claims.find((claim) => /しかし|でも/.test(claim.text))?.text || written),
    },
  ].map((item, index) => ({
    ...item,
    keep: item.keep.length ? item.keep : baseKeep,
    drop: item.drop.length ? item.drop : baseDrop,
    id: item.id || ["a", "b", "c"][index] || "a",
  }));
}

export function composeTalk(
  manuscript: string,
  input: { purpose?: string; audience?: string; audit?: string; directionId?: string },
): TalkArchitecture {
  const claims = extractClaims(manuscript);
  const directions = proposeDirections(manuscript, input.purpose, input.audience);
  const chosen = directions.find((item) => item.id === input.directionId) ?? directions[0]!;
  const designed = designSlides(manuscript, claims, chosen, input.audit ?? "");
  const planned = planSlideRoles(
    designed.map((slide) => ({ id: slide.id, text: slide.text })),
    { purpose: chosen.centralMessage, audience: chosen.audience },
  );
  const merged = overlayDesign(planned, designed, chosen, directions, claims);
  const reviewed = reviewDeck(merged);
  return {
    claims,
    directions,
    chosen,
    kept: chosen.keep,
    dropped: chosen.drop,
    story: merged.arc,
    slides: designed,
    review: reviewed.review,
  };
}

export function planFromManuscript(
  manuscript: string,
  input: { purpose?: string; audience?: string; audit?: string; directionId?: string },
): DeckRolePlan {
  const claims = extractClaims(manuscript);
  const long = manuscript.trim().length >= 600 || claims.length >= 8;
  const directions = proposeDirections(manuscript, input.purpose, input.audience);
  const chosen = directions.find((item) => item.id === input.directionId) ?? directions[0]!;
  const designed = long
    ? designSlides(manuscript, claims, chosen, input.audit ?? "")
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

function designSlides(
  _manuscript: string,
  claims: TalkClaim[],
  chosen: TalkDirection,
  audit: string,
): DesignedSlide[] {
  const keepSet = new Set(chosen.keep);
  const selected = claims.filter((claim) => keepSet.has(claim.text) || matchesDirection(claim, chosen));
  const pool = selected.length >= 4 ? selected : claims.slice(0, 12);
  const dropped = new Set(chosen.drop);
  const body = pool.filter((claim) => !dropped.has(claim.text));
  const finer = /細かく|分けて/.test(audit);
  const climaxClaim =
    body.slice().sort((a, b) => b.score - a.score)[0]?.text || chosen.centralMessage;

  const slides: DesignedSlide[] = [];
  slides.push(
    makeSlide(slides.length, chosen, {
      act: "intro",
      slideType: "title",
      text: `${wrapJapanese(chosen.question, 12)}\n${chosen.centralMessage}`,
      oneMessage: chosen.question,
      visualWhy: "表紙の写真は、この発表が扱う対立（現状とこれから）を予告する。飾りではない。",
      layoutHint: "巨大タイトル＋問いのサブタイトル＋対立が読める写真。説明の箇条書きは置かない。",
      connectsFrom: "まだ何の話か分からない状態から、問いだけを開く。",
    }),
  );

  const misconception = body.find((claim) => /思う|感じ|きっと|しかし/.test(claim.text));
  if (misconception) {
    slides.push(
      makeSlide(slides.length, chosen, {
        act: "problem",
        slideType: "question",
        text: misconception.text,
        oneMessage: misconception.text,
        visualWhy: "相手がすでに持っている前提を、文字だけで先に出す。図は不要。",
        layoutHint: "見出し＋宣言。余白を広く。",
        connectsFrom: "表紙の問いを、相手の内心の言葉に落とす。",
      }),
    );
  }

  const development = body.filter((claim) => claim.text !== misconception?.text && claim.text !== climaxClaim);
  const grouped = groupRelated(development, finer ? 1 : 2);
  grouped.forEach((group, index) => {
    const type = chooseType(group);
    const merged = group.map((item) => item.text).join("\n");
    slides.push(
      makeSlide(slides.length, chosen, {
        act: index < grouped.length - 1 ? "development" : "turn",
        slideType: type,
        text: merged,
        oneMessage: group[0]?.text ?? merged,
        visualWhy: visualForType(type, group[0]?.text ?? ""),
        layoutHint: layoutForType(type),
        connectsFrom: index === 0 ? "前提のあと、論点が一つ増える。" : "前の論点を受けて、一段具体化する。",
      }),
    );
  });

  slides.push(
    makeSlide(slides.length, chosen, {
      act: "climax",
      slideType: "climax",
      text: climaxClaim,
      oneMessage: climaxClaim,
      visualWhy: "山は情報を減らす。写真か大きな字だけ。前後より余白を広くする。",
      layoutHint: "全面インパクト。一文だけ。補足もカードも置かない。",
      connectsFrom: "ここまでの具体を、一本の主張に畳む。",
    }),
  );

  slides.push(
    makeSlide(slides.length, chosen, {
      act: "landing",
      slideType: "landing",
      text: `${chosen.centralMessage}\n${chosen.question}`,
      oneMessage: chosen.centralMessage,
      visualWhy: "結論は中心メッセージに戻る。新しい項目のカタログにしない。",
      layoutHint: "見出し＋持ち帰る一文。箇条書きの要約にしない。",
      connectsFrom: "山の主張を、聴衆が考える問いに戻す。",
    }),
  );

  return capDesigned(slides, MAX_SLIDES);
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
  const dropped = chosen.drop.slice(0, 8);
  return {
    ...plan,
    slides,
    intent: chosen.centralMessage,
    directions,
    chosenDirectionId: chosen.id,
    centralMessage: chosen.centralMessage,
    keptClaims: chosen.keep,
    droppedClaims: dropped,
    architectureSummary: [
      `中心メッセージ: ${chosen.centralMessage}`,
      `構成: ${chosen.structure}`,
      dropped.length ? `捨てた論点: ${dropped.slice(0, 4).join(" / ")}` : "",
      `原稿から拾った論点は${claims.length}。この方向では${slides.length}枚に再構成した。`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function direction(
  id: string,
  label: string,
  audience: string,
  claims: TalkClaim[],
  themeIds: string[],
): TalkDirection {
  const keepClaims = claims.filter((claim) => claim.themes.some((theme) => themeIds.includes(theme)));
  const keep = (keepClaims.length ? keepClaims : claims).slice(0, 8).map((claim) => claim.text);
  const drop = claims.filter((claim) => !keep.includes(claim.text)).slice(0, 8).map((claim) => claim.text);
  return {
    id,
    label,
    centralMessage: label,
    audience,
    structure: "導入 → 問題提起 → 展開 → 転換 → クライマックス → 結論",
    keep,
    drop,
    trait: `${label}に必要な論点だけ残し、隣接テーマは落とす`,
    question: asQuestion(label),
  };
}

function rankedKeep(claims: TalkClaim[], count: number): string[] {
  return claims.slice().sort((a, b) => b.score - a.score).slice(0, count).map((claim) => claim.text);
}

function rankedDrop(claims: TalkClaim[], keep: string[], count: number): string[] {
  const kept = new Set(keep);
  return claims.filter((claim) => !kept.has(claim.text)).slice(-count).map((claim) => claim.text);
}

function matchesDirection(claim: TalkClaim, chosen: TalkDirection): boolean {
  const blob = `${chosen.label}${chosen.centralMessage}${chosen.keep.join("")}`;
  return claim.themes.some((theme) => blob.includes(theme)) || chosen.keep.some((item) => claim.text.includes(item.slice(0, 10)));
}

function groupRelated(claims: TalkClaim[], perSlide: number): TalkClaim[][] {
  const groups: TalkClaim[][] = [];
  let current: TalkClaim[] = [];
  for (const claim of claims) {
    const last = current[0];
    const related = last && last.themes.some((theme) => claim.themes.includes(theme));
    if (current.length >= perSlide || (current.length && !related && perSlide === 1)) {
      groups.push(current);
      current = [claim];
    } else {
      current.push(claim);
    }
  }
  if (current.length) groups.push(current);
  return groups.slice(0, 16);
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
  if (type === "compare") return `比較表か Before/After。画像が要らないなら表にする。「例とイラスト」は禁止。主題は「${topic.slice(0, 18)}」。`;
  if (type === "diagram" || type === "process") return "3段階の図解かフロー。空カードを置かない。各段は短い語だけ。";
  if (type === "example") return "具体は数字・引用・タイムラインのどれか。挿絵のプレースホルダーは置かない。";
  if (type === "question") return "問いを巨大に。背景は対立が伝わる写真か、字だけ。";
  return `この枚のビジュアルは「${topic.slice(0, 24)}」を補強するためだけに置く。説明できない飾りは削除。`;
}

function layoutForType(type: SlideType): string {
  if (type === "compare") return "左右または上下の比較。同じ強さ。";
  if (type === "diagram") return "横並び3欄。見出し・一行。写真が無いならタイポと線だけ。";
  if (type === "process") return "左から右の3ステップ。矢印は意味のある流れだけ。";
  if (type === "climax") return "余白最大。字最大。一メッセージ。";
  if (type === "title") return "タイトル＋問い＋予告ビジュアル。";
  if (type === "landing") return "中心メッセージに戻る。新規リストを足さない。";
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
  if (slides.length <= max) return slides;
  const locked = new Set(["title", "climax", "landing"]);
  const next = slides.slice();
  while (next.length > max) {
    const index = next.findIndex((slide, position) => position > 0 && !locked.has(slide.slideType) && slide.act === "development");
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
