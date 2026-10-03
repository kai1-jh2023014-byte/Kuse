import { describe, expect, it } from "vitest";
import { hasEnoughTalk, inferPurpose } from "./infer-brief";

describe("inferPurpose", () => {
  it("uses the first line so the user does not write a separate brief", () => {
    expect(inferPurpose("終わらせる仕事を決める\n数字は後からついてくる")).toContain("終わらせる仕事を決める");
    expect(inferPurpose("短い", "現場")).toContain("現場");
    expect(hasEnoughTalk("あいうえおかきくけこさし")).toBe(true);
    expect(hasEnoughTalk("短い")).toBe(false);
  });
});
