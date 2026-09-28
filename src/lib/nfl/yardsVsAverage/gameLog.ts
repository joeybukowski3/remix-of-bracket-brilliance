/**
 * Collapses normalized player-week rows into one yardage line per
 * offense-game. Every offense-game any player row reveals is created first and
 * every metric starts at 0, so a game where nflverse emitted no TE (or no
 * receiving RB, ...) row still counts as a 0-yard game for that group instead
 * of silently disappearing from the sample.
 */

import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { YARDS_VS_AVERAGE_METRIC_KEYS, type YardsVsAverageMetricKey, type YardsVsAverageMetricValues } from "./types";

export type OffenseGame = {
  season: number;
  week: number;
  offense: string;
  defense: string;
  actual: YardsVsAverageMetricValues;
};

export function zeroMetricValues(): YardsVsAverageMetricValues {
  return Object.fromEntries(YARDS_VS_AVERAGE_METRIC_KEYS.map((key) => [key, 0])) as YardsVsAverageMetricValues;
}

/** Yards one player-week row contributes to each metric. */
export function playerWeekContribution(row: HistoricalPlayerWeek): Partial<Record<YardsVsAverageMetricKey, number>> {
  const { passingYards, rushingYards, receivingYards } = row.stats;
  const contribution: Partial<Record<YardsVsAverageMetricKey, number>> = { pass: passingYards, rush: rushingYards };
  if (row.position === "QB") contribution.qbRush = rushingYards;
  if (row.position === "RB") {
    contribution.rbRush = rushingYards;
    contribution.rbRec = receivingYards;
  }
  if (row.position === "WR") contribution.wrRec = receivingYards;
  if (row.position === "TE") contribution.teRec = receivingYards;
  return contribution;
}

export const offenseGameKey = (season: number, week: number, offense: string) => `${season}|${week}|${offense}`;

/** Offense-games sorted by season, week, offense. Throws if one offense-game lists two opponents. */
export function buildOffenseGameLog(rows: readonly HistoricalPlayerWeek[]): OffenseGame[] {
  const games = new Map<string, OffenseGame>();
  for (const row of rows) {
    const key = offenseGameKey(row.season, row.week, row.team);
    let game = games.get(key);
    if (!game) {
      game = { season: row.season, week: row.week, offense: row.team, defense: row.opponent, actual: zeroMetricValues() };
      games.set(key, game);
    } else if (game.defense !== row.opponent) {
      throw new Error(`Offense-game ${key} lists two opponents (${game.defense}, ${row.opponent}).`);
    }
    for (const [metric, yards] of Object.entries(playerWeekContribution(row)) as [YardsVsAverageMetricKey, number][]) {
      game.actual[metric] += yards;
    }
  }
  return [...games.values()].sort((a, b) => a.season - b.season || a.week - b.week || a.offense.localeCompare(b.offense));
}
