/**
 * Phase B -- strictly-prior team scoring feature builder.
 *
 * Consumes the compact scoring-support cache (one row per team per game:
 * eligible plays, summed EPA, traditional-success numerator/denominator,
 * explosive-play count -- see
 * scripts/analysis/nfl-total-model-research/fetch-scoring-support-cache.mjs)
 * and derives, for one team at one (season, week) cutoff:
 *
 *  - that team's own OFFENSE window (EPA/play, success rate, explosive
 *    rate), and
 *  - what that team's DEFENSE allowed, computed by reading the opponent's
 *    offensive row for each of the team's own past games -- the same
 *    "opponent-allowed windows are read off the opponent field of the same
 *    records" pattern src/lib/nfl/props/teamPlayVolume.ts already uses for
 *    play volume. No separate defensive aggregation exists; a team's
 *    defense-allowed window is definitionally its opponents' offense
 *    windows in the games it played.
 *
 * WINDOW COALESCE (mirrors WU4A's `teamPlayVolume.ts` /
 * teamOpportunityFeatures.ts convention exactly): prefer the current
 * season's own completed games strictly before the cutoff week
 * ("seasonPrior"); if none exist yet (e.g. that team's Week 1), fall back
 * to the ENTIRE immediately prior season ("priorSeason"); if neither
 * exists, the window is "insufficient" and every rate is null -- never
 * silently zero-filled.
 *
 * Every row consumed here already carries only strictly-prior-kickoff data
 * by construction (the cache has one row per completed historical game),
 * so the only leakage risk this module must itself guard is accidentally
 * including the TARGET game's own row in a team's window -- guarded by the
 * (season, week) cutoff filter below, and covered by
 * teamScoringFeatures.test.ts and leakage.test.ts.
 */
import type {
  NflTotalResearchCutoff,
  NflTotalResearchScoringSupportRow,
  NflTotalResearchScoringWindow,
  NflTotalResearchWindowLabel,
} from "./types";

type WindowEntry = {
  season: number;
  week: number;
  eligiblePlays: number;
  offEpaSum: number;
  successNum: number;
  successDen: number;
  explosiveCount: number;
};

function isStrictlyPrior(entry: WindowEntry, cutoff: NflTotalResearchCutoff): boolean {
  if (entry.season < cutoff.season) return true;
  if (entry.season === cutoff.season && entry.week < cutoff.week) return true;
  return false;
}

function aggregate(entries: readonly WindowEntry[], window: NflTotalResearchWindowLabel): NflTotalResearchScoringWindow {
  if (entries.length === 0) {
    return { epaPerPlay: null, successRate: null, explosiveRate: null, sampleGames: 0, samplePlays: 0, window: "insufficient" };
  }
  const eligiblePlays = entries.reduce((s, e) => s + e.eligiblePlays, 0);
  const offEpaSum = entries.reduce((s, e) => s + e.offEpaSum, 0);
  const successNum = entries.reduce((s, e) => s + e.successNum, 0);
  const successDen = entries.reduce((s, e) => s + e.successDen, 0);
  const explosiveCount = entries.reduce((s, e) => s + e.explosiveCount, 0);
  return {
    epaPerPlay: eligiblePlays > 0 ? offEpaSum / eligiblePlays : null,
    successRate: successDen > 0 ? successNum / successDen : null,
    explosiveRate: eligiblePlays > 0 ? explosiveCount / eligiblePlays : null,
    sampleGames: entries.length,
    samplePlays: eligiblePlays,
    window,
  };
}

/** Coalesce: current-season-prior games if any exist, else the entire immediately-prior season, else insufficient. */
function aggregateWithCoalesce(entries: readonly WindowEntry[], cutoff: NflTotalResearchCutoff): NflTotalResearchScoringWindow {
  const strictlyPrior = entries.filter((e) => isStrictlyPrior(e, cutoff));
  const seasonPrior = strictlyPrior.filter((e) => e.season === cutoff.season);
  if (seasonPrior.length > 0) return aggregate(seasonPrior, "seasonPrior");
  const priorSeason = strictlyPrior.filter((e) => e.season === cutoff.season - 1);
  if (priorSeason.length > 0) return aggregate(priorSeason, "priorSeason");
  return aggregate([], "insufficient");
}

/**
 * Index the scoring-support cache once for repeated per-team-game lookups.
 * `byTeam` = rows where this team WAS the offense (its own production).
 * `byOpponent` = rows where this team WAS the opponent (i.e. what its
 * defense allowed that game, read off the opposing offense's own row).
 */
export type NflTotalResearchScoringSupportIndex = {
  byTeam: ReadonlyMap<string, readonly NflTotalResearchScoringSupportRow[]>;
  byOpponent: ReadonlyMap<string, readonly NflTotalResearchScoringSupportRow[]>;
};

export function buildScoringSupportIndex(
  rows: readonly NflTotalResearchScoringSupportRow[],
): NflTotalResearchScoringSupportIndex {
  const byTeam = new Map<string, NflTotalResearchScoringSupportRow[]>();
  const byOpponent = new Map<string, NflTotalResearchScoringSupportRow[]>();
  for (const row of rows) {
    if (!byTeam.has(row.team)) byTeam.set(row.team, []);
    byTeam.get(row.team)!.push(row);
    if (!byOpponent.has(row.opponent)) byOpponent.set(row.opponent, []);
    byOpponent.get(row.opponent)!.push(row);
  }
  return { byTeam, byOpponent };
}

function toEntries(rows: readonly NflTotalResearchScoringSupportRow[]): WindowEntry[] {
  return rows.map((r) => ({
    season: r.season,
    week: r.week,
    eligiblePlays: r.eligiblePlays,
    offEpaSum: r.offEpaSum,
    successNum: r.successNum,
    successDen: r.successDen,
    explosiveCount: r.explosiveCount,
  }));
}

/** A team's own strictly-prior offense window at a cutoff. */
export function buildOffenseWindow(
  index: NflTotalResearchScoringSupportIndex,
  team: string,
  cutoff: NflTotalResearchCutoff,
): NflTotalResearchScoringWindow {
  return aggregateWithCoalesce(toEntries(index.byTeam.get(team) ?? []), cutoff);
}

/** What a team's defense allowed, strictly prior to a cutoff (opponent-offense window). */
export function buildDefenseAllowedWindow(
  index: NflTotalResearchScoringSupportIndex,
  team: string,
  cutoff: NflTotalResearchCutoff,
): NflTotalResearchScoringWindow {
  return aggregateWithCoalesce(toEntries(index.byOpponent.get(team) ?? []), cutoff);
}
