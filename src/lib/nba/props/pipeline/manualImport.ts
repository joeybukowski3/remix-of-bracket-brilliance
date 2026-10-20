/**
 * Manual CSV import of pregame lines and final results: the no-API-cost
 * fallback. Strict by design: a row that cannot be proven pregame, in a known
 * market, with whole prices and canonical teams is rejected with a reason, not
 * repaired. Every accepted record carries the importer's attestation.
 */
import { etGameDate, canonicalGameKey, canonicalTeamCode } from "../canonical";
import { sha256Json } from "../canonicalJson";
import type { DataUse } from "../sources/types";
import { assertAttestableUses } from "./oddsSources";
import {
  buildSnapshot,
  PARTICIPATION,
  PIPELINE_SCHEMA,
  type GameStatus,
  type Market,
  type NbaPipelineGame,
  type NbaPregameSnapshot,
  type Participation,
} from "./contracts";
import { DEFAULT_CAPTURE_POLICY, type CapturePolicy } from "./captureWindow";
import { readCsvTable } from "./csv";
import type { ResultDraft } from "./resultsRecorder";

export interface ImportAttestation {
  attestedBy: string;
  /** YYYY-MM-DD */
  attestedOn: string;
  /** Where the data came from, in the importer's words ("typed from the FanDuel app at 3:05 pm ET"). */
  origin: string;
  /** Defaults to private research. Raw redistribution is never attestable. */
  permittedUses: readonly DataUse[];
}

export interface RowIssue {
  line: number;
  code: string;
  message: string;
}

const MARKET_ALIASES: Readonly<Record<string, Market>> = { pts: "pts", points: "pts", player_points: "pts", reb: "reb", rebounds: "reb", player_rebounds: "reb", ast: "ast", assists: "ast", player_assists: "ast" };
const MARKET_SOURCE_KEY: Readonly<Record<Market, string>> = { pts: "player_points", reb: "player_rebounds", ast: "player_assists" };

function assertAttestation(a: ImportAttestation): void {
  if (!a.attestedBy.trim() || !a.origin.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(a.attestedOn)) throw new Error("Attestation needs attestedBy, origin and an attestedOn date (YYYY-MM-DD)");
  if (a.permittedUses.length === 0) throw new Error("Attestation must list at least one permitted use");
  assertAttestableUses(a.permittedUses);
}

const permissionsFrom = (a: ImportAttestation, backfilled = false) => ({
  permittedUses: [...a.permittedUses],
  licenseBasis: `manual import attestation: ${a.origin}`,
  licenseReviewedOn: a.attestedOn,
  attestation: { attestedBy: a.attestedBy, attestedOn: a.attestedOn, origin: a.origin, backfilled },
});

/** Normalizes an instant that carries an explicit offset to ISO UTC; null otherwise. */
function toUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().replace(/\.000Z$/, "Z");
}

const toNumber = (value: string): number | null => (value.trim() === "" || Number.isNaN(Number(value)) ? null : Number(value));

function gameFromRow(values: Record<string, string>): { ok: true; game: NbaPregameSnapshot["game"]; tipoffUtc: string } | { ok: false; code: string; message: string } {
  const tipoffUtc = toUtc(values.tipoff_utc);
  if (!tipoffUtc) return { ok: false, code: "bad_tipoff", message: "tipoff_utc must be an ISO instant with an explicit offset" };
  const away = canonicalTeamCode(values.away_team);
  const home = canonicalTeamCode(values.home_team);
  if (!away || !home || away === home) return { ok: false, code: "unknown_team", message: `unknown or identical teams "${values.away_team}" / "${values.home_team}"` };
  const key = canonicalGameKey({ gameDate: etGameDate(tipoffUtc), homeCode: home, awayCode: away });
  if (!key) return { ok: false, code: "bad_game", message: "could not build a game key" };
  return { ok: true, tipoffUtc, game: { canonicalGameKey: key, sourceEventId: null, tipoffUtc, awayTeam: away, homeTeam: home, neutralSite: false } };
}

export interface LineImportOptions {
  attestation: ImportAttestation;
  /** The import time. A line cannot be imported as pregame once tipoff has passed unless `allowBackfill` is set. */
  now?: Date;
  /** Accept lines for games that have started, flagged as backfilled (unverifiable, never authentic). */
  allowBackfill?: boolean;
  policy?: CapturePolicy;
  /** Maps a name and team to a canonical player id when one is known. */
  resolvePlayer?: (name: string, team: string) => string | null;
}

export interface LineImportResult {
  batchId: string;
  snapshots: NbaPregameSnapshot[];
  rejected: RowIssue[];
  duplicateRows: number;
}

