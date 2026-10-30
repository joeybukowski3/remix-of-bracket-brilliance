/**
 * Pregame team defensive ratings for the player Last 10 table's DEF RTG column.
 *
 * Definition. Defensive rating is points allowed per 100 possessions, so a LOWER number is a stronger defense. A team's rating
 * on a date pools its usable regular-season games dated STRICTLY BEFORE that date: 100 x (points allowed) / (possessions),
 * summed over the games first, never an average of per-game ratings. The game itself, and every later game, never contribute:
 * no future-game leakage.
 *
 * Possessions are estimated from the player rows as FGA + 0.44 x FTA - OREB + TOV for each team, and the game's possession
 * count is the mean of the two teams' estimates (both sides play the same possessions). Player rows exclude team-level
 * rebounds and turnovers, so the estimate runs slightly off an official figure; it is consistent across teams and dates, which
 * is what a league-relative reading needs. It is labelled an estimate wherever it is shown.
 *
 * A game is USABLE only when every player row of both teams carries all four possession inputs and each team's minutes add up
 * to a complete game (gameResults.ts, the W/L rule: within 2 minutes, so a missing player row is not mistaken for rounding). Any other game is left out of every rating, in numerator and denominator alike, and
 * counted, never repaired. An older import without the inputs therefore yields an empty table, and the page says so.
 *
 * Rank is among every team with at least one usable game before the date (1 = lowest rating, ties share a rank). The
 * strong / average / weak label is derived from the rank by defenseStrength (recentForm.ts) and only for a team with
 * MIN_GAMES_FOR_STRENGTH or more games. Display context only: nothing here changes a projection.
 */
import { teamDefenseKey, type TeamDefenseEntry, type TeamDefenseTable } from "../recentForm";
import { isCompleteTeamMinutes } from "./gameResults";
import type { ImportedPlayerGame } from "./playerGameImport";

const FREE_THROW_POSSESSION_WEIGHT = 0.44;
const PER_POSSESSIONS = 100;
/** Two ratings closer than this are the same rating for ranking. */
const RANK_EPSILON = 1e-9;
const RATING_DECIMALS = 100;

export interface PossessionInputs {
  fga: number;
  fta: number;
  oreb: number;
  tov: number;
}

/** Estimated possessions for one team's totals: FGA + 0.44 x FTA - OREB + TOV. */
export const estimatedPossessions = (t: PossessionInputs): number => t.fga + FREE_THROW_POSSESSION_WEIGHT * t.fta - t.oreb + t.tov;

interface TeamTotals extends PossessionInputs {
  pts: number;
  minutes: number;
  /** False once any player row lacks the possession inputs. */
  complete: boolean;
}

interface UsableGame {
  date: string;
  /** Points allowed and the shared possession estimate, by team. */
  sides: Array<{ team: string; allowed: number }>;
  possessions: number;
}

function teamTotals(rows: readonly ImportedPlayerGame[]): TeamTotals {
  const totals: TeamTotals = { pts: 0, minutes: 0, fga: 0, fta: 0, oreb: 0, tov: 0, complete: true };
  for (const r of rows) {
    totals.pts += r.pts;
    totals.minutes += r.minutes;
    if (r.fga === undefined || r.fta === undefined || r.oreb === undefined || r.tov === undefined) totals.complete = false;
    else {
      totals.fga += r.fga;
      totals.fta += r.fta;
      totals.oreb += r.oreb;
      totals.tov += r.tov;
    }
  }
  return totals;
}

/** The season's regular-season games grouped by id, each as the two teams' rows. */
function groupGames(rows: readonly ImportedPlayerGame[], season: string): Map<string, ImportedPlayerGame[]> {
  const games = new Map<string, ImportedPlayerGame[]>();
  for (const r of rows) {
    if (r.season !== season || r.seasonType !== "regular") continue;
    games.set(r.gameId, [...(games.get(r.gameId) ?? []), r]);
  }
  return games;
}

