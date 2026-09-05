/**
 * Generate data/nfl/starter-cohorts/<season>/<week>.jsonl -- the frozen,
 * deterministic pregame starter cohort for a given NFL season/week, derived
 * from the live `passing`/`rushing`/`receiving` prediction archives.
 *
 * This is a READ-ONLY consumer of
 * data/nfl/predictions/<season>/<week>/{nfl-passing-direct-ridge,
 * nfl-rushing-carries-x-shrunk-ypc,nfl-receiving-targets-x-shrunk-ypt}.jsonl.
 * It never writes to a prediction or outcome archive, and every selection
 * decision is delegated to buildStarterCohort (scripts/lib/nfl-starter-
 * cohort.ts), which reads only pregame-valid archived evidence.
 *
 * The output file is fully regenerated (atomic overwrite) on every run --
 * given the same archive state, the output is byte-identical (aside from a
 * `generated_at` field frozen per-run via --generated-at for tests). This is
 * the same idempotent-regeneration pattern as generate-nfl-team-totals-
 * view.mts: the source archive is append-only and can gain new pregame
 * snapshots between runs (e.g. a corrected depth chart before kickoff), so
 * "regenerate the whole file" rather than "append rows" is the correct
 * semantics for a frozen-but-recomputable pregame view.
 *
 * Run via tsx:
 *   npx tsx scripts/generate-nfl-starter-cohort.mts --season=2026 --week=1
 *   npx tsx scripts/generate-nfl-starter-cohort.mts --season=2026 --week=1 --dry-run
 */
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadArchivedPredictions } from "./resolve-nfl-prediction-outcomes";
import { buildStarterCohort, serializeStarterCohort, type MissingStarterSlot, type StarterCohortRecordV1 } from "./lib/nfl-starter-cohort";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_ROOT = join(ROOT, "data", "nfl", "predictions");
const OUT_ROOT = join(ROOT, "data", "nfl", "starter-cohorts");

type Args = { season: number; week: number; dryRun: boolean; archiveRoot: string; outRoot: string; generatedAt: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { season: NaN, week: NaN, dryRun: false, archiveRoot: ARCHIVE_ROOT, outRoot: OUT_ROOT, generatedAt: new Date().toISOString() };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw.startsWith("--archive-root=")) args.archiveRoot = resolve(ROOT, raw.slice(15));
    else if (raw.startsWith("--out-root=")) args.outRoot = resolve(ROOT, raw.slice(11));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season)) throw new Error("--season=<year> is required");
  if (!Number.isInteger(args.week) || args.week < 1) throw new Error("--week=<n> is required");
  return args;
}

export function outputPath(outRoot: string, season: number, week: number): string {
  return join(outRoot, String(season), `${String(week).padStart(2, "0")}.jsonl`);
}

function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  } catch (error) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw error;
  }
}

export type StarterCohortSummary = {
  season: number;
  week: number;
  games: number;
  teams: number;
  totalRows: number;
  byPosition: Record<"QB" | "RB" | "WR" | "TE", number>;
  qbByDepthChart: number;
  qbByProjectionFallback: number;
  teamsWithMissingSlots: number;
  missing: MissingStarterSlot[];
};

export function summarize(season: number, week: number, records: StarterCohortRecordV1[], missing: MissingStarterSlot[]): StarterCohortSummary {
  const games = new Set(records.map((r) => r.game_id));
  const teams = new Set(records.map((r) => r.team));
  const byPosition = { QB: 0, RB: 0, WR: 0, TE: 0 };
  let qbByDepthChart = 0;
  let qbByProjectionFallback = 0;
  for (const record of records) {
    byPosition[record.position] += 1;
    if (record.starter_basis === "QB1_BY_ARCHIVED_DEPTH_CHART") qbByDepthChart += 1;
    if (record.starter_basis === "QB1_BY_PROJECTED_PASSING_YARDS") qbByProjectionFallback += 1;
  }
  const teamsWithMissingSlots = new Set(missing.map((m) => `${m.game_id}|${m.team}`)).size;
  return { season, week, games: games.size, teams: teams.size, totalRows: records.length, byPosition, qbByDepthChart, qbByProjectionFallback, teamsWithMissingSlots, missing };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const allPredictions = loadArchivedPredictions(args.archiveRoot, args.season, args.week);
  const passing = allPredictions.filter((r) => r.prediction_type === "passing");
  const rushing = allPredictions.filter((r) => r.prediction_type === "rushing");
  const receiving = allPredictions.filter((r) => r.prediction_type === "receiving");

  const { records, missing } = buildStarterCohort({ passing, rushing, receiving, generatedAt: args.generatedAt });
  const summary = summarize(args.season, args.week, records, missing);

  console.log(`[nfl:starter-cohort] season=${args.season} week=${args.week} games=${summary.games} teams=${summary.teams} rows=${summary.totalRows} QB=${summary.byPosition.QB}(depth=${summary.qbByDepthChart},fallback=${summary.qbByProjectionFallback}) RB=${summary.byPosition.RB} WR=${summary.byPosition.WR} TE=${summary.byPosition.TE} teamsWithMissingSlots=${summary.teamsWithMissingSlots}`);
  if (missing.length > 0) {
    console.log(`[nfl:starter-cohort] missing slots:`);
    for (const slot of missing) console.log(`  ${slot.game_id} ${slot.team} ${slot.slot}: ${slot.reason}`);
  }

  const outPath = outputPath(args.outRoot, args.season, args.week);
  if (args.dryRun) {
    console.log(`[nfl:starter-cohort] dry-run — not writing ${outPath}`);
    return;
  }
  atomicWrite(outPath, serializeStarterCohort(records));
  console.log(`[nfl:starter-cohort] wrote ${outPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`[nfl:starter-cohort] FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
