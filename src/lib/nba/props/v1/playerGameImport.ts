/**
 * Manual / licensed player-game import for the props board V1.
 *
 * Real NBA box scores can only reach the public board from a source whose rights include model development and
 * public display. No real source has those rights today (see docs/nba-props-v1.md), so this route does not grant
 * any: the file names a registered `sourceId`, and the board builder applies that source's EFFECTIVE rights from
 * `licenses.ts` exactly as it does for every other input. Supplying a file never opens a source.
 *
 * The import is strict by design: it never drops, repairs or invents a row. Any malformed row, unknown team,
 * duplicate player-game or inconsistent game fails the whole file with the first problems listed.
 */
import { z } from "zod";
import { canonicalTeamCode } from "../canonical";
import { readCsvTable } from "../pipeline/csv";
import { isNbaSeasonType, NBA_SEASON_TYPES, type NbaSeasonType } from "../seasonType";
import type { NbaSourceId } from "../sources/types";

export const PLAYER_GAMES_SCHEMA = "jkb-player-games-import-v1";
export const IMPORT_SEASONS = ["2025-26", "2026-27"] as const;
export type ImportSeason = (typeof IMPORT_SEASONS)[number];

const SOURCE_IDS = ["stats.nba.com", "espn", "hoopr-espn", "llimllib-nba-data", "thesportsdb", "sportsdataio", "balldontlie", "api-sports-nba", "synthetic"] as const;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const MAX_MINUTES = 70;
const MAX_ISSUES_SHOWN = 8;
/** Calendar window of each season's games, preseason through playoffs. A row dated outside its season's window is a labelling error. */
const SEASON_WINDOWS: Readonly<Record<ImportSeason, readonly [first: string, last: string]>> = Object.freeze({
  "2025-26": ["2025-09-01", "2026-07-31"],
  "2026-27": ["2026-09-01", "2027-07-31"],
});

/** A real calendar day, not just a well-formed string ("2026-02-31" is rejected). */
function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const isRealInstant = (value: string): boolean => ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));

const count = z.number().int().min(0);
const POSSESSION_FIELDS = ["fga", "fta", "oreb", "tov"] as const;

const rowSchema = z
  .object({
    season: z.enum(IMPORT_SEASONS),
    seasonType: z.enum(NBA_SEASON_TYPES),
    gameId: z.string().min(1).max(40),
    gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    team: z.string(),
    opponent: z.string(),
    isHome: z.boolean(),
    playerId: z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/),
    playerName: z.string().min(1),
    minutes: z.number().min(0).max(MAX_MINUTES),
    pts: count,
    reb: count,
    ast: count,
    starter: z.boolean().optional(),
    fga: count.optional(),
    fta: count.optional(),
    oreb: count.optional(),
    tov: count.optional(),
  })
  .superRefine((row, ctx) => {
    const present = POSSESSION_FIELDS.filter((field) => row[field] !== undefined).length;
    if (present !== 0 && present !== POSSESSION_FIELDS.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "possession inputs (fga, fta, oreb, tov) must be given together or not at all" });
  });

export const playerGamesFileSchema = z.object({
  schemaVersion: z.literal(PLAYER_GAMES_SCHEMA),
  source: z.object({
    sourceId: z.enum(SOURCE_IDS),
    retrievedAtUtc: z.string().refine(isRealInstant, "retrievedAtUtc must be a real ISO UTC instant"),
    /** Who exported this data, from where, and under what agreement. Required; recorded in the build report. */
    provenance: z.string().min(10),
  }),
  rows: z.array(rowSchema),
});

export interface ImportedPlayerGame {
  season: ImportSeason;
  seasonType: NbaSeasonType;
  gameId: string;
  gameDate: string;
  /** Canonical franchise codes. */
  team: string;
  opponent: string;
  isHome: boolean;
  playerId: string;
  playerName: string;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  /** The source's explicit starter status for this game. Absent when the source gives none: never inferred from minutes or points. */
  starter?: boolean;
  /** Possession inputs (field-goal and free-throw attempts, offensive rebounds, turnovers), given together or not at all. Absent in older imports. */
  fga?: number;
  fta?: number;
  oreb?: number;
  tov?: number;
}

export interface PlayerGameImport {
  sourceId: NbaSourceId;
  retrievedAtUtc: string;
  provenance: string;
  rows: ImportedPlayerGame[];
}

function canonicalRow(row: z.output<typeof rowSchema>, index: number): ImportedPlayerGame {
  const team = canonicalTeamCode(row.team);
  const opponent = canonicalTeamCode(row.opponent);
  if (team === null) throw new Error(`row ${index + 1}: unknown team "${row.team}"`);
  if (opponent === null) throw new Error(`row ${index + 1}: unknown opponent "${row.opponent}"`);
  if (team === opponent) throw new Error(`row ${index + 1}: team and opponent are both ${team}`);
  return { ...row, team, opponent };
}

/** A game's rows from one team must agree on opponent and home flag. */
function teamProblems(key: string, group: readonly ImportedPlayerGame[], team: string): string[] {
  const rows = group.filter((r) => r.team === team);
  const problems: string[] = [];
  if (new Set(rows.map((r) => r.opponent)).size > 1) problems.push(`game ${key}: ${team} rows disagree on the opponent`);
  if (new Set(rows.map((r) => r.isHome)).size > 1) problems.push(`game ${key}: ${team} rows disagree on home or away`);
  return problems;
}

/**
 * Every game must have rows from exactly two teams that are each other's opponent, one home and one away, on one
 * date. A one-team game is rejected: its defense-side lines would be attributed to an opponent the file never shows.
 */