function toUsableGame(group: readonly ImportedPlayerGame[]): UsableGame | null {
  const teams = [...new Set(group.map((r) => r.team))];
  if (teams.length !== 2) return null;
  const [a, b] = teams.map((team) => ({ team, totals: teamTotals(group.filter((r) => r.team === team)) }));
  if (![a, b].every((side) => side.totals.complete && isCompleteTeamMinutes(side.totals.minutes))) return null;
  const possessions = (estimatedPossessions(a.totals) + estimatedPossessions(b.totals)) / 2;
  if (!(possessions > 0)) return null;
  return { date: group[0].gameDate, sides: [{ team: a.team, allowed: b.totals.pts }, { team: b.team, allowed: a.totals.pts }], possessions };
}

interface Running {
  allowed: number;
  possessions: number;
  games: number;
}

const rate = (allowed: number, possessions: number): number => (PER_POSSESSIONS * allowed) / possessions;
const rounded = (value: number): number => Math.round(value * RATING_DECIMALS) / RATING_DECIMALS;

/** Entries for the teams playing on one date, from the running totals of every game BEFORE it. */
function entriesBefore(running: ReadonlyMap<string, Running>, playing: readonly string[], date: string): Array<[string, TeamDefenseEntry]> {
  const ranked = [...running].filter(([, r]) => r.games > 0).map(([team, r]) => ({ team, rating: rate(r.allowed, r.possessions), games: r.games }));
  if (ranked.length === 0) return [];
  const league = [...running.values()].reduce((sum, r) => ({ allowed: sum.allowed + r.allowed, possessions: sum.possessions + r.possessions }), { allowed: 0, possessions: 0 });
  const leagueRating = rounded(rate(league.allowed, league.possessions));
  return playing.flatMap((team) => {
    const own = ranked.find((r) => r.team === team);
    if (!own) return [];
    const rank = 1 + ranked.filter((r) => r.rating < own.rating - RANK_EPSILON).length;
    return [[teamDefenseKey(team, date), { rating: rounded(own.rating), leagueRating, rank, rankedOf: ranked.length, games: own.games }] as [string, TeamDefenseEntry]];
  });
}

/** Keeps only the (team, date) ratings a board reads, so a snapshot does not carry every team on every date of the season. */
export function restrictTeamDefense(table: TeamDefenseTable, keys: ReadonlySet<string>): TeamDefenseTable {
  return { ...table, asOf: Object.fromEntries(Object.entries(table.asOf).filter(([key]) => keys.has(key))) };
}

export function buildTeamDefense(rows: readonly ImportedPlayerGame[], season: string): TeamDefenseTable {
  const groups = groupGames(rows, season);
  const usable: UsableGame[] = [];
  let unusableGames = 0;
  for (const group of groups.values()) {
    const game = toUsableGame(group);
    if (game) usable.push(game);
    else unusableGames += 1;
  }
  // Teams that play on each date, from every game of the season (usable or not): a rating is shown for the game a player played.
  const playingOn = new Map<string, Set<string>>();
  for (const group of groups.values()) for (const r of group) playingOn.set(r.gameDate, (playingOn.get(r.gameDate) ?? new Set()).add(r.team));

  const byDate = new Map<string, UsableGame[]>();
  for (const game of usable) byDate.set(game.date, [...(byDate.get(game.date) ?? []), game]);
  const running = new Map<string, Running>();
  const asOf: Record<string, TeamDefenseEntry> = {};
  for (const date of [...playingOn.keys()].sort()) {
    // Snapshot first, then add the day's games: a date's own games never reach its own entries.
    for (const [key, entry] of entriesBefore(running, [...(playingOn.get(date) ?? [])], date)) asOf[key] = entry;
    for (const game of byDate.get(date) ?? []) {
      for (const side of game.sides) {
        const prior = running.get(side.team) ?? { allowed: 0, possessions: 0, games: 0 };
        running.set(side.team, { allowed: prior.allowed + side.allowed, possessions: prior.possessions + game.possessions, games: prior.games + 1 });
      }
    }
  }
  return { season, asOf, usableGames: usable.length, unusableGames };
}
