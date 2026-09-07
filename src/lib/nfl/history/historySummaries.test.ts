import { describe, expect, it } from "vitest";
import { summarizeHistoryDeltas } from "./historySummaries";

describe("history comparison denominators", () => {
  it("separates valid, missing and total rows", () => {
    expect(summarizeHistoryDeltas([15, -5, 0, 10, null, undefined, NaN, Infinity])).toEqual({
      n: 8, comparisonCount: 4, mean: 5, median: 5, aboveCount: 2, belowCount: 1, equalCount: 1, missingCount: 4,
    });
  });
  it("supports an odd median and fewer than ten comparisons without mutating inputs", () => {
    const values = [9, 1, 2, null];
    expect(summarizeHistoryDeltas(values)).toMatchObject({ n: 4, comparisonCount: 3, aboveCount: 3, mean: 4, median: 2 });
    expect(values).toEqual([9, 1, 2, null]);
  });
  it("reports empty/all-missing windows without invented averages", () => {
    expect(summarizeHistoryDeltas([])).toMatchObject({ n: 0, comparisonCount: 0, mean: null, median: null, missingCount: 0 });
    expect(summarizeHistoryDeltas([null])).toMatchObject({ n: 1, comparisonCount: 0, mean: null, median: null, missingCount: 1 });
  });
});
