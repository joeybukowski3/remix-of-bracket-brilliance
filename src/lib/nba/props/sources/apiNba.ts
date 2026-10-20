/**
 * API-NBA v2 (v2.nba.api-sports.io) response shapes, validators and a pure
 * normalizer into the canonical schemas. No network here.
 *
 * Field names follow API-Sports' public API-NBA v2 documentation and are
 * UNVERIFIED against our account until the coverage probe runs. In particular
 * the `stage` -> season-type mapping is unverified: only stage 2 (regular
 * season) is mapped, everything else is reported and excluded.
 *
 * The license record for this source permits no use (licenses.ts), so
 * `normalizePayloads` refuses this adapter; the normalizer is exercised only
 * with synthetic payloads until a license decision is made.
 */
import { seasonFromStartYear, type NbaSeasonType } from "../seasonType";
import type { NbaBoxStats, NbaPlayerGame, NbaTeamGame, ValidationIssue } from "../types";
import { SOURCE_LICENSES } from "./licenses";
import type { NbaAvailabilityRecord, NbaSourceAdapter, NormalizedSourceSnapshot, SourcePayload } from "./types";

export const API_NBA_BASE_URL = "https://v2.nba.api-sports.io";

/** UNVERIFIED: confirm with the probe's per-stage game counts before relying on more. */
export const API_NBA_STAGE_TO_SEASON_TYPE: Readonly<Record<number, NbaSeasonType>> = Object.freeze({ 2: "regular" });

export interface ApiNbaEnvelope {
  get?: unknown;
  parameters?: unknown;
  errors?: unknown;
  results?: unknown;
  paging?: { current?: unknown; total?: unknown };
  response: unknown[];
}

interface ApiNbaTeamRef {
  id: number;
  code?: string | null;
  name?: string | null;
}

export interface ApiNbaGame {
  id: number;
  season: number;
  stage: number | null;
  date: { start: string };
  status?: { long?: string | null; short?: number | null };
  periods?: { total?: number | null };
  teams: { home: ApiNbaTeamRef; visitors: ApiNbaTeamRef };
  scores?: { home?: { points?: number | null }; visitors?: { points?: number | null } };
}

export interface ApiNbaPlayerStat {
  player: { id: number; firstname?: string | null; lastname?: string | null };
  team: ApiNbaTeamRef;
  game: { id: number };
  min: string | null;
  comment?: string | null;
  [stat: string]: unknown;
}

export interface ApiNbaTeamStat {
  team: ApiNbaTeamRef;
  statistics: Record<string, unknown>[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Parse the common API-Sports envelope. Returns an error string for anything unexpected. */
export function parseEnvelope(bodyText: string): { envelope: ApiNbaEnvelope } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { error: "body is not JSON" };
  }
  if (!isObject(parsed)) return { error: "body is not a JSON object" };
  if (!Array.isArray(parsed.response)) return { error: "`response` is not an array" };
  if (parsed.results !== undefined && parsed.results !== parsed.response.length) {
    return { error: `results=${String(parsed.results)} but response has ${parsed.response.length} item(s)` };
  }
  return { envelope: parsed as unknown as ApiNbaEnvelope };
}

/** Index of the first item failing `check`, with its reason; null when all pass. */
function firstInvalid(items: unknown[], check: (item: Record<string, unknown>) => string | null): string | null {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const reason = isObject(item) ? check(item) : "not an object";
    if (reason) return `item ${i}: ${reason}`;
  }
  return null;
}

const teamRefInvalid = (v: unknown) => (isObject(v) && isInt(v.id) ? null : "team id missing");

