/**
 * Last-ten-game sequences for the props board: a player's own ten most recent results, and what the opponent allowed to the
 * player's estimated position in the opponent's ten most recent games. Browser-safe types and arithmetic (no Node imports).
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

const marketValue = <T extends { pts: number | null; reb: number | null; ast: number | null }>(game: T, market: BoardMarket): number | null => game[market];

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

export interface OpponentLastTen {
  /**
   * "stale": the board predates sequences. "no-position" / "no-opponent": the row has nothing to look up. "none": the
   * defense has no completed game this season (or none with an attributed position).
   */
  status: "ok" | "none" | "stale" | "no-position" | "no-opponent";
  points: RecentPoint[];
  /** Games in the window (at most ten), and how many of them carry a figure. */
  games: number;
  gamesWithFigure: number;
  /** Mean allowed per game over the games that carry a figure; null with none. */
  average: number | null;
  /** Attributed share of the window's opposing-player minutes (0-1); null with no minutes. */
  coverage: number | null;
  /** Completed games the defense has this season before the matchup (may exceed the window). */
  seasonGames: number;
  isSmallSample: boolean;
}

const EMPTY_OPPONENT: Omit<OpponentLastTen, "status"> = { points: [], games: 0, gamesWithFigure: 0, average: null, coverage: null, seasonGames: 0, isSmallSample: false };

export function opponentLastTenUnavailable(status: Exclude<OpponentLastTen["status"], "ok">): OpponentLastTen {
  return { status, ...EMPTY_OPPONENT };
}

export function opponentLastTen(sequence: OpponentRecentSequence | undefined | null, market: BoardMarket): OpponentLastTen {
  if (!sequence) return opponentLastTenUnavailable("none");
  const window = sequence.games.slice(-L10_GAMES);
  const points: RecentPoint[] = window.map((g) => ({
    date: g.date,
    versus: venue(g.defenseIsHome, g.versus),
    value: marketValue(g, market),
    detail: g.totalMinutes > 0 ? `${Math.round((g.attributedMinutes / g.totalMinutes) * 100)}% of opposing minutes attributed to a position` : "no opposing minutes",
  }));
  const figures = window.flatMap((g) => (marketValue(g, market) === null ? [] : [marketValue(g, market) as number]));
  const totalMinutes = window.reduce((sum, g) => sum + g.totalMinutes, 0);
  const attributed = window.reduce((sum, g) => sum + g.attributedMinutes, 0);
  return {
    status: figures.length === 0 ? "none" : "ok",
    points,
    games: window.length,
    gamesWithFigure: figures.length,
    average: mean(figures),
    coverage: totalMinutes > 0 ? attributed / totalMinutes : null,
    seasonGames: sequence.seasonGames,
    isSmallSample: window.length < SMALL_SAMPLE_BELOW,
  };
}