function checkGames(rows: readonly ImportedPlayerGame[]): string[] {
  const problems: string[] = [];
  const games = new Map<string, ImportedPlayerGame[]>();
  for (const row of rows) games.set(`${row.season}|${row.gameId}`, [...(games.get(`${row.season}|${row.gameId}`) ?? []), row]);
  for (const [key, group] of games) {
    const teams = [...new Set(group.map((r) => r.team))];
    if (new Set(group.map((r) => r.gameDate)).size > 1) problems.push(`game ${key}: rows carry different dates`);
    if (new Set(group.map((r) => r.seasonType)).size > 1) problems.push(`game ${key}: rows carry different season types`);
    if (teams.length !== 2) {
      problems.push(`game ${key}: needs rows from exactly two teams, found ${teams.length}`);
      continue;
    }
    problems.push(...teams.flatMap((team) => teamProblems(key, group, team)));
    const [a, b] = teams;
    const opponentOf = (team: string) => group.find((r) => r.team === team)?.opponent;
    if (opponentOf(a) !== b || opponentOf(b) !== a) problems.push(`game ${key}: ${a} and ${b} are not each other's listed opponent`);
    if (group.find((r) => r.team === a)?.isHome === group.find((r) => r.team === b)?.isHome) problems.push(`game ${key}: exactly one team must be home`);
  }
  return problems;
}

/** Dates must be real days inside their season's window, and no game may postdate the retrieval. */
function checkDates(rows: readonly ImportedPlayerGame[], retrievedAtUtc: string): string[] {
  const problems: string[] = [];
  rows.forEach((row, i) => {
    const [first, last] = SEASON_WINDOWS[row.season];
    if (!isRealDate(row.gameDate)) problems.push(`row ${i + 1}: ${row.gameDate} is not a real calendar date`);
    else if (row.gameDate < first || row.gameDate > last) problems.push(`row ${i + 1}: ${row.gameDate} is outside the ${row.season} season window (${first} to ${last}); check the season label`);
    else if (row.gameDate > retrievedAtUtc.slice(0, 10)) problems.push(`row ${i + 1}: game dated ${row.gameDate} is after the data was retrieved (${retrievedAtUtc})`);
  });
  return problems;
}

/** Validates a parsed JSON import. Throws with the first problems; never returns a partial import. */
export function parsePlayerGameImport(raw: unknown): PlayerGameImport {
  const file = playerGamesFileSchema.parse(raw);
  const rows = file.rows.map(canonicalRow);
  const seen = new Set<string>();
  const problems: string[] = [];
  rows.forEach((row, i) => {
    const key = `${row.season}|${row.gameId}|${row.playerId}`;
    if (seen.has(key)) problems.push(`row ${i + 1}: duplicate player-game ${key}`);
    seen.add(key);
  });
  problems.push(...checkDates(rows, file.source.retrievedAtUtc), ...checkGames(rows));
  if (problems.length > 0) throw new Error(`player-game import rejected (${problems.length} problem(s)): ${problems.slice(0, MAX_ISSUES_SHOWN).join("; ")}`);
  return { sourceId: file.source.sourceId, retrievedAtUtc: file.source.retrievedAtUtc, provenance: file.source.provenance, rows };
}

const CSV_COLUMNS = ["season", "seasontype", "gameid", "gamedate", "team", "opponent", "ishome", "playerid", "playername", "minutes", "pts", "reb", "ast"] as const;

function bool(value: string, line: number): boolean {
  const v = value.toLowerCase();
  if (v === "true" || v === "1" || v === "home") return true;
  if (v === "false" || v === "0" || v === "away") return false;
  throw new Error(`CSV line ${line}: ishome must be true/false, got "${value}"`);
}

/** Plain non-negative decimals only: "0x10" and "1e1" are not accepted as numbers. */
function num(value: string, column: string, line: number): number {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`CSV line ${line}: ${column} is not a plain non-negative number ("${value}")`);
  return Number(value);
}

function minutesOf(value: string, line: number): number {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!clock) return num(value, "minutes", line);
  if (Number(clock[2]) > 59) throw new Error(`CSV line ${line}: minutes "${value}" has more than 59 seconds`);
  return Number(clock[1]) + Number(clock[2]) / 60;
}

/**
 * Converts an owner's CSV export into the same strict import. Columns: season, seasonType, gameId, gameDate, team,
 * opponent, isHome, playerId, playerName, minutes, pts, reb, ast. `minutes` may be decimal or "mm:ss".
 * The source record comes from outside the CSV so a spreadsheet cannot silently choose its own license.
 */
export function playerGamesFromCsv(text: string, source: { sourceId: NbaSourceId; retrievedAtUtc: string; provenance: string }): PlayerGameImport {
  const table = readCsvTable(text, CSV_COLUMNS);
  const rows = table.rows.map(({ line, values }) => {
    if (!isNbaSeasonType(values.seasontype)) throw new Error(`CSV line ${line}: unknown season type "${values.seasontype}"`);
    const minutes = minutesOf(values.minutes, line);
    return {
      season: values.season,
      seasonType: values.seasontype,
      gameId: values.gameid,
      gameDate: values.gamedate,
      team: values.team,
      opponent: values.opponent,
      isHome: bool(values.ishome, line),
      playerId: values.playerid,
      playerName: values.playername,
      minutes,
      pts: num(values.pts, "pts", line),
      reb: num(values.reb, "reb", line),
      ast: num(values.ast, "ast", line),
    };
  });
  return parsePlayerGameImport({ schemaVersion: PLAYER_GAMES_SCHEMA, source, rows });
}