export const validators = {
  seasons(items: unknown[]): string | null {
    return items.every(isInt) ? null : "seasons are not all integers";
  },
  games(items: unknown[]): string | null {
    return firstInvalid(items, (g) => {
      if (!isInt(g.id)) return "id missing";
      if (!isObject(g.date) || typeof g.date.start !== "string" || Number.isNaN(Date.parse(g.date.start))) return "date.start missing";
      if (!isObject(g.teams)) return "teams missing";
      return teamRefInvalid(g.teams.home) ?? teamRefInvalid(g.teams.visitors);
    });
  },
  playerStats(items: unknown[]): string | null {
    return firstInvalid(items, (r) => {
      if (!isObject(r.player) || !isInt(r.player.id)) return "player id missing";
      if (!isObject(r.game) || !isInt(r.game.id)) return "game id missing";
      if (r.min !== null && r.min !== undefined && typeof r.min !== "string") return "min is not a string";
      return teamRefInvalid(r.team);
    });
  },
  teamStats(items: unknown[]): string | null {
    return firstInvalid(items, (r) => teamRefInvalid(r.team) ?? (Array.isArray(r.statistics) && r.statistics.length > 0 ? null : "statistics missing"));
  },
};

export type MinutesFormat = "minutes-seconds" | "whole-minutes" | "absent" | "unparseable";

/** "34:12" -> 34.2, "34" -> 34. Null/empty/"-" -> null (absent). */
export function parseApiNbaMinutes(raw: unknown): { minutes: number | null; format: MinutesFormat } {
  if (raw === null || raw === undefined) return { minutes: null, format: "absent" };
  const text = String(raw).trim();
  if (text === "" || text === "-" || text === "--") return { minutes: null, format: "absent" };
  const match = /^(\d{1,3})(?::(\d{1,2}))?$/.exec(text);
  if (!match) return { minutes: null, format: "unparseable" };
  const seconds = match[2] === undefined ? 0 : Number(match[2]);
  if (seconds >= 60) return { minutes: null, format: "unparseable" };
  return { minutes: Number(match[1]) + seconds / 60, format: match[2] === undefined ? "whole-minutes" : "minutes-seconds" };
}

const BOX_FIELDS: Record<Exclude<keyof NbaBoxStats, "plusMinus">, string> = {
  pts: "points",
  reb: "totReb",
  ast: "assists",
  oreb: "offReb",
  dreb: "defReb",
  fgm: "fgm",
  fga: "fga",
  fg3m: "tpm",
  fg3a: "tpa",
  ftm: "ftm",
  fta: "fta",
  stl: "steals",
  blk: "blocks",
  tov: "turnovers",
  pf: "pFouls",
};

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/^\+/, ""));
  return Number.isFinite(n) ? n : null;
}

/** All box fields; null when any counting stat is missing. */
function readBox(row: Record<string, unknown>): NbaBoxStats | null {
  const box = {} as NbaBoxStats;
  for (const [key, field] of Object.entries(BOX_FIELDS) as [keyof typeof BOX_FIELDS, string][]) {
    const value = toNumber(row[field]);
    if (value === null) return null;
    box[key] = value;
  }
  box.plusMinus = toNumber(row.plusMinus);
  return box;
}

/** A row for a player who did not play: no minutes and a reason comment, or zero minutes with no stats. */
export function isDidNotPlay(row: ApiNbaPlayerStat): boolean {
  const { minutes } = parseApiNbaMinutes(row.min);
  const hasComment = typeof row.comment === "string" && row.comment.trim() !== "";
  return (minutes === null || minutes === 0) && (hasComment || readBox(row) === null);
}

function availabilityStatus(comment: string | null | undefined): NbaAvailabilityRecord["status"] {
  if (!comment) return "dnp";
  return /inactive|not with team|suspend|injur|out\b/i.test(comment) ? "inactive" : "dnp";
}

/** America/New_York calendar date of a UTC instant. */
export function easternDate(isoUtc: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(isoUtc));
}

export interface ApiNbaGameContext {
  gameId: string;
  gameDate: string;
  season: string;
  seasonType: NbaSeasonType;
  homeTeamId: number;
  awayTeamId: number;
  abbrByTeam: Map<number, string>;
  pointsByTeam: Map<number, number | null>;
  periods: number | null;
}

