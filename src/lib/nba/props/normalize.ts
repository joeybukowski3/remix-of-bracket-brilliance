/**
 * Raw stats.nba.com result set -> canonical rows.
 *
 * Row-level only: no cross-row joins except resolving the opponent from the
 * team-game rows of the same game. Problems are reported as ValidationIssues;
 * rows that cannot be normalized are dropped and reported, never guessed.
 */
import { gameIdMatches, type NbaSeasonType } from "./seasonType";
import type { NbaBoxStats, NbaPlayerGame, NbaTeamGame, ValidationIssue } from "./types";
import type { StatsNbaResultSet } from "./ingest/statsNbaPayload";

export interface SnapshotContext {
  snapshotId: string;
  season: string;
  seasonType: NbaSeasonType;
}

const SHARED_COLUMNS = [
  "TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "GAME_ID", "GAME_DATE", "MATCHUP", "WL", "MIN",
  "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "OREB", "DREB", "REB", "AST", "TOV", "STL", "BLK", "PF", "PTS",
  "PLUS_MINUS",
] as const;
export const PLAYER_LOG_COLUMNS = [...SHARED_COLUMNS, "PLAYER_ID", "PLAYER_NAME", "MIN_SEC"] as const;
export const TEAM_LOG_COLUMNS = SHARED_COLUMNS;

/** Allowed gap between decimal MIN and MIN_SEC, which can carry "mm:60". */
const MIN_SEC_TOLERANCE = 1 / 60 + 1e-6;
const MAX_PLAYER_MINUTES = 70;
const MATCHUP_PATTERN = /^([A-Z0-9]{2,4}) (vs\.|@) ([A-Z0-9]{2,4})$/;

type RawRecord = Record<string, unknown>;

function toRecords(resultSet: StatsNbaResultSet, required: readonly string[]): RawRecord[] {
  const missing = required.filter((column) => !resultSet.headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`stats.nba.com schema drift: result set "${resultSet.name}" is missing ${missing.join(", ")}`);
  }
  return resultSet.rowSet.map((row) =>
    Object.fromEntries(resultSet.headers.map((header, index) => [header, row[index]])),
  );
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** "mm:ss" -> decimal minutes; tolerates the source's "mm:60". */
export function parseMinSec(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+):(\d{2})$/.exec(value);
  return match ? Number(match[1]) + Number(match[2]) / 60 : null;
}

export interface ParsedMatchup {
  teamAbbr: string;
  opponentAbbr: string;
  isHome: boolean;
}

/** "DEN vs. LAC" -> home; "LAC @ DEN" -> away. */
export function parseMatchup(matchup: unknown): ParsedMatchup | null {
  if (typeof matchup !== "string") return null;
  const match = MATCHUP_PATTERN.exec(matchup.trim());
  if (!match) return null;
  return { teamAbbr: match[1], opponentAbbr: match[3], isHome: match[2] === "vs." };
}

const BOX_FIELDS: ReadonlyArray<[keyof NbaBoxStats, string]> = [
  ["pts", "PTS"], ["reb", "REB"], ["ast", "AST"], ["oreb", "OREB"], ["dreb", "DREB"], ["fgm", "FGM"],
  ["fga", "FGA"], ["fg3m", "FG3M"], ["fg3a", "FG3A"], ["ftm", "FTM"], ["fta", "FTA"], ["stl", "STL"],
  ["blk", "BLK"], ["tov", "TOV"], ["pf", "PF"],
];

interface ParsedCommon {
  gameId: string;
  gameDate: string;
  teamId: number;
  teamAbbr: string;
  matchup: ParsedMatchup;
  box: NbaBoxStats;
}

