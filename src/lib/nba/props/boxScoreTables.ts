/**
 * The two box-score tables of the expanded props row: the player's own last ten games (with the pregame defensive rating of
 * each opponent), and the opponent's last ten games (the points the defense allowed, the opposing starter at the player's
 * position, and every opposing player behind them). Browser-safe (no Node imports).
 *
 * Same records as the charts (recentForm.ts). The opponent's position is the player's estimated primary position, the same one
 * Defense vs. Position uses (dvpPositions.ts), and the opposing starter at it is chosen by opponentStarter.ts from the source's
 * explicit starter flags: a game with no single identifiable starter has no figure (a gap with its reason), never a guess, and
 * players' figures are never added into a position total. Team points allowed are shown on their own and are null when the
 * opposing box score is not a complete game.
 *
 * Private-preview data only (the records come from a source not licensed for publication); display context, never a model input.
 */
import { classifyRosterLabel, type DvpPosition } from "./dvpPositions";
import { matchStarter, teamPointsAllowed, type StarterMatch } from "./opponentStarter";
import {
  L10_GAMES, NO_STARTER_GAPS, SMALL_SAMPLE_BELOW, defenseStrength, mean, opponentBoxKey, opponentLastTenUnavailable, teamDefenseKey,
  type DefenseStrength, type GameResult, type OpponentBoxScoreGame, type OpponentBoxScores, type OpponentLastTen, type OpposingPlayerLine, type PlayerLastTen, type RecentPoint, type StarterGaps, type TeamDefenseEntry, type TeamDefenseTable,
} from "./recentForm";
import type { BoardEntry, BoardMarket } from "./propsBoard";

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
  /** The opponent's defensive rating before this game (teamDefense.ts); null when it has no usable earlier game or the board carries none. */
  defense: TeamDefenseEntry | null;
  /** Strong / average / weak by league rank, only from MIN_GAMES_FOR_STRENGTH prior games (recentForm.ts); null otherwise. */
  strength: DefenseStrength | null;
}

export interface PlayerBoxTable {
  status: PlayerLastTen["status"];
  /** Newest to oldest. */
  rows: PlayerBoxRow[];
  average: BoxAverages | null;
  isSmallSample: boolean;
  /** Wins and losses among the games whose final score is known; null when none is. `known` of `rows.length` games carry a result. */
  record: { wins: number; losses: number; known: number } | null;
  /** "stale": the board predates DEF RTG. "no-inputs": it was built from data without possession inputs. "ok": ratings exist where a game had an earlier usable opponent game. */
  defenseStatus: "stale" | "no-inputs" | "ok";
  /** Mean opponent rating over the games that have one, and how many that is. */
  defenseAverage: number | null;
  defenseKnown: number;
}

const averages = (rows: readonly { minutes: number; pts: number; reb: number; ast: number; selected: number }[]): BoxAverages | null =>
  rows.length === 0 ? null : { minutes: mean(rows.map((r) => r.minutes)) ?? 0, pts: mean(rows.map((r) => r.pts)) ?? 0, reb: mean(rows.map((r) => r.reb)) ?? 0, ast: mean(rows.map((r) => r.ast)) ?? 0, selected: mean(rows.map((r) => r.selected)) ?? 0 };

/** "no-inputs" only when games exist and none was usable; a season with no games yet is simply "ok" with nothing to rate. */
const defenseStatusOf = (teamDefense: TeamDefenseTable | null | undefined): PlayerBoxTable["defenseStatus"] =>
  teamDefense == null ? "stale" : teamDefense.usableGames === 0 && teamDefense.unusableGames > 0 ? "no-inputs" : "ok";

