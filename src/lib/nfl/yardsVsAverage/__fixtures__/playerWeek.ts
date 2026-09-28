import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { makeHistoricalPlayerWeek } from "@/lib/nfl/fantasyAllowed/__fixtures__/historicalPlayerWeek";

const ZERO_STATS: HistoricalPlayerWeek["stats"] = {
  passAttempts: 0, completions: 0, passingYards: 0, passingTouchdowns: 0, interceptions: 0,
  rushAttempts: 0, rushingYards: 0, rushingTouchdowns: 0, receptions: 0, targets: 0,
  receivingYards: 0, receivingTouchdowns: 0, sackFumblesLost: 0, rushingFumblesLost: 0,
  receivingFumblesLost: 0, fumblesLost: 0, passingTwoPointConversions: 0,
  rushingTwoPointConversions: 0, receivingTwoPointConversions: 0, specialTeamsTouchdowns: 0,
};

/** One player-week row with just the yardage a test cares about. */
export function playerWeek(input: {
  season: number;
  week: number;
  team: string;
  opponent: string;
  position: FantasyPosition;
  pass?: number;
  rush?: number;
  rec?: number;
  playerId?: string;
}): HistoricalPlayerWeek {
  return makeHistoricalPlayerWeek({
    season: input.season,
    week: input.week,
    team: input.team,
    opponent: input.opponent,
    position: input.position,
    playerId: input.playerId,
    stats: { ...ZERO_STATS, passingYards: input.pass ?? 0, rushingYards: input.rush ?? 0, receivingYards: input.rec ?? 0 },
  });
}

/** An offense-game expressed as one QB row (rushing = `rush`); enough for single-metric tests on `rush`/`qbRush`. */
export function qbGame(season: number, week: number, offense: string, defense: string, rush: number): HistoricalPlayerWeek {
  return playerWeek({ season, week, team: offense, opponent: defense, position: "QB", rush, playerId: `${season}-${week}-${offense}-qb` });
}