function parseCommon(raw: RawRecord, ctx: SnapshotContext, issues: ValidationIssue[], label: string): ParsedCommon | null {
  const gameId = String(raw.GAME_ID ?? "");
  const teamId = num(raw.TEAM_ID);
  const base = { gameId, snapshotId: ctx.snapshotId, teamId: teamId ?? undefined };
  const reject = (code: string, message: string): null => {
    issues.push({ code, severity: "error", message: `${label}: ${message}`, ...base });
    return null;
  };
  if (!/^\d{10}$/.test(gameId)) return reject("invalid_game_id", `GAME_ID "${gameId}" is malformed`);
  if (!gameIdMatches(gameId, ctx.season, ctx.seasonType)) {
    return reject("season_type_mismatch", `GAME_ID ${gameId} does not belong to ${ctx.season} ${ctx.seasonType}`);
  }
  if (teamId === null) return reject("invalid_team_id", "TEAM_ID is missing");
  const gameDate = typeof raw.GAME_DATE === "string" ? raw.GAME_DATE.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) return reject("invalid_game_date", `GAME_DATE "${String(raw.GAME_DATE)}"`);
  const matchup = parseMatchup(raw.MATCHUP);
  if (!matchup) return reject("invalid_matchup", `MATCHUP "${String(raw.MATCHUP)}"`);
  const box = {} as NbaBoxStats;
  for (const [field, column] of BOX_FIELDS) {
    const value = num(raw[column]);
    if (value === null || value < 0) return reject("invalid_stat", `${column}=${String(raw[column])}`);
    box[field] = value;
  }
  box.plusMinus = num(raw.PLUS_MINUS);
  if (box.reb !== box.oreb + box.dreb) {
    issues.push({ code: "reb_component_mismatch", severity: "warning", message: `${label}: REB != OREB + DREB`, ...base });
  }
  return { gameId, gameDate, teamId, teamAbbr: String(raw.TEAM_ABBREVIATION ?? matchup.teamAbbr), matchup, box };
}

export function normalizePlayerGameLogs(
  resultSet: StatsNbaResultSet,
  ctx: SnapshotContext,
): { rows: NbaPlayerGame[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const rows: NbaPlayerGame[] = [];
  for (const raw of toRecords(resultSet, PLAYER_LOG_COLUMNS)) {
    const playerId = num(raw.PLAYER_ID);
    const label = `player ${String(raw.PLAYER_ID)} game ${String(raw.GAME_ID)}`;
    const common = parseCommon(raw, ctx, issues, label);
    if (!common) continue;
    if (playerId === null) {
      issues.push({ code: "invalid_player_id", severity: "error", message: `${label}: PLAYER_ID missing`, gameId: common.gameId, snapshotId: ctx.snapshotId });
      continue;
    }
    const minSec = parseMinSec(raw.MIN_SEC);
    const minutes = num(raw.MIN) ?? minSec;
    const issueBase = { gameId: common.gameId, playerId, snapshotId: ctx.snapshotId };
    if (minutes === null || minutes < 0 || minutes > MAX_PLAYER_MINUTES) {
      issues.push({ code: "invalid_minutes", severity: "error", message: `${label}: MIN=${String(raw.MIN)} MIN_SEC=${String(raw.MIN_SEC)}`, ...issueBase });
      continue;
    }
    if (minSec !== null && Math.abs(minSec - minutes) > MIN_SEC_TOLERANCE) {
      issues.push({ code: "min_sec_disagrees", severity: "warning", message: `${label}: MIN=${minutes} vs MIN_SEC=${String(raw.MIN_SEC)}`, ...issueBase });
    }
    rows.push({
      schemaVersion: "nba-player-game-v1",
      gameId: common.gameId,
      gameDate: common.gameDate,
      season: ctx.season,
      seasonType: ctx.seasonType,
      playerId,
      playerName: String(raw.PLAYER_NAME ?? ""),
      teamId: common.teamId,
      teamAbbr: common.teamAbbr,
      opponentTeamId: null,
      opponentAbbr: common.matchup.opponentAbbr,
      isHome: common.matchup.isHome,
      minutes,
      ...common.box,
      sourceSnapshotId: ctx.snapshotId,
    });
  }
  return { rows, issues };
}

export function normalizeTeamGameLogs(
  resultSet: StatsNbaResultSet,
  ctx: SnapshotContext,
): { rows: NbaTeamGame[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const rows: NbaTeamGame[] = [];
  for (const raw of toRecords(resultSet, TEAM_LOG_COLUMNS)) {
    const common = parseCommon(raw, ctx, issues, `team ${String(raw.TEAM_ID)} game ${String(raw.GAME_ID)}`);
    if (!common) continue;
    rows.push({
      schemaVersion: "nba-team-game-v1",
      gameId: common.gameId,
      gameDate: common.gameDate,
      season: ctx.season,
      seasonType: ctx.seasonType,
      teamId: common.teamId,
      teamAbbr: common.teamAbbr,
      opponentTeamId: null,
      opponentAbbr: common.matchup.opponentAbbr,
      isHome: common.matchup.isHome,
      minutes: num(raw.MIN) ?? 0,
      won: raw.WL === "W" ? true : raw.WL === "L" ? false : null,
      ...common.box,
      sourceSnapshotId: ctx.snapshotId,
    });
  }
  return { rows, issues };
}
