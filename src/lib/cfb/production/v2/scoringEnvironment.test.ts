import { describe, expect, it } from "vitest";
import { estimateCfbV2ScoringEnvironment } from "./scoringEnvironment";
import { estimateScoringEnvironment } from "../../research/phase4/scoringEnvironment";
import { PHASE4_FINALIST_SCORING_CONFIG } from "../../research/phase8/phase8WalkForward";

describe("estimateCfbV2ScoringEnvironment (§7 BLENDED_CURRENT)", () => {
  it("returns previousSeasonMean unchanged at zero current-season games", () => {
    expect(estimateCfbV2ScoringEnvironment({ allPriorSeasonsMean: 20, previousSeasonMean: 27.5, currentSeasonSoFarMean: null, currentSeasonGamesSoFar: 0 }, 8)).toBe(27.5);
  });

  it("returns null when neither prior nor current data exists (never fabricated)", () => {
    expect(estimateCfbV2ScoringEnvironment({ allPriorSeasonsMean: null, previousSeasonMean: null, currentSeasonSoFarMean: null, currentSeasonGamesSoFar: 0 }, 8)).toBeNull();
  });

  it("blends precision-weighted as current-season games accrue", () => {
    const result = estimateCfbV2ScoringEnvironment({ allPriorSeasonsMean: 20, previousSeasonMean: 26, currentSeasonSoFarMean: 30, currentSeasonGamesSoFar: 8 }, 8);
    expect(result).toBeCloseTo((8 * 26 + 8 * 30) / 16, 9);
  });

  it("matches research/phase4/scoringEnvironment.ts's BLENDED_CURRENT branch exactly at representative inputs", () => {
    const cases = [
      { allPriorSeasonsMean: 20, previousSeasonMean: 27.2, currentSeasonSoFarMean: null, currentSeasonGamesSoFar: 0 },
      { allPriorSeasonsMean: 20, previousSeasonMean: 27.2, currentSeasonSoFarMean: 24.1, currentSeasonGamesSoFar: 3 },
      { allPriorSeasonsMean: 20, previousSeasonMean: 27.2, currentSeasonSoFarMean: 31.9, currentSeasonGamesSoFar: 40 },
      { allPriorSeasonsMean: null, previousSeasonMean: null, currentSeasonSoFarMean: 25, currentSeasonGamesSoFar: 5 },
    ];
    for (const inputs of cases) {
      const production = estimateCfbV2ScoringEnvironment(inputs, PHASE4_FINALIST_SCORING_CONFIG.priorGamesWeight);
      const research = estimateScoringEnvironment(inputs, PHASE4_FINALIST_SCORING_CONFIG.scoringEnvironment, PHASE4_FINALIST_SCORING_CONFIG.priorGamesWeight);
      expect(production).toBe(research);
    }
  });
});
