import { describe, expect, it } from "vitest";
import { generateCanvaPrompt } from "./prompt";
import { planSlideRoles, roleSection, segmentManuscript } from "./slide-roles";
import type { DesignBrief } from "./types";

const brief: DesignBrief = {
  purpose: "スライドは見た目ではなく、相手の感情を動かす順番だと伝える",
  audience: "発表を作っている人",
  copyText: "",
  size: "16:9",
  mood: "",
  imagery: "",
  notes: "",
};

const deck = [
  { id: "a", text: "感情の順番" },
  { id: "b", text: "みなさんはきっと、スライドは見た目が大事だと思っている" },
  { id: "c", text: "伝わる\n覚えない\n動かない" },
  { id: "d", text: "一番伝えたいのは、相手の気持ちを一つ動かすこと" },
  { id: "e", text: "次の1枚で、相手の気持ちを一つだけ動かす" },
];

describe("slide role logic", () => {
  it("reads the whole deck before assigning title, empathy, parallel, and impact", () => {
    const plan = planSlideRoles(deck, brief);
    expect(plan.slides.map((slide) => slide.role)).toEqual(["title", "empathy", "parallel", "impact", "landing"]);
    expect(plan.arc).toContain("感情の順番");
    expect(plan.slides[1]?.expression).toContain("みなさんはきっとこう思ってますよね");
    expect(plan.slides[2]?.designConsequence).toContain("同じ");
    expect(plan.slides[3]?.job).toContain("大きく動かす");
    expect(plan.slides[0]?.audienceAfter).not.toBe(plan.slides[3]?.audienceAfter);
    expect(plan.warnings.some((warning) => warning.includes("インパクト"))).toBe(false);
    expect(plan.slides.map((slide) => slide.weight)).toEqual(["quiet", "quiet", "even", "force", "quiet"]);
    expect(plan.emphasis).toContain("4枚目");
    expect(plan.intent).toContain("感情を動かす");
    expect(plan.slides.filter((slide) => slide.weight === "force")).toHaveLength(1);
    expect(plan.slides[3]?.weightReason).toContain("競争");
    expect(plan.slides[0]?.weightReason).toContain("山");
  });

  it("warns when important claims are pushed before the audience is acknowledged", () => {
    const plan = planSlideRoles(
      [
        { id: "1", text: "新企画" },
        { id: "2", text: "一番伝えたい結論" },
        { id: "3", text: "持って帰る一文" },
      ],
      { purpose: "企画の説明", audience: "チーム" },
    );
    expect(plan.warnings.some((warning) => warning.includes("気持ち"))).toBe(true);
  });

  it("puts the slide's emotional job ahead of decoration in the Canva prompt", async () => {
    const plan = planSlideRoles(deck, brief);
    const role = plan.slides[2];
    expect(role).toBeTruthy();
    const section = roleSection(role!, plan.slides.length);
    const result = await generateCanvaPrompt({
      profile: null,
      brief,
      styleStrength: 0,
      slideRole: role,
      slideCount: plan.slides.length,
    });
    expect(result.prompt).toContain("【このスライドの役割】");
    expect(result.prompt).toContain("並列");
    expect(result.prompt).toContain(section.split("\n")[1] ?? "感情");
    expect(result.prompt.indexOf("【このスライドの役割】")).toBeLessThan(result.prompt.indexOf("【レイアウト】"));
  });

  it("cuts one pasted manuscript into an emotional sequence", () => {
    const manuscript = [
      "感情の順番。みなさんはきっと、スライドは見た目が大事だと思っている。",
      "伝わる。覚えない。動かない。",
      "一番伝えたいのは、相手の気持ちを一つ動かすこと。",
      "次の1枚で、相手の気持ちを一つだけ動かす。",
    ].join("");
    const cut = segmentManuscript(manuscript);
    const plan = planSlideRoles(cut.slides, brief);
    expect(plan.slides.map((slide) => slide.role)).toEqual(["title", "empathy", "parallel", "impact", "landing"]);
    expect(cut.reasons[2]).toContain("同じ重さ");
    expect(cut.summary).toContain("監査");
  });

  it("keeps one peak when two slides both ask for impact", () => {
    const plan = planSlideRoles(
      [
        { id: "1", text: "新企画" },
        { id: "2", text: "一番伝えたい結論は速度です" },
        { id: "3", text: "一番伝えたいのは、相手の気持ちを一つ動かすこと" },
        { id: "4", text: "持って帰る一文" },
      ],
      { purpose: "相手の気持ちを一つ動かす", audience: "チーム" },
    );
    expect(plan.slides.map((slide) => slide.weight)).toEqual(["quiet", "quiet", "force", "quiet"]);
    expect(plan.slides[1]?.weightReason).toContain("一つ");
    expect(plan.slides[2]?.deckIntent).toContain("相手の気持ちを一つ動かす");
  });

  it("folds explanation around the sentence the whole deck wants to keep", () => {
    const manuscript = [
      "発表の入口では、まだ結論を言いません。",
      "市場の変化について、背景だけを先に置いておきます。",
      "本当に残したいのは、相手の気持ちを一つ動かすことです。",
      "手順の細かい説明は、この場では読み上げません。",
      "配布資料に、補足の数字をまとめてあります。",
      "次の一枚で、相手の気持ちを一つだけ動かします。",
    ].join("");
    const purpose = "相手の気持ちを一つ動かす";
    const withIntent = segmentManuscript(manuscript, "", purpose);
    const plain = segmentManuscript(manuscript);
    expect(withIntent.slides.length).toBeLessThan(plain.slides.length);
    expect(withIntent.slides.some((slide) => slide.text.includes("相手の気持ちを一つ動かすこと") && !slide.text.includes("手順"))).toBe(true);
    expect(withIntent.slides.some((slide) => slide.text.includes("手順") && slide.text.includes("配布"))).toBe(true);
    expect(withIntent.summary).toContain("力を入れる");
  });

  it("splits a conclusion onto the next slide so a transition can reveal it", async () => {
    const manuscript = [
      "アリに印をつけ、できるだけ長く生存させる。",
      "⇓",
      "見ているのはアリの社会性だ。",
      "仮説は、印が他のアリに取られるか、土で落ちることだ。",
      "だから、取られにくい印を発見する。",
      "冷蔵庫で動きを止めて腹に印をつけると、巣に戻したあとも誰が誰か分かる。",
    ].join("\n");
    const cut = segmentManuscript(manuscript);
    const plan = planSlideRoles(cut.slides, { purpose: "印をつけたアリを長く生存させる", audience: "同学年" });
    const reveals = plan.slides.filter((slide) => slide.transition === "reveal");
    expect(reveals.map((slide) => slide.transitionAdds)).toEqual(
      expect.arrayContaining(["見ているのはアリの社会性だ", "取られにくい印を発見する", "巣に戻したあとも誰が誰か分かる"]),
    );
    expect(plan.slides.some((slide) => slide.transition === "hold" && slide.transitionAdds === "見ているのはアリの社会性だ")).toBe(true);
    const reveal = reveals[0];
    expect(reveal).toBeTruthy();
    const section = roleSection(reveal!, plan.slides.length);
    expect(section).toContain("【このスライドの役割】");
    expect(section).toContain("スライド切り替え");
    expect(section).toContain("見ているのはアリの社会性だ");
    const result = await generateCanvaPrompt({
      profile: null,
      brief: { ...brief, purpose: "印をつけたアリを長く生存させる" },
      styleStrength: 0,
      slideRole: reveal,
      slideCount: plan.slides.length,
    });
    expect(result.prompt.indexOf("切り替え:")).toBeGreaterThan(result.prompt.indexOf("【このスライドの役割】"));
    expect(result.prompt.indexOf("切り替え:")).toBeLessThan(result.prompt.indexOf("【レイアウト】"));
    expect(cut.summary).toContain("切り替え");
    expect(cut.summary).toContain("監査");
  });

  it("splits a grouped slide again when the audit asks for a finer cut", () => {
    const manuscript = "感情の順番。伝わる。覚えない。動かない。一番伝えたいのは、相手の気持ちを一つ動かすこと。";
    const cut = segmentManuscript(manuscript, "細かく分けて");
    expect(cut.slides.map((slide) => slide.text)).toContain("伝わる");
    expect(cut.slides.map((slide) => slide.text)).toContain("動かない");
    expect(cut.summary).toContain("細かく分けて");
  });
});
