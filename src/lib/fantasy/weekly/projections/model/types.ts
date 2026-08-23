import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { WeeklyFantasyProjectionTrainingRow } from "../contract";

/**
 * Phase 2 weekly fantasy point projection research types. Nothing here is a
 * production artifact; everything under `model/` is model-selection research
 * that must obey the frozen 2023/2024/2025 split (see `../splitAuthority.ts`).
 */

export const PROJECTION_MODEL_RESEARCH_VERSION = "weekly-projection-model-research-v1" as const;

export type Row = WeeklyFantasyProjectionTrainingRow;

/** A single scalar feature read from a training row, with an explicit missingness policy. */
export type FeatureKey =
  // Baseline / shrinkage terms
  | "priorSeasonPpg"
  | "seasonPpgPrior"
  | "last3PpgPrior"
  | "last5PpgPrior"
  | "gamesPlayedPrior"
  | "weeksSinceLastAppearance"
  | "teamChangedFromPriorSeason"
  | "homeAway"
  | "restDays"
  | "shortWeek"
  | "byeReturn"
  // QB usage
  | "passAttemptsSeasonPrior"
  | "passAttemptsLast3"
  | "passingYardsSeasonPrior"
  | "passingTdsSeasonPrior"
  | "interceptionsSeasonPrior"
  | "carriesSeasonPrior"
  | "rushingYardsSeasonPrior"
  | "rushingTdsSeasonPrior"
  // RB usage
  | "carriesLast3"
  | "targetsSeasonPrior"
  | "targetsLast3"
  | "receptionsSeasonPrior"
  | "rushYardsSeasonPrior"
  | "receivingYardsSeasonPrior"
  | "targetShareSeasonPrior"
  // WR/TE usage
  | "receivingAirYardsSeasonPrior"
  | "airYardsShareSeasonPrior"
  // Snap usage
  | "snapShareSeasonPrior"
  | "snapShareLast3"
  // Team context
  | "teamOffensiveEpaPrior"
  | "teamPassEpaPrior"
  | "teamRushEpaPrior"
  | "teamOffensivePlaysPrior"
  | "teamPassRatePrior"
  // Opponent context
  | "opponentDefensiveEpaPrior"
  | "opponentPassDefenseEpaPrior"
  | "opponentRushDefenseEpaPrior"
  // FPA
  | "opponentPositionFpaPrior"
  | "opponentPositionFpaPriorSeason";

/** Named, ordered feature groupings used for both the model feature list and the section-12 ablation ladder. */
export type FeatureBlockName =
  | "baseline"
  | "usage"
  | "teamContext"
  | "opponentContext"
  | "fpa"
  | "snapUsage";

export type FeatureBlock = {
  name: FeatureBlockName;
  features: readonly FeatureKey[];
};

export type ModelFamily =
  | "deterministic-shrinkage-baseline"
  | "residual-ridge"
  | "residual-elastic-net"
  | "direct-ridge";

export type EvaluationPopulation = "full-universe" | "projection-candidate";

export type SeasonSegmentName = "weeks-1-3" | "weeks-4-8" | "weeks-9-plus";
export type HistorySegmentName = "prior-history" | "rookie-no-prior";
export type UsageSegmentName = "established-usage" | "low-usage" | "usage-unknown";

/** All segment axes are pregame-known and deterministic; never derived from target-week participation. */
export type SegmentKey = {
  season: SeasonSegmentName;
  history: HistorySegmentName;
  usage: UsageSegmentName;
};

export type PointAccuracyMetrics = {
  rows: number;
  scoredRows: number;
  coverage: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null; // signed mean error: mean(predicted - actual)
  medianAbsoluteError: number | null;
  pearson: number | null;
};

export type CalibrationBucket = {
  bucketLabel: string;
  bucketMinProjected: number;
  bucketMaxProjected: number;
  rows: number;
  meanProjected: number | null;
  meanActual: number | null;
};

export type RankingSecondaryMetrics = {
  spearman: number | null;
  kendall: number | null;
  topTierHitRate: number | null;
  topTierThreshold: number;
};

export type CandidateEvaluation = {
  family: ModelFamily;
  featureBlocks: readonly FeatureBlockName[];
  hyperparameter: number | null; // ridge/elastic-net alpha, or null for non-tuned families
  l1Ratio: number | null; // elastic net only
  validation: PointAccuracyMetrics;
  calibration: readonly CalibrationBucket[];
  ranking: RankingSecondaryMetrics;
};

export type PromotionDecision = {
  promoted: boolean;
  reasons: readonly string[];
};

/** The frozen, immutable Phase-2 modeling decision for one position, written before any 2025 access. */
export type FrozenPositionSpec = {
  position: FantasyPosition;
  frozenAt: string; // ISO timestamp
  specHash: string; // sha256 of the canonical JSON below, used to detect any post-freeze mutation
  baselineAuthority: BaselineAuthorityName;
  selectedFamily: ModelFamily;
  selectedFeatureBlocks: readonly FeatureBlockName[];
  selectedFeatures: readonly FeatureKey[];
  hyperparameter: number | null;
  l1Ratio: number | null;
  shrinkageK: number;
  candidatePopulationPolicy: EvaluationPopulation;
  rookieFallback: RookieFallbackPolicy;
  promotionDecision: PromotionDecision;
};

export type BaselineAuthorityName =
  | "prior-season-ppg"
  | "season-ppg-prior"
  | "last3-ppg-prior"
  | "last5-ppg-prior"
  | "shrinkage-blend"
  | "position-mean-naive"
  | "hard-2-game-transition";

/** Deterministic, pre-registered rookie/no-prior-history fallback: population mean computed ONLY from training (2023) rows. */
export type RookieFallbackPolicy = {
  positionMeanPpgFromTraining: number;
  appliesWhen: "rookieOrNoPriorHistory === true and no shrinkage input is available";
};

export type FittedScaler = {
  feature: FeatureKey;
  mean: number;
  scale: number;
  missingRateInTraining: number;
  hasMissingIndicator: boolean;
};
