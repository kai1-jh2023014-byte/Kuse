import { describe, expect, it } from "vitest";
import { craftSection, isPresentationJob, slidesToRegenerate } from "./presentation-craft";
import { generateCanvaPrompt } from "./prompt";
import { planSlideRoles } from "./slide-roles";
import type { DesignBrief } from "./types";

const brief: DesignBrief = {
  purpose: "発表資料のスライドを作りたい",
  audience: "チーム",
  copyText: "",
  size: "16:9（発表）",
  mood: "",
  imagery: "",
  notes: "",
};

describe("presentation craft", () => {
  it("treats this product as a presentation app", () => {
    expect(isPresentationJob("発表資料のスライドを作りたい", "16:9（発表）", 5)).toBe(true);
    expect(isPresentationJob("方針発表", "", 1)).toBe(true);
  });

  it("regenerates only missing or dirty slides", () => {
    expect(
      slidesToRegenerate({
        slideIds: ["a", "b", "c"],
        acceptedIds: ["a"],
        existingIds: ["a", "b"],
        dirtyIds: ["c"],
      }),
    ).toEqual(["c"]);
    expect(
      slidesToRegenerate({
        slideIds: ["a", "b"],
        acceptedIds: [],
        existingIds: ["a", "b"],
      }),
    ).toEqual([]);
    expect(
      slidesToRegenerate({
        slideIds: ["a", "b"],
        acceptedIds: [],
        existingIds: ["a"],
      }),
    ).toEqual(["b"]);
  });

  it("puts soft craft behind the manuscript and asks for one page", async () => {
    const plan = planSlideRoles(
      [
        { id: "a", text: "感情の順番" },
        { id: "b", text: "みなさんはきっと、見た目が先だと思っている" },
        { id: "c", text: "相手の気持ちを一つ動かす" },
      ],
      brief,
    );
    const slide = plan.slides[1];
    expect(slide).toBeTruthy();
    const section = craftSection({
      deck: {
        arc: plan.arc,
        intent: plan.intent,
        emphasis: plan.emphasis,
        slides: plan.slides.map((item) => ({
          id: item.id,
          index: item.index,
          roleLabel: item.roleLabel,
          text: item.text,
        })),
      },
      slide: slide!,
    });
    expect(section).toContain("弱い既定");
    expect(section).toContain("【この1枚だけ】");
    const result = await generateCanvaPrompt({
      profile: null,
      brief,
      styleStrength: 0,
      slideRole: slide,
      slideCount: plan.slides.length,
      deck: {
        arc: plan.arc,
        intent: plan.intent,
        emphasis: plan.emphasis,
        slides: plan.slides.map((item) => ({
          id: item.id,
          index: item.index,
          roleLabel: item.roleLabel,
          text: item.text,
        })),
      },
    });
    expect(result.prompt).toContain("【発表の型】");
    expect(result.prompt).toContain("みなさんはきっと、見た目が先だと思っている");
    expect(result.prompt).toContain("他のページは作らない");
    expect(result.prompt.indexOf("【発表の型】")).toBeGreaterThan(result.prompt.indexOf("【このスライドの役割】"));
  });
});
