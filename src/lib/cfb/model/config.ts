/**
 * Centralized JKB College Football model configuration.
 *
 * NO MAGIC NUMBERS belong anywhere else in the model — every weight or scale
 * constant used by preseasonModel.ts / normalize.ts must be read from here.
 *
 * This config carries NO per-team values or exceptions. It applies uniformly
 * to all 138 FBS teams; see model/preseasonModel.test.ts for an automated
 * check that no team id ever appears inside this object.
 *
 * Weight provenance:
 * - offensiveBaseWeights / defensiveBaseWeights / powerBaseWeights are initial
 *   defaults chosen for architecture validation (roughly: prior performance is
 *   the dominant signal, returning production and QB continuity are secondary
 *   adjustments, offense and defense are weighted evenly into power). They are
 *   NOT fit to historical CFB outcomes yet — that calibration is future work
 *   once real prior-season and returning-production data is wired in (see the
 *   Phase 2A report's "remaining work" section).
 * - rosterTalentWeight and coachingContinuityWeight are reserved at 0 because
 *   no recruiting/portal/coaching dataset exists in the repo yet. The
 *   architecture supports them; enabling them requires only changing this
 *   config plus supplying CfbRosterTalentInputs / CfbCoachingContinuityInputs.
 */

export const CFB_MODEL_VERSION = "cfb-preseason-v0.1" as const;

export type CfbModelConfig = {
  version: typeof CFB_MODEL_VERSION;
  /** Weights for offensiveBase = f(priorPerformance, returningProduction, qbContinuity). Sum to 1. */
  offensiveBaseWeights: {
    priorPerformanceWeight: number;
    returningProductionWeight: number;
    quarterbackContinuityWeight: number;
  };
  /** Weights for defensiveBase = f(priorPerformance, returningProduction). Sum to 1. */
  defensiveBaseWeights: {
    priorPerformanceWeight: number;
    returningProductionWeight: number;
  };
  /** Weights combining offensiveBase + defensiveBase into powerBase. Sum to 1. */
  powerBaseWeights: {
    offensiveBaseWeight: number;
    defensiveBaseWeight: number;
  };
  /** Reserved, currently disabled (0) until a roster/talent data source exists. */
  rosterTalentWeight: number;
  /** Reserved, currently disabled (0) until a coaching-continuity data source exists. */
  coachingContinuityWeight: number;
  /** QB continuity bonus applied on top of returning-starter counts when a team returns its starter. */
  quarterbackContinuityBonus: {
    /** Added to the QB-continuity component (0-1 scale) when returningQuarterback === true. */
    returningStarterBonus: number;
    /** Applied when returningQuarterback === false. */
    newStarterPenalty: number;
  };
  normalization: {
    method: "percentile-rank";
    /** Display scale bounds teams are mapped onto after percentile normalization. */
    displayScale: { min: number; max: number };
  };
};

export const CFB_MODEL_CONFIG: CfbModelConfig = Object.freeze({
  version: CFB_MODEL_VERSION,
  offensiveBaseWeights: Object.freeze({
    priorPerformanceWeight: 0.6,
    returningProductionWeight: 0.25,
    quarterbackContinuityWeight: 0.15,
  }),
  defensiveBaseWeights: Object.freeze({
    priorPerformanceWeight: 0.7,
    returningProductionWeight: 0.3,
  }),
  powerBaseWeights: Object.freeze({
    offensiveBaseWeight: 0.5,
    defensiveBaseWeight: 0.5,
  }),
  rosterTalentWeight: 0,
  coachingContinuityWeight: 0,
  quarterbackContinuityBonus: Object.freeze({
    returningStarterBonus: 1,
    newStarterPenalty: -1,
  }),
  normalization: Object.freeze({
    method: "percentile-rank",
    displayScale: Object.freeze({ min: 40, max: 99 }),
  }),
}) as CfbModelConfig;

const OFFENSIVE_WEIGHT_SUM =
  CFB_MODEL_CONFIG.offensiveBaseWeights.priorPerformanceWeight +
  CFB_MODEL_CONFIG.offensiveBaseWeights.returningProductionWeight +
  CFB_MODEL_CONFIG.offensiveBaseWeights.quarterbackContinuityWeight;

const DEFENSIVE_WEIGHT_SUM =
  CFB_MODEL_CONFIG.defensiveBaseWeights.priorPerformanceWeight +
  CFB_MODEL_CONFIG.defensiveBaseWeights.returningProductionWeight;

const POWER_WEIGHT_SUM =
  CFB_MODEL_CONFIG.powerBaseWeights.offensiveBaseWeight +
  CFB_MODEL_CONFIG.powerBaseWeights.defensiveBaseWeight;

const WEIGHT_SUM_TOLERANCE = 1e-9;

function assertWeightSum(sum: number, label: string): void {
  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(`CFB_MODEL_CONFIG.${label} weights must sum to 1, got ${sum}`);
  }
}

assertWeightSum(OFFENSIVE_WEIGHT_SUM, "offensiveBaseWeights");
assertWeightSum(DEFENSIVE_WEIGHT_SUM, "defensiveBaseWeights");
assertWeightSum(POWER_WEIGHT_SUM, "powerBaseWeights");
