import type { CpuStrategyProfile, FantasyPosition } from "../types";

export const SIXTEEN_ZERO_DATA_VERSION = "fantasy-2026-v2";
export const SIXTEEN_ZERO_ENGINE_VERSION = "16-0-engine-v8";

export const LEAGUE_CONFIG = {
  teams: 12,
  rounds: 17,
  regularSeasonWeeks: 14,
  rosterSize: 17,
  starters: {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    FLEX: 1,
    K: 1,
    DST: 1,
  },
  rosterRequirements: {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    flexEligible: 6,
    K: 2,
    DST: 2,
  },
} as const;

export const ROSTER_SOFT_MAXIMUMS: Record<FantasyPosition, number> = {
  QB: 3,
  RB: 8,
  WR: 8,
  TE: 4,
  K: 2,
  DST: 2,
};

export const CPU_STRATEGIES: CpuStrategyProfile[] = [
  "balanced",
  "rb-heavy",
  "wr-heavy",
  "early-qb",
  "elite-te",
  "best-player-available",
  "zero-rb",
  "late-qb",
  "value-drafter",
];

export const CPU_DRAFT_WEIGHTS = {
  consensus: 0.45,
  projection: 0.25,
  positionalNeed: 0.15,
  strategy: 0.08,
  rosterConstruction: 0.07,
  randomness: 0.07,
} as const;

export const MATCHUP_MULTIPLIERS = {
  easiest: 1.07,
  easy: 1.04,
  favorable: 1.02,
  neutral: 1,
  difficult: 0.98,
  hard: 0.96,
  hardest: 0.93,
} as const;

export const POSITION_VOLATILITY: Record<FantasyPosition, number> = {
  QB: 0.24,
  RB: 0.34,
  WR: 0.42,
  TE: 0.44,
  K: 0.5,
  DST: 0.58,
};

/**
 * CPU opponents are drafted rosters, not a synthetic score distribution.
 * Regular-season and playoff opponents are simulated with the same
 * matchup-adjusted lineup optimizer and player-level scoring engine used for
 * the user roster (see seasonSimulation.ts and rosterStrength.ts).
 *
 * The values below only translate a CPU roster's precomputed, projection-based
 * strength into a plausible weekly win probability for synthetic
 * standings/seeding purposes. They are bounds, not targets: they are not
 * tuned to hit any desired qualification, championship, or 16-0 rate.
 */
export const CPU_STANDINGS_CONFIG = {
  winProbabilitySlope: 0.12,
  minimumWeeklyWinProbability: 0.15,
  maximumWeeklyWinProbability: 0.85,
  averageScoreNoiseStandardDeviation: 4,
} as const;

/** Minimum regular-season wins required to hold a top-two seed / Week 15 bye. */
export const MINIMUM_BYE_WINS = 10;