/** Index regular-season-mapped games by id; unmapped stages are reported, not guessed. */
export function indexGames(games: readonly ApiNbaGame[]): { byId: Map<string, ApiNbaGameContext>; issues: ValidationIssue[] } {
  const byId = new Map<string, ApiNbaGameContext>();
  const issues: ValidationIssue[] = [];
  for (const g of games) {
    const gameId = String(g.id);
    const seasonType = g.stage === null ? undefined : API_NBA_STAGE_TO_SEASON_TYPE[g.stage];
    if (!seasonType) {
      issues.push({ code: "unmapped-stage", severity: "warning", message: `stage ${String(g.stage)} has no verified season type`, gameId });
      continue;
    }
    const { home, visitors } = g.teams;
    byId.set(gameId, {
      gameId,
      gameDate: easternDate(g.date.start),
      season: seasonFromStartYear(g.season),
      seasonType,
      homeTeamId: home.id,
      awayTeamId: visitors.id,
      abbrByTeam: new Map([
        [home.id, home.code ?? ""],
        [visitors.id, visitors.code ?? ""],
      ]),
      pointsByTeam: new Map([
        [home.id, g.scores?.home?.points ?? null],
        [visitors.id, g.scores?.visitors?.points ?? null],
      ]),
      periods: g.periods?.total ?? null,
    });
  }
  return { byId, issues };
}

function teamContext(ctx: ApiNbaGameContext, teamId: number, sourceSnapshotId: string) {
  const isHome = teamId === ctx.homeTeamId;
  const opponentTeamId = isHome ? ctx.awayTeamId : ctx.homeTeamId;
  return {
    gameId: ctx.gameId,
    gameDate: ctx.gameDate,
    season: ctx.season,
    seasonType: ctx.seasonType,
    teamId,
    teamAbbr: ctx.abbrByTeam.get(teamId) ?? "",
    opponentTeamId,
    opponentAbbr: ctx.abbrByTeam.get(opponentTeamId) ?? "",
    isHome,
    sourceSnapshotId,
  };
}

export interface ApiNbaNormalized {
  playerRows: NbaPlayerGame[];
  teamRows: NbaTeamGame[];
  availability: NbaAvailabilityRecord[];
  issues: ValidationIssue[];
}

export function normalizePlayerStats(rows: readonly ApiNbaPlayerStat[], games: Map<string, ApiNbaGameContext>, snapshotId: string, retrievedAtUtc: string): ApiNbaNormalized {
  const out: ApiNbaNormalized = { playerRows: [], teamRows: [], availability: [], issues: [] };
  const seen = new Set<string>();
  for (const row of rows) {
    const gameId = String(row.game.id);
    const playerId = row.player.id;
    const ctx = games.get(gameId);
    if (!ctx) {
      out.issues.push({ code: "game-context-missing", severity: "error", message: "player row for a game not in the games index", gameId, playerId, snapshotId });
      continue;
    }
    if (row.team.id !== ctx.homeTeamId && row.team.id !== ctx.awayTeamId) {
      out.issues.push({ code: "team-not-in-game", severity: "error", message: "player team is neither participant", gameId, playerId, teamId: row.team.id, snapshotId });
      continue;
    }
    const key = `${gameId}|${playerId}`;
    if (seen.has(key)) {
      out.issues.push({ code: "duplicate-player-game", severity: "error", message: "duplicate player-game row", gameId, playerId, snapshotId });
      continue;
    }
    seen.add(key);
    if (isDidNotPlay(row)) {
      out.availability.push({
        schemaVersion: "nba-availability-v1",
        gameId,
        gameDate: ctx.gameDate,
        season: ctx.season,
        seasonType: ctx.seasonType,
        playerId,
        teamId: row.team.id,
        status: availabilityStatus(row.comment),
        starter: null,
        reason: row.comment ?? null,
        // Box-score comments are postgame: never usable as a pregame feature.
        asOfUtc: retrievedAtUtc,
        sourceSnapshotId: snapshotId,
      });
      continue;
    }
    const { minutes, format } = parseApiNbaMinutes(row.min);
    const box = readBox(row);
    if (minutes === null || box === null) {
      out.issues.push({ code: "unparseable-player-row", severity: "error", message: `minutes ${format} or box stats missing`, gameId, playerId, snapshotId });
      continue;
    }
    const name = [row.player.firstname, row.player.lastname].filter(Boolean).join(" ").trim();
    out.playerRows.push({ schemaVersion: "nba-player-game-v1", ...teamContext(ctx, row.team.id, snapshotId), ...box, playerId, playerName: name, minutes });
  }
  return out;
}

