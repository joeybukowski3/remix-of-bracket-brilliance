import { describe, expect, it } from "vitest";
import { estimateScoringEnvironment } from "./scoringEnvironment";

describe("estimateScoringEnvironment", () => {
  const inputs = {
    allPriorSeasonsMean: 27,
    previousSeasonMean: 29,
    currentSeasonSoFarMean: 33,
    currentSeasonGamesSoFar: 10,
  };

  it("STATIC_HISTORICAL uses the pooled all-prior-seasons mean", () => {
    expect(estimateScoringEnvironment(inputs, "STATIC_HISTORICAL", 8)).toBe(27);
  });

  it("PREVIOUS_SEASON uses only last season's mean", () => {
    expect(estimateScoringEnvironment(inputs, "PREVIOUS_SEASON", 8)).toBe(29);
  });

  it("BLENDED_CURRENT blends previous-season and current-season-so-far via precision weighting", () => {
    const result = estimateScoringEnvironment(inputs, "BLENDED_CURRENT", 8);
    // (8*29 + 10*33) / 18
    expect(result).toBeCloseTo((8 * 29 + 10 * 33) / 18, 10);
  });

  it("BLENDED_CURRENT falls back to previous-season mean with 0 current-season games (week 1)", () => {
    const result = estimateScoringEnvironment({ ...inputs, currentSeasonSoFarMean: null, currentSeasonGamesSoFar: 0 }, "BLENDED_CURRENT", 8);
    expect(result).toBe(29);
  });

  it("returns null rather than fabricating a value when no relevant data exists", () => {
    expect(estimateScoringEnvironment({ allPriorSeasonsMean: null, previousSeasonMean: null, currentSeasonSoFarMean: null, currentSeasonGamesSoFar: 0 }, "STATIC_HISTORICAL", 8)).toBeNull();
  });
});