const LINE_COLUMNS = ["captured_at_utc", "tipoff_utc", "away_team", "home_team", "player", "team", "market", "sportsbook", "line", "over_price", "under_price"] as const;

export function importLinesCsv(text: string, options: LineImportOptions): LineImportResult {
  assertAttestation(options.attestation);
  const policy = options.policy ?? DEFAULT_CAPTURE_POLICY;
  const importedAtMs = (options.now ?? new Date()).getTime();
  const table = readCsvTable(text, LINE_COLUMNS);
  const batchId = `batch_${sha256Json({ text: text.replace(/\r\n/g, "\n").trim(), attestation: options.attestation, kind: "lines" }).slice(0, 24)}`;
  const snapshots = new Map<string, NbaPregameSnapshot>();
  const rejected: RowIssue[] = [];
  let duplicateRows = 0;
  for (const { line, values } of table.rows) {
    const reject = (code: string, message: string) => void rejected.push({ line, code, message });
    const game = gameFromRow(values);
    if (!game.ok) {
      reject(game.code, game.message);
      continue;
    }
    const capturedAtUtc = toUtc(values.captured_at_utc);
    if (!capturedAtUtc) {
      reject("bad_captured_at", "captured_at_utc must be an ISO instant with an explicit offset");
      continue;
    }
    if (Date.parse(capturedAtUtc) >= Date.parse(game.tipoffUtc)) {
      reject("captured_after_tipoff", "a line captured at or after tipoff is not a pregame line and is never imported");
      continue;
    }
    if (Date.parse(capturedAtUtc) > importedAtMs) {
      reject("captured_in_future", "captured_at_utc is later than the import time");
      continue;
    }
    const backfilled = importedAtMs >= Date.parse(game.tipoffUtc);
    if (backfilled && !options.allowBackfill) {
      reject("imported_after_tipoff", "the game has started, so this capture time cannot be verified; use --allow-backfill to keep it flagged as backfilled");
      continue;
    }
    const market = MARKET_ALIASES[values.market.toLowerCase()];
    if (!market) {
      reject("unknown_market", `market "${values.market}" is not points, rebounds or assists`);
      continue;
    }
    const team = canonicalTeamCode(values.team);
    if (!team || (team !== game.game.awayTeam && team !== game.game.homeTeam)) {
      reject("player_team_not_in_game", `team "${values.team}" is not one of the game's teams`);
      continue;
    }
    const lineValue = toNumber(values.line);
    const over = toNumber(values.over_price);
    const under = toNumber(values.under_price);
    if (lineValue === null || over === null || under === null) {
      reject("missing_numbers", "line, over_price and under_price must all be numbers (both sides are required)");
      continue;
    }
    const lastUpdate = values.source_last_update_utc ? toUtc(values.source_last_update_utc) : null;
    if (values.source_last_update_utc && !lastUpdate) {
      reject("bad_source_update", "source_last_update_utc must be an ISO instant with an explicit offset");
      continue;
    }
    const minutes = (Date.parse(game.tipoffUtc) - Date.parse(capturedAtUtc)) / 60_000;
    if (minutes > policy.earlyMinutes) {
      reject("too_early", `captured ${Math.round(minutes)} minutes before tipoff; lines more than ${policy.earlyMinutes} minutes out are not stored`);
      continue;
    }
    if (minutes < policy.floorMinutes) {
      reject("inside_capture_floor", `captured ${Math.round(minutes)} minutes before tipoff; lines inside ${policy.floorMinutes} minutes are not stored`);
      continue;
    }
    try {
      const snapshot = buildSnapshot({
        game: game.game,
        player: { canonicalPlayerId: options.resolvePlayer?.(values.player, team) ?? null, sourcePlayerName: values.player, sourcePlayerId: null, team },
        market,
        source: { sourceId: "manual-import", method: "manual-import", sportsbook: values.sportsbook.toLowerCase(), sourceMarketKey: MARKET_SOURCE_KEY[market] },
        line: lineValue,
        overPrice: over,
        underPrice: under,
        sourceLastUpdateUtc: lastUpdate,
        capturedAtUtc,
        maxAgeMinutes: policy.maxLineAgeMinutes,
        projection: { unavailableReason: "manual import carries no JKB projection" },
        permissions: permissionsFrom(options.attestation, backfilled),
        provenance: { runId: null, importBatchId: batchId, creditsCharged: 0 },
      });
      if (snapshots.has(snapshot.snapshotId)) duplicateRows += 1;
      else snapshots.set(snapshot.snapshotId, snapshot);
    } catch (error) {
      reject("invalid_row", error instanceof Error ? error.message : String(error));
    }
  }
  return { batchId, snapshots: [...snapshots.values()], rejected, duplicateRows };
}

/**
 * Schedule rows for the games on imported lines, so the manual path needs no
 * schedule provider. A game's status stays "scheduled" until a result or a
 * schedule update says otherwise.
 */
