/**
 * Assemble canonical NBA tables from normalized raw snapshots.
 *
 * - The latest snapshot per (endpoint, season, seasonType) is authoritative;
 *   older snapshots are only diffed to report revisions.
 * - Duplicate (playerId, gameId) / (teamId, gameId) keys are errors; the first
 *   occurrence is kept so output is deterministic.
 * - Opponents are resolved from the two team-game rows of each game.
 * - Player points must sum to team points for every team-game; player minutes
 *   must sum to ~5x team minutes.
 */
import { NBA_SEASON_TYPES, type NbaSeasonType } from "./seasonType";
import type {
  NbaGame,
  NbaPlayerGame,
  NbaPlayerIdentity,
  NbaTeamGame,
  NbaTeamIdentity,
  ValidationIssue,
} from "./types";

/** Source used when a snapshot does not name one (Phase 1 stats.nba.com snapshots). */
export const DEFAULT_SOURCE_ID = "stats.nba.com";

export interface NormalizedSnapshot {
  meta: {
    snapshotId: string;
    /** Source-native endpoint or table name; part of the latest-snapshot key. */
    endpoint: string;
    season: string;
    seasonType: NbaSeasonType;
    retrievedAtUtc: string;
    /** Defaults to stats.nba.com. A dataset is built from exactly one source (ids are source-native). */
    sourceId?: string;
  };
  playerRows?: NbaPlayerGame[];
  teamRows?: NbaTeamGame[];
  issues: ValidationIssue[];
}

export interface SnapshotRevision {
  endpoint: string;
  season: string;
  seasonType: NbaSeasonType;
  latestSnapshotId: string;
  previousSnapshotId: string;
  added: number;
  removed: number;
  changed: number;
}

export interface CoverageRow {
  season: string;
  seasonType: NbaSeasonType;
  games: number;
  teamGames: number;
  gamesWithPlayerRows: number;
  playerGames: number;
  uniquePlayers: number;
  zeroMinuteRows: number;
  firstGameDate: string | null;
  lastGameDate: string | null;
  pointsReconciliationFailures: number;
  minutesReconciliationWarnings: number;
  snapshotIds: string[];
}

export interface NbaDataset {
  playerGames: NbaPlayerGame[];
  teamGames: NbaTeamGame[];
  games: NbaGame[];
  players: NbaPlayerIdentity[];
  teams: NbaTeamIdentity[];
  coverage: CoverageRow[];
  revisions: SnapshotRevision[];
  issues: ValidationIssue[];
}

/** Player-minute sums may drift from 5x team minutes by source rounding. */
const MINUTES_RECONCILIATION_TOLERANCE = 1;
const PLAYERS_ON_COURT = 5;

const snapshotKey = (meta: NormalizedSnapshot["meta"]) => `${meta.endpoint}|${meta.season}|${meta.seasonType}`;
const playerKey = (row: NbaPlayerGame) => `${row.playerId}|${row.gameId}`;
const teamKey = (row: NbaTeamGame) => `${row.teamId}|${row.gameId}`;

function compareRows<T>(a: T, b: T): boolean {
  const strip = (row: T) => JSON.stringify({ ...row, sourceSnapshotId: undefined });
  return strip(a) === strip(b);
}

function diffSnapshots<T>(latest: T[], previous: T[], keyOf: (row: T) => string) {
  const prev = new Map(previous.map((row) => [keyOf(row), row]));
  const next = new Map(latest.map((row) => [keyOf(row), row]));
  let added = 0;
  let changed = 0;
  for (const [key, row] of next) {
    const before = prev.get(key);
    if (!before) added += 1;
    else if (!compareRows(row, before)) changed += 1;
  }
  const removed = [...prev.keys()].filter((key) => !next.has(key)).length;
  return { added, removed, changed };
}

