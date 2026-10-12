/**
 * A synthetic "commercial provider" adapter for tests. Its payload shape is
 * invented and deliberately unlike stats.nba.com (nested objects, integer
 * minutes + seconds, team minutes as a 240 total, its own id space, an
 * availability table with as-of timestamps), to prove the source contract
 * absorbs a different provider without touching canonical schemas.
 */
import { SOURCE_LICENSES } from "../sources/licenses";
import { createPayload } from "../sources/ingest";
import {
  type AvailabilityStatus,
  type NbaAvailabilityRecord,
  type NbaSourceAdapter,
  type NormalizedSourceSnapshot,
  type SourcePayload,
  type SourceRequest,
  type SourceTable,
} from "../sources/types";
import { isNbaSeasonType, type NbaSeasonType } from "../seasonType";
import type { NbaBoxStats, NbaPlayerGame, NbaTeamGame, ValidationIssue } from "../types";

interface SyntheticGameRef { id: number; date: string; season: string; type: string }
interface SyntheticTeamRef { id: number; abbr: string }
interface SyntheticStats {
  pts: number; reb: number; oreb: number; dreb: number; ast: number; fgm: number; fga: number; fg3m: number; fg3a: number;
  ftm: number; fta: number; stl: number; blk: number; tov: number; pf: number; plus_minus: number | null;
}
export interface SyntheticPlayerRow { game: SyntheticGameRef; player: { id: number; name: string }; team: SyntheticTeamRef; opponent: SyntheticTeamRef; home: boolean; minutes: number; seconds: number; stats: SyntheticStats }
export interface SyntheticTeamRow { game: SyntheticGameRef; team: SyntheticTeamRef; opponent: SyntheticTeamRef; home: boolean; team_minutes: number; won: boolean | null; stats: SyntheticStats }
export interface SyntheticAvailabilityRow { game: SyntheticGameRef; player: { id: number }; team: { id: number }; status: string; reason: string | null; starter: boolean | null; as_of: string }

const STATUS_MAP: Record<string, AvailabilityStatus> = {
  ACTIVE: "active", INACTIVE: "inactive", "DNP-CD": "dnp", OUT: "out", DOUBTFUL: "doubtful", QUESTIONABLE: "questionable", PROBABLE: "probable",
};
const PLAYERS_ON_COURT = 5;
const MAX_PLAYER_MINUTES = 70;

function parseRows(bodyText: string): unknown[] {
  const body = JSON.parse(bodyText) as { rows?: unknown };
  if (!Array.isArray(body.rows)) throw new Error("synthetic source schema drift: body.rows is missing");
  return body.rows;
}

function box(stats: SyntheticStats | undefined): NbaBoxStats | null {
  if (!stats) return null;
  const values = [stats.pts, stats.reb, stats.oreb, stats.dreb, stats.ast, stats.fgm, stats.fga, stats.fg3m, stats.fg3a, stats.ftm, stats.fta, stats.stl, stats.blk, stats.tov, stats.pf];
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)) return null;
  const { plus_minus, ...rest } = stats;
  return { ...rest, plusMinus: plus_minus };
}

function context(row: { game: SyntheticGameRef; team: SyntheticTeamRef; opponent: SyntheticTeamRef; home: boolean }, snapshotId: string) {
  return {
    gameId: String(row.game.id), gameDate: row.game.date, season: row.game.season, seasonType: row.game.type as NbaSeasonType,
    teamId: row.team.id, teamAbbr: row.team.abbr, opponentTeamId: null, opponentAbbr: row.opponent.abbr, isHome: row.home, sourceSnapshotId: snapshotId,
  };
}

function checkSeason(row: { game: SyntheticGameRef }, payload: SourcePayload, issues: ValidationIssue[]): boolean {
  if (isNbaSeasonType(row.game.type) && row.game.type === payload.meta.seasonType && row.game.season === payload.meta.season) return true;
  issues.push({ code: "season_type_mismatch", severity: "error", message: `game ${row.game.id} is ${row.game.season} ${row.game.type}`, gameId: String(row.game.id), snapshotId: payload.meta.snapshotId });
  return false;
}