export function gamesFromSnapshots(snapshots: readonly NbaPregameSnapshot[], observedAtUtc: string): NbaPipelineGame[] {
  const byKey = new Map<string, NbaPipelineGame>();
  for (const s of snapshots) {
    if (byKey.has(s.game.canonicalGameKey)) continue;
    byKey.set(s.game.canonicalGameKey, { schemaVersion: PIPELINE_SCHEMA.game, canonicalGameKey: s.game.canonicalGameKey, sourceEventId: s.game.sourceEventId, tipoffUtc: s.game.tipoffUtc, awayTeam: s.game.awayTeam, homeTeam: s.game.homeTeam, neutralSite: s.game.neutralSite, status: "scheduled", observedAtUtc });
  }
  return [...byKey.values()].sort((a, b) => a.tipoffUtc.localeCompare(b.tipoffUtc) || a.canonicalGameKey.localeCompare(b.canonicalGameKey));
}

export interface ResultImportResult {
  batchId: string;
  drafts: ResultDraft[];
  rejected: RowIssue[];
}

const RESULT_COLUMNS = ["tipoff_utc", "away_team", "home_team", "player", "team", "participation", "game_status"] as const;
const IMPORTABLE_PARTICIPATION: readonly Participation[] = PARTICIPATION.filter((p) => p !== "unverified_absent");

export function importResultsCsv(text: string, options: { attestation: ImportAttestation; resolvePlayer?: LineImportOptions["resolvePlayer"] }): ResultImportResult {
  assertAttestation(options.attestation);
  const table = readCsvTable(text, RESULT_COLUMNS);
  const batchId = `batch_${sha256Json({ text: text.replace(/\r\n/g, "\n").trim(), attestation: options.attestation, kind: "results" }).slice(0, 24)}`;
  const drafts: ResultDraft[] = [];
  const rejected: RowIssue[] = [];
  for (const { line, values } of table.rows) {
    const reject = (code: string, message: string) => void rejected.push({ line, code, message });
    const game = gameFromRow(values);
    if (!game.ok) {
      reject(game.code, game.message);
      continue;
    }
    const team = canonicalTeamCode(values.team);
    if (!team || (team !== game.game.awayTeam && team !== game.game.homeTeam)) {
      reject("player_team_not_in_game", `team "${values.team}" is not one of the game's teams`);
      continue;
    }
    const status = values.game_status.toLowerCase() as GameStatus;
    if (!["final", "postponed", "cancelled", "suspended", "in_progress", "scheduled"].includes(status)) {
      reject("bad_game_status", `unknown game_status "${values.game_status}"`);
      continue;
    }
    const participation = values.participation.toLowerCase() as Participation;
    if (!IMPORTABLE_PARTICIPATION.includes(participation)) {
      reject("bad_participation", `participation must be one of ${IMPORTABLE_PARTICIPATION.join(", ")}; an absent player is never imported as a DNP unless confirmed`);
      continue;
    }
    const finalizedAt = values.finalized_at_utc ? toUtc(values.finalized_at_utc) : null;
    if (status === "final" && !finalizedAt) {
      reject("missing_finalized_at", "a final game needs finalized_at_utc");
      continue;
    }
    const periods = values.periods ? toNumber(values.periods) : null;
    let stats: ResultDraft["stats"] = null;
    if (participation === "played") {
      const [minutes, pts, reb, ast] = [values.minutes, values.pts, values.reb, values.ast].map((v) => toNumber(v ?? ""));
      if (minutes === null || pts === null || reb === null || ast === null || ![pts, reb, ast].every(Number.isInteger)) {
        reject("bad_stats", "a played line needs numeric minutes and whole-number pts, reb, ast");
        continue;
      }
      if (minutes <= 0) {
        reject("zero_minutes", "a zero-minute row is not a played line: record it as dnp_confirmed if the player is confirmed out");
        continue;
      }
      stats = { minutes, pts, reb, ast };
    }
    const player = { canonicalPlayerId: options.resolvePlayer?.(values.player, team) ?? null, sourcePlayerName: values.player, sourcePlayerId: null, team };
    drafts.push({
      game: { canonicalGameKey: game.game.canonicalGameKey, tipoffUtc: game.tipoffUtc, status, periods, finalizedAtUtc: finalizedAt },
      player,
      participation,
      stats,
      correctionReason: values.correction_reason ? values.correction_reason : null,
      provider: { sourceId: "manual-import", method: "manual-import" },
      evidence: { sourceSnapshotId: null, importBatchId: batchId, rowRef: `line ${line}` },
      permissions: permissionsFrom(options.attestation),
    });
  }
  return { batchId, drafts, rejected };
}
