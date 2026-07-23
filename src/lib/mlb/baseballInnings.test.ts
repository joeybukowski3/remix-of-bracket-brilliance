import { describe, expect, it } from "vitest";

import {
  averageDecimalInnings,
  averageOuts,
  mlbInningsToOuts,
  outsToDecimalInnings,
  outsToMlbInnings,
  totalOuts,
} from "./baseballInnings";

describe("baseball innings helpers", () => {
  it.each([
    [4, 12],
    [4.0, 12],
    ["4.0", 12],
    [4.1, 13],
    ["4.1", 13],
    [4.2, 14],
    ["4.2", 14],
  ])("converts MLB innings notation %s to outs", (input, outs) => {
    expect(mlbInningsToOuts(input)).toBe(outs);
  });

  it("rejects invalid or malformed innings", () => {
    for (const value of [4.3, "4.3", -1, "-4.1", "abc", "4.10", "4.a", "", null, undefined]) {
      expect(mlbInningsToOuts(value)).toBeNull();
    }
  });

  it("never treats 4.1 as decimal 4.1 innings", () => {
    expect(mlbInningsToOuts(4.1)).toBe(13);
    expect(outsToDecimalInnings(mlbInningsToOuts(4.1))).toBe(13 / 3);
  });

  it("converts outs to decimal innings and MLB display notation", () => {
    expect(outsToDecimalInnings(13)).toBe(13 / 3);
    expect(outsToMlbInnings(13)).toBe("4.1");
    expect(outsToMlbInnings(14)).toBe("4.2");
    expect(outsToMlbInnings(15)).toBe("5.0");
  });

  it("rejects invalid outs", () => {
    for (const outs of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(outsToDecimalInnings(outs)).toBeNull();
      expect(outsToMlbInnings(outs)).toBeNull();
    }
  });

  it("averages innings using outs", () => {
    expect(totalOuts(["4.0", "4.1", "4.2"])).toBe(39);
    expect(averageOuts(["4.0", "4.1", "4.2"])).toBe(13);
    expect(averageDecimalInnings(["4.0", "4.1", "4.2"])).toBe(13 / 3);
  });
});
