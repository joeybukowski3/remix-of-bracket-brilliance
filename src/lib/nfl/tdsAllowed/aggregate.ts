/**
 * Core aggregation/ranking library for defense touchdowns-allowed-by-position
 * tables. Pure and testable: takes already-normalized per-game player rows
 * (HistoricalPlayerWeek) and produces ranked samples of touchdowns allowed.
 *
 * Structurally this mirrors src/lib/nfl/fantasyAllowed/aggregate.ts (same
 * game-log -> sample-selection -> per-game-rank pipeline), but the metric is
 * touchdown counts, not fantasy points, and each position sums a different
 * pair of raw stat fields -- see touchdownsForPosition below. Kept as its
 * own module rather than sharing aggregate.ts because the two positions'
 * "value" extraction differs (a fixed fantasy-points field vs. per-position
 * summed TD stat fields); only the position sample record shape and rank
 * direction (1 = fewest allowed) are the same.
 *
 * Rank direction is fixed: rank 1 = fewest touchdowns allowed per game
 * (toughest matchup), rank N = most allowed. Ties are broken deterministically
 * by total touchdowns allowed, then by team abbreviation, so every eligible
 * team gets a unique rank -- never a shared rank.
 */

import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { TdsAllowedPositionSample, TdsAllowedSource } from "./types";

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

/**
 * Positional touchdown-allowed rule (see work-unit spec):
 *  - QB: passing TDs thrown + QB's own rushing TDs (fantasy-position framing,
 *    not "real" QB touchdowns only).
 *  - RB/WR/TE: rushing TDs + receiving TDs scored by that position.
 * Each row's two stat fields are summed exactly once -- no field is read
 * twice, so a dual-threat player (e.g. a rushing + receiving TD in the same
 * game) cannot be double-counted within a position.
 */
export function touchdownsForPosition(row: HistoricalPlayerWeek): number {
  if (row.position === "QB") {
    return row.stats.passingTouchdowns + row.stats.rushingTouchdowns;
  }
  return row.stats.rushingTouchdowns + row.stats.receivingTouchdowns;
}

/**
 * Collapses per-player HistoricalPlayerWeek rows into one touchdowns-allowed
 * total per (defense, game, position). A "game" here is identified by
 * (opponent, season, week); HistoricalPlayerWeek only ever contains
 * REG-season rows (preseason/playoffs are filtered upstream by
 * normalizeHistoricalPlayerWeek), so no extra season-type filtering is
 * needed here.
 */
export function buildDefenseTouchdownGameLog(
  rows: readonly HistoricalPlayerWeek[],
  position: FantasyPosition,
): DefenseGameTouchdowns[] {
  const byGame = new Map<string, DefenseGameTouchdowns>();
  for (const row of rows) {
    if (row.position !== position) continue;
    const touchdowns = touchdownsForPosition(row);
    const key = `${row.opponent}|${row.season}|${row.week}`;
    const existing = byGame.get(key);
    if (existing) {
      existing.touchdownsAllowed += touchdowns;
    } else {
      byGame.set(key, { team: row.opponent, season: row.season, week: row.week, touchdownsAllowed: touchdowns });
    }
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
 * Computes the ranked touchdowns-allowed sample for one position across a
 * fixed set of teams (e.g. all 32 franchises), given a game log already
 * filtered to that position by buildDefenseTouchdownGameLog.
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
