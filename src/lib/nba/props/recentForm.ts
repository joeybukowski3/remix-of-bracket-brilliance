/**
 * Last-ten-game sequences for the props board: a player's own ten most recent results, and what the opposing team's starter at
 * the player's estimated position scored in the opponent's ten most recent games. Browser-safe types and arithmetic (no Node imports).
 *
 * Both sequences are oldest to newest, current season only, and exist only on a private preview board: they are
 * hoopR/ESPN-derived and may not be published (containsPrivateData in propsBoard.ts refuses a public board that has them).
 * They are display context. Nothing here feeds a projection.
 *
 * A short sample is reported as it is: three games is "3 games", never padded to ten, and a game the data does not hold is
 * never invented.
 *
 * The box-score tables in the expanded row (the player's ten games, and the individual opposing players behind each
 * opponent game) read the same records as the charts, so the two can never disagree: the per-game subtotals here are the
 * bars there.
 */
import type { DvpPosition } from "./dvpPositions";
import type { BoardMarket } from "./propsBoard";

/** Games in a recent window. */
export const L10_GAMES = 10;
/** Below this many games in the window a last-ten reading is flagged as a small sample. */
export const SMALL_SAMPLE_BELOW = L10_GAMES;

/** One completed game of the player's, with did-not-play and zero-minute games already left out. */
export interface PlayerRecentGame {
  /** Eastern game date, YYYY-MM-DD. */
  date: string;
  opponent: string;
  isHome: boolean;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  /** The final score, present only when it is reliably known (see v1/gameResults.ts); absent, never guessed, otherwise. */
  result?: GameResult;
}

/**
 * A team's defensive rating as of one date: points allowed per 100 estimated possessions over its usable regular-season games dated
 * strictly before that date (v1/teamDefense.ts). Lower is a stronger defense. Context only; never a projection input.
 */
export interface TeamDefenseEntry {
  rating: number;
  /** The league's pooled rating over the same cutoff, for reference. */
  leagueRating: number;
  /** 1 is the lowest rating (best defense) among the `rankedOf` teams with at least one usable game by that date. Ties share a rank. */
  rank: number;
  rankedOf: number;
  /** Usable games behind the team's rating. */
  games: number;
}

export interface TeamDefenseTable {
  season: string;
  /** Keyed by teamDefenseKey: the team's rating before the game it played on that date. A team with no usable prior game has no entry. */
  asOf: Record<string, TeamDefenseEntry>;
  /** Regular-season games of the season whose possession inputs were complete for both teams, and the ones that were not (left out of every rating). */
  usableGames: number;
  unusableGames: number;
}

export const teamDefenseKey = (team: string, date: string): string => `${team}|${date}`;

/** Fewest prior games for which a strong / average / weak label is given. Below it the rating is shown with its sample size and no label. */
export const MIN_GAMES_FOR_STRENGTH = 5;

export type DefenseStrength = "strong" | "average" | "weak";

/**
 * League-relative label from the rank alone: the best third of the ranked teams is strong, the worst third weak, the rest average
 * (30 teams: ranks 1-10, 11-20, 21-30). No threshold is tuned; null when the sample is under MIN_GAMES_FOR_STRENGTH games or fewer
 * than three teams are ranked.
 */
export function defenseStrength(entry: TeamDefenseEntry | undefined | null): DefenseStrength | null {
  if (!entry || entry.games < MIN_GAMES_FOR_STRENGTH || entry.rankedOf < 3) return null;
  const third = entry.rankedOf / 3;
  if (entry.rank <= third) return "strong";
  return entry.rank > entry.rankedOf - third ? "weak" : "average";
}

/** A completed game's outcome from the player's team's side. */
export interface GameResult {
  won: boolean;
  teamPts: number;
  opponentPts: number;
}

/** One game of the defense, summed over the opposing players attributed to one estimated position. */
export interface OpponentRecentGame {
  date: string;
  /** The team that faced this defense in the game. */
  versus: string;
  /** True when the defense was the home team. */
  defenseIsHome: boolean;
  /** Opposing-player minutes attributed to a position, and all opposing-player minutes, in this game. */
  attributedMinutes: number;
  totalMinutes: number;
  /** Null when no minutes in the game could be attributed to any position: unknown, not zero. */
  pts: number | null;
  reb: number | null;
  ast: number | null;
}

/** The defense's recent games for one position, as built for one upcoming game. */
export interface OpponentRecentSequence {
  team: string;
  position: DvpPosition;
  season: string;
  /** Completed regular-season games the defense has this season before the upcoming game; the window holds the last ten. */
  seasonGames: number;
  /** Oldest to newest, at most ten. */
  games: OpponentRecentGame[];
}

/** Key of a sequence on the board: the upcoming game, the defending team and the estimated position. */
export const opponentRecentKey = (gameKey: string, team: string, position: DvpPosition): string => `${gameKey}|${team}|${position}`;