/** The player's last-ten window as table rows, newest first, with its average. The window is already pregame-only and played-only (seasonStatsBuild.ts). */
export function playerBoxTable(last: PlayerLastTen, market: BoardMarket, teamDefense?: TeamDefenseTable | null): PlayerBoxTable {
  const defenseStatus = defenseStatusOf(teamDefense);
  const rows: PlayerBoxRow[] = last.recent
    .map((g, i): PlayerBoxRow => {
      const defense = defenseStatus === "ok" ? teamDefense?.asOf[teamDefenseKey(g.opponent, g.date)] ?? null : null;
      return { key: `${g.date}-${i}`, date: g.date, opponent: g.opponent, isHome: g.isHome, minutes: g.minutes, pts: g.pts, reb: g.reb, ast: g.ast, selected: g[market], result: g.result ?? null, defense, strength: defenseStrength(defense) };
    })
    .reverse();
  const decided = rows.filter((r) => r.result !== null);
  const wins = decided.filter((r) => r.result?.won).length;
  const ratings = rows.flatMap((r) => (r.defense === null ? [] : [r.defense.rating]));
  return {
    status: last.status,
    rows,
    average: averages(rows),
    isSmallSample: last.isSmallSample,
    record: decided.length === 0 ? null : { wins, losses: decided.length - wins, known: decided.length },
    defenseStatus,
    defenseAverage: mean(ratings),
    defenseKnown: ratings.length,
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
  /** The source's explicit starter status; null when the board does not carry it. */
  starter: boolean | null;
}

export interface OpponentBoxGame {
  gameId: string;
  date: string;
  /** The team that faced the defense: the team the listed players play for. */
  versus: string;
  defenseIsHome: boolean;
  /** Every opposing player who played, starters first, then by minutes. The complete box score behind the figures. */
  players: OpponentBoxPlayer[];
  /** Points the defense allowed (the opposing team's total); null when the opposing box score is not a complete game. */
  teamPtsAllowed: number | null;
  /** Which opposing starter holds the player's position, or why none is identified. */
  starterMatch: StarterMatch<OpponentBoxPlayer>;
  /** The matched starter, when exactly one is identified. */
  starter: OpponentBoxPlayer | null;
}

export interface OpponentBoxTable {
  /** "stale": the board predates box scores. "none": no usable game. */
  status: "ok" | "none" | "stale" | "no-position" | "no-opponent";
  position: DvpPosition | null;
  /** Newest to oldest, at most ten. */
  games: OpponentBoxGame[];
  /** Mean of the matched starters' lines, over the games that identify one; null with none. */
  average: BoxAverages | null;
  /** Games that identify exactly one starter at the position (the games `average` is over). */
  gamesWithFigure: number;
  gaps: StarterGaps;
  /** Whether the source's starter status is present for "all" games, "some" or "none" (a board built before it was carried). */
  starterData: "all" | "some" | "none";
  /** Mean team points allowed over the games where the opposing box score is complete; null with none. */
  teamPtsAverage: number | null;
  teamPtsKnown: number;
  isSmallSample: boolean;
}

const UNAVAILABLE: Omit<OpponentBoxTable, "status" | "position"> = { games: [], average: null, gamesWithFigure: 0, gaps: NO_STARTER_GAPS, starterData: "none", teamPtsAverage: null, teamPtsKnown: 0, isSmallSample: false };
export const opponentBoxUnavailable = (status: Exclude<OpponentBoxTable["status"], "ok">, position: DvpPosition | null = null): OpponentBoxTable => ({ status, position, ...UNAVAILABLE });

const toPlayer = (line: OpposingPlayerLine, market: BoardMarket): OpponentBoxPlayer => ({ name: line.name, minutes: line.minutes, pts: line.pts, reb: line.reb, ast: line.ast, selected: line[market], position: line.position, starter: line.starter ?? null });
const startersFirst = (a: OpponentBoxPlayer, b: OpponentBoxPlayer): number => Number(b.starter === true) - Number(a.starter === true) || b.minutes - a.minutes || a.name.localeCompare(b.name);

function gameView(game: OpponentBoxScoreGame, position: DvpPosition, market: BoardMarket): OpponentBoxGame {
  const lines = game.players.map((p) => toPlayer(p, market));
  const starterMatch = matchStarter(lines, position);
  return {
    gameId: game.gameId,
    date: game.date,
    versus: game.versus,
    defenseIsHome: game.defenseIsHome,
    players: [...lines].sort(startersFirst),
    teamPtsAllowed: teamPointsAllowed(lines),
    starterMatch,
    starter: starterMatch.kind === "matched" ? starterMatch.player : null,
  };
}

function gapsOf(games: readonly OpponentBoxGame[]): StarterGaps {
  const count = (kind: StarterMatch["kind"]): number => games.filter((g) => g.starterMatch.kind === kind).length;
  return { multiple: count("multiple"), none: count("none"), uncertain: count("uncertain"), unavailable: count("unavailable") };
}

const gamesOf = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;

/** "2 games with several PG starters; 1 game with no PG starter" for the non-zero reasons, or an empty string. */
export function describeStarterGaps(gaps: StarterGaps, position: string): string {
  return [
    gaps.multiple > 0 ? `${gamesOf(gaps.multiple)} with several ${position} starters` : "",
    gaps.none > 0 ? `${gamesOf(gaps.none)} with no ${position} starter` : "",
    gaps.uncertain > 0 ? `${gamesOf(gaps.uncertain)} where a starter has no position estimate` : "",
    gaps.unavailable > 0 ? `${gamesOf(gaps.unavailable)} without usable starter status` : "",
  ].filter(Boolean).join("; ");
}

/** One plain sentence for a game's starter outcome, for hovers and assistive text. */
export function describeStarterMatch(match: StarterMatch<OpponentBoxPlayer>, position: string): string {
  switch (match.kind) {
    case "matched":
      return `${match.player.name} started at ${position}`;
    case "multiple":
      return `${match.players.length} starters are estimated at ${position} (${match.players.map((p) => p.name).join(", ")}): no single player is chosen`;
    case "none":
      return `No starter is estimated at ${position}: a positional substitution or an unconventional lineup`;
    case "uncertain":
      return `${match.unclassified} ${match.unclassified === 1 ? "starter has" : "starters have"} no position estimate, so who held ${position} is unclear`;
    case "unavailable":
      return match.reason === "no-flags" ? "The source gave no starter status for this game" : `The source flagged ${match.starters} starters instead of five, so it is not trusted`;
  }
}

/**
 * The opponent's last ten games, newest first: the points the defense allowed, and the opposing starter at the player's estimated
 * primary position, game by game, with every opposing player behind them. The position is chosen exactly as for the DvP columns.
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
  const matched = games.flatMap((g) => (g.starter === null ? [] : [g.starter]));
  const teamPoints = games.flatMap((g) => (g.teamPtsAllowed === null ? [] : [g.teamPtsAllowed]));
  const gaps = gapsOf(games);
  // Only a game with no starter flags at all means the board predates them; flags that name other than five starters are a gap of their own.
  const withoutFlags = games.filter((g) => g.starterMatch.kind === "unavailable" && g.starterMatch.reason === "no-flags").length;
  return {
    status: "ok",
    position,
    games,
    average: averages(matched),
    gamesWithFigure: matched.length,
    gaps,
    starterData: withoutFlags === 0 ? "all" : withoutFlags === games.length ? "none" : "some",
    teamPtsAverage: mean(teamPoints),
    teamPtsKnown: teamPoints.length,
    isSmallSample: games.length < SMALL_SAMPLE_BELOW,
  };
}

/**
 * The opponent chart and the board's Opp L10 column, from the very same table, so a bar, a row, the average and the column can
 * never disagree. Each bar is the matched starter's figure in the selected market; a game without one is a gap with its reason.
 */
export function opponentLastTenFromBox(box: OpponentBoxTable): OpponentLastTen {
  if (box.status !== "ok") return opponentLastTenUnavailable(box.status);
  const position = box.position ?? "the position";
  if (box.starterData === "none") return { ...opponentLastTenUnavailable("no-starters"), games: box.games.length, gaps: box.gaps };
  const points: RecentPoint[] = [...box.games].reverse().map((g) => ({
    date: g.date,
    versus: `${g.defenseIsHome ? "vs" : "@"} ${g.versus}`,
    value: g.starter?.selected ?? null,
    detail: g.starter ? `${g.starter.name}, ${Math.round(g.starter.minutes)} min` : describeStarterMatch(g.starterMatch, position),
  }));
  return {
    status: box.gamesWithFigure === 0 ? "none" : "ok",
    points,
    games: box.games.length,
    gamesWithFigure: box.gamesWithFigure,
    average: box.average?.selected ?? null,
    gaps: box.gaps,
    isSmallSample: box.isSmallSample,
  };
}
