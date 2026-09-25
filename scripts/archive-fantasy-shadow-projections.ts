/**
 * Freeze SHADOW fantasy projections (production + Candidate A + Candidate B, with all inputs/components) into the append-only prospective archive.
 *
 *   tsx scripts/archive-fantasy-shadow-projections.ts --season=2026 --week=3 [--dry-run]
 *
 * Reads data/fantasy/shadow/<season>/week-NN.json (from generate-fantasy-shadow-candidates.ts). Uses the REAL clock: --captured-at is accepted ONLY
 * together with --dry-run (simulation). A row whose game has kicked off (or has no canonical kickoff) is REJECTED, never written. Existing archive lines
 * are integrity-checked and never rewritten. Does not touch the public projection artifact.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendPredictionEvents, buildPredictionEvent, resolveKickoff, sha256, shadowArchivePaths, type Json, type ShadowGame } from "./lib/fantasy-shadow-archive";
import { SHADOW_ARCHIVE_SCHEMA_VERSION } from "../src/lib/fantasy/weekly/projections/shadow-candidates/spec.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseArchiveArgs(argv: string[]) {
  const args = { season: NaN, week: NaN, dryRun: false, capturedAt: null as string | null };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw.startsWith("--captured-at=")) args.capturedAt = raw.slice(14);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || !Number.isInteger(args.week) || args.week < 1 || args.week > 18) throw new Error("Required: --season=YYYY --week=1..18");
  if (args.capturedAt && !args.dryRun) throw new Error("--captured-at is only allowed with --dry-run (new real captures always use the actual clock; no backdating)");
  if (args.capturedAt && Number.isNaN(Date.parse(args.capturedAt))) throw new Error("--captured-at must be ISO-8601");
  return args;
}

export function runShadowArchive(args: ReturnType<typeof parseArchiveArgs>, root = ROOT, now: () => string = () => new Date().toISOString()) {
  const nn = String(args.week).padStart(2, "0");
  const text = readFileSync(join(root, "data", "fantasy", "shadow", String(args.season), `week-${nn}.json`), "utf8");
  const artifact = JSON.parse(text) as { season: number; week: number; candidateVersions: { candidateA: string; candidateB: string }; sourceHashes: Record<string, string>; generatedAt: string; specSha256: string; rows: Record<string, unknown>[] };
  if (artifact.season !== args.season || artifact.week !== args.week) throw new Error("Shadow artifact season/week mismatch.");
  const games = (JSON.parse(readFileSync(join(root, "public", "data", "nfl", String(args.season), "games.json"), "utf8")) as { games: ShadowGame[] }).games;
  const capturedAt = args.capturedAt ?? now();
  const events = artifact.rows.map((row) => {
    const team = String(row.team);
    const k = resolveKickoff(games, args.season, args.week, team);
    return buildPredictionEvent({
      schema: SHADOW_ARCHIVE_SCHEMA_VERSION, capturedAt, season: args.season, week: args.week, playerId: String(row.playerId),
      gameId: k?.gameId ?? "", kickoff: k?.kickoff ?? "", candidateVersions: artifact.candidateVersions,
      sourceHashes: { ...artifact.sourceHashes, shadowArtifact: sha256(text), spec: artifact.specSha256 }, payload: row as unknown as Json,
    });
  });
  const paths = shadowArchivePaths(root, args.season, args.week);
  const result = appendPredictionEvents(paths.predictions, events, { dryRun: args.dryRun });
  return { dryRun: args.dryRun, capturedAt, rows: events.length, appended: result.appended, duplicates: result.duplicates, rejected: result.rejected.length,
    rejectedByReason: result.rejected.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.reason]: (acc[r.reason] ?? 0) + 1 }), {}), archive: paths.predictions };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runShadowArchive(parseArchiveArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
