/**
 * Phase L -- leakage-safe exponentially-weighted (EWMA) team scoring window,
 * built to test whether it avoids the Phase K-documented variance
 * compression of the "current" (expanding season-to-date) window in
 * teamScoringFeatures.ts.
 *
 * WEIGHT EQUATION: for a team's strictly-prior games sorted most-recent-
 * first (index i = 0 for the newest eligible game, 1 for the next, ...),
 *   rawWeight_i = 0.5 ^ (i / halfLife)
 *   weight_i    = rawWeight_i / sum(rawWeight)
 * "gamesAgo" is a game-count index, not calendar time -- a half-life of 4
 * means the game 4 slots back carries exactly half the weight of the most
 * recent game (rawWeight ratio 0.5^(4/4) = 0.5^1 = 0.5 exactly).
 *
 * EFFECTIVE SAMPLE SIZE: the standard weighted-sum ESS formula,
 * 1 / sum(weight_i^2). A uniform 5-game window has ESS = 5; an EWMA whose
 * weights decay evenly has strictly smaller ESS than its raw game count,
 * quantifying how much of the pool is actually "counted."
 *
 * EARLY-SEASON / POOL RULE: unlike teamScoringFeatures.ts's "current"
 * window (which hard-cutovers to 100% current-season data after the
 * team's first game and drops prior-season data entirely), the EWMA pool
 * is simply "every strictly-prior game available in the scoring-support
 * cache," regardless of season boundary. Weeks with little or no
 * current-season history naturally lean on prior-season games because
 * those are the highest-weighted (most recent) games available -- there is
 * no separate blending rule to implement or tune; the same weight equation
 * handles Week 1 (100% prior-season pool) through Week 18 (mostly
 * current-season, with a small, quantified prior-season tail) uniformly.
 * `currentSeasonGamesUsed` / `priorSeasonGamesUsed` / `priorSeasonWeightSharePct`
 * make that tail's exact size visible per row rather than leaving it hidden.
 */
import type { NflTotalResearchCutoff, NflTotalResearchScoringSupportRow } from "./types";

export type EwmaWindowResult = {
  epaPerPlay: number | null;
  successRate: number | null;
  explosiveRate: number | null;
  halfLife: number;
  totalGamesUsed: number;
  currentSeasonGamesUsed: number;
  priorSeasonGamesUsed: number;
  /** Games from two or more seasons before the cutoff -- tracked separately so it is never silently folded into "prior season." */
  olderSeasonGamesUsed: number;
  /** Share of TOTAL WEIGHT (not game count) assigned to any non-current-season game, as a percentage 0-100. */
  nonCurrentSeasonWeightSharePct: number | null;
  effectiveSampleSize: number;
};

function isStrictlyPrior(row: { season: number; week: number }, cutoff: NflTotalResearchCutoff): boolean {
  if (row.season < cutoff.season) return true;
  if (row.season === cutoff.season && row.week < cutoff.week) return true;
  return false;
}

export function computeEwmaWindow(
  allRows: readonly NflTotalResearchScoringSupportRow[],
  cutoff: NflTotalResearchCutoff,
  halfLife: number,
): EwmaWindowResult {
  if (!(halfLife > 0)) throw new Error(`computeEwmaWindow: halfLife must be > 0, got ${halfLife}`);

  const strictlyPrior = allRows.filter((r) => isStrictlyPrior(r, cutoff));
  // Most-recent-first: sort ascending by (season, week), then reverse.
  const mostRecentFirst = [...strictlyPrior].sort((a, b) => a.season - b.season || a.week - b.week).reverse();

  const empty: EwmaWindowResult = {
    epaPerPlay: null, successRate: null, explosiveRate: null, halfLife,
    totalGamesUsed: 0, currentSeasonGamesUsed: 0, priorSeasonGamesUsed: 0, olderSeasonGamesUsed: 0,
    nonCurrentSeasonWeightSharePct: null, effectiveSampleSize: 0,
  };
  if (mostRecentFirst.length === 0) return empty;

  const rawWeights = mostRecentFirst.map((_, i) => 0.5 ** (i / halfLife));
  const weightSum = rawWeights.reduce((s, w) => s + w, 0);
  const weights = rawWeights.map((w) => w / weightSum);
  const effectiveSampleSize = 1 / weights.reduce((s, w) => s + w * w, 0);

  let epaNum = 0;
  let epaDen = 0;
  let successNum = 0;
  let successDen = 0;
  let explosiveNum = 0;
  let explosiveDen = 0;
  let currentSeasonGamesUsed = 0;
  let priorSeasonGamesUsed = 0;
  let olderSeasonGamesUsed = 0;
  let nonCurrentSeasonWeight = 0;

  for (let i = 0; i < mostRecentFirst.length; i += 1) {
    const row = mostRecentFirst[i];
    const w = weights[i];
    if (row.eligiblePlays > 0) {
      epaNum += w * (row.offEpaSum / row.eligiblePlays);
      epaDen += w;
      explosiveNum += w * (row.explosiveCount / row.eligiblePlays);
      explosiveDen += w;
    }
    if (row.successDen > 0) {
      successNum += w * (row.successNum / row.successDen);
      successDen += w;
    }
    if (row.season === cutoff.season) {
      currentSeasonGamesUsed += 1;
    } else {
      nonCurrentSeasonWeight += w;
      if (row.season === cutoff.season - 1) priorSeasonGamesUsed += 1;
      else olderSeasonGamesUsed += 1;
    }
  }

  return {
    epaPerPlay: epaDen > 0 ? epaNum / epaDen : null,
    successRate: successDen > 0 ? successNum / successDen : null,
    explosiveRate: explosiveDen > 0 ? explosiveNum / explosiveDen : null,
    halfLife,
    totalGamesUsed: mostRecentFirst.length,
    currentSeasonGamesUsed,
    priorSeasonGamesUsed,
    olderSeasonGamesUsed,
    nonCurrentSeasonWeightSharePct: 100 * nonCurrentSeasonWeight,
    effectiveSampleSize,
  };
}
