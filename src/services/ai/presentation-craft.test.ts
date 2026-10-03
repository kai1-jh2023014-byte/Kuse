import { describe, expect, it } from "vitest";
import { craftSection, isPresentationJob, slidesToRegenerate, stageCopy } from "./presentation-craft";
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
    expect(stageCopy("歯列矯正について、本気で相談があります\n見た目ではなく、人生への投資として").title).toBe(
      "歯列矯正について、",
    );
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
    expect(section).toContain("【基本の構成】");
    expect(section).toContain("色の統一");
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
    expect(result.prompt).toContain("【基本の構成】");
    expect(result.prompt).toContain("【発表の型】");
    expect(result.prompt).toContain("みなさんはきっと、見た目が先だと思っている");
    expect(result.prompt).toContain("【この1枚だけ】");
    expect(result.prompt.indexOf("【基本の構成】")).toBeLessThan(result.prompt.indexOf("【このスライドの役割】"));
  });

  it("asks Canva for the whole talk as one multi-page design", async () => {
    const plan = planSlideRoles(
      [
        { id: "a", text: "感情の順番" },
        { id: "b", text: "みなさんはきっと、見た目が先だと思っている" },
        { id: "c", text: "相手の気持ちを一つ動かす" },
      ],
      brief,
    );
    const deck = {
      arc: plan.arc,
      intent: plan.intent,
      emphasis: plan.emphasis,
      slides: plan.slides.map((item) => ({
        id: item.id,
        index: item.index,
        roleLabel: item.roleLabel,
        role: item.role,
        text: item.text,
      })),
    };
    const result = await generateCanvaPrompt({
      profile: null,
      brief,
      styleStrength: 0,
      deck,
    });
    expect(result.prompt).toContain("Presentation Brief");
    expect(result.prompt).toContain("Slide Plan");
    expect(result.prompt).toContain("Visuals:");
    expect(result.prompt).toContain("みなさんはきっと、");
    expect(result.prompt).toContain("Huge Japanese type");
    expect(result.prompt).not.toContain("【この1枚だけ】");
    expect(result.prompt).not.toContain("【自分らしさの強度】");
  });
});
