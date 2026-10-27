/**
 * What each defense allowed to each estimated position in its last ten completed games, for the private preview board.
 *
 * It aggregates the same hoopR player-game rows the DvP builder uses, classified the same way: a player-season's estimated
 * position label (dvpLabelFor) expanded to position weights (classifyRosterLabel), regular-season games only. The unit is the
 * DEFENSE's game, never the player's: the window is the opponent's ten most recent distinct completed games, and a game
 * counts once however many opposing players appeared. Within a game the allowed figure is the sum over opposing players of
 * position weight x stat, exactly the DvP numerator for that game.
 *
 * Gates: this season only; strictly before the upcoming game's Eastern date (the leakage gate every pregame feature uses);
 * did-not-play and zero-minute rows never count. A game in which no opposing minutes could be attributed to any position
 * carries no figure (null), not a zero: the data does not say what that position allowed.
 *
 * buildOpponentBoxScores returns the same games with the individual opposing players (name, minutes, stats, estimated position),
 * collected in the same pass over the same rows, so a position's subtotal there is exactly the bar here.
 *
 * Display context only. Nothing here changes a projection, a DvP row or a rank.
 */
import { DVP_POSITIONS, classifyRosterLabel, type DvpPosition } from "../dvpPositions";
import { L10_GAMES, opponentBoxKey, opponentRecentKey, type OpponentBoxScoreGame, type OpponentBoxScores, type OpponentRecentGame, type OpponentRecentSequence, type OpposingPlayerLine } from "../recentForm";
import type { ImportedPlayerGame } from "./playerGameImport";
import { dvpLabelFor, type PositionEstimateSet } from "./positionEstimates";

/** The slate fields this needs; SlateGame (slateBuild.ts) satisfies it. */
export interface UpcomingGame {
  gameKey: string;
  away: string;
  home: string;
  /** Eastern calendar date of the upcoming game: only earlier games count. */
  date: string;
}

interface DefenseGame {
  gameId: string;
  date: string;
  versus: string;
  defenseIsHome: boolean;
  totalMinutes: number;
  attributedMinutes: number;
  allowed: Record<DvpPosition, { pts: number; reb: number; ast: number }>;
  players: OpposingPlayerLine[];
}

const emptyAllowed = (): DefenseGame["allowed"] => Object.fromEntries(DVP_POSITIONS.map((p) => [p, { pts: 0, reb: 0, ast: 0 }])) as DefenseGame["allowed"];

/** Every completed regular-season game of this season per defending team, with the opposing players' attributed totals. */
function defenseGames(rows: readonly ImportedPlayerGame[], positions: PositionEstimateSet, season: string): Map<string, DefenseGame[]> {
  const games = new Map<string, DefenseGame>();
  for (const r of rows) {
    if (r.season !== season || r.seasonType !== "regular" || !(Number.isFinite(r.minutes) && r.minutes > 0)) continue;
    const key = `${r.opponent}|${r.gameId}`;
    const game = games.get(key) ?? { gameId: r.gameId, date: r.gameDate, versus: r.team, defenseIsHome: !r.isHome, totalMinutes: 0, attributedMinutes: 0, allowed: emptyAllowed(), players: [] };
    games.set(key, game);
    game.totalMinutes += r.minutes;
    const position = classifyRosterLabel(dvpLabelFor(positions, r.season, r.playerId));
    game.players.push({ name: r.playerName, minutes: r.minutes, pts: r.pts, reb: r.reb, ast: r.ast, position: position.ok ? position.primary : null });
    if (position.ok === false) continue;
    game.attributedMinutes += r.minutes;
    for (const [pos, weight] of Object.entries(position.weights) as [DvpPosition, number][]) {
      game.allowed[pos].pts += weight * r.pts;
      game.allowed[pos].reb += weight * r.reb;
      game.allowed[pos].ast += weight * r.ast;
    }
  }
  const byTeam = new Map<string, DefenseGame[]>();
  for (const [key, game] of games) {
    const team = key.slice(0, key.indexOf("|"));
    byTeam.set(team, [...(byTeam.get(team) ?? []), game]);
  }
  return byTeam;
}

const toGame = (game: DefenseGame, position: DvpPosition): OpponentRecentGame => {
  const known = game.attributedMinutes > 0;
  const { pts, reb, ast } = game.allowed[position];
  return {
    date: game.date,
    versus: game.versus,
    defenseIsHome: game.defenseIsHome,
    attributedMinutes: game.attributedMinutes,
    totalMinutes: game.totalMinutes,
    pts: known ? pts : null,
    reb: known ? reb : null,
    ast: known ? ast : null,
  };
};

/** The defense's completed games strictly before the upcoming game, oldest to newest: the one rule both outputs share. */
const completedBefore = (byTeam: ReadonlyMap<string, DefenseGame[]>, team: string, upcoming: UpcomingGame): DefenseGame[] =>
  (byTeam.get(team) ?? []).filter((g) => g.date < upcoming.date).sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));

/** One sequence per upcoming game, defending team and position, keyed by opponentRecentKey. A defense with no completed game gets none. */
export function buildOpponentRecent(rows: readonly ImportedPlayerGame[], positions: PositionEstimateSet, slate: readonly UpcomingGame[], season: string): Record<string, OpponentRecentSequence> {
  const byTeam = defenseGames(rows, positions, season);
  const out: Record<string, OpponentRecentSequence> = {};
  for (const upcoming of slate) {
    for (const team of [upcoming.away, upcoming.home]) {
      const completed = completedBefore(byTeam, team, upcoming);
      if (completed.length === 0) continue;
      const window = completed.slice(-L10_GAMES);
      for (const position of DVP_POSITIONS) {
        out[opponentRecentKey(upcoming.gameKey, team, position)] = { team, position, season, seasonGames: completed.length, games: window.map((g) => toGame(g, position)) };
      }
    }
  }
  return out;
}

const toBoxGame = (game: DefenseGame): OpponentBoxScoreGame => ({ gameId: game.gameId, date: game.date, versus: game.versus, defenseIsHome: game.defenseIsHome, players: [...game.players].sort((a, b) => a.name.localeCompare(b.name) || b.minutes - a.minutes) });

/**
 * The same last-ten window as buildOpponentRecent, with every opposing player who played, keyed by opponentBoxKey (one list per
 * upcoming game and defending team; the position is chosen when the table is read, from the player's own estimate).
 */
export function buildOpponentBoxScores(rows: readonly ImportedPlayerGame[], positions: PositionEstimateSet, slate: readonly UpcomingGame[], season: string): OpponentBoxScores {
  const byTeam = defenseGames(rows, positions, season);
  const out: OpponentBoxScores = {};
  for (const upcoming of slate) {
    for (const team of [upcoming.away, upcoming.home]) {
      const completed = completedBefore(byTeam, team, upcoming);
      if (completed.length === 0) continue;
      out[opponentBoxKey(upcoming.gameKey, team)] = completed.slice(-L10_GAMES).map(toBoxGame);
    }
  }
  return out;
}
