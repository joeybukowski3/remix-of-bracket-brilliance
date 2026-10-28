/**
 * Final scores for the player's Last 10 table, derived from the same imported player-game rows (no other source).
 *
 * A team's score is the sum of its players' points. That is exact only when the import holds the whole box score, so a score is
 * reported only when BOTH teams' minutes add up to a full game (240, plus 25 per overtime, within 2 rounded minutes). A
 * game with a missing player row fails that test and has no result: the table shows no W/L rather than a guessed one.
 */
import type { GameResult } from "../recentForm";
import type { ImportedPlayerGame } from "./playerGameImport";

const REGULATION_MINUTES = 240;
const OVERTIME_MINUTES = 25;
/** Per-player minutes are often whole numbers, so a complete team can sum a few minutes off. A missing rotation player is far more. */
const MINUTES_TOLERANCE = 2;

/** Team points by `season|gameId`, only for games whose two box scores both look complete. */
export type GameScores = ReadonlyMap<string, Readonly<Record<string, number>>>;

/** True when a team's minutes are a whole number of 48-minute games plus 5-minute overtimes, within tolerance. */
export function isCompleteTeamMinutes(minutes: number): boolean {
  const extra = minutes - REGULATION_MINUTES;
  if (extra < -MINUTES_TOLERANCE) return false;
  const overtimes = Math.max(0, Math.round(extra / OVERTIME_MINUTES));
  return Math.abs(extra - overtimes * OVERTIME_MINUTES) <= MINUTES_TOLERANCE;
}

export function buildGameScores(rows: readonly ImportedPlayerGame[]): GameScores {
  const teams = new Map<string, Map<string, { pts: number; minutes: number }>>();
  for (const r of rows) {
    const key = `${r.season}|${r.gameId}`;
    const game = teams.get(key) ?? new Map<string, { pts: number; minutes: number }>();
    const team = game.get(r.team) ?? { pts: 0, minutes: 0 };
    game.set(r.team, { pts: team.pts + r.pts, minutes: team.minutes + r.minutes });
    teams.set(key, game);
  }
  const scores = new Map<string, Readonly<Record<string, number>>>();
  for (const [key, game] of teams) {
    const sides = [...game.entries()];
    if (sides.length !== 2 || !sides.every(([, side]) => isCompleteTeamMinutes(side.minutes))) continue;
    // A tie cannot happen in a finished NBA game, so equal sums mean the import is incomplete after all.
    if (sides[0][1].pts === sides[1][1].pts) continue;
    scores.set(key, Object.fromEntries(sides.map(([team, side]) => [team, side.pts])));
  }
  return scores;
}

/** The outcome for `team` against `opponent`, or undefined when the game's score is not reliably known. */
export function resultFor(scores: GameScores | undefined, game: { season: string; gameId: string; team: string; opponent: string }): GameResult | undefined {
  const teamPts = scores?.get(`${game.season}|${game.gameId}`)?.[game.team];
  const opponentPts = scores?.get(`${game.season}|${game.gameId}`)?.[game.opponent];
  return teamPts === undefined || opponentPts === undefined ? undefined : { won: teamPts > opponentPts, teamPts, opponentPts };
}
