/**
 * The two box-score tables of the expanded props row: the player's own last ten games, and the individual opposing players
 * behind each of the opponent's last ten games at the player's estimated position. Browser-safe (no Node imports).
 *
 * Same records as the charts (recentForm.ts) and the same position assignment as Defense vs. Position (dvpPositions.ts): a
 * player counts toward a position only when the board's estimated primary position for that player is that position.
 * A generic roster label (G, F) never decides it. A player with no estimate is listed apart as "not counted" and adds
 * nothing to any subtotal.
 *
 * A game whose opposing minutes were not all assigned a position is INCOMPLETE, not a shutout: its subtotal is a floor and the
 * table says so. A game in which no opposing minute could be assigned has no subtotal at all (unknown, never zero).
 *
 * Private-preview data only (the records come from a source not licensed for publication); display context, never a model input.
 */
import { classifyRosterLabel, type DvpPosition } from "./dvpPositions";
import { L10_GAMES, SMALL_SAMPLE_BELOW, mean, opponentBoxKey, type GameResult, type OpponentBoxScoreGame, type OpponentBoxScores, type OpposingPlayerLine, type PlayerLastTen } from "./recentForm";
import type { BoardEntry, BoardMarket } from "./propsBoard";

/** A float tolerance on minute sums, which are decimals: below it a game counts as fully attributed. */
const MINUTES_EPSILON = 1e-6;

export interface BoxAverages {
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  /** The selected market's average (equal to pts, reb or ast). */
  selected: number;
}

export interface PlayerBoxRow {
  /** Stable React key: the date plus the position in the window, since a player can play only once a day. */
  key: string;
  date: string;
  opponent: string;
  isHome: boolean;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  /** The selected market's result for the game. */
  selected: number;
  result: GameResult | null;
}

export interface PlayerBoxTable {
  status: PlayerLastTen["status"];
  /** Newest to oldest. */
  rows: PlayerBoxRow[];
  average: BoxAverages | null;
  isSmallSample: boolean;
  /** Wins and losses among the games whose final score is known; null when none is. `known` of `rows.length` games carry a result. */
  record: { wins: number; losses: number; known: number } | null;
}

const averages = (rows: readonly { minutes: number; pts: number; reb: number; ast: number; selected: number }[]): BoxAverages | null =>
  rows.length === 0 ? null : { minutes: mean(rows.map((r) => r.minutes)) ?? 0, pts: mean(rows.map((r) => r.pts)) ?? 0, reb: mean(rows.map((r) => r.reb)) ?? 0, ast: mean(rows.map((r) => r.ast)) ?? 0, selected: mean(rows.map((r) => r.selected)) ?? 0 };

/** The player's last-ten window as table rows, newest first, with its average. The window is already pregame-only and played-only (seasonStatsBuild.ts). */
export function playerBoxTable(last: PlayerLastTen, market: BoardMarket): PlayerBoxTable {
  const rows: PlayerBoxRow[] = last.recent
    .map((g, i) => ({ key: `${g.date}-${i}`, date: g.date, opponent: g.opponent, isHome: g.isHome, minutes: g.minutes, pts: g.pts, reb: g.reb, ast: g.ast, selected: g[market], result: g.result ?? null }))
    .reverse();
  const decided = rows.filter((r) => r.result !== null);
  const wins = decided.filter((r) => r.result?.won).length;
  return {
    status: last.status,
    rows,
    average: averages(rows),
    isSmallSample: last.isSmallSample,
    record: decided.length === 0 ? null : { wins, losses: decided.length - wins, known: decided.length },
  };
}

export interface OpponentBoxPlayer {
  name: string;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  selected: number;
  position: DvpPosition | null;
}

export interface OpponentBoxGame {
  gameId: string;
  date: string;
  /** The team that faced the defense: the team the listed players play for. */
  versus: string;
  defenseIsHome: boolean;
  /** Opposing players whose estimated primary position is the row's position, most minutes first. */
  players: OpponentBoxPlayer[];
  /** Opposing players with no position estimate. Shown so the gap is visible; counted nowhere. */
  unmatched: OpponentBoxPlayer[];
  otherPositionPlayers: number;
  totalMinutes: number;
  attributedMinutes: number;
  /** Attributed share of the game's opposing minutes (0-1); null with no opposing minutes. */
  coverage: number | null;
  /** The sum over `players`. Null when no opposing minute was assigned a position at all: unknown, not zero. */
  subtotal: BoxAverages | null;
  /** True when some opposing minutes had no position, so `subtotal` is a floor. */
  isIncomplete: boolean;
}