function selectLatestSnapshots(snapshots: NormalizedSnapshot[], issues: ValidationIssue[]) {
  const grouped = new Map<string, NormalizedSnapshot[]>();
  for (const snapshot of snapshots) {
    const key = snapshotKey(snapshot.meta);
    grouped.set(key, [...(grouped.get(key) ?? []), snapshot]);
  }
  const latest: NormalizedSnapshot[] = [];
  const revisions: SnapshotRevision[] = [];
  for (const group of grouped.values()) {
    const ordered = [...group].sort((a, b) => a.meta.retrievedAtUtc.localeCompare(b.meta.retrievedAtUtc));
    const current = ordered[ordered.length - 1];
    latest.push(current);
    const previous = ordered[ordered.length - 2];
    if (!previous) continue;
    const diff = current.playerRows !== undefined
      ? diffSnapshots(current.playerRows ?? [], previous.playerRows ?? [], playerKey)
      : diffSnapshots(current.teamRows ?? [], previous.teamRows ?? [], teamKey);
    if (diff.removed > 0) {
      issues.push({ code: "snapshot_rows_removed", severity: "warning", message: `${current.meta.snapshotId} dropped ${diff.removed} row(s) present in ${previous.meta.snapshotId}`, snapshotId: current.meta.snapshotId });
    }
    revisions.push({
      endpoint: current.meta.endpoint,
      season: current.meta.season,
      seasonType: current.meta.seasonType,
      latestSnapshotId: current.meta.snapshotId,
      previousSnapshotId: previous.meta.snapshotId,
      ...diff,
    });
  }
  return { latest, revisions };
}

function dedupe<T extends { gameId: string; sourceSnapshotId: string }>(
  rows: T[],
  keyOf: (row: T) => string,
  code: string,
  issues: ValidationIssue[],
): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (seen.has(key)) {
      issues.push({ code, severity: "error", message: `duplicate key ${key}; first occurrence kept`, gameId: row.gameId, snapshotId: row.sourceSnapshotId });
      continue;
    }
    seen.set(key, row);
  }
  return [...seen.values()];
}

function byDateThenId<T extends { gameDate: string; gameId: string }>(a: T, b: T): number {
  return a.gameDate.localeCompare(b.gameDate) || a.gameId.localeCompare(b.gameId);
}

function buildGames(teamGames: NbaTeamGame[], issues: ValidationIssue[]) {
  const byGame = new Map<string, NbaTeamGame[]>();
  for (const row of teamGames) byGame.set(row.gameId, [...(byGame.get(row.gameId) ?? []), row]);
  const games: NbaGame[] = [];
  const resolvedTeamGames: NbaTeamGame[] = [];
  for (const [gameId, rows] of byGame) {
    const homeRows = rows.filter((row) => row.isHome);
    const distinctTeams = new Set(rows.map((row) => row.teamId)).size === 2;
    // Two rows: either one home + one away, or a neutral site (both "@").
    const valid = rows.length === 2 && distinctTeams && homeRows.length <= 1;
    if (!valid) {
      issues.push({ code: "game_team_rows_invalid", severity: "error", message: `game ${gameId} has ${rows.length} team rows (${homeRows.length} home)`, gameId });
      continue;
    }
    const neutralSite = homeRows.length === 0;
    const [a, b] = rows;
    games.push({
      gameId,
      gameDate: a.gameDate,
      season: a.season,
      seasonType: a.seasonType,
      teamIds: [Math.min(a.teamId, b.teamId), Math.max(a.teamId, b.teamId)],
      homeTeamId: neutralSite ? null : homeRows[0].teamId,
      awayTeamId: neutralSite ? null : rows.find((row) => !row.isHome)!.teamId,
      neutralSite,
    });
    resolvedTeamGames.push({ ...a, opponentTeamId: b.teamId }, { ...b, opponentTeamId: a.teamId });
  }
  return { games: games.sort(byDateThenId), teamGames: resolvedTeamGames.sort(byDateThenId) };
}

