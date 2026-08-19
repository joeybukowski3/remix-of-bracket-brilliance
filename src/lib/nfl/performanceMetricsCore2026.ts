/**
 * Performance Rating engine (Phase 5) — pure metric derivation.
 *
 * Computes ALL 9 offense + 9 defense candidate metrics from the 2026
 * Performance Model Backtest (2023-2025 nflverse play-by-play, validated
 * exactly against the production EPA cache — see
 * scripts/analysis/nfl-performance-backtest/). This module is framework-free
 * and never fetches: like currentRating2026.ts, it takes already-aggregated
 * per-team-window play sums (produced upstream by a data pipeline, the same
 * shape scripts/analysis/nfl-performance-backtest/lib/metrics-engine.mjs
 * emits) and returns derived rates. It is NOT wired into any consumer yet;
 * only performanceComposite2026.ts (Phase 5's other half) reads from it.
 *
 * Every metric is exposed here, even though the approved composite (see
 * performanceComposite2026.ts) consumes only 3 of the 9 per side — the rest
 * remain first-class outputs for future analytics/matchup/fantasy surfaces,
 * per the backtest's display-only recommendations.
 *
 * SUCCESS RATE is always the traditional down-and-distance definition
 * (40%/60%/100% by down), never nflfastR's EPA>0 `success` field — that is
 * kept only as the `epaPositiveRate` diagnostic, per the approved
 * methodology correction.
 */

/** Per-side play-level sums for one team over one window, one game-state variant. */
export type PerformancePlaySums = {
  offEpa: number;
  offPlays: number;
  successNum: number;
  successDen: number;
  /** nflfastR's own EPA>0 `success` field — diagnostic only, never canonical SR. */
  epaPosNum: number;
  epaPosDen: number;
  earlyEpa: number;
  earlyPlays: number;
  earlySuccessNum: number;
  earlySuccessDen: number;
  passEpa: number;
  passPlays: number;
  passSuccessNum: number;
  passSuccessDen: number;
  rushEpa: number;
  rushPlays: number;
  rushSuccessNum: number;
  rushSuccessDen: number;
  explosivePass: number;
  explosiveRush: number;
  thirdEpa: number;
  thirdPlays: number;
  thirdSuccessNum: number;
  thirdSuccessDen: number;
  /** Raw 3rd-down conversion diagnostic: yards_gained >= ydstogo proxy. */
  thirdRawConvNum: number;
  thirdRawConvDen: number;
  sacks: number;
  dropbacks: number;
};

export type PerformanceDriveSums = {
  drives: number;
  points: number;
};

/**
 * One team's window input: its own offensive play sums (unfiltered `all` and
 * garbage-time-`filtered`), the mirrored sums for opponents faced in the same
 * window (used to derive the 9 DEF "allowed" metrics), and drive totals for
 * both sides (Points/Drive is never game-state filtered — see
 * scripts/analysis/nfl-performance-backtest/lib/metrics-engine.mjs docblock).
 */
export type TeamPerformanceWindowInput = {
  team: string;
  gamesPlayed: number;
  offense: { all: PerformancePlaySums; filtered: PerformancePlaySums };
  defenseAllowed: { all: PerformancePlaySums; filtered: PerformancePlaySums };
  driveOff: PerformanceDriveSums;
  driveDefAllowed: PerformanceDriveSums;
};

const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

/** The 9 candidate rates derived from one side's play sums, plus diagnostics. */
export type PerformanceRateBundle = {
  epaPerPlay: number | null;
  successRate: number | null;
  /** Diagnostic only — nflfastR EPA>0, never the canonical Success Rate. */
  epaPositiveRate: number | null;
  earlyDownEpaPerPlay: number | null;
  earlyDownSuccessRate: number | null;
  passEpaPerDropback: number | null;
  passSuccessRate: number | null;
  rushEpaPerPlay: number | null;
  rushSuccessRate: number | null;
  explosiveRate: number | null;
  explosivePassCount: number;
  explosiveRushCount: number;
  thirdDownEpaPerPlay: number | null;
  thirdDownSuccessRate: number | null;
  /** Display diagnostic — raw 3rd-down conversion%, not a rating input. */
  thirdDownRawConversionRate: number | null;
  sackRate: number | null;
  offPlays: number;
  dropbacks: number;
};

export function deriveRateBundle(sums: PerformancePlaySums): PerformanceRateBundle {
  return {
    epaPerPlay: ratio(sums.offEpa, sums.offPlays),
    successRate: ratio(sums.successNum, sums.successDen),
    epaPositiveRate: ratio(sums.epaPosNum, sums.epaPosDen),
    earlyDownEpaPerPlay: ratio(sums.earlyEpa, sums.earlyPlays),
    earlyDownSuccessRate: ratio(sums.earlySuccessNum, sums.earlySuccessDen),
    passEpaPerDropback: ratio(sums.passEpa, sums.passPlays),
    passSuccessRate: ratio(sums.passSuccessNum, sums.passSuccessDen),
    rushEpaPerPlay: ratio(sums.rushEpa, sums.rushPlays),
    rushSuccessRate: ratio(sums.rushSuccessNum, sums.rushSuccessDen),
    explosiveRate: ratio(sums.explosivePass + sums.explosiveRush, sums.offPlays),
    explosivePassCount: sums.explosivePass,
    explosiveRushCount: sums.explosiveRush,
    thirdDownEpaPerPlay: ratio(sums.thirdEpa, sums.thirdPlays),
    thirdDownSuccessRate: ratio(sums.thirdSuccessNum, sums.thirdSuccessDen),
    thirdDownRawConversionRate: ratio(sums.thirdRawConvNum, sums.thirdRawConvDen),
    sackRate: ratio(sums.sacks, sums.dropbacks),
    offPlays: sums.offPlays,
    dropbacks: sums.dropbacks,
  };
}

/** All 9 offense + 9 defense metrics (both filter variants) plus Points/Drive for one team-window. */
export type TeamPerformanceMetrics = {
  team: string;
  gamesPlayed: number;
  offense: { all: PerformanceRateBundle; filtered: PerformanceRateBundle };
  defenseAllowed: { all: PerformanceRateBundle; filtered: PerformanceRateBundle };
  pointsPerDriveOff: number | null;
  pointsPerDriveAllowed: number | null;
};

export function deriveTeamPerformanceMetrics(input: TeamPerformanceWindowInput): TeamPerformanceMetrics {
  return {
    team: input.team,
    gamesPlayed: input.gamesPlayed,
    offense: {
      all: deriveRateBundle(input.offense.all),
      filtered: deriveRateBundle(input.offense.filtered),
    },
    defenseAllowed: {
      all: deriveRateBundle(input.defenseAllowed.all),
      filtered: deriveRateBundle(input.defenseAllowed.filtered),
    },
    pointsPerDriveOff: ratio(input.driveOff.points, input.driveOff.drives),
    pointsPerDriveAllowed: ratio(input.driveDefAllowed.points, input.driveDefAllowed.drives),
  };
}
