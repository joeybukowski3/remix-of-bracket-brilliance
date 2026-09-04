/**
 * Phase K diagnostic-only window-scheme variants. NOT part of the core
 * research library (src/lib/nfl/research/total/**) and NOT a new
 * production-candidate feature builder -- these exist purely to compare
 * against the existing "current" window (teamScoringFeatures.ts's
 * season-prior -> immediately-prior-season coalesce) for diagnosing the
 * Phase J late-season bias finding. Never used to fit or score a model.
 */
import type { NflTotalResearchCutoff, NflTotalResearchScoringSupportRow } from "@/lib/nfl/research/total/types";

export type WindowScheme =
  | { kind: "current" } // mirrors teamScoringFeatures.ts's aggregateWithCoalesce exactly
  | { kind: "lastN"; n: number }
  | { kind: "seasonToDateOnly" }
  | { kind: "ewma"; halfLife: number };

export type WindowedFeatureResult = {
  epaPerPlay: number | null;
  successRate: number | null;
  explosiveRate: number | null;
  gamesUsed: number;
  effectiveN: number;
  schemeLabel: string;
};

function isStrictlyPrior(row: { season: number; week: number }, cutoff: NflTotalResearchCutoff): boolean {
  if (row.season < cutoff.season) return true;
  if (row.season === cutoff.season && row.week < cutoff.week) return true;
  return false;
}

function sortChronological(rows: readonly NflTotalResearchScoringSupportRow[]): NflTotalResearchScoringSupportRow[] {
  return [...rows].sort((a, b) => a.season - b.season || a.week - b.week);
}

function aggregateSums(rows: readonly NflTotalResearchScoringSupportRow[]): { epaPerPlay: number | null; successRate: number | null; explosiveRate: number | null } {
  if (rows.length === 0) return { epaPerPlay: null, successRate: null, explosiveRate: null };
  const eligiblePlays = rows.reduce((s, r) => s + r.eligiblePlays, 0);
  const offEpaSum = rows.reduce((s, r) => s + r.offEpaSum, 0);
  const successNum = rows.reduce((s, r) => s + r.successNum, 0);
  const successDen = rows.reduce((s, r) => s + r.successDen, 0);
  const explosiveCount = rows.reduce((s, r) => s + r.explosiveCount, 0);
  return {
    epaPerPlay: eligiblePlays > 0 ? offEpaSum / eligiblePlays : null,
    successRate: successDen > 0 ? successNum / successDen : null,
    explosiveRate: eligiblePlays > 0 ? explosiveCount / eligiblePlays : null,
  };
}

/** Computes one windowed feature value from a team's full chronological history and a strict cutoff. `allRows` need not be pre-filtered. */
export function computeWindowedFeature(
  allRows: readonly NflTotalResearchScoringSupportRow[],
  cutoff: NflTotalResearchCutoff,
  scheme: WindowScheme,
): WindowedFeatureResult {
  const priorSorted = sortChronological(allRows.filter((r) => isStrictlyPrior(r, cutoff)));

  if (scheme.kind === "current") {
    const seasonPrior = priorSorted.filter((r) => r.season === cutoff.season);
    if (seasonPrior.length > 0) {
      const agg = aggregateSums(seasonPrior);
      return { ...agg, gamesUsed: seasonPrior.length, effectiveN: seasonPrior.length, schemeLabel: "current:seasonPrior" };
    }
    const priorSeason = priorSorted.filter((r) => r.season === cutoff.season - 1);
    if (priorSeason.length > 0) {
      const agg = aggregateSums(priorSeason);
      return { ...agg, gamesUsed: priorSeason.length, effectiveN: priorSeason.length, schemeLabel: "current:priorSeason" };
    }
    return { epaPerPlay: null, successRate: null, explosiveRate: null, gamesUsed: 0, effectiveN: 0, schemeLabel: "current:insufficient" };
  }

  if (scheme.kind === "lastN") {
    const window = priorSorted.slice(Math.max(0, priorSorted.length - scheme.n));
    const agg = aggregateSums(window);
    return { ...agg, gamesUsed: window.length, effectiveN: window.length, schemeLabel: `lastN:${scheme.n}` };
  }

  if (scheme.kind === "seasonToDateOnly") {
    const seasonToDate = priorSorted.filter((r) => r.season === cutoff.season);
    const agg = aggregateSums(seasonToDate);
    return { ...agg, gamesUsed: seasonToDate.length, effectiveN: seasonToDate.length, schemeLabel: "seasonToDateOnly" };
  }

  // ewma: most-recent-first, weight_i = 0.5^(i/halfLife), i=0 for the most recent prior game.
  const mostRecentFirst = [...priorSorted].reverse();
  if (mostRecentFirst.length === 0) {
    return { epaPerPlay: null, successRate: null, explosiveRate: null, gamesUsed: 0, effectiveN: 0, schemeLabel: `ewma:${scheme.halfLife}` };
  }
  const rawWeights = mostRecentFirst.map((_, i) => 0.5 ** (i / scheme.halfLife));
  const weightSum = rawWeights.reduce((s, w) => s + w, 0);
  const weights = rawWeights.map((w) => w / weightSum);
  const effectiveN = 1 / weights.reduce((s, w) => s + w * w, 0);

  let epaPerPlay = 0;
  let successRate = 0;
  let explosiveRate = 0;
  let epaDen = 0;
  let successRateDen = 0;
  let explosiveDen = 0;
  for (let i = 0; i < mostRecentFirst.length; i += 1) {
    const row = mostRecentFirst[i];
    const w = weights[i];
    if (row.eligiblePlays > 0) {
      epaPerPlay += w * (row.offEpaSum / row.eligiblePlays);
      explosiveRate += w * (row.explosiveCount / row.eligiblePlays);
      epaDen += w;
      explosiveDen += w;
    }
    if (row.successDen > 0) {
      successRate += w * (row.successNum / row.successDen);
      successRateDen += w;
    }
  }
  return {
    epaPerPlay: epaDen > 0 ? epaPerPlay / epaDen : null,
    successRate: successRateDen > 0 ? successRate / successRateDen : null,
    explosiveRate: explosiveDen > 0 ? explosiveRate / explosiveDen : null,
    gamesUsed: mostRecentFirst.length,
    effectiveN,
    schemeLabel: `ewma:${scheme.halfLife}`,
  };
}