function normalizePlayers(payload: SourcePayload, issues: ValidationIssue[]): NbaPlayerGame[] {
  return (parseRows(payload.bodyText) as SyntheticPlayerRow[]).flatMap((row) => {
    if (!checkSeason(row, payload, issues)) return [];
    const stats = box(row.stats);
    const minutes = row.minutes + row.seconds / 60;
    if (!stats || !(minutes >= 0 && minutes <= MAX_PLAYER_MINUTES)) {
      issues.push({ code: stats ? "invalid_minutes" : "invalid_stat", severity: "error", message: `player ${row.player.id} game ${row.game.id}`, gameId: String(row.game.id), playerId: row.player.id, snapshotId: payload.meta.snapshotId });
      return [];
    }
    return [{ schemaVersion: "nba-player-game-v1" as const, ...context(row, payload.meta.snapshotId), playerId: row.player.id, playerName: row.player.name, minutes, ...stats }];
  });
}

function normalizeTeams(payload: SourcePayload, issues: ValidationIssue[]): NbaTeamGame[] {
  return (parseRows(payload.bodyText) as SyntheticTeamRow[]).flatMap((row) => {
    if (!checkSeason(row, payload, issues)) return [];
    const stats = box(row.stats);
    if (!stats) {
      issues.push({ code: "invalid_stat", severity: "error", message: `team ${row.team.id} game ${row.game.id}`, gameId: String(row.game.id), teamId: row.team.id, snapshotId: payload.meta.snapshotId });
      return [];
    }
    // This provider reports total player-minutes (240 + 25 per OT); canonical team minutes are game length.
    return [{ schemaVersion: "nba-team-game-v1" as const, ...context(row, payload.meta.snapshotId), minutes: row.team_minutes / PLAYERS_ON_COURT, won: row.won, ...stats }];
  });
}

function normalizeAvailability(payload: SourcePayload, issues: ValidationIssue[]): NbaAvailabilityRecord[] {
  return (parseRows(payload.bodyText) as SyntheticAvailabilityRow[]).flatMap((row) => {
    if (!checkSeason(row, payload, issues)) return [];
    const status = STATUS_MAP[row.status] ?? "unknown";
    if (status === "unknown") issues.push({ code: "unknown_availability_status", severity: "warning", message: `status "${row.status}"`, gameId: String(row.game.id), playerId: row.player.id, snapshotId: payload.meta.snapshotId });
    return [{
      schemaVersion: "nba-availability-v1" as const, gameId: String(row.game.id), gameDate: row.game.date, season: row.game.season, seasonType: row.game.type as NbaSeasonType,
      playerId: row.player.id, teamId: row.team.id, status, starter: row.starter, reason: row.reason, asOfUtc: row.as_of, sourceSnapshotId: payload.meta.snapshotId,
    }];
  });
}

export const syntheticSourceAdapter: NbaSourceAdapter = {
  sourceId: "synthetic",
  license: SOURCE_LICENSES.synthetic,
  capabilities: { playerMinutes: "minutes-seconds", starterFlag: true, availabilityRecords: true, pregameAsOfTimestamps: true },
  planRequests({ seasons, seasonTypes, tables }) {
    return seasons.flatMap((season) => seasonTypes.flatMap((seasonType) => tables.map((table): SourceRequest => ({
      requestKey: `${table}/${season}/${seasonType}`, table, season, seasonType, endpoint: `synthetic-${table}`, params: { season, type: seasonType },
    }))));
  },
  normalize(payload: SourcePayload): NormalizedSourceSnapshot {
    const issues: ValidationIssue[] = [];
    const { meta } = payload;
    const snapshotMeta = { snapshotId: meta.snapshotId, endpoint: meta.endpoint, season: meta.season, seasonType: meta.seasonType, retrievedAtUtc: meta.retrievedAtUtc };
    if (meta.table === "player_games") return { meta: snapshotMeta, playerRows: normalizePlayers(payload, issues), issues };
    if (meta.table === "team_games") return { meta: snapshotMeta, teamRows: normalizeTeams(payload, issues), issues };
    return { meta: snapshotMeta, availability: normalizeAvailability(payload, issues), issues };
  },
};

export function syntheticPayload(
  table: SourceTable,
  season: string,
  seasonType: NbaSeasonType,
  rows: unknown[],
  retrievedAtUtc = "2042-07-20T12:00:00.000Z",
  asOfUtc: string | null = null,
): SourcePayload {
  const [request] = syntheticSourceAdapter.planRequests({ seasons: [season], seasonTypes: [seasonType], tables: [table] });
  return createPayload("synthetic", request, { httpStatus: 200, retrievedAtUtc, bodyText: JSON.stringify({ rows }) }, asOfUtc);
}

