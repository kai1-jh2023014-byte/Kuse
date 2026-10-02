import { describe, expect, it } from "vitest";
import { TEST_TALK_BRIEF, TEST_TALK_MANUSCRIPT, TEST_TALK_PURPOSE } from "./test-fixture";
import { planSlideRoles } from "@/services/ai/slide-roles";

describe("test talk fixture", () => {
  it("fills a mid-size talk without typing", () => {
    expect(TEST_TALK_BRIEF.purpose).toBe(TEST_TALK_PURPOSE);
    expect(TEST_TALK_BRIEF.size).toMatch(/16:9/);
    expect(TEST_TALK_MANUSCRIPT.split("\n\n").length).toBeGreaterThan(8);
  });

  it("splits into more than a handful of slides", () => {
    const drafts = TEST_TALK_MANUSCRIPT.split("\n\n").map((text, index) => ({
      id: `t-${index}`,
      text,
    }));
    const plan = planSlideRoles(drafts, TEST_TALK_BRIEF);
    expect(plan.slides.length).toBeGreaterThan(8);
    expect(plan.slides.length).toBeLessThanOrEqual(24);
  });
});
