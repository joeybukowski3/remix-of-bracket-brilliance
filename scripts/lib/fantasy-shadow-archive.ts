/**
 * Append-only, content-addressed archive for SHADOW fantasy projections and their later outcomes.
 *
 * Guarantees (each covered by `archive.test.ts`):
 *  - Predictions are captured with the REAL clock and are only accepted strictly BEFORE the player's canonical game kickoff. Post-kickoff or
 *    kickoff-less rows are rejected (returned in `rejected`), never written.
 *  - Existing lines are never rewritten: writes are `appendFileSync` only, and every append first re-verifies every existing line's content hash;
 *    a modified or malformed line aborts the write (`ArchiveIntegrityError`).
 *  - Event id = sha256 of the immutable material EXCLUDING `capturedAt`, so an identical re-capture is a no-op and the first capture time is kept.
 *  - The final pre-kickoff prediction per player/game is the LATEST pre-kickoff observation; later observations can never replace it.
 *  - Outcomes are separate events (never merged into a prediction); a corrected value appends a new revision that supersedes, never overwrites.
 *  - This archive does NOT alter the public projection calculation and is separate from the WU6B.1 production archive (which keeps archiving the
 *    public artifact verbatim under data/nfl/predictions/).
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canonicalize(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}
export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

export class ArchiveIntegrityError extends Error {}

export type ShadowGame = { gameId: string; season: number; week: number; seasonType: string; dateUtc: string | null; homeAbbr: string; awayAbbr: string };

/** Canonical kickoff from the committed schedule authority; never inferred. */
export function resolveKickoff(games: readonly ShadowGame[], season: number, week: number, team: string): { gameId: string; kickoff: string } | null {
  const t = team.toLowerCase();
  const matches = games.filter((g) => g.season === season && g.week === week && g.seasonType === "REG" && (g.homeAbbr.toLowerCase() === t || g.awayAbbr.toLowerCase() === t));
  if (matches.length !== 1) return null;
  const { gameId, dateUtc } = matches[0];
  return dateUtc && Number.isFinite(Date.parse(dateUtc)) ? { gameId, kickoff: new Date(dateUtc).toISOString() } : null;
}

export type CaptureClass = "eligible" | "post-kickoff" | "no-kickoff";
export function classifyCapture(capturedAt: string, kickoff: string | null): CaptureClass {
  if (!kickoff) return "no-kickoff";
  return Date.parse(capturedAt) < Date.parse(kickoff) ? "eligible" : "post-kickoff";
}

export type PredictionEvent = {
  eventType: "prediction";
  schema: string;
  eventId: string;
  capturedAt: string;
  season: number;
  week: number;
  playerId: string;
  gameId: string;
  kickoff: string;
  candidateVersions: { candidateA: string; candidateB: string };
  /** Hashes of the exact inputs the row was derived from. */
  sourceHashes: Record<string, string>;
  payload: Json;
};

const materialOf = (event: Omit<PredictionEvent, "eventId" | "capturedAt">): string => canonicalize(event as unknown as Json);

export function buildPredictionEvent(input: Omit<PredictionEvent, "eventId" | "eventType">): PredictionEvent {
  const { capturedAt, ...rest } = input;
  const material = { eventType: "prediction" as const, ...rest };
  return { ...material, eventId: `shp_${sha256(materialOf(material))}`, capturedAt };
}

export function verifyEvent(event: PredictionEvent): boolean {
  const { eventId, capturedAt: _capturedAt, ...material } = event;
  return eventId === `shp_${sha256(materialOf(material as Omit<PredictionEvent, "eventId" | "capturedAt">))}`;
}

export function readJsonl<T>(path: string): { rows: T[]; malformedLines: number[] } {
  if (!existsSync(path)) return { rows: [], malformedLines: [] };
  const rows: T[] = []; const malformedLines: number[] = [];
  readFileSync(path, "utf8").split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    try { rows.push(JSON.parse(line) as T); } catch { malformedLines.push(index + 1); }
  });
  return { rows, malformedLines };
}

/** Throws unless every existing prediction line parses and hashes to its own id. */
export function assertArchiveIntact(path: string): PredictionEvent[] {
  const { rows, malformedLines } = readJsonl<PredictionEvent>(path);
  if (malformedLines.length) throw new ArchiveIntegrityError(`${path}: malformed line(s) ${malformedLines.join(",")}`);
  const bad = rows.filter((row) => row.eventType === "prediction" && !verifyEvent(row)).map((row) => row.eventId);
  if (bad.length) throw new ArchiveIntegrityError(`${path}: event(s) fail their content hash (modified after capture?): ${bad.slice(0, 5).join(", ")}`);
  return rows.filter((row) => row.eventType === "prediction");
}

