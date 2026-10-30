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
import { isCompleteTeamMinutes } from "./v1/gameResults";

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
 * The points the defense allowed: the opposing team's total, the sum of its players' points. Only when the team's minutes make a
 * full game by the same rule as the W/L display (a missing player row would otherwise understate it); null, never a floor, otherwise.
 * A game whose minutes are 3-5 off is left out too: in 2025-26, 1 of 30 such team-games had player points that differed from the official score.
 */
export function teamPointsAllowed(players: readonly Pick<StarterCandidate, "minutes" | "pts">[]): number | null {
  if (players.length === 0) return null;
  const minutes = players.reduce((sum, x) => sum + x.minutes, 0);
  return isCompleteTeamMinutes(minutes) ? players.reduce((sum, x) => sum + x.pts, 0) : null;
}
