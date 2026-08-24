import { describe, expect, it } from "vitest";
import {
  CFB_V2_CALIBRATION_CONFIG,
  CFB_V2_CONFIG_VERSION,
  CFB_V2_CONNECTIVITY_CONFIG,
  CFB_V2_FROZEN_CONFIG,
  CFB_V2_PROBABILITY_CONFIG,
  CFB_V2_RATING_CONFIG,
  CFB_V2_SCORING_CONFIG,
  CfbV2ConfigValidationError,
  validateCfbV2Config,
} from "./config";
import { buildProductionCandidateConfigSnapshot } from "../../research/phase9/productionCandidateConfig";

describe("CFB_V2_FROZEN_CONFIG — production drift guard (§20)", () => {
  it("locks the exact frozen values — any diff here means someone changed the production spec", () => {
    expect(CFB_V2_FROZEN_CONFIG).toEqual({
      rating: {
        coreMetrics: ["ypp", "ppp"],
        aggregation: "gameWeighted",
        garbageTimeFilter: "NONE",
        opponentAdjustment: "RIDGE_PRIOR_CENTERED",
        connectivity: {
          policy: "COMPONENT_SIZE",
          baseLambda: 10,
          componentSizeK: 20,
          maxPenaltyMultiplier: 3,
          multiplierFormula: "baseLambda * clamp(componentSizeK / max(componentSize, 1), 1, maxPenaltyMultiplier)",
        },
        preseasonPrior: {
          featureSet: "PRIOR_D",
          offenseFeatures: ["prevSeasonOffense", "returningProductionOffense", "talent"],
          defenseFeatures: ["prevSeasonDefense", "talent"],
          fallbackHierarchy: {
            offense: ["PRIOR_D", "PRIOR_C", "PRIOR_A", "LEAGUE_MEAN"],
            defense: ["PRIOR_D", "PRIOR_C", "PRIOR_A", "LEAGUE_MEAN"],
          },
          priorRidgeLambda: 3,
        },
      },
      scoring: {
        hfa: "NATIONAL",
        scoringEnvironment: "BLENDED_CURRENT",
        pace: "NONE",
        secondaryBlock: ["SUCCESS"],
        scoringRidgeLambda: 2,
        priorGamesWeight: 8,
      },
      calibration: {
        method: "TOTAL_ONLY_LINEAR",
        scoreCalibrationMode: "TOTAL_ONLY",
        totalCalibrationMethod: "LINEAR",
        preservesRawMargin: true,
      },
      probability: {
        method: "EMPIRICAL_RESIDUAL_BOOTSTRAP",
        seed: 20260101,
        drawCount: 20000,
        residualPooling: "EMPIRICAL_POOLED",
        varianceTreatment: "HOMOSKEDASTIC",
      },
    });
  });

  it("every config object is frozen (immutability guard)", () => {
    expect(Object.isFrozen(CFB_V2_RATING_CONFIG)).toBe(true);
    expect(Object.isFrozen(CFB_V2_RATING_CONFIG.connectivity)).toBe(true);
    expect(Object.isFrozen(CFB_V2_RATING_CONFIG.preseasonPrior)).toBe(true);
    expect(Object.isFrozen(CFB_V2_SCORING_CONFIG)).toBe(true);
    expect(Object.isFrozen(CFB_V2_CALIBRATION_CONFIG)).toBe(true);
    expect(Object.isFrozen(CFB_V2_PROBABILITY_CONFIG)).toBe(true);
  });

  it("computes a stable, non-empty configVersion hash", () => {
    expect(CFB_V2_CONFIG_VERSION).toMatch(/^cfb-v2-config-[0-9a-f]{8}$/);
  });
});