export function normalizeTeamStats(rows: readonly ApiNbaTeamStat[], ctx: ApiNbaGameContext | undefined, snapshotId: string): ApiNbaNormalized {
  const out: ApiNbaNormalized = { playerRows: [], teamRows: [], availability: [], issues: [] };
  if (!ctx) {
    out.issues.push({ code: "game-context-missing", severity: "error", message: "team statistics for a game not in the games index", snapshotId });
    return out;
  }
  for (const row of rows) {
    const stats = row.statistics[0];
    const box = readBox(stats);
    if (box === null) {
      out.issues.push({ code: "unparseable-team-row", severity: "error", message: "team box stats missing", gameId: ctx.gameId, teamId: row.team.id, snapshotId });
      continue;
    }
    // API-NBA reports team minutes as player-minutes ("240:00"); canonical is game minutes.
    const playerMinutes = parseApiNbaMinutes(stats.min).minutes;
    const minutes = playerMinutes !== null ? playerMinutes / 5 : ctx.periods !== null ? 48 + 5 * Math.max(0, ctx.periods - 4) : 48;
    const own = ctx.pointsByTeam.get(row.team.id) ?? null;
    const base = teamContext(ctx, row.team.id, snapshotId);
    const opp = ctx.pointsByTeam.get(base.opponentTeamId) ?? null;
    if (own !== null && own !== box.pts) {
      out.issues.push({ code: "team-points-mismatch", severity: "warning", message: `team box ${box.pts} vs game score ${own}`, gameId: ctx.gameId, teamId: row.team.id, snapshotId });
    }
    out.teamRows.push({ schemaVersion: "nba-team-game-v1", ...base, ...box, minutes, won: own !== null && opp !== null ? own > opp : null });
  }
  return out;
}

/** Endpoint names used in `SourceSnapshotMeta.endpoint` for this source. */
export const API_NBA_ENDPOINTS = { playerStats: "players/statistics", teamStats: "games/statistics" } as const;

/**
 * Adapter over a games index built from `/games` bodies. Its license permits
 * no use, so ingestion through `normalizePayloads` is refused.
 */
export function createApiNbaAdapter(games: readonly ApiNbaGame[]): NbaSourceAdapter {
  const { byId } = indexGames(games);
  return {
    sourceId: "api-sports-nba",
    license: SOURCE_LICENSES["api-sports-nba"],
    capabilities: { playerMinutes: "minutes-seconds", starterFlag: false, availabilityRecords: true, pregameAsOfTimestamps: false },
    planRequests() {
      throw new Error("API-NBA requests are planned by the coverage probe, not by season scope");
    },
    normalize(payload: SourcePayload): NormalizedSourceSnapshot {
      const { meta } = payload;
      const parsed = parseEnvelope(payload.bodyText);
      if ("error" in parsed) throw new Error(`${meta.snapshotId}: ${parsed.error}`);
      const items = parsed.envelope.response;
      const snapshotMeta = { snapshotId: meta.snapshotId, endpoint: meta.endpoint, season: meta.season, seasonType: meta.seasonType, retrievedAtUtc: meta.retrievedAtUtc };
      if (meta.table === "player_games") {
        const invalid = validators.playerStats(items);
        if (invalid) throw new Error(`${meta.snapshotId}: schema drift (${invalid})`);
        const result = normalizePlayerStats(items as ApiNbaPlayerStat[], byId, meta.snapshotId, meta.retrievedAtUtc);
        return { meta: snapshotMeta, playerRows: result.playerRows, availability: result.availability, issues: result.issues };
      }
      if (meta.table === "team_games") {
        const invalid = validators.teamStats(items);
        if (invalid) throw new Error(`${meta.snapshotId}: schema drift (${invalid})`);
        const gameId = /(?:^|\/)game=(\d+)/.exec(meta.requestKey)?.[1];
        const result = normalizeTeamStats(items as ApiNbaTeamStat[], gameId ? byId.get(gameId) : undefined, meta.snapshotId);
        return { meta: snapshotMeta, teamRows: result.teamRows, issues: result.issues };
      }
      throw new Error(`API-NBA adapter cannot normalize table ${meta.table}`);
    },
  };
}
