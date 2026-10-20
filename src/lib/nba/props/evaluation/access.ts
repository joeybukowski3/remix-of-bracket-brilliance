/**
 * Timestamp-gated data access: the only place that decides what is knowable
 * before a game's feature cutoff. Everything the models and the availability
 * universe see comes through here.
 *
 * Rules (fail closed):
 *   - a prior game's rows are usable only if the game is scheduled and
 *     tipoff + resultLag is strictly before the target's cutoff;
 *   - a pregame availability snapshot is usable only if it was current
 *     strictly before the cutoff;
 *   - zero-minute rows are not production history;
 *   - a player's absence counts as non-participation only when a zero-minute
 *     row or a post-game final status establishes it.
 */
import type { AvailabilityStatus, NbaAvailabilityRecord } from "../sources/types";
import { NBA_COMPETITIVE_SEASON_TYPES } from "../seasonType";
import type { NbaPlayerGame, NbaTeamGame } from "../types";
import { cutoffMs, resultAvailableMs } from "./clock";
import { ROSTER_LOOKBACK_TEAM_GAMES } from "./constants";
import type { CutoffPolicy, EvaluationDataset, FinalStatusRecord, ScheduledGame } from "./types";

export interface AccessCounters {
  unscheduledRows: number;
  availabilityIgnoredAsLate: number;
}

/**
 * Independent audit of a target's history. It recomputes the rule from the
 * schedule rather than reusing the gate's own predicate, so a weakened gate
 * (a `<=`, a dropped lag) is caught. Returns the number of rows that violate it.
 */
export function countHistoryViolations(rows: readonly NbaPlayerGame[], target: ScheduledGame, schedule: ReadonlyMap<string, ScheduledGame>, policy: CutoffPolicy): number {
  const cutoff = Date.parse(target.tipoffUtc) - policy.leadMinutes * 60_000;
  let violations = 0;
  for (const row of rows) {
    const source = schedule.get(row.gameId);
    const resultAt = source ? Date.parse(source.tipoffUtc) + policy.resultLagMinutes * 60_000 : Number.POSITIVE_INFINITY;
    if (!source || resultAt >= cutoff || row.gameDate >= target.gameDate || row.gameId === target.gameId) violations += 1;
  }
  return violations;
}

