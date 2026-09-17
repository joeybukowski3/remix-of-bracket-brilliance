/**
 * Core aggregation/ranking library for defense fantasy-points-allowed
 * tables. Pure and testable: takes already-normalized per-game player rows
 * (HistoricalPlayerWeek, JKB Full PPR scoring) and produces ranked samples.
 *
 * Rank direction is fixed across this whole module: rank 1 = fewest fantasy
 * points allowed per game (toughest matchup), rank N = most allowed
 * (softest/most favorable matchup). Ties are broken deterministically by
 * total points allowed, then by team abbreviation, so every eligible team
 * gets a unique rank -- never a shared rank.
 */

import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { FantasyAllowedPositionSample, FantasyAllowedSource } from "./types";

export type DefenseGamePoints = {
  /** Defense that allowed these points (i.e. the opponent the offense played). */
  team: string;
  season: number;
  week: number;
  fantasyPointsAllowed: number;
};

export type FantasyAllowedSampleSelector =
  | { kind: "season"; season: number }
  | { kind: "last-n"; n: number };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Collapses per-player HistoricalPlayerWeek rows into one fantasy-points-
 * allowed total per (defense, game, position). A "game" here is identified
 * by (opponent, season, week); HistoricalPlayerWeek only ever contains
 * REG-season rows (preseason/playoffs are filtered upstream by
 * normalizeHistoricalPlayerWeek), so no extra season-type filtering is
 * needed here.
 */
export function buildDefenseGameLog(
  rows: readonly HistoricalPlayerWeek[],
  position: FantasyPosition,
): DefenseGamePoints[] {
  const byGame = new Map<string, DefenseGamePoints>();
  for (const row of rows) {
    if (row.position !== position) continue;
    const key = `${row.opponent}|${row.season}|${row.week}`;
    const existing = byGame.get(key);
    if (existing) {
      existing.fantasyPointsAllowed = round2(existing.fantasyPointsAllowed + row.actualFantasyPoints);
    } else {
      byGame.set(key, {
        team: row.opponent,
        season: row.season,
        week: row.week,
        fantasyPointsAllowed: round2(row.actualFantasyPoints),
      });
    }
  }
  return [...byGame.values()];
}

/**
 * Selects the games behind one team's sample: either every REG game a
 * defense played in a given season, or its most recent N completed games
 * (which may span backward across a season boundary).
 */
export function selectDefenseGames(
  gameLog: readonly DefenseGamePoints[],
  team: string,
  selector: FantasyAllowedSampleSelector,
): DefenseGamePoints[] {
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
 * Ranks teams by fantasy points allowed per game, ascending (fewest
 * allowed = rank 1). Teams with zero sampled games are excluded from
 * ranking (rank null) rather than assigned a misleading rank.
 */
function rankTeamsByPointsAllowed(perTeam: ReadonlyMap<string, TeamTotals>): Map<string, number> {
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

/**
 * Computes the ranked fantasy-points-allowed sample for one position across
 * a fixed set of teams (e.g. all 32 franchises), given a game log already
 * filtered to that position by buildDefenseGameLog.
 */
export function computePositionSample(
  gameLog: readonly DefenseGamePoints[],
  teams: readonly string[],
  selector: FantasyAllowedSampleSelector,
  source: FantasyAllowedSource,
): Map<string, FantasyAllowedPositionSample> {
  const perTeam = new Map<string, TeamTotals>();
  for (const team of teams) {
    const games = selectDefenseGames(gameLog, team, selector);
    const total = round2(games.reduce((sum, game) => sum + game.fantasyPointsAllowed, 0));
    perTeam.set(team, { total, games: games.length });
  }

  const ranks = rankTeamsByPointsAllowed(perTeam);
  const result = new Map<string, FantasyAllowedPositionSample>();
  for (const team of teams) {
    const totals = perTeam.get(team)!;
    result.set(team, {
      rank: ranks.get(team) ?? null,
      gamesSampled: totals.games,
      fantasyPointsAllowedTotal: totals.games > 0 ? totals.total : null,
      fantasyPointsAllowedPerGame: totals.games > 0 ? round2(totals.total / totals.games) : null,
      source,
    });
  }
  return result;
}

/**
 * Ranks a one-shot snapshot metric (e.g. the Razzball slot/wide PPG-allowed
 * scrape) the same direction as computePositionSample, for positions where
 * no per-game historical log exists. gamesSampled is always 0 here -- the
 * snapshot is a season-to-date aggregate we did not build game-by-game, so
 * it cannot be sliced into 2025/last-5 samples the way JKB-scored positions
 * can (see docs/research/nfl-fantasy-points-allowed for this gap).
 */
export function rankSnapshotSample(
  valuesByTeam: ReadonlyMap<string, number>,
  teams: readonly string[],
  source: FantasyAllowedSource,
): Map<string, FantasyAllowedPositionSample> {
  const perTeam = new Map<string, TeamTotals>();
  for (const team of teams) {
    const value = valuesByTeam.get(team);
    perTeam.set(team, value == null ? { total: 0, games: 0 } : { total: value, games: 1 });
  }

  const ranks = rankTeamsByPointsAllowed(perTeam);
  const result = new Map<string, FantasyAllowedPositionSample>();
  for (const team of teams) {
    const value = valuesByTeam.get(team);
    result.set(team, {
      rank: ranks.get(team) ?? null,
      gamesSampled: 0,
      fantasyPointsAllowedTotal: null,
      fantasyPointsAllowedPerGame: value ?? null,
      source,
    });
  }
  return result;
}
