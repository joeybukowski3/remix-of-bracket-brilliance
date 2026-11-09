/**
 * The two box-score tables of the expanded props row: the player's own last ten games (with the pregame defensive rating of
 * each opponent), and the opponent's last ten games (what the defense allowed as a team, and every opposing player behind it,
 * most minutes first). Browser-safe (no Node imports).
 *
 * Same records as the charts (recentForm.ts). The team figures come first: points allowed are the official score, rebounds and
 * assists the team's total over a complete box, and each is null when the box cannot be trusted. The opposing starter at the
 * player's estimated position (opponentStarter.ts, from the source's explicit starter flags) is optional detail that never
 * drives a figure: a game with no single identifiable starter has no starter figure (a gap with its reason), never a guess,
 * and players' figures are never added into a position total.
 *
 * Private-preview data only (the records come from a source not licensed for publication); display context, never a model input.
 */
import { classifyRosterLabel, type DvpPosition } from "./dvpPositions";
import { matchStarter, teamPointsFor, teamStatAllowed, type StarterMatch } from "./opponentStarter";
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

/** A player who logged at least this many minutes in a game counts as part of that game's rotation; the others are listed apart. */
export const ROTATION_GAME_MINUTES = 15;

export interface OpponentBoxPlayer {
  name: string;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  selected: number;
  /** The estimated primary position DvP uses, shown as approximate; null when the player has none. */
  position: DvpPosition | null;
  /** The source's explicit starter status; null when the board does not carry it. */
  starter: boolean | null;
  /** At least ROTATION_GAME_MINUTES in this game. */
  inRotation: boolean;
}

export interface OpponentBoxGame {
  gameId: string;
  date: string;
  /** The team that faced the defense: the team the listed players play for. */
  versus: string;
  defenseIsHome: boolean;
  /** Every opposing player who played, by minutes. The complete box score behind the figures. */
  players: OpponentBoxPlayer[];
  /** Points the defense allowed: the official final score when the board carries it, else the opposing team's total; null when neither is trustworthy. */
  teamPtsAllowed: number | null;
  /** Where `teamPtsAllowed` comes from; null when it is unknown. */
  teamPtsSource: "official" | "box" | null;
  /** The defense's team totals allowed in each stat (teamStatAllowed); null where the box cannot be trusted. */
  teamAllowed: Record<BoardMarket, number | null>;
  /** False when the listed players do not account for the team's points (a player row is missing) or, without an official score, the minutes do not make a full game. */
  boxComplete: boolean;
  /** What the listed players' points add up to. */
  playerPtsSum: number;
  /** Which opposing starter holds the player's position, or why none is identified; null when the player has no estimated position. Optional detail. */
  starterMatch: StarterMatch<OpponentBoxPlayer> | null;
  /** The matched starter, when exactly one is identified. */
  starter: OpponentBoxPlayer | null;
}

export interface OpponentBoxTable {
  /** "stale": the board predates box scores. "none": no usable game. */
  status: "ok" | "none" | "stale" | "no-opponent";
  /** The player's estimated primary position, for the optional position detail; null when there is none. */
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
  /** Mean team total allowed per game in each stat, over the games where it is trustworthy; null with none. */
  teamAverage: Record<BoardMarket, number | null>;
  /** How many of the games each team average rests on. */
  teamKnown: Record<BoardMarket, number>;
  isSmallSample: boolean;
}

const NO_TEAM_AVERAGE: Record<BoardMarket, number | null> = { pts: null, reb: null, ast: null };
const NO_TEAM_KNOWN: Record<BoardMarket, number> = { pts: 0, reb: 0, ast: 0 };
const UNAVAILABLE: Omit<OpponentBoxTable, "status" | "position"> = { games: [], average: null, gamesWithFigure: 0, gaps: NO_STARTER_GAPS, starterData: "none", teamAverage: NO_TEAM_AVERAGE, teamKnown: NO_TEAM_KNOWN, isSmallSample: false };
export const opponentBoxUnavailable = (status: Exclude<OpponentBoxTable["status"], "ok">, position: DvpPosition | null = null): OpponentBoxTable => ({ status, position, ...UNAVAILABLE });

const toPlayer = (line: OpposingPlayerLine, market: BoardMarket): OpponentBoxPlayer => ({
  name: line.name, minutes: line.minutes, pts: line.pts, reb: line.reb, ast: line.ast, selected: line[market], position: line.position, starter: line.starter ?? null, inRotation: line.minutes >= ROTATION_GAME_MINUTES,
});
const byMinutes = (a: OpponentBoxPlayer, b: OpponentBoxPlayer): number => b.minutes - a.minutes || a.name.localeCompare(b.name);

