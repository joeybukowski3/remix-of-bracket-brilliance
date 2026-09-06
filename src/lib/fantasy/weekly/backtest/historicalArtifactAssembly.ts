import type { HistoricalPlayerWeek, HistoricalPlayerWeekSource } from "@/lib/fantasy/weekly/history";

/**
 * Phase 1 glue: pure, testable assembly helpers used by
 * scripts/generate-fantasy-weekly-history.mts to wire real nflverse source
 * caches through the already-tested leakage-safe library
 * (history.ts / backtest/universe.ts / backtest/features.ts). Nothing here
 * fetches, scores, or ranks — see that library for the frozen behavior.
 */

/**
 * Adapts one raw `stats_player_week_{season}.csv` (nflverse `stats_player`
 * release) row into the shape `normalizeHistoricalPlayerWeek()` expects,
 * which was authored against the older `player_stats` release's column
 * names. Only column names differ between the two releases for the fields
 * this pipeline reads; the values are the same upstream measurement.
 */
export function adaptStatsPlayerWeekRow(
  row: Readonly<Record<string, string | number | null | undefined>>,
): HistoricalPlayerWeekSource {
  return {
    ...row,
    recent_team: row.team,
    interceptions: row.passing_interceptions,
  };
}

export type GameRow = { season: number; week: number; awayTeam: string; homeTeam: string; neutral: boolean };
export type HomeAway = "home" | "away" | "neutral" | "bye" | "unknown";

/** Builds a `season|week|team` -> home/away/neutral lookup from a schedule. */
export function buildHomeAwayLookup(games: readonly GameRow[]): Map<string, HomeAway> {
  const map = new Map<string, HomeAway>();
  for (const game of games) {
    const homeAway = (team: string): HomeAway =>
      game.neutral ? "neutral" : team === game.homeTeam ? "home" : "away";
    map.set(`${game.season}|${game.week}|${game.homeTeam}`, homeAway(game.homeTeam));
    map.set(`${game.season}|${game.week}|${game.awayTeam}`, homeAway(game.awayTeam));
  }
  return map;
}

function chronology(row: { season: number; week: number }): number {
  return row.season * 100 + row.week;
}

export type AppearanceState = "played" | "eligible-no-stats";

export type AppearanceHistory = {
  appearanceState: AppearanceState;
  priorGamesCount: number;
  eligibleWeeksCount: number;
  weeksSinceLastAppearance: number | null;
};

const PLAYED_SOURCE: HistoricalPlayerWeek["provenance"]["source"] = "nflverse stats_player weekly";

/**
 * Derives appearance/eligibility counters for one target row from that
 * player's full chronological universe history (eligible weeks 2023-2025
 * only — 2022-only prior-season outcome rows are not "eligible weeks").
 *
 * `priorGamesCount` counts games with a recorded stat appearance strictly
 * before the target week; `eligibleWeeksCount` counts eligible universe
 * weeks up to and including the target week; `weeksSinceLastAppearance` is
 * null when the player has no earlier recorded appearance in this universe
 * (explicit missingness, never imputed as 0 or "just now").
 */
export function computeAppearanceHistory(
  target: { season: number; week: number },
  playerUniverseHistory: readonly HistoricalPlayerWeek[],
): AppearanceHistory {
  const sorted = [...playerUniverseHistory].sort((a, b) => chronology(a) - chronology(b));
  const priorRows = sorted.filter((row) => chronology(row) < chronology(target));
  const priorAppearances = priorRows.filter((row) => row.provenance.source === PLAYED_SOURCE);
  const targetRow = sorted.find((row) => chronology(row) === chronology(target));
  const played = targetRow?.provenance.source === PLAYED_SOURCE;
  const lastAppearance = [...priorAppearances].reverse()[0] ?? null;

  return {
    appearanceState: played ? "played" : "eligible-no-stats",
    priorGamesCount: priorAppearances.length,
    eligibleWeeksCount: priorRows.length + 1,
    weeksSinceLastAppearance:
      lastAppearance == null
        ? null
        : (target.season - lastAppearance.season) * 18 + (target.week - lastAppearance.week),
  };
}
