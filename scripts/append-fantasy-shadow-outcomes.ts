/**
 * Append realised Full-PPR outcomes for archived shadow predictions as SEPARATE events (never edits a prediction).
 *
 *   tsx scripts/append-fantasy-shadow-outcomes.ts --season=2026 --week=2 [--dry-run]
 *
 * A player's team must appear in the manifest-verified nflverse player-week stats for that week (=> the team's game is complete). A player with no stat
 * line on a completed team is recorded as 0 with statLine:false (inactive/DNP). Teams not yet in the stats file (game not complete / not published)
 * are skipped, never zero-filled. A corrected value appends a new revision that supersedes the old one.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";
import { appendOutcomeEvents, assertArchiveIntact, buildOutcomeEvent, currentOutcomes, readJsonl, selectFinalPreKickoff, sha256, shadowArchivePaths, type OutcomeEvent } from "./lib/fantasy-shadow-archive";
import { normalizeHistoricalPlayerWeek } from "../src/lib/fantasy/weekly/history.ts";
import { normalizeNflTeamAbbr } from "../src/lib/fantasy/weekly/identity.ts";
import { FANTASY_SCORING_VERSION } from "../src/lib/fantasy/weekly/scoring.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function runShadowOutcomes(opts: { season: number; week: number; dryRun: boolean }, root = ROOT, now: () => string = () => new Date().toISOString()) {
  const paths = shadowArchivePaths(root, opts.season, opts.week);
  const predictions = selectFinalPreKickoff(assertArchiveIntact(paths.predictions));
  const dir = join(root, "data", "nfl", "nflverse", "stats-player-week");
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { files: { season: number | null; filename: string; sha256: string }[] };
  const entry = manifest.files.find((file) => file.season === opts.season);
  if (!entry) throw new Error(`No stats-player-week manifest entry for ${opts.season}.`);
  const text = readFileSync(join(dir, entry.filename), "utf8").replace(/\r\n/g, "\n");
  const problems = verifyCacheEntry(entry as never, text);
  if (problems.length) throw new Error(problems.join("\n"));
  const statsSha = sha256(text);
  const rows = (parseCsv(text) as Record<string, string>[]).filter((row) => String(row.season_type).toUpperCase() === "REG" && Number(row.week) === opts.week);
  const completeTeams = new Set(rows.map((row) => normalizeNflTeamAbbr(String(row.recent_team ?? row.team ?? "")) ?? String(row.recent_team).toLowerCase()));
  const points = new Map<string, number>();
  for (const row of rows) {
    const normalized = normalizeHistoricalPlayerWeek(row);
    if (normalized) points.set(normalized.playerId, normalized.actualFantasyPoints);
  }
  const existing = currentOutcomes(readJsonl<OutcomeEvent>(paths.outcomes).rows);
  const events: OutcomeEvent[] = []; let skippedIncomplete = 0;
  for (const p of predictions) {
    const team = String((p.payload as { team: string }).team).toLowerCase();
    if (!completeTeams.has(normalizeNflTeamAbbr(team) ?? team)) { skippedIncomplete += 1; continue; }
    const hasLine = points.has(p.playerId);
    const event = buildOutcomeEvent({ eventType: "outcome", season: opts.season, week: opts.week, playerId: p.playerId, actualFantasyPoints: hasLine ? points.get(p.playerId)! : 0,
      statLine: hasLine, scoringVersion: FANTASY_SCORING_VERSION, statsSourceSha256: statsSha, recordedAt: now() }, existing.get(`${opts.season}|${opts.week}|${p.playerId}`) ?? null);
    if (event) events.push(event);
  }
  const appended = appendOutcomeEvents(paths.outcomes, events, { dryRun: opts.dryRun });
  return { dryRun: opts.dryRun, predictions: predictions.length, appended, skippedIncomplete, outcomes: paths.outcomes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = { season: NaN, week: NaN, dryRun: false };
    for (const raw of process.argv.slice(2)) { if (raw === "--dry-run") o.dryRun = true; else if (raw.startsWith("--season=")) o.season = Number(raw.slice(9)); else if (raw.startsWith("--week=")) o.week = Number(raw.slice(7)); else throw new Error(`Unknown argument: ${raw}`); }
    if (!Number.isInteger(o.season) || !Number.isInteger(o.week)) throw new Error("Required: --season --week");
    console.log(JSON.stringify(runShadowOutcomes(o), null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