function gameView(game: OpponentBoxScoreGame, position: DvpPosition | null, market: BoardMarket): OpponentBoxGame {
  const lines = game.players.map((p) => toPlayer(p, market));
  const starterMatch = position === null ? null : matchStarter(lines, position);
  const points = teamPointsFor(lines, game.teamScore);
  return {
    gameId: game.gameId,
    date: game.date,
    versus: game.versus,
    defenseIsHome: game.defenseIsHome,
    players: [...lines].sort(byMinutes),
    teamPtsAllowed: points.points,
    teamPtsSource: points.source,
    teamAllowed: { pts: teamStatAllowed(lines, "pts", game.teamScore), reb: teamStatAllowed(lines, "reb", game.teamScore), ast: teamStatAllowed(lines, "ast", game.teamScore) },
    boxComplete: points.complete,
    playerPtsSum: points.playerSum,
    starterMatch,
    starter: starterMatch?.kind === "matched" ? starterMatch.player : null,
  };
}

function gapsOf(games: readonly OpponentBoxGame[]): StarterGaps {
  const count = (kind: StarterMatch["kind"]): number => games.filter((g) => g.starterMatch?.kind === kind).length;
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

const BOARD_STATS = ["pts", "reb", "ast"] as const;

/**
 * The opponent's last ten games, newest first: what the defense allowed as a team in each stat, with every opposing player behind
 * it, and (as optional detail) the opposing starter at the player's estimated primary position, chosen exactly as for the DvP
 * columns. A player with no estimated position still gets the whole table; only the position detail is unavailable.
 */
export function opponentBoxTable(entry: Pick<BoardEntry, "positionLabel" | "opponent" | "gameKey" | "market">, artifact: { opponentBoxScores?: OpponentBoxScores }): OpponentBoxTable {
  if (artifact.opponentBoxScores === undefined) return opponentBoxUnavailable("stale");
  const classification = classifyRosterLabel(entry.positionLabel);
  const position = classification.ok ? classification.primary : null;
  if (!entry.opponent) return opponentBoxUnavailable("no-opponent", position);
  const window = (artifact.opponentBoxScores[opponentBoxKey(entry.gameKey, entry.opponent)] ?? []).slice(-L10_GAMES);
  const games = window.map((g) => gameView(g, position, entry.market)).reverse();
  if (games.length === 0) return opponentBoxUnavailable("none", position);
  const matched = games.flatMap((g) => (g.starter === null ? [] : [g.starter]));
  const known = (stat: BoardMarket): number[] => games.flatMap((g) => (g.teamAllowed[stat] === null ? [] : [g.teamAllowed[stat] as number]));
  const gaps = gapsOf(games);
  // Only a game with no starter flags at all means the board predates them; flags that name other than five starters are a gap of their own.
  const withoutFlags = games.filter((g) => g.players.length === 0 || g.players.some((p) => p.starter === null)).length;
  return {
    status: "ok",
    position,
    games,
    average: averages(matched),
    gamesWithFigure: matched.length,
    gaps,
    starterData: withoutFlags === 0 ? "all" : withoutFlags === games.length ? "none" : "some",
    teamAverage: Object.fromEntries(BOARD_STATS.map((stat) => [stat, mean(known(stat))])) as Record<BoardMarket, number | null>,
    teamKnown: Object.fromEntries(BOARD_STATS.map((stat) => [stat, known(stat).length])) as Record<BoardMarket, number>,
    isSmallSample: games.length < SMALL_SAMPLE_BELOW,
  };
}

/** Why a game has a team figure or not, for a hover. */
const teamFigureDetail = (game: OpponentBoxGame, market: BoardMarket): string => {
  if (game.teamAllowed[market] === null) return `${game.versus}'s box score is not a complete game, so the team total is unknown`;
  if (market !== "pts") return market === "reb" ? "Sum of the listed players' rebounds over a complete box score; player rows carry no team rebounds" : "Sum of the listed players' assists over a complete box score";
  return game.teamPtsSource === "official" ? "Official final score" : "Summed from the listed players";
};

/**
 * The opponent chart and the board's Opp L10 column, from the very same table, so a bar, a row, the average and the column can
 * never disagree. Each bar is what the defense allowed as a team in the selected stat; a game whose box score cannot be trusted
 * is a gap with its reason. Never a position figure and never a sum of chosen players.
 */
export function opponentLastTenFromBox(box: OpponentBoxTable, market: BoardMarket): OpponentLastTen {
  if (box.status !== "ok") return opponentLastTenUnavailable(box.status);
  const points: RecentPoint[] = [...box.games].reverse().map((g) => ({
    date: g.date,
    versus: `${g.defenseIsHome ? "vs" : "@"} ${g.versus}`,
    value: g.teamAllowed[market],
    detail: teamFigureDetail(g, market),
  }));
  return {
    status: box.teamKnown[market] === 0 ? "none" : "ok",
    points,
    games: box.games.length,
    gamesWithFigure: box.teamKnown[market],
    average: box.teamAverage[market],
    isSmallSample: box.isSmallSample,
  };
}
