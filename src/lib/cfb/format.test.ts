import { describe, expect, it } from "vitest";
import {
  formatMoneyline,
  formatNullableNumber,
  formatRank,
  formatRankChange,
  formatSpread,
  formatTotal,
} from "./format";

describe("CFB format helpers", () => {
  it("renders null/undefined/NaN as em dash, not fake zeros", () => {
    expect(formatNullableNumber(null)).toBe("—");
    expect(formatNullableNumber(undefined)).toBe("—");
    expect(formatNullableNumber(Number.NaN)).toBe("—");
    expect(formatRank(null)).toBe("—");
    expect(formatSpread(null)).toBe("—");
    expect(formatTotal(null)).toBe("—");
    expect(formatMoneyline(null)).toBe("—");
  });

  it("formats real zero values correctly", () => {
    expect(formatNullableNumber(0)).toBe("0.0");
    expect(formatSpread(0)).toBe("PK");
  });

  it("hides rank movement when previous rank is unavailable", () => {
    expect(formatRankChange(null, 7)).toEqual({ text: "", direction: "none" });
    expect(formatRankChange(10, 7)).toEqual({ text: "↑3", direction: "up" });
    expect(formatRankChange(5, 8)).toEqual({ text: "↓3", direction: "down" });
  });
});
