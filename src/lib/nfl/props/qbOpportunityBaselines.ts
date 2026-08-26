import type { NflQbOpportunityFeatureRow } from "./types/qbOpportunityFeatures";
import { coalesceWindow } from "./qbOpportunityEncoding";

/**
 * Baseline A/B/C: deterministic, no fitting beyond a handful of TRAIN-only
 * constants computed once. None of these choose a weight from holdout
 * performance.
 */
export type NflBaselineConstants = {
  /** League mean primaryQbAttempts over TRAIN rows -- Baseline A, and the final fallback for B/C. */
  leagueMeanAttempts: number;
};

export function computeBaselineConstants(trainRows: readonly NflQbOpportunityFeatureRow[]): NflBaselineConstants {
  const values = trainRows.map((r) => r.target.primaryQbAttempts);
  const leagueMeanAttempts = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  return { leagueMeanAttempts };
}

/** Baseline A: the TRAIN-only league mean, for every row. */
export function predictBaselineA(row: NflQbOpportunityFeatureRow, constants: NflBaselineConstants): number {
  return constants.leagueMeanAttempts;
}

/**
 * Baseline B: this QB's own rolling mean attempts (seasonPrior -> priorSeason
 * -> league mean, in that order), and separately his last3 mean substituted
 * for seasonPrior when only that is available. Uses the exact same
 * coalesce policy as the ridge design matrix (see qbOpportunityEncoding.ts).
 */
export function predictBaselineB(row: NflQbOpportunityFeatureRow, constants: NflBaselineConstants): number {
  const seasonOrPrior = coalesceWindow({
    seasonPrior: row.features.qbRole.attemptsPerGameSeasonPrior,
    priorSeason: row.features.qbRole.attemptsPerGamePriorSeason,
  });
  return seasonOrPrior ?? constants.leagueMeanAttempts;
}

/**
 * Baseline C: transparent football decomposition --
 * `team expected plays x team expected dropback rate x QB share`.
 * Each component is the same seasonPrior->priorSeason coalesce used
 * elsewhere; no hand-tuned weight is introduced. QB share is this QB's own
 * attempts-per-game divided by the team's own pass-attempts-per-game over
 * the same coalesced window (both already leakage-safe pregame features).
 */
export function predictBaselineC(row: NflQbOpportunityFeatureRow, constants: NflBaselineConstants): number {
  const teamPlays = coalesceWindow(row.features.teamVolume.offensivePlaysPerGame);
  const dropbackRate = coalesceWindow(row.features.passTendency.overallDropbackRate);
  const teamPassAttempts = coalesceWindow(row.features.teamVolume.passAttemptsPerGame);
  const qbAttempts = coalesceWindow({
    seasonPrior: row.features.qbRole.attemptsPerGameSeasonPrior,
    priorSeason: row.features.qbRole.attemptsPerGamePriorSeason,
  });

  if (teamPlays == null || dropbackRate == null) return predictBaselineB(row, constants);

  const expectedTeamDropbacks = teamPlays * dropbackRate;
  const qbShare = teamPassAttempts != null && teamPassAttempts > 0 && qbAttempts != null
    ? Math.min(1, qbAttempts / teamPassAttempts)
    : null;

  if (qbShare == null) return expectedTeamDropbacks > 0 ? expectedTeamDropbacks : predictBaselineB(row, constants);
  return expectedTeamDropbacks * qbShare;
}
