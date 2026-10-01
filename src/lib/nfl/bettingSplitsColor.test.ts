import { describe, expect, it } from "vitest";
import { percentageBarColor } from "./bettingSplitsColor";

describe("percentageBarColor", () => {
  it("uses red, neutral gray, and green endpoints", () => {
    expect(percentageBarColor(0)).toBe("rgb(227, 72, 72)");
    expect(percentageBarColor(50)).toBe("rgb(148, 163, 184)");
    expect(percentageBarColor(100)).toBe("rgb(24, 182, 84)");
  });
  it("interpolates each half deterministically", () => {
    expect(percentageBarColor(25)).toBe("rgb(188, 118, 128)");
    expect(percentageBarColor(75)).toBe("rgb(86, 173, 134)");
    expect(percentageBarColor(25)).toBe(percentageBarColor(25));
  });
});
