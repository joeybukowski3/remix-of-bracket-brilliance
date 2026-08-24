import { MAX_CONNECTIVITY_MULTIPLIER, STALENESS_RELIABILITY_GAMES_K } from "../phase8/config";
import { PHASE9_FINALIST_SPEC, PHASE9_TEST_SEASONS } from "./config";
import { PHASE9_CALIBRATION_CONFIG } from "./pipeline";

/**
 * Section 24 — full explicit config snapshot for the frozen production
 * candidate. Every value here is a plain literal copied from the frozen
 * Phase 8/9 research config modules (never a live/mutable production
 * constant — Section 24's explicit prohibition).
 */
export function buildProductionCandidateConfigSnapshot() {
  return {
    ratingFoundation: {
      coreMetrics: ["ypp", "ppp"],
      aggregation: "gameWeighted",
      garbageTimeFilter: "NONE",
      opponentAdjustment: "RIDGE_PRIOR_CENTERED",
      connectivity: {
        policy: PHASE9_FINALIST_SPEC.connectivity,
        baseLambda: PHASE9_FINALIST_SPEC.baseLambda,
        multiplierFormula: "baseLambda * clamp(COMPONENT_SIZE_K / max(componentSize, 1), 1, MAX_CONNECTIVITY_MULTIPLIER)",
        multiplierCap: MAX_CONNECTIVITY_MULTIPLIER,
      },
      staleness: {
        policy: PHASE9_FINALIST_SPEC.staleness,
        note: "Rejected in Phase 8 — not part of the frozen production candidate. reliabilityGamesK retained here only for provenance.",
        reliabilityGamesK: STALENESS_RELIABILITY_GAMES_K,
      },
      preseasonPrior: {
        featureSet: "PRIOR_D",
        offenseFeatures: ["prevSeasonOffense", "returningProductionOffense", "talent"],
        defenseFeatures: ["prevSeasonDefense", "talent"],
        fallbackHierarchy: "downward-only from requested tier to LEAGUE_MEAN (Phase 3 Section 9)",
        priorRidgeLambda: 3,
      },
    },
    scoringArchitecture: {
      hfa: "NATIONAL",
      scoringEnvironment: "BLENDED_CURRENT",
      pace: "NONE",
      secondaryBlock: ["SUCCESS"],
      scoringRidgeLambda: 2,
      priorGamesWeight: 8,
    },
    totalCalibration: {
      scoreCalibrationMode: PHASE9_CALIBRATION_CONFIG.scoreCalibrationMode,
      totalCalibrationMethod: PHASE9_CALIBRATION_CONFIG.totalCalibrationMethod,
      preservesRawMargin: true,
    },
    probability: {
      distributionFamily: PHASE9_CALIBRATION_CONFIG.distributionFamily,
      heteroskedastic: PHASE9_CALIBRATION_CONFIG.heteroskedastic,
      simulationSeed: PHASE9_CALIBRATION_CONFIG.simulationSeed,
      simulationDraws: PHASE9_CALIBRATION_CONFIG.simulationDraws,
    },
    evaluationPeriod: { testSeasons: [...PHASE9_TEST_SEASONS] },
    explicitlyRejectedFromPhase8: ["GAMES_PLAYED", "CROSS_CONFERENCE", "COMBINED_INFORMATION", "ADAPTIVE_STALENESS_DECAY", "QB_CONTINUITY_RATING_INPUT", "TRANSFER_NET_COUNT"],
  };
}