export interface DataAccess {
  readonly counters: AccessCounters;
  cutoffOf(game: ScheduledGame): number;
  /** True when the game is scheduled and its result became available strictly before the instant. */
  resultUsable(gameId: string, atMs: number): boolean;
  hasResults(gameId: string): boolean;
  teamsOf(game: ScheduledGame): number[];
  rowsOf(gameId: string): readonly NbaPlayerGame[];
  /** Usable prior rows with minutes > 0, oldest first. */
  history(playerId: number, cutoff: number): NbaPlayerGame[];
  /** Competitive game dates of the team whose results were usable at the cutoff, ascending. */
  teamDates(teamId: number, cutoff: number): string[];
  statusAt(game: ScheduledGame, playerId: number): AvailabilityStatus | null;
  /** Players knowable before the cutoff as candidates to appear for the team. */
  universe(game: ScheduledGame, teamId: number): number[];
  /** played / did not play, or null when participation is not established. */
  outcome(gameId: string, playerId: number): { played: boolean } | null;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const competitive = (row: { seasonType: NbaPlayerGame["seasonType"] }) => NBA_COMPETITIVE_SEASON_TYPES.includes(row.seasonType);

export function createDataAccess(dataset: EvaluationDataset, schedule: ReadonlyMap<string, ScheduledGame>, policy: CutoffPolicy): DataAccess {
  const counters: AccessCounters = { unscheduledRows: 0, availabilityIgnoredAsLate: 0 };
  const availableAt = new Map<string, number>([...schedule].map(([id, game]) => [id, resultAvailableMs(game, policy)]));

  const rowsByPlayer = new Map<number, NbaPlayerGame[]>();
  const rowsByGame = new Map<string, NbaPlayerGame[]>();
  const rowByGamePlayer = new Map<string, NbaPlayerGame>();
  const playersByTeamSeason = new Map<string, Set<number>>();
  const seenPlayerRows = new Set<string>();
  for (const row of dataset.playerGames) {
    const rowKey = `${row.gameId}|${row.playerId}`;
    if (seenPlayerRows.has(rowKey)) throw new Error(`Duplicate player-game row ${rowKey}`);
    seenPlayerRows.add(rowKey);
    const scheduled = schedule.get(row.gameId);
    if (!scheduled) counters.unscheduledRows += 1;
    else if (scheduled.gameDate !== row.gameDate) throw new Error(`Row ${rowKey}: gameDate ${row.gameDate} disagrees with the schedule (${scheduled.gameDate})`);
    pushTo(rowsByPlayer, row.playerId, row);
    pushTo(rowsByGame, row.gameId, row);
    rowByGamePlayer.set(`${row.gameId}|${row.playerId}`, row);
    const key = `${row.teamId}|${row.season}`;
    (playersByTeamSeason.get(key) ?? playersByTeamSeason.set(key, new Set()).get(key)!).add(row.playerId);
  }
  // Canonical order, so every accumulation is independent of how the input happened to be sorted.
  for (const rows of rowsByPlayer.values()) rows.sort((a, b) => a.gameDate.localeCompare(b.gameDate) || a.gameId.localeCompare(b.gameId));
  for (const rows of rowsByGame.values()) rows.sort((a, b) => a.playerId - b.playerId);

  const teamRowsByTeam = new Map<number, NbaTeamGame[]>();
  const teamRowsByGame = new Map<string, NbaTeamGame[]>();
  const seenTeamRows = new Set<string>();
  for (const row of dataset.teamGames) {
    const rowKey = `${row.gameId}|${row.teamId}`;
    if (seenTeamRows.has(rowKey)) throw new Error(`Duplicate team-game row ${rowKey}`);
    seenTeamRows.add(rowKey);
    pushTo(teamRowsByTeam, row.teamId, row);
    pushTo(teamRowsByGame, row.gameId, row);
  }

  const recordsByGamePlayer = new Map<string, NbaAvailabilityRecord[]>();
  const recordsByGameTeam = new Map<string, NbaAvailabilityRecord[]>();
  for (const record of dataset.availability) {
    pushTo(recordsByGamePlayer, `${record.gameId}|${record.playerId}`, record);
    pushTo(recordsByGameTeam, `${record.gameId}|${record.teamId}`, record);
  }
  for (const records of recordsByGamePlayer.values()) records.sort((a, b) => Date.parse(a.asOfUtc) - Date.parse(b.asOfUtc));

  const finalByGamePlayer = new Map<string, FinalStatusRecord>();
  for (const final of dataset.finalStatuses) {
    const key = `${final.gameId}|${final.playerId}`;
    if (finalByGamePlayer.has(key)) throw new Error(`Duplicate final status ${key}`);
    finalByGamePlayer.set(key, final);
  }
  const gamesWithResults = new Set<string>([...rowsByGame.keys(), ...teamRowsByGame.keys()]);

  const statusCache = new Map<string, AvailabilityStatus | null>();
  const universeCache = new Map<string, number[]>();

  const usable = (gameId: string, cutoff: number): boolean => {
    const at = availableAt.get(gameId);
    return at !== undefined && at < cutoff;
  };

  const access: DataAccess = {
    counters,
    cutoffOf: (game) => cutoffMs(game, policy),
    resultUsable: (gameId, atMs) => usable(gameId, atMs),
    hasResults: (gameId) => gamesWithResults.has(gameId),
    rowsOf: (gameId) => rowsByGame.get(gameId) ?? [],

    // Participants come from the schedule, which is known before tipoff, never from the game's own results.
    teamsOf: (game) => (game.neutralSite ? [...(game.participantTeamIds ?? [])] : [game.homeTeamId, game.awayTeamId].filter((id): id is number => id !== null)),

    history(playerId, cutoff) {
      return (rowsByPlayer.get(playerId) ?? []).filter((row) => row.minutes > 0 && competitive(row) && usable(row.gameId, cutoff));
    },

    teamDates(teamId, cutoff) {
      const dates = (teamRowsByTeam.get(teamId) ?? []).filter((row) => competitive(row) && usable(row.gameId, cutoff)).map((row) => row.gameDate);
      return [...new Set(dates)].sort();
    },

    statusAt(game, playerId) {
      const key = `${game.gameId}|${playerId}`;
      if (statusCache.has(key)) return statusCache.get(key) ?? null;
      const cutoff = cutoffMs(game, policy);
      let status: AvailabilityStatus | null = null;
      for (const record of recordsByGamePlayer.get(key) ?? []) {
        const at = Date.parse(record.asOfUtc);
        if (at < cutoff) status = record.status;
        else counters.availabilityIgnoredAsLate += 1;
      }
      statusCache.set(key, status);
      return status;
    },

    universe(game, teamId) {
      const key = `${game.gameId}|${teamId}`;
      const cached = universeCache.get(key);
      if (cached) return cached;
      const cutoff = cutoffMs(game, policy);
      // Membership rests only on pregame evidence for THIS team: a usable snapshot naming the team, or a usable recent
      // appearance for it. `playersByTeamSeason` merely enumerates candidates (it is built from all rows, so it may
      // include players who join the team later); the evidence check below is what admits them.
      const members = new Set<number>();
      for (const record of recordsByGameTeam.get(key) ?? []) if (Date.parse(record.asOfUtc) < cutoff) members.add(record.playerId);
      const recentDates = new Set(access.teamDates(teamId, cutoff).slice(-ROSTER_LOOKBACK_TEAM_GAMES));
      for (const playerId of playersByTeamSeason.get(`${teamId}|${game.season}`) ?? []) {
        if (access.history(playerId, cutoff).some((row) => row.teamId === teamId && row.season === game.season && recentDates.has(row.gameDate))) members.add(playerId);
      }
      const sorted = [...members].sort((a, b) => a - b);
      universeCache.set(key, sorted);
      return sorted;
    },

    outcome(gameId, playerId) {
      const row = rowByGamePlayer.get(`${gameId}|${playerId}`);
      if (row) return { played: row.minutes > 0 };
      return finalByGamePlayer.has(`${gameId}|${playerId}`) ? { played: false } : null;
    },
  };
  return access;
}