export interface OpponentBoxTable {
  /** "stale": the board predates box scores. "none": no usable game. */
  status: "ok" | "none" | "stale" | "no-position" | "no-opponent";
  position: DvpPosition | null;
  /** Newest to oldest, at most ten. */
  games: OpponentBoxGame[];
  /** Mean subtotal over the games that carry one; null with none. */
  average: BoxAverages | null;
  gamesWithFigure: number;
  incompleteGames: number;
  /** Attributed share of the window's opposing minutes (0-1); null with no minutes. */
  coverage: number | null;
  isSmallSample: boolean;
}

const UNAVAILABLE: Omit<OpponentBoxTable, "status" | "position"> = { games: [], average: null, gamesWithFigure: 0, incompleteGames: 0, coverage: null, isSmallSample: false };
export const opponentBoxUnavailable = (status: Exclude<OpponentBoxTable["status"], "ok">, position: DvpPosition | null = null): OpponentBoxTable => ({ status, position, ...UNAVAILABLE });

const toPlayer = (line: OpposingPlayerLine, market: BoardMarket): OpponentBoxPlayer => ({ name: line.name, minutes: line.minutes, pts: line.pts, reb: line.reb, ast: line.ast, selected: line[market], position: line.position });
const byMinutes = (a: OpponentBoxPlayer, b: OpponentBoxPlayer): number => b.minutes - a.minutes || a.name.localeCompare(b.name);

function gameView(game: OpponentBoxScoreGame, position: DvpPosition, market: BoardMarket): OpponentBoxGame {
  const totalMinutes = game.players.reduce((sum, p) => sum + p.minutes, 0);
  const attributedMinutes = game.players.reduce((sum, p) => sum + (p.position === null ? 0 : p.minutes), 0);
  const players = game.players.filter((p) => p.position === position).map((p) => toPlayer(p, market)).sort(byMinutes);
  const unmatched = game.players.filter((p) => p.position === null).map((p) => toPlayer(p, market)).sort(byMinutes);
  const sum = (field: "pts" | "reb" | "ast" | "minutes" | "selected"): number => players.reduce((total, p) => total + p[field], 0);
  return {
    gameId: game.gameId,
    date: game.date,
    versus: game.versus,
    defenseIsHome: game.defenseIsHome,
    players,
    unmatched,
    otherPositionPlayers: game.players.filter((p) => p.position !== null && p.position !== position).length,
    totalMinutes,
    attributedMinutes,
    coverage: totalMinutes > 0 ? attributedMinutes / totalMinutes : null,
    subtotal: attributedMinutes > 0 ? { minutes: sum("minutes"), pts: sum("pts"), reb: sum("reb"), ast: sum("ast"), selected: sum("selected") } : null,
    isIncomplete: totalMinutes - attributedMinutes > MINUTES_EPSILON,
  };
}

/**
 * The opponent's last ten games at the player's estimated primary position, newest first, with the individual opposing players.
 * The position is chosen exactly as for the opponent chart and the DvP columns (the primary of the roster label's classification).
 */
export function opponentBoxTable(entry: Pick<BoardEntry, "positionLabel" | "opponent" | "gameKey" | "market">, artifact: { opponentBoxScores?: OpponentBoxScores }): OpponentBoxTable {
  if (artifact.opponentBoxScores === undefined) return opponentBoxUnavailable("stale");
  const classification = classifyRosterLabel(entry.positionLabel);
  if (classification.ok === false) return opponentBoxUnavailable("no-position");
  const position = classification.primary;
  if (!entry.opponent) return opponentBoxUnavailable("no-opponent", position);
  const window = (artifact.opponentBoxScores[opponentBoxKey(entry.gameKey, entry.opponent)] ?? []).slice(-L10_GAMES);
  const games = window.map((g) => gameView(g, position, entry.market)).reverse();
  if (games.length === 0) return opponentBoxUnavailable("none", position);
  const withFigure = games.flatMap((g) => (g.subtotal === null ? [] : [g.subtotal]));
  const totalMinutes = games.reduce((sum, g) => sum + g.totalMinutes, 0);
  const attributedMinutes = games.reduce((sum, g) => sum + g.attributedMinutes, 0);
  return {
    status: withFigure.length === 0 ? "none" : "ok",
    position,
    games,
    average: averages(withFigure),
    gamesWithFigure: withFigure.length,
    incompleteGames: games.filter((g) => g.isIncomplete).length,
    coverage: totalMinutes > 0 ? attributedMinutes / totalMinutes : null,
    isSmallSample: games.length < SMALL_SAMPLE_BELOW,
  };
}