function resolvePlayerOpponents(playerGames: NbaPlayerGame[], games: Map<string, NbaGame>, issues: ValidationIssue[]) {
  return playerGames.map((row) => {
    const game = games.get(row.gameId);
    if (!game || !game.teamIds.includes(row.teamId)) {
      issues.push({ code: "player_team_not_in_game", severity: "error", message: `player ${row.playerId} team ${row.teamId} not found in game ${row.gameId}`, gameId: row.gameId, playerId: row.playerId });
      return row;
    }
    const opponentTeamId = game.teamIds[0] === row.teamId ? game.teamIds[1] : game.teamIds[0];
    return { ...row, opponentTeamId };
  });
}

interface ReconciliationResult {
  pointsFailures: Map<string, number>;
  minutesWarnings: Map<string, number>;
}

function reconcile(playerGames: NbaPlayerGame[], teamGames: NbaTeamGame[], issues: ValidationIssue[]): ReconciliationResult {
  const sums = new Map<string, { pts: number; minutes: number }>();
  for (const row of playerGames) {
    const key = `${row.teamId}|${row.gameId}`;
    const sum = sums.get(key) ?? { pts: 0, minutes: 0 };
    sums.set(key, { pts: sum.pts + row.pts, minutes: sum.minutes + row.minutes });
  }
  const pointsFailures = new Map<string, number>();
  const minutesWarnings = new Map<string, number>();
  const bump = (map: Map<string, number>, row: NbaTeamGame) => {
    const key = `${row.season}|${row.seasonType}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const team of teamGames) {
    const sum = sums.get(teamKey(team));
    if (!sum) continue; // games without player rows are reported via coverage
    if (sum.pts !== team.pts) {
      bump(pointsFailures, team);
      issues.push({ code: "points_reconciliation_failed", severity: "error", message: `team ${team.teamId} game ${team.gameId}: players ${sum.pts} vs team ${team.pts}`, gameId: team.gameId, teamId: team.teamId });
    }
    if (Math.abs(sum.minutes - PLAYERS_ON_COURT * team.minutes) > MINUTES_RECONCILIATION_TOLERANCE) {
      bump(minutesWarnings, team);
      issues.push({ code: "minutes_reconciliation_drift", severity: "warning", message: `team ${team.teamId} game ${team.gameId}: players ${sum.minutes.toFixed(2)} vs 5x team ${(PLAYERS_ON_COURT * team.minutes).toFixed(2)}`, gameId: team.gameId, teamId: team.teamId });
    }
  }
  return { pointsFailures, minutesWarnings };
}

function buildPlayerIdentities(playerGames: NbaPlayerGame[]): NbaPlayerIdentity[] {
  const map = new Map<number, NbaPlayerIdentity>();
  for (const row of playerGames) {
    const existing = map.get(row.playerId);
    if (!existing) {
      map.set(row.playerId, { playerId: row.playerId, playerName: row.playerName, namesSeen: [row.playerName], firstGameDate: row.gameDate, lastGameDate: row.gameDate, teamIdsSeen: [row.teamId] });
      continue;
    }
    map.set(row.playerId, {
      ...existing,
      playerName: row.gameDate >= existing.lastGameDate ? row.playerName : existing.playerName,
      namesSeen: existing.namesSeen.includes(row.playerName) ? existing.namesSeen : [...existing.namesSeen, row.playerName],
      firstGameDate: row.gameDate < existing.firstGameDate ? row.gameDate : existing.firstGameDate,
      lastGameDate: row.gameDate > existing.lastGameDate ? row.gameDate : existing.lastGameDate,
      teamIdsSeen: existing.teamIdsSeen.includes(row.teamId) ? existing.teamIdsSeen : [...existing.teamIdsSeen, row.teamId],
    });
  }
  return [...map.values()].sort((a, b) => a.playerId - b.playerId);
}

function buildTeamIdentities(teamGames: NbaTeamGame[], teamNames: Map<number, Set<string>>): NbaTeamIdentity[] {
  const map = new Map<number, NbaTeamIdentity>();
  for (const row of teamGames) {
    const existing = map.get(row.teamId) ?? { teamId: row.teamId, abbreviationsBySeason: {}, namesSeen: [...(teamNames.get(row.teamId) ?? [])].sort() };
    map.set(row.teamId, { ...existing, abbreviationsBySeason: { ...existing.abbreviationsBySeason, [row.season]: row.teamAbbr } });
  }
  return [...map.values()].sort((a, b) => a.teamId - b.teamId);
}

function buildCoverage(
  latest: NormalizedSnapshot[],
  playerGames: NbaPlayerGame[],
  teamGames: NbaTeamGame[],
  games: NbaGame[],
  reconciliation: ReconciliationResult,
): CoverageRow[] {
  const keys = new Set([...games, ...playerGames].map((row) => `${row.season}|${row.seasonType}`));
  const rows: CoverageRow[] = [];
  for (const key of keys) {
    const [season, seasonType] = key.split("|") as [string, NbaSeasonType];
    const match = <T extends { season: string; seasonType: NbaSeasonType }>(row: T) => row.season === season && row.seasonType === seasonType;
    const seasonPlayers = playerGames.filter(match);
    const seasonGames = games.filter(match);
    const dates = seasonGames.map((game) => game.gameDate).sort();
    rows.push({
      season,
      seasonType,
      games: seasonGames.length,
      teamGames: teamGames.filter(match).length,
      gamesWithPlayerRows: new Set(seasonPlayers.map((row) => row.gameId)).size,
      playerGames: seasonPlayers.length,
      uniquePlayers: new Set(seasonPlayers.map((row) => row.playerId)).size,
      zeroMinuteRows: seasonPlayers.filter((row) => row.minutes === 0).length,
      firstGameDate: dates[0] ?? null,
      lastGameDate: dates[dates.length - 1] ?? null,
      pointsReconciliationFailures: reconciliation.pointsFailures.get(key) ?? 0,
      minutesReconciliationWarnings: reconciliation.minutesWarnings.get(key) ?? 0,
      snapshotIds: latest.filter((snapshot) => match(snapshot.meta)).map((snapshot) => snapshot.meta.snapshotId).sort(),
    });
  }
  const typeOrder = (type: NbaSeasonType) => NBA_SEASON_TYPES.indexOf(type);
  return rows.sort((a, b) => a.season.localeCompare(b.season) || typeOrder(a.seasonType) - typeOrder(b.seasonType));
}

export function buildDataset(snapshots: NormalizedSnapshot[], teamNames: Map<number, Set<string>> = new Map()): NbaDataset {
  const sources = new Set(snapshots.map((snapshot) => snapshot.meta.sourceId ?? DEFAULT_SOURCE_ID));
  if (sources.size > 1) {
    throw new Error(`Cannot build one dataset from multiple sources (${[...sources].sort().join(", ")}): ids are source-native; crosswalk first`);
  }
  const issues: ValidationIssue[] = [];
  const { latest, revisions } = selectLatestSnapshots(snapshots, issues);
  issues.push(...latest.flatMap((snapshot) => snapshot.issues));
  const rawTeamGames = dedupe(latest.flatMap((s) => s.teamRows ?? []), teamKey, "duplicate_team_game", issues);
  const rawPlayerGames = dedupe(latest.flatMap((s) => s.playerRows ?? []), playerKey, "duplicate_player_game", issues);
  const { games, teamGames } = buildGames(rawTeamGames, issues);
  const gameMap = new Map(games.map((game) => [game.gameId, game]));
  const playerGames = resolvePlayerOpponents(rawPlayerGames, gameMap, issues).sort(
    (a, b) => byDateThenId(a, b) || a.playerId - b.playerId,
  );
  const reconciliation = reconcile(playerGames, teamGames, issues);
  return {
    playerGames,
    teamGames,
    games,
    players: buildPlayerIdentities(playerGames),
    teams: buildTeamIdentities(teamGames, teamNames),
    coverage: buildCoverage(latest, playerGames, teamGames, games, reconciliation),
    revisions,
    issues,
  };
}