export type AppendResult = { appended: number; duplicates: number; rejected: { playerId: string; reason: CaptureClass }[]; path: string };

/**
 * Append candidate events (already classified by the caller with `classifyCapture`). Ineligible events are returned in `rejected` and never written.
 * `dryRun` performs every check and writes nothing.
 */
export function appendPredictionEvents(path: string, events: readonly PredictionEvent[], options: { dryRun?: boolean } = {}): AppendResult {
  const existing = assertArchiveIntact(path);
  const known = new Set(existing.map((event) => event.eventId));
  const rejected: AppendResult["rejected"] = [];
  const fresh: PredictionEvent[] = [];
  for (const event of events) {
    const cls = classifyCapture(event.capturedAt, event.kickoff);
    if (cls !== "eligible") { rejected.push({ playerId: event.playerId, reason: cls }); continue; }
    if (known.has(event.eventId)) continue;
    known.add(event.eventId);
    fresh.push(event);
  }
  const duplicates = events.length - rejected.length - fresh.length;
  if (!options.dryRun && fresh.length) {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, fresh.map((event) => `${JSON.stringify(event)}\n`).join(""), "utf8");
  }
  return { appended: fresh.length, duplicates, rejected, path };
}

/** Final pre-kickoff prediction per player/game: the latest eligible observation strictly before kickoff. Ties break on eventId. */
export function selectFinalPreKickoff(events: readonly PredictionEvent[]): PredictionEvent[] {
  const best = new Map<string, PredictionEvent>();
  for (const event of events) {
    if (classifyCapture(event.capturedAt, event.kickoff) !== "eligible") continue;
    const key = `${event.season}|${event.week}|${event.playerId}`;
    const current = best.get(key);
    if (!current || Date.parse(event.capturedAt) > Date.parse(current.capturedAt) || (event.capturedAt === current.capturedAt && event.eventId > current.eventId)) best.set(key, event);
  }
  return [...best.values()].sort((a, b) => a.playerId.localeCompare(b.playerId));
}

// ------------------------------------------------------------------------------------------------ outcomes
export type OutcomeEvent = {
  eventType: "outcome";
  outcomeId: string;
  season: number;
  week: number;
  playerId: string;
  actualFantasyPoints: number;
  /** false => the player's team completed the week but the player has no stat line (scored 0, i.e. inactive/DNP). */
  statLine: boolean;
  scoringVersion: string;
  statsSourceSha256: string;
  recordedAt: string;
  revision: number;
  supersedes: string | null;
};

export function buildOutcomeEvent(input: Omit<OutcomeEvent, "outcomeId" | "revision" | "supersedes">, previous: OutcomeEvent | null): OutcomeEvent | null {
  if (previous && previous.actualFantasyPoints === input.actualFantasyPoints && previous.statLine === input.statLine && previous.scoringVersion === input.scoringVersion) return null;
  const { recordedAt: _r, ...material } = input;
  const revision = previous ? previous.revision + 1 : 1;
  return { ...input, revision, supersedes: previous?.outcomeId ?? null, outcomeId: `sho_${sha256(canonicalize({ ...material, revision } as unknown as Json))}` };
}

export function appendOutcomeEvents(path: string, events: readonly OutcomeEvent[], options: { dryRun?: boolean } = {}): number {
  const { rows, malformedLines } = readJsonl<OutcomeEvent>(path);
  if (malformedLines.length) throw new ArchiveIntegrityError(`${path}: malformed line(s) ${malformedLines.join(",")}`);
  const known = new Set(rows.map((row) => row.outcomeId));
  const fresh = events.filter((event) => !known.has(event.outcomeId));
  if (!options.dryRun && fresh.length) {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, fresh.map((event) => `${JSON.stringify(event)}\n`).join(""), "utf8");
  }
  return fresh.length;
}

/** Latest revision per player/game (superseded outcomes stay on disk). */
export function currentOutcomes(events: readonly OutcomeEvent[]): Map<string, OutcomeEvent> {
  const out = new Map<string, OutcomeEvent>();
  for (const event of events) {
    const key = `${event.season}|${event.week}|${event.playerId}`;
    const current = out.get(key);
    if (!current || event.revision > current.revision) out.set(key, event);
  }
  return out;
}

export const shadowArchivePaths = (root: string, season: number, week: number) => {
  const dir = `${root}/data/fantasy/shadow-archive/${season}`;
  const nn = String(week).padStart(2, "0");
  return { predictions: `${dir}/week-${nn}.predictions.jsonl`, outcomes: `${dir}/week-${nn}.outcomes.jsonl` };
};
