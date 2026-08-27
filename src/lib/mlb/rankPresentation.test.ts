import { describe, expect, it } from "vitest";
import { formatRankOrdinal, mlbRankHeatClass } from "@/lib/mlb/rankPresentation";

describe("MLB rank presentation", () => {
  it("formats league ranks as ordinals, including teen exceptions", () => {
    expect([1, 2, 3, 8, 11, 12, 13, 21, 32].map(formatRankOrdinal)).toEqual([
      "1st", "2nd", "3rd", "8th", "11th", "12th", "13th", "21st", "32nd",
    ]);
  });

  it("uses the favorable-to-unfavorable heat ramp and a neutral missing treatment", () => {
    expect(mlbRankHeatClass(1)).toContain("emerald");
    expect(mlbRankHeatClass(30)).toContain("rose");
    expect(mlbRankHeatClass(null)).toContain("slate");
  });
});
