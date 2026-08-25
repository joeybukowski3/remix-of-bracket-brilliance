import type { NflQbPassingFeatureRow } from "./types/qbPassingFeatures";
import { coalesceWindow } from "./qbOpportunityEncoding";

export type NflPassingBaselineConstants = {
  leagueMeanPassingYards: number;
  leagueMeanYardsPerAttempt: number;
};

export function computePassingBaselineConstants(trainRows: readonly NflQbPassingFeatureRow[]): NflPassingBaselineConstants {
  const yards = trainRows.map((r) => r.target.primaryQbPassingYards);
  const leagueMeanPassingYards = yards.length > 0 ? yards.reduce((s, v) => s + v, 0) / yards.length : 0;
  const ypaValues = trainRows
    .map((r) => coalesceWindow(r.features.qbEfficiency.yardsPerAttempt))
    .filter((v): v is number => v != null);
  const leagueMeanYardsPerAttempt = ypaValues.length > 0 ? ypaValues.reduce((s, v) => s + v, 0) / ypaValues.length : 7;
  return { leagueMeanPassingYards, leagueMeanYardsPerAttempt };
}

/** Baseline A: TRAIN-only league mean passing yards for every row. */
export function predictPassingBaselineA(row: NflQbPassingFeatureRow, constants: NflPassingBaselineConstants): number {
  return constants.leagueMeanPassingYards;
}

/** Baseline B: this QB's own rolling passing-yards-per-game (seasonPrior -> priorSeason -> league mean). */
export function predictPassingBaselineB(row: NflQbPassingFeatureRow, constants: NflPassingBaselineConstants): number {
  const rolling = coalesceWindow(row.features.qbRollingPassingYardsPerGame);
  return rolling ?? constants.leagueMeanPassingYards;
}

/**
 * Shrinks a small-sample rate toward the league mean.
 * `weight` is the sample size backing `sampleValue` (here: prior games
 * started, a proxy for attempts volume). `priorStrength` is a FIXED,
 * pre-registered constant (never tuned against any holdout) expressing
 * "how many games' worth of league-average signal to blend in."
 */
export function shrinkTowardLeagueMean(sampleValue: number, weight: number, leagueMean: number, priorStrength: number): number {
  return (weight * sampleValue + priorStrength * leagueMean) / (weight + priorStrength);
}

export const YPA_SHRINKAGE_PRIOR_STRENGTH_GAMES = 4;

/** projectedYPA: seasonPrior->priorSeason coalesced YPA, shrunk toward the league mean YPA using games-started as the sample-size proxy. */
export function projectYpa(row: NflQbPassingFeatureRow, constants: NflPassingBaselineConstants): number {
  const rawYpa = coalesceWindow(row.features.qbEfficiency.yardsPerAttempt);
  if (rawYpa == null) return constants.leagueMeanYardsPerAttempt;
  const games = row.diagnostics.gamesStartedPriorThisSeason || (row.diagnostics.hasPriorSeasonStarts ? 1 : 0);
  return shrinkTowardLeagueMean(rawYpa, games, constants.leagueMeanYardsPerAttempt, YPA_SHRINKAGE_PRIOR_STRENGTH_GAMES);
}

/** projectedAttempts: this QB's own rolling attempts (seasonPrior -> priorSeason), the same simple rolling-mean signal Phase 3 established as competitive with its own ridge model. */
export function projectAttempts(row: NflQbPassingFeatureRow, fallbackAttempts: number): number {
  return coalesceWindow(row.features.opportunity.qbAttemptsPerGame) ?? fallbackAttempts;
}

/** Baseline C: projectedAttempts x projectedYPA (shrunk). Reports each leg's error contribution via the returned components. */
export function predictPassingBaselineC(
  row: NflQbPassingFeatureRow,
  constants: NflPassingBaselineConstants,
  fallbackAttempts: number,
): { predicted: number; projectedAttempts: number; projectedYpa: number } {
  const attempts = projectAttempts(row, fallbackAttempts);
  const ypa = projectYpa(row, constants);
  return { predicted: attempts * ypa, projectedAttempts: attempts, projectedYpa: ypa };
}
