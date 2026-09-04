/**
 * Shared strictly-prior windowing helper, generalized from
 * teamScoringFeatures.ts's coalesce logic so Phase H residual-feature
 * candidates (pass/rush matchup, pace, turnovers, sacks) do not each
 * reimplement the same season-prior -> prior-season fallback.
 */
import type { NflTotalResearchCutoff, NflTotalResearchWindowLabel } from "./types";

export type GenericWindowEntry = { season: number; week: number; numerator: number; denominator: number };

export type GenericWindowResult = { rate: number | null; sampleGames: number; sampleDenominator: number; window: NflTotalResearchWindowLabel };

function isStrictlyPrior(entry: GenericWindowEntry, cutoff: NflTotalResearchCutoff): boolean {
  if (entry.season < cutoff.season) return true;
  if (entry.season === cutoff.season && entry.week < cutoff.week) return true;
  return false;
}

function aggregate(entries: readonly GenericWindowEntry[], window: NflTotalResearchWindowLabel): GenericWindowResult {
  if (entries.length === 0) return { rate: null, sampleGames: 0, sampleDenominator: 0, window: "insufficient" };
  const numerator = entries.reduce((s, e) => s + e.numerator, 0);
  const denominator = entries.reduce((s, e) => s + e.denominator, 0);
  return { rate: denominator > 0 ? numerator / denominator : null, sampleGames: entries.length, sampleDenominator: denominator, window };
}

/** Current-season-prior games if any exist, else the entire immediately-prior season, else insufficient. */
export function aggregateGenericWindow(entries: readonly GenericWindowEntry[], cutoff: NflTotalResearchCutoff): GenericWindowResult {
  const strictlyPrior = entries.filter((e) => isStrictlyPrior(e, cutoff));
  const seasonPrior = strictlyPrior.filter((e) => e.season === cutoff.season);
  if (seasonPrior.length > 0) return aggregate(seasonPrior, "seasonPrior");
  const priorSeason = strictlyPrior.filter((e) => e.season === cutoff.season - 1);
  if (priorSeason.length > 0) return aggregate(priorSeason, "priorSeason");
  return aggregate([], "insufficient");
}

export type GenericIndex = {
  byTeam: ReadonlyMap<string, readonly GenericWindowEntry[]>;
  byOpponent: ReadonlyMap<string, readonly GenericWindowEntry[]>;
};

export function buildGenericIndex<T extends { season: number; week: number; team: string; opponent: string }>(
  rows: readonly T[],
  extract: (row: T) => { numerator: number; denominator: number },
): GenericIndex {
  const byTeam = new Map<string, GenericWindowEntry[]>();
  const byOpponent = new Map<string, GenericWindowEntry[]>();
  for (const row of rows) {
    const { numerator, denominator } = extract(row);
    const entry: GenericWindowEntry = { season: row.season, week: row.week, numerator, denominator };
    if (!byTeam.has(row.team)) byTeam.set(row.team, []);
    byTeam.get(row.team)!.push(entry);
    if (!byOpponent.has(row.opponent)) byOpponent.set(row.opponent, []);
    byOpponent.get(row.opponent)!.push(entry);
  }
  return { byTeam, byOpponent };
}
