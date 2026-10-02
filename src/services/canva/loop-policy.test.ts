import { describe, expect, it } from "vitest";
import type { DesignEvaluation } from "@/services/ai/evaluation-types";
import { LOOP_LIMIT, clampLoopLimit, loopReason, nextLoopAction, readyToShow } from "./loop-policy";
import { pickBestLoopVersion } from "./loop";

function analysis(similarity: number, high: boolean): Pick<DesignEvaluation, "style_similarity" | "improvements"> {
  return {
    style_similarity: similarity,
    improvements: high
      ? [{ category: "layout", priority: "high", problem: "ずれ", suggestion: "直す", desired: "寄せる" }]
      : [],
  };
}

describe("automatic Canva loop", () => {
  it("shows a result only when likeness is high and nothing is badly off", () => {
    expect(readyToShow(analysis(80, false))).toBe(true);
    expect(readyToShow(analysis(90, true))).toBe(false);
    expect(readyToShow(analysis(71, false))).toBe(false);
  });

  it("improves until the bar or the chosen generation count", () => {
    expect(nextLoopAction({ round: 1, hasProfile: true, analysis: analysis(40, true) })).toBe("improve");
    expect(nextLoopAction({ round: 2, hasProfile: true, analysis: analysis(80, false) })).toBe("show");
    expect(nextLoopAction({ round: LOOP_LIMIT, hasProfile: true, analysis: analysis(40, true) })).toBe("show");
    expect(nextLoopAction({ round: 3, hasProfile: true, analysis: analysis(40, true), limit: 5 })).toBe("improve");
    expect(nextLoopAction({ round: 5, hasProfile: true, analysis: analysis(40, true), limit: 5 })).toBe("show");
    expect(nextLoopAction({ round: 1, hasProfile: false, analysis: null })).toBe("show");
  });

  it("clamps a user-chosen loop count", () => {
    expect(clampLoopLimit(1)).toBe(1);
    expect(clampLoopLimit(10)).toBe(10);
    expect(clampLoopLimit(0)).toBe(1);
    expect(clampLoopLimit(99)).toBe(10);
    expect(clampLoopLimit("8")).toBe(8);
    expect(clampLoopLimit("no")).toBe(3);
  });

  it("does not describe likeness as a quality score", () => {
    expect(loopReason({ reached: true, rounds: 2, similarity: 80, hasProfile: true, stoppedEarly: false })).toContain("出来ではなく");
    expect(loopReason({ reached: false, rounds: 3, similarity: 40, hasProfile: true, stoppedEarly: false })).toContain("3回まで");
  });

  it("keeps the closest loop round instead of only the last one", () => {
    const best = pickBestLoopVersion(
      [
        { id: "a", loopId: "L", analysis: { style_similarity: 40 } },
        { id: "b", loopId: "L", analysis: { style_similarity: 70 } },
        { id: "c", loopId: "L", analysis: { style_similarity: 55 } },
      ] as never,
      "L",
      "c",
    );
    expect(best.id).toBe("b");
  });
});