describe("CFB_V2_FROZEN_CONFIG parity with Phase 9's validated production-candidate snapshot", () => {
  const research = buildProductionCandidateConfigSnapshot();

  it("rating foundation matches Phase 9 exactly", () => {
    expect(CFB_V2_RATING_CONFIG.coreMetrics).toEqual(research.ratingFoundation.coreMetrics);
    expect(CFB_V2_RATING_CONFIG.aggregation).toBe(research.ratingFoundation.aggregation);
    expect(CFB_V2_RATING_CONFIG.garbageTimeFilter).toBe(research.ratingFoundation.garbageTimeFilter);
    expect(CFB_V2_CONNECTIVITY_CONFIG.policy).toBe(research.ratingFoundation.connectivity.policy);
    expect(CFB_V2_CONNECTIVITY_CONFIG.baseLambda).toBe(research.ratingFoundation.connectivity.baseLambda);
    expect(CFB_V2_CONNECTIVITY_CONFIG.maxPenaltyMultiplier).toBe(research.ratingFoundation.connectivity.multiplierCap);
    expect(CFB_V2_RATING_CONFIG.preseasonPrior.featureSet).toBe(research.ratingFoundation.preseasonPrior.featureSet);
    expect(CFB_V2_RATING_CONFIG.preseasonPrior.offenseFeatures).toEqual(research.ratingFoundation.preseasonPrior.offenseFeatures);
    expect(CFB_V2_RATING_CONFIG.preseasonPrior.defenseFeatures).toEqual(research.ratingFoundation.preseasonPrior.defenseFeatures);
    expect(CFB_V2_RATING_CONFIG.preseasonPrior.priorRidgeLambda).toBe(research.ratingFoundation.preseasonPrior.priorRidgeLambda);
  });

  it("scoring architecture matches Phase 9 exactly", () => {
    expect(CFB_V2_SCORING_CONFIG.hfa).toBe(research.scoringArchitecture.hfa);
    expect(CFB_V2_SCORING_CONFIG.scoringEnvironment).toBe(research.scoringArchitecture.scoringEnvironment);
    expect(CFB_V2_SCORING_CONFIG.pace).toBe(research.scoringArchitecture.pace);
    expect(CFB_V2_SCORING_CONFIG.secondaryBlock).toEqual(research.scoringArchitecture.secondaryBlock);
    expect(CFB_V2_SCORING_CONFIG.scoringRidgeLambda).toBe(research.scoringArchitecture.scoringRidgeLambda);
    expect(CFB_V2_SCORING_CONFIG.priorGamesWeight).toBe(research.scoringArchitecture.priorGamesWeight);
  });

  it("calibration matches Phase 9 exactly", () => {
    expect(CFB_V2_CALIBRATION_CONFIG.scoreCalibrationMode).toBe(research.totalCalibration.scoreCalibrationMode);
    expect(CFB_V2_CALIBRATION_CONFIG.totalCalibrationMethod).toBe(research.totalCalibration.totalCalibrationMethod);
    expect(CFB_V2_CALIBRATION_CONFIG.preservesRawMargin).toBe(research.totalCalibration.preservesRawMargin);
  });

  it("probability matches Phase 9 exactly", () => {
    expect(CFB_V2_PROBABILITY_CONFIG.seed).toBe(research.probability.simulationSeed);
    expect(CFB_V2_PROBABILITY_CONFIG.drawCount).toBe(research.probability.simulationDraws);
    expect(CFB_V2_PROBABILITY_CONFIG.varianceTreatment).toBe(research.probability.heteroskedastic ? "HETEROSKEDASTIC" : "HOMOSKEDASTIC");
  });
});

describe("validateCfbV2Config", () => {
  const valid = { rating: CFB_V2_RATING_CONFIG, scoring: CFB_V2_SCORING_CONFIG, probability: CFB_V2_PROBABILITY_CONFIG };

  it("does not throw for the frozen production config", () => {
    expect(() => validateCfbV2Config()).not.toThrow();
    expect(() => validateCfbV2Config(valid)).not.toThrow();
  });

  it("rejects non-positive baseLambda", () => {
    const mutated = { ...valid, rating: { ...valid.rating, connectivity: { ...valid.rating.connectivity, baseLambda: 0 } } };
    expect(() => validateCfbV2Config(mutated)).toThrow(CfbV2ConfigValidationError);
  });

  it("rejects maxPenaltyMultiplier below 1", () => {
    const mutated = { ...valid, rating: { ...valid.rating, connectivity: { ...valid.rating.connectivity, maxPenaltyMultiplier: 0.5 } } };
    expect(() => validateCfbV2Config(mutated)).toThrow(/maxPenaltyMultiplier/);
  });

  it("rejects a non-zero-but-invalid componentSizeK", () => {
    const mutated = { ...valid, rating: { ...valid.rating, connectivity: { ...valid.rating.connectivity, componentSizeK: -5 } } };
    expect(() => validateCfbV2Config(mutated)).toThrow(/componentSizeK/);
  });

  it("rejects an unsupported connectivity policy", () => {
    const mutated = {
      ...valid,
      rating: { ...valid.rating, connectivity: { ...valid.rating.connectivity, policy: "GAMES_PLAYED" as never } },
    };
    expect(() => validateCfbV2Config(mutated)).toThrow(/unsupported connectivity policy/);
  });

  it("rejects non-positive drawCount", () => {
    const mutated = { ...valid, probability: { ...valid.probability, drawCount: 0 } };
    expect(() => validateCfbV2Config(mutated)).toThrow(/drawCount/);
  });

  it("rejects a non-finite seed", () => {
    const mutated = { ...valid, probability: { ...valid.probability, seed: NaN } };
    expect(() => validateCfbV2Config(mutated)).toThrow(/seed/);
  });

  it("rejects non-positive priorRidgeLambda", () => {
    const mutated = {
      ...valid,
      rating: { ...valid.rating, preseasonPrior: { ...valid.rating.preseasonPrior, priorRidgeLambda: 0 } },
    };
    expect(() => validateCfbV2Config(mutated)).toThrow(/priorRidgeLambda/);
  });

  it("rejects non-positive scoringRidgeLambda", () => {
    const mutated = { ...valid, scoring: { ...valid.scoring, scoringRidgeLambda: 0 } };
    expect(() => validateCfbV2Config(mutated)).toThrow(/scoringRidgeLambda/);
  });

  it("rejects non-positive priorGamesWeight", () => {
    const mutated = { ...valid, scoring: { ...valid.scoring, priorGamesWeight: 0 } };
    expect(() => validateCfbV2Config(mutated)).toThrow(/priorGamesWeight/);
  });
});
