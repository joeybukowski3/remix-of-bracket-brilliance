import { describe, expect, it } from "vitest";
import {
  buildComparisonRailModel,
  deriveMetricComparisonFromRanks,
  MIN_ADVANTAGE_MAGNITUDE,
  RANK_DIFFERENTIAL_SPAN,
} from "@/lib/nfl/matchupRailNormalization";

describe("buildComparisonRailModel", () => {
  it("points left and scales by the rank gap when the left team leads", () => {
    const model = buildComparisonRailModel({
      leftValue: 0.2,
      rightValue: 0.05,
      leftRank: 3,
      rightRank: 19,
      higherIsBetter: true,
    });
    expect(model.side).toBe("left");
    expect(model.basis).toBe("rank");
    expect(model.magnitude).toBeCloseTo(16 / RANK_DIFFERENTIAL_SPAN, 5);
  });

  it("points right when the right team leads", () => {
    const model = buildComparisonRailModel({
      leftValue: 0.05,
      rightValue: 0.2,
      leftRank: 24,
      rightRank: 6,
      higherIsBetter: true,
    });
    expect(model.side).toBe("right");
    expect(model.magnitude).toBeCloseTo(18 / RANK_DIFFERENTIAL_SPAN, 5);
  });

  it("treats a better (lower) rank as the winner for a lower-is-better metric", () => {
    // EPA/play allowed: right team allows less and is ranked better.
    const model = buildComparisonRailModel({
      leftValue: 0.09,
      rightValue: -0.04,
      leftRank: 22,
      rightRank: 4,
      higherIsBetter: false,
      comparison: "home",
    });
    expect(model.side).toBe("right");
    expect(model.magnitude).toBeCloseTo(18 / RANK_DIFFERENTIAL_SPAN, 5);
  });

  it("renders a neutral centre for a tie", () => {
    const model = buildComparisonRailModel({
      leftValue: 0.1,
      rightValue: 0.1,
      leftRank: 12,
      rightRank: 12,
      higherIsBetter: true,
      comparison: "tie",
    });
    expect(model.side).toBe("even");
    expect(model.magnitude).toBe(0);
  });

  it("renders no fill when a value is missing / not comparable", () => {
    expect(
      buildComparisonRailModel({
        leftValue: null,
        rightValue: 0.1,
        leftRank: null,
        rightRank: 8,
        higherIsBetter: true,
        comparison: "missing",
      })
    ).toEqual({ side: "none", magnitude: 0, basis: "none" });

    expect(
      buildComparisonRailModel({
        leftValue: 5,
        rightValue: 6,
        leftRank: 10,
        rightRank: 11,
        higherIsBetter: null,
        comparison: "not-comparable",
      }).side
    ).toBe("none");
  });

  it("keeps a real but tiny lead visible with the minimum magnitude", () => {
    const model = buildComparisonRailModel({
      leftValue: 0.121,
      rightValue: 0.12,
      leftRank: 14,
      rightRank: 15,
      higherIsBetter: true,
      comparison: "away",
    });
    expect(model.side).toBe("left");
    expect(model.magnitude).toBe(MIN_ADVANTAGE_MAGNITUDE);
  });

  it("falls back to a proportional value difference when ranks are absent", () => {
    const model = buildComparisonRailModel({
      leftValue: 30,
      rightValue: 10,
      leftRank: null,
      rightRank: null,
      higherIsBetter: true,
    });
    expect(model.side).toBe("left");
    expect(model.basis).toBe("value");
    expect(model.magnitude).toBeCloseTo(20 / 40, 5);
  });

  it("treats a negligible value-only difference as even", () => {
    const model = buildComparisonRailModel({
      leftValue: 100.01,
      rightValue: 100,
      leftRank: null,
      rightRank: null,
      higherIsBetter: true,
    });
    expect(model.side).toBe("even");
  });
});

describe("deriveMetricComparisonFromRanks", () => {
  it("gives the asymmetric pair to the better (lower) league rank on the left", () => {
    // Pass Block Win Rate #13 vs opposing Pass Rush Win Rate #25.
    expect(deriveMetricComparisonFromRanks(13, 25)).toBe("away");
  });

  it("gives it to the right side when that rank is better", () => {
    expect(deriveMetricComparisonFromRanks(20, 7)).toBe("home");
  });

  it("reports an effective tie when the two ranks are equal", () => {
    expect(deriveMetricComparisonFromRanks(11, 11)).toBe("tie");
  });

  it("refuses to compare when either rank is missing or non-finite", () => {
    expect(deriveMetricComparisonFromRanks(5, null)).toBe("not-comparable");
    expect(deriveMetricComparisonFromRanks(null, 8)).toBe("not-comparable");
    expect(deriveMetricComparisonFromRanks(null, null)).toBe("not-comparable");
    expect(deriveMetricComparisonFromRanks(Number.NaN, 4)).toBe("not-comparable");
  });

  it("feeds a rank-basis rail when passed straight into the rail model", () => {
    const comparison = deriveMetricComparisonFromRanks(13, 25);
    const model = buildComparisonRailModel({
      leftValue: null,
      rightValue: null,
      leftRank: 13,
      rightRank: 25,
      higherIsBetter: true,
      comparison,
    });
    expect(model.side).toBe("left");
    expect(model.basis).toBe("rank");
  });
});
