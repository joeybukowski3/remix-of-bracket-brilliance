/**
 * Core aggregation/ranking library for defense touchdowns-allowed tables,
 * split by scoring method (scorer position + touchdown type). Pure and
 * testable: takes already-normalized per-game player rows
 * (HistoricalPlayerWeek) and produces ranked samples of touchdowns allowed.
 *
 * Structurally this mirrors src/lib/nfl/fantasyAllowed/aggregate.ts (same
 * game-log -> sample-selection -> per-game-rank pipeline), but the metric is
 * touchdown counts, not fantasy points -- see TDS_ALLOWED_CATEGORIES below.
 *
 * Rank direction is fixed: rank 1 = fewest touchdowns allowed per game
 * (toughest matchup), rank N = most allowed. Ties are broken deterministically
 * by total touchdowns allowed, then by team abbreviation, so every eligible
 * team gets a unique rank -- never a shared rank.
 */

import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { TdsAllowedCategoryKey, TdsAllowedPositionSample, TdsAllowedSource } from "./types";

export type DefenseGameTouchdowns = {
  /** Defense that allowed these touchdowns (i.e. the opponent the offense played). */
  team: string;
  season: number;
  week: number;
  touchdownsAllowed: number;
};

export type TdsAllowedSampleSelector =
  | { kind: "season"; season: number }
  | { kind: "last-n"; n: number };

export type TdsAllowedCategory = {
  key: TdsAllowedCategoryKey;
  /** Scorer position (nflverse position of the player row the stat belongs to). */
  position: FantasyPosition;
  /** The single stat field this category reads -- passing_tds / rushing_tds / receiving_tds only. */
  statField: "passingTouchdowns" | "rushingTouchdowns" | "receivingTouchdowns";
};

/**
 * The six scoring-method categories. Each reads exactly ONE stat field from
 * rows of exactly ONE position, so no stat can be counted in two categories.
 * Two-point conversions, special-teams and defensive touchdowns live in
 * separate nflverse columns (passing_2pt_conversions, special_teams_tds, ...)
 * that no category reads, so they are excluded by construction.
 */
export const TDS_ALLOWED_CATEGORIES: readonly TdsAllowedCategory[] = [
  { key: "qbPass", position: "QB", statField: "passingTouchdowns" },
  { key: "qbRush", position: "QB", statField: "rushingTouchdowns" },
  { key: "rbRush", position: "RB", statField: "rushingTouchdowns" },
  { key: "rbRec", position: "RB", statField: "receivingTouchdowns" },
  { key: "wrRec", position: "WR", statField: "receivingTouchdowns" },
  { key: "teRec", position: "TE", statField: "receivingTouchdowns" },
];

/** Touchdowns this player-week contributes to one category (0 when the row is another position). */
export function touchdownsForCategory(row: HistoricalPlayerWeek, category: TdsAllowedCategory): number {
  return row.position === category.position ? row.stats[category.statField] : 0;
}

/**
 * Collapses per-player HistoricalPlayerWeek rows into one touchdowns-allowed
 * total per (defense, game) for one category. A "game" here is identified by
 * (opponent, season, week); HistoricalPlayerWeek only ever contains
 * REG-season rows (preseason/playoffs are filtered upstream by
 * normalizeHistoricalPlayerWeek).
 *
 * The denominator is the defense's COMPLETE game count: every game in which
 * the defense faced any offensive player row registers a game, and a game
 * with no row of the category's position (e.g. no TE row) contributes 0
 * touchdowns rather than dropping out of the sample. Consequently all six
 * categories share the same game log length for a given defense, and
 * last-N windows mean the defense's last N games.
 */
export function buildDefenseTouchdownGameLog(
  rows: readonly HistoricalPlayerWeek[],
  category: TdsAllowedCategory,
): DefenseGameTouchdowns[] {
  const byGame = new Map<string, DefenseGameTouchdowns>();
  for (const row of rows) {
    const key = `${row.opponent}|${row.season}|${row.week}`;
    let game = byGame.get(key);
    if (!game) {
      game = { team: row.opponent, season: row.season, week: row.week, touchdownsAllowed: 0 };
      byGame.set(key, game);
    }
    game.touchdownsAllowed += touchdownsForCategory(row, category);
  }
  return [...byGame.values()];
}

/**
 * Selects the games behind one team's sample: either every REG game a
 * defense played in a given season, or its most recent N completed games
 * (which may span backward across a season boundary).
 */
export function selectDefenseTouchdownGames(
  gameLog: readonly DefenseGameTouchdowns[],
  team: string,
  selector: TdsAllowedSampleSelector,
): DefenseGameTouchdowns[] {
  const teamGames = gameLog
    .filter((game) => game.team === team)
    .sort((a, b) => b.season - a.season || b.week - a.week);

  if (selector.kind === "season") {
    return teamGames
      .filter((game) => game.season === selector.season)
      .sort((a, b) => a.week - b.week);
  }

  return teamGames.slice(0, selector.n).sort((a, b) => a.season - b.season || a.week - b.week);
}

type TeamTotals = { total: number; games: number };

/**
 * Ranks teams by touchdowns allowed per game, ascending (fewest allowed =
 * rank 1). Teams with zero sampled games are excluded from ranking (rank
 * null) rather than assigned a misleading rank.
 */
function rankTeamsByTouchdownsAllowed(perTeam: ReadonlyMap<string, TeamTotals>): Map<string, number> {
  const eligible = [...perTeam.entries()].filter(([, totals]) => totals.games > 0);
  eligible.sort(([teamA, a], [teamB, b]) => {
    const perGameA = a.total / a.games;
    const perGameB = b.total / b.games;
    if (perGameA !== perGameB) return perGameA - perGameB;
    if (a.total !== b.total) return a.total - b.total;
    return teamA.localeCompare(teamB);
  });
  const ranks = new Map<string, number>();
  eligible.forEach(([team], index) => ranks.set(team, index + 1));
  return ranks;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Computes the ranked touchdowns-allowed sample for one category across a
 * fixed set of teams (e.g. all 32 franchises), given a game log already
 * built for that category by buildDefenseTouchdownGameLog.
 */
export function computeTouchdownPositionSample(
  gameLog: readonly DefenseGameTouchdowns[],
  teams: readonly string[],
  selector: TdsAllowedSampleSelector,
  source: TdsAllowedSource,
): Map<string, TdsAllowedPositionSample> {
  const perTeam = new Map<string, TeamTotals>();
  for (const team of teams) {
    const games = selectDefenseTouchdownGames(gameLog, team, selector);
    const total = games.reduce((sum, game) => sum + game.touchdownsAllowed, 0);
    perTeam.set(team, { total, games: games.length });
  }

  const ranks = rankTeamsByTouchdownsAllowed(perTeam);
  const result = new Map<string, TdsAllowedPositionSample>();
  for (const team of teams) {
    const totals = perTeam.get(team)!;
    result.set(team, {
      rank: ranks.get(team) ?? null,
      gamesSampled: totals.games,
      touchdownsAllowedTotal: totals.games > 0 ? totals.total : null,
      touchdownsAllowedPerGame: totals.games > 0 ? round1(totals.total / totals.games) : null,
      source,
    });
  }
  return result;
}