/** One opposing player's line in a defense's game. Did-not-play and zero-minute rows are never included. */
export interface OpposingPlayerLine {
  name: string;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  /** The estimated primary position DvP uses for this player and season; null when the player has no estimate (not counted anywhere). */
  position: DvpPosition | null;
  /** The source's explicit starter status for this game. Absent on a board built before starters were carried, or when the source gives none. */
  starter?: boolean;
}

/** One game of a defense with every opposing player who played, so a subtotal can be traced to the people behind it. */
export interface OpponentBoxScoreGame {
  gameId: string;
  date: string;
  /** The team that faced this defense, i.e. the team the players belong to. */
  versus: string;
  defenseIsHome: boolean;
  players: OpposingPlayerLine[];
}

/** The defense's last ten games (oldest to newest) before an upcoming game, by `gameKey|team`. */
export type OpponentBoxScores = Record<string, OpponentBoxScoreGame[]>;
export const opponentBoxKey = (gameKey: string, team: string): string => `${gameKey}|${team}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "2026-10-24" as "Oct 24", read from the text so no time zone can move the day. */
export function shortDate(iso: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${MONTHS[Number(match[1]) - 1] ?? match[1]} ${Number(match[2])}` : iso;
}

/** A finite mean, or null for no values. */
export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** One bar of a chart. `value` is null when the game's figure is unknown (shown as a gap). */
export interface RecentPoint {
  date: string;
  /** "vs BOS" or "@ BOS", from the side of the team the row is about. */
  versus: string;
  value: number | null;
  /** Extra exact detail for the tooltip (minutes, coverage). */
  detail: string;
}

export interface PlayerLastTen {
  /** "stale": the board was built before sequences existed. "none": no completed game this season. */
  status: "ok" | "none" | "stale";
  /** Oldest to newest. */
  points: RecentPoint[];
  /** The same window's full lines, oldest to newest, for the box-score table. */
  recent: PlayerRecentGame[];
  games: number;
  average: number | null;
  /** True when fewer than ten games exist, so the average rests on a shorter window. */
  isSmallSample: boolean;
}

const venue = (isHome: boolean, team: string): string => `${isHome ? "vs" : "@"} ${team}`;

export function playerLastTen(games: readonly PlayerRecentGame[] | undefined, market: BoardMarket): PlayerLastTen {
  if (games === undefined) return { status: "stale", points: [], recent: [], games: 0, average: null, isSmallSample: false };
  const window = games.slice(-L10_GAMES);
  const points: RecentPoint[] = window.map((g) => ({ date: g.date, versus: venue(g.isHome, g.opponent), value: g[market], detail: `${g.minutes.toFixed(0)} min` }));
  return { status: window.length === 0 ? "none" : "ok", points, recent: window, games: window.length, average: mean(window.map((g) => g[market])), isSmallSample: window.length > 0 && window.length < SMALL_SAMPLE_BELOW };
}

/** Why games in an opponent window carry no starter figure, one count per reason (opponentStarter.ts). A game with a figure is in none of them. */
export interface StarterGaps {
  /** Two or more starters at the position, so no single player is chosen. */
  multiple: number;
  /** Every starter has a position estimate and none is at the position. */
  none: number;
  /** A starter has no position estimate, so who holds the position is unclear. */
  uncertain: number;
  /** The source gave no (or an inconsistent) starter status for the game. */
  unavailable: number;
}

export const NO_STARTER_GAPS: StarterGaps = Object.freeze({ multiple: 0, none: 0, uncertain: 0, unavailable: 0 });

export interface OpponentLastTen {
  /**
   * "stale": the board predates opponent box scores. "no-position" / "no-opponent": the row has nothing to look up. "no-starters":
   * the board's box scores carry no starter status (built before it was carried). "none": the defense has no completed game this
   * season, or none with exactly one identified starter at the position.
   */
  status: "ok" | "none" | "stale" | "no-position" | "no-opponent" | "no-starters";
  /** One point per game in the window, oldest to newest; `value` is the matched starter's figure, null for a gap. */
  points: RecentPoint[];
  /** Games in the window (at most ten), and how many of them carry a figure. */
  games: number;
  gamesWithFigure: number;
  /** Mean of the matched starters' figures per game; null with none. */
  average: number | null;
  gaps: StarterGaps;
  isSmallSample: boolean;
}

const EMPTY_OPPONENT: Omit<OpponentLastTen, "status"> = { points: [], games: 0, gamesWithFigure: 0, average: null, gaps: NO_STARTER_GAPS, isSmallSample: false };

export function opponentLastTenUnavailable(status: Exclude<OpponentLastTen["status"], "ok">): OpponentLastTen {
  return { status, ...EMPTY_OPPONENT };
}
