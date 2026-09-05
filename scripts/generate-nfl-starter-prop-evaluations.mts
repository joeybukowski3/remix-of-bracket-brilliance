/**
 * Generate data/nfl/starter-prop-evaluations/<season>/<week>.jsonl -- the
 * canonical WU2 starter-prop evaluation dataset, derived from:
 *   - data/nfl/starter-cohorts/<season>/<week>.jsonl (frozen WU1 cohort)
 *   - data/nfl/predictions/<season>/<week>/*.jsonl (immutable projections)
 *   - data/nfl/prediction-outcomes/<season>/<week>/*.jsonl (resolved outcomes)
 *
 * Read-only over all three archives; never writes to any of them. Fully
 * regenerated (atomic overwrite) on every run, so a corrected outcome
 * revision or a newly-archived comparison line is picked up on rerun without
 * any special migration step.
 *
 * Run via tsx:
 *   npx tsx scripts/generate-nfl-starter-prop-evaluations.mts --season=2026 --week=1
 *   npx tsx scripts/generate-nfl-starter-prop-evaluations.mts --season=2026 --week=1 --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadArchivedPredictions } from "./resolve-nfl-prediction-outcomes";
import { loadOutcomeEvents } from "./lib/nfl-evaluation-materializer";
import type { StarterCohortRecordV1 } from "./lib/nfl-starter-cohort";
import {
  buildStarterPropEvaluations,
  serializeStarterPropEvaluations,
  summarizeStarterPropEvaluations,
  type StarterPropExclusion,
} from "./lib/nfl-starter-prop-evaluation";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COHORT_ROOT = join(ROOT, "data", "nfl", "starter-cohorts");
const PREDICTION_ROOT = join(ROOT, "data", "nfl", "predictions");
const OUTCOME_ROOT = join(ROOT, "data", "nfl", "prediction-outcomes");
const OUT_ROOT = join(ROOT, "data", "nfl", "starter-prop-evaluations");

type Args = {
  season: number;
  week: number;
  dryRun: boolean;
  cohortRoot: string;
  predictionRoot: string;
  outcomeRoot: string;
  outRoot: string;
  generatedAt: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    season: NaN, week: NaN, dryRun: false,
    cohortRoot: COHORT_ROOT, predictionRoot: PREDICTION_ROOT, outcomeRoot: OUTCOME_ROOT, outRoot: OUT_ROOT,
    generatedAt: new Date().toISOString(),
  };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw.startsWith("--cohort-root=")) args.cohortRoot = resolve(ROOT, raw.slice(14));
    else if (raw.startsWith("--prediction-root=")) args.predictionRoot = resolve(ROOT, raw.slice(18));
    else if (raw.startsWith("--outcome-root=")) args.outcomeRoot = resolve(ROOT, raw.slice(15));
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

function cohortPath(cohortRoot: string, season: number, week: number): string {
  return join(cohortRoot, String(season), `${String(week).padStart(2, "0")}.jsonl`);
}

export function loadStarterCohort(cohortRoot: string, season: number, week: number): StarterCohortRecordV1[] {
  const path = cohortPath(cohortRoot, season, week);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StarterCohortRecordV1);
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

function logExclusions(exclusions: readonly StarterPropExclusion[]): void {
  for (const exclusion of exclusions) {
    console.log(`  ${exclusion.game_id} ${exclusion.team} ${exclusion.player_id} ${exclusion.market}: ${exclusion.reason} (${exclusion.detail ?? ""})`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cohort = loadStarterCohort(args.cohortRoot, args.season, args.week);
  const allPredictions = loadArchivedPredictions(args.predictionRoot, args.season, args.week);
  const predictions = allPredictions.filter((row) => row.prediction_type === "passing" || row.prediction_type === "rushing" || row.prediction_type === "receiving");
  const outcomeEvents = loadOutcomeEvents(args.outcomeRoot, args.season, args.week, null)
    .filter((event) => event.prediction_type === "passing" || event.prediction_type === "rushing" || event.prediction_type === "receiving");

  const { rows, exclusions } = buildStarterPropEvaluations({ cohort, predictions, outcomeEvents, generatedAt: args.generatedAt });
  const summary = summarizeStarterPropEvaluations(cohort.length, rows, exclusions);

  console.log(
    `[nfl:starter-prop-evaluations] season=${args.season} week=${args.week} cohortRows=${summary.total_cohort_rows} gradeable=${summary.gradeable_rows} ` +
      `win=${summary.win_n} loss=${summary.loss_n} push=${summary.push_n} neutral=${summary.neutral_n} ` +
      `hitRate=${summary.directional_hit_rate ?? "n/a"} exclusions=${exclusions.length}`,
  );
  if (exclusions.length > 0) {
    console.log(`[nfl:starter-prop-evaluations] exclusions by reason: ${JSON.stringify(summary.exclusions_by_reason)}`);
    logExclusions(exclusions);
  }

  const outPath = outputPath(args.outRoot, args.season, args.week);
  if (args.dryRun) {
    console.log(`[nfl:starter-prop-evaluations] dry-run — not writing ${outPath}`);
    return;
  }
  atomicWrite(outPath, serializeStarterPropEvaluations(rows));
  console.log(`[nfl:starter-prop-evaluations] wrote ${outPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`[nfl:starter-prop-evaluations] FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
