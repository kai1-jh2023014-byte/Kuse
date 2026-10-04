import { describe, expect, it } from "vitest";
import { planFromManuscript, proposeDirections } from "./deck-architecture";
import { wrapJapanese } from "./japanese-wrap";
import { generateCanvaPrompt } from "./prompt";

const EDUCATION = `
日本の学校教育は、これからどう変わるべきか。
学校教育では知識の暗記が中心になっている。
社会では問題発見や協働が必要だ。
教科には知識以外の価値がある。
AIが知的作業を代替する。
英語学習は会話より思考の道具になる。
プログラミングでは、AIが生成したコードが正しいか判断する力がいる。
何を作るのか決める。AIに適切な指示を出す。
データリテラシーは、数字を読む力だ。
AI時代の教育は、人間にしかできない判断を鍛える。
AIがコードを書けるようになるほど、人間に必要な能力は高まる。
教師の役割は、知識の伝達から伴走へ移る。
結論として、学校は何を教えるべきかを問い直す。
`.trim();

describe("deck architecture", () => {
  it("proposes distinct directions instead of dumping every claim", () => {
    const directions = proposeDirections(EDUCATION, "", "教員");
    expect(directions).toHaveLength(3);
    expect(directions.map((item) => item.label).join()).toMatch(/教えるべきか|教師|知識/);
    expect(directions[0]?.drop.length).toBeGreaterThan(0);
    expect(directions[0]?.keep.length).toBeGreaterThan(0);
  });

  it("rebuilds a long manuscript around a climax and a landing that returns to the message", () => {
    const plan = planFromManuscript(EDUCATION, { audience: "教員" });
    expect(plan.slides.length).toBeGreaterThan(4);
    expect(plan.slides.length).toBeLessThanOrEqual(24);
    expect(plan.directions?.length).toBe(3);
    expect(plan.centralMessage).toMatch(/学校|AI|知識|教師/);
    expect(plan.slides.some((slide) => slide.slideType === "climax" || slide.weight === "force")).toBe(true);
    const landing = plan.slides.at(-1);
    expect(landing?.text).toContain((plan.centralMessage ?? "").slice(0, 8));
    expect(plan.slides.every((slide) => !/例とイラスト/.test(slide.text))).toBe(true);
    expect(plan.review?.scores.story).toBeGreaterThan(50);
  });

  it("wraps Japanese titles without splitting 変わる", () => {
    const wrapped = wrapJapanese("日本の学校教育はこれからどう変わるべきか", 12);
    expect(wrapped).not.toMatch(/変わ\nる/);
    expect(wrapped).toContain("学校教育は");
    expect(wrapped.split("\n").every((line) => line.length > 2)).toBe(true);
  });

  it("tells Canva to forbid placeholders and mid-word breaks in the deck prompt", async () => {
    const plan = planFromManuscript(EDUCATION, { audience: "教員", directionId: "a" });
    const result = await generateCanvaPrompt({
      profile: null,
      brief: { purpose: plan.centralMessage || "教育", audience: "教員", copyText: "", size: "16:9", mood: "", imagery: "", notes: "" },
      styleStrength: 0,
      deck: {
        arc: plan.arc,
        intent: plan.intent,
        emphasis: plan.emphasis,
        centralMessage: plan.centralMessage,
        architectureSummary: plan.architectureSummary,
        droppedClaims: plan.droppedClaims,
        slides: plan.slides.map((slide) => ({
          id: slide.id,
          index: slide.index,
          roleLabel: slide.roleLabel,
          role: slide.role,
          text: slide.text,
          act: slide.act,
          slideType: slide.slideType,
          oneMessage: slide.oneMessage,
          visualWhy: slide.visualWhy,
          connectsFrom: slide.connectsFrom,
          layoutHint: slide.layoutHint,
          weight: slide.weight,
        })),
      },
    });
    expect(result.prompt).toContain("Central message");
    expect(result.prompt).toContain("例とイラスト");
    expect(result.prompt).toContain("Never write 例とイラスト");
    expect(result.prompt).toContain("climax");
    expect(result.prompt).toContain("変わ / る");
    expect(result.prompt).not.toMatch(/変わ\nる/);
  });
});
