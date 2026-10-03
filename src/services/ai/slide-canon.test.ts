import { describe, expect, it } from "vitest";
import { canonBlock, canonFrameFor, formDeckRecipe } from "./slide-canon";

describe("canonical slide frames", () => {
  it("maps roles to composition, not a color theme", () => {
    expect(canonFrameFor("title")).toBe("cover");
    expect(canonFrameFor("parallel")).toBe("parallel");
    expect(canonFrameFor("impact")).toBe("impact");
    expect(canonFrameFor("empathy")).toBe("statement");
    expect(canonFrameFor("landing")).toBe("statement");
    expect(canonFrameFor("context", "説明")).toBe("explain");
    expect(canonFrameFor("context", "01\n02\n03\n04\n05")).toBe("toc");
  });

  it("tells Canva to keep structure and skip a house gradient", () => {
    const cover = canonBlock({ role: "title", roleLabel: "表紙", text: "企業のデジタル変革を、もっと身近に。", index: 0 });
    expect(cover).toContain("写真");
    expect(cover).toContain("グラデーション");
    const parallel = canonBlock({ role: "parallel", roleLabel: "並列", text: "三つ", index: 3 });
    expect(parallel).toContain("同じ幅の欄");
    const impact = canonBlock({ role: "impact", roleLabel: "インパクト", text: "なぜ", index: 4 });
    expect(impact).toContain("背景いっぱい");
    expect(formDeckRecipe()).toContain("巨大タイトル");
    expect(formDeckRecipe()).toContain("句読点");
  });
});
