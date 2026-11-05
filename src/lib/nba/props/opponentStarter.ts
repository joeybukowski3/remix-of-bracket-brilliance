/**
 * Which opposing player is "the starter at the player's position" in one of a defense's games, and how many points the defense
 * allowed in total. Browser-safe, so the tables, the charts and the board column all read one rule.
 *
 * The starter is whoever the source flags as a starter for that game (hoopR `starter`), never inferred from minutes or scoring.
 * The position is the player's estimated primary position for the season (the one Defense vs. Position uses), because box
 * scores do not say who played which spot. Five starters and five positions rarely line up one to one, so a game is only
 * called MATCHED when the evidence is unambiguous:
 *
 *   matched      exactly one starter at the position, and no starter lacks a position estimate
 *   multiple     two or more starters at the position (a two-guard lineup labelled twice as PG): no single figure is chosen
 *   none         every starter has an estimate and none is at the position (three forwards, no starting PG)
 *   uncertain    a starter has no position estimate, so that starter might be the one at the position
 *   unavailable  the source gave no starter status for every player, or flagged other than five starters
 *
 * Only a matched game carries a figure. Nothing here ever adds players together into a single-player matchup number.
 */
import type { DvpPosition } from "./dvpPositions";
import { SCORE_CHECKED_MINUTES_TOLERANCE, isCompleteTeamMinutes } from "./v1/gameResults";

/** Starters a team puts on the floor to open a game. A flag set that names any other count is not trusted. */
export const STARTERS_PER_TEAM = 5;

/** The fields the rule reads; every opposing player line satisfies it. */
export interface StarterCandidate {
  name: string;
  position: DvpPosition | null;
  /** The source's explicit starter status; undefined when the source gave none. */
  starter?: boolean | null;
  minutes: number;
  pts: number;
}

export type StarterMatch<P extends StarterCandidate = StarterCandidate> =
  | { kind: "matched"; player: P }
  | { kind: "multiple"; players: P[] }
  | { kind: "none" }
  | { kind: "uncertain"; unclassified: number }
  | { kind: "unavailable"; reason: "no-flags" }
  | { kind: "unavailable"; reason: "starter-count"; starters: number };

export function matchStarter<P extends StarterCandidate>(players: readonly P[], position: DvpPosition): StarterMatch<P> {
  if (players.length === 0 || players.some((x) => typeof x.starter !== "boolean")) return { kind: "unavailable", reason: "no-flags" };
  const starters = players.filter((x) => x.starter === true);
  if (starters.length !== STARTERS_PER_TEAM) return { kind: "unavailable", reason: "starter-count", starters: starters.length };
  const atPosition = starters.filter((x) => x.position === position);
  if (atPosition.length >= 2) return { kind: "multiple", players: atPosition };
  const unclassified = starters.filter((x) => x.position === null).length;
  if (unclassified > 0) return { kind: "uncertain", unclassified };
  return atPosition.length === 1 ? { kind: "matched", player: atPosition[0] } : { kind: "none" };
}

/**
 * The points the defense allowed, without an official score to check against: the opposing team's total, the sum of its players'
 * points, only when the team's minutes make a full game by the same rule as the W/L display (a missing player row would otherwise
 * understate it); null, never a floor, otherwise. A game whose minutes are 3-5 off is left out too: in 2025-26, 1 of 30 such
 * team-games had player points that differed from the official score. See teamPointsFor for the exact path.
 */
export function teamPointsAllowed(players: readonly Pick<StarterCandidate, "minutes" | "pts">[]): number | null {
  if (players.length === 0) return null;
  const minutes = players.reduce((sum, x) => sum + x.minutes, 0);
  return isCompleteTeamMinutes(minutes) ? players.reduce((sum, x) => sum + x.pts, 0) : null;
}

export interface TeamPointsAllowed {
  /** The points the defense allowed; null when there is no official score and the box is not a complete game. */
  points: number | null;
  /** "official": the source's final score for the team. "box": the sum of the player rows, accepted because the minutes make a full game. */
  source: "official" | "box" | null;
  /** False when the player rows do not account for the points (official score known but the rows sum to something else) or the minutes do not make a full game. */
  complete: boolean;
  playerSum: number;
}

/**
 * Points allowed with the official final score when the import carries it, which is exact whatever the box looks like; the player
 * rows are then only checked against it, so a missing row is named instead of silently understating the figure. Without an official
 * score it is teamPointsAllowed (minutes rule), unchanged.
 */
export function teamPointsFor(players: readonly Pick<StarterCandidate, "minutes" | "pts">[], officialScore?: number | null): TeamPointsAllowed {
  const playerSum = players.reduce((sum, x) => sum + x.pts, 0);
  if (typeof officialScore === "number" && Number.isFinite(officialScore)) return { points: officialScore, source: "official", complete: playerSum === officialScore, playerSum };
  const points = teamPointsAllowed(players);
  return { points, source: points === null ? null : "box", complete: points !== null, playerSum };
}

/** The stats a team total is kept for. */
export type TeamStat = "pts" | "reb" | "ast";

/**
 * The opposing team's total in one stat: what the defense allowed as a team, never a position figure. Points are the official
 * final score when known (teamPointsFor). Rebounds and assists have no official total here, so they are the sum of the listed
 * players, accepted only when the box is complete: the player points add up to the official score (or the minutes make a full
 * game without one) and the minutes make a full game within the score-checked tolerance. Null, never a floor, otherwise.
 */
export function teamStatAllowed<P extends Pick<StarterCandidate, "minutes" | "pts"> & { reb: number; ast: number }>(players: readonly P[], stat: TeamStat, officialScore?: number | null): number | null {
  const points = teamPointsFor(players, officialScore);
  if (stat === "pts") return points.points;
  if (players.length === 0 || !points.complete) return null;
  if (!isCompleteTeamMinutes(players.reduce((sum, x) => sum + x.minutes, 0), SCORE_CHECKED_MINUTES_TOLERANCE)) return null;
  return players.reduce((sum, x) => sum + x[stat], 0);
}
