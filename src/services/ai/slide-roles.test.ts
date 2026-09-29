import { describe, expect, it } from "vitest";
import { generateCanvaPrompt } from "./prompt";
import { planSlideRoles, roleSection } from "./slide-roles";
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
});
