/**
 * WU4 -- generate public/data/nfl/performance/props.json, the canonical
 * frontend-facing NFL starter-props performance artifact.
 *
 * This script writes NO model output and grades NOTHING itself: it is a
 * pure reshape/rollup over already-canonical WU2 output --
 *  - data/nfl/starter-cohorts/<season>/<week>.jsonl (WU1 frozen cohort, read
 *    only to compute total_cohort_rows coverage denominators),
 *  - data/nfl/starter-prop-evaluations/<season>/<week>.jsonl (gradeable rows),
 *  - data/nfl/starter-prop-evaluations/<season>/<week>.exclusions.jsonl
 *    (persisted exclusion diagnostics -- never recomputed here).
 * All grading/error math and `directional_result` are read verbatim off the
 * WU2 archive rows; see scripts/lib/nfl-props-performance.ts (pure,
 * unit-tested) for the reshape/rollup logic itself.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import type { StarterCohortRecordV1 } from "./lib/nfl-starter-cohort";
import type { StarterPropEvaluationRowV1, StarterPropExclusion } from "./lib/nfl-starter-prop-evaluation";
import {
  buildPropsPerformanceRow,
  computePropsBucketRollups,
  computePropsCoverageDiagnostics,
  computePropsSummaryMetrics,
  type PropsPerformanceRow,
} from "./lib/nfl-props-performance";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COHORT_ROOT = join(ROOT, "data", "nfl", "starter-cohorts");
const EVALUATION_ROOT = join(ROOT, "data", "nfl", "starter-prop-evaluations");
const OUT_FILE = join(ROOT, "public", "data", "nfl", "performance", "props.json");
export const PROPS_PERFORMANCE_SCHEMA_VERSION = "nfl-props-performance-v1";

function listSeasonWeekJsonlFiles(root: string, suffix: string): { season: number; week: number; path: string }[] {
  if (!existsSync(root)) return [];
  const out: { season: number; week: number; path: string }[] = [];
  for (const seasonEntry of readdirSync(root, { withFileTypes: true })) {
    if (!seasonEntry.isDirectory() || !/^[0-9]{4}$/.test(seasonEntry.name)) continue;
    const season = Number(seasonEntry.name);
    const seasonDir = join(root, seasonEntry.name);
    for (const fileEntry of readdirSync(seasonDir, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith(suffix)) continue;
      const weekToken = fileEntry.name.slice(0, -suffix.length);
      if (!/^[0-9]{2}$/.test(weekToken)) continue;
      out.push({ season, week: Number(weekToken), path: join(seasonDir, fileEntry.name) });
    }
  }
  return out.sort((a, b) => a.season - b.season || a.week - b.week);
}

function readJsonlRows<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

/**
 * Pure(-ish) artifact build: reads the same on-disk sources `main()` does,
 * but performs no writes. Exported so tests can call it twice and assert
 * determinism (idempotency), and can inspect intermediate shape, without
 * touching public/data/nfl/performance/props.json.
 */
export function buildPropsPerformanceArtifact(
  generatedAt: string,
  cohortRoot: string = COHORT_ROOT,
  evaluationRoot: string = EVALUATION_ROOT,
) {
  const cohortFiles = listSeasonWeekJsonlFiles(cohortRoot, ".jsonl");
  let totalCohortRows = 0;
  for (const file of cohortFiles) totalCohortRows += readJsonlRows<StarterCohortRecordV1>(file.path).length;

  const evaluationFiles = listSeasonWeekJsonlFiles(evaluationRoot, ".jsonl").filter((f) => !f.path.endsWith(".exclusions.jsonl"));
  const evaluationRows: StarterPropEvaluationRowV1[] = [];
  for (const file of evaluationFiles) evaluationRows.push(...readJsonlRows<StarterPropEvaluationRowV1>(file.path));

  const exclusions: StarterPropExclusion[] = [];
  for (const file of evaluationFiles) {
    const exclusionsPath = file.path.replace(/\.jsonl$/, ".exclusions.jsonl");
    exclusions.push(...readJsonlRows<StarterPropExclusion>(exclusionsPath));
  }

  const rows: PropsPerformanceRow[] = evaluationRows
    .map(buildPropsPerformanceRow)
    .sort((a, b) => a.season - b.season || a.week - b.week || a.game_id.localeCompare(b.game_id) || a.player_id.localeCompare(b.player_id) || a.market.localeCompare(b.market));

  const summary = computePropsSummaryMetrics(rows);
  const buckets = computePropsBucketRollups(rows);
  const coverage = computePropsCoverageDiagnostics(totalCohortRows, rows, exclusions);

  const seasons = [...new Set(evaluationFiles.map((f) => f.season))].sort();
  const modelVersions = [...new Set(evaluationRows.map((r) => r.model_version))].sort();
  const predictionTimestamps = evaluationRows.map((r) => r.prediction_timestamp).sort();

  const artifact = {
    _meta: buildNflMeta({
      source: "generated (data/nfl/starter-cohorts/** + data/nfl/starter-prop-evaluations/**)",
      modelVersion: modelVersions.length === 1 ? modelVersions[0] : null,
      notes: [
        "Canonical derived starter-props performance artifact for the future /nfl/performance dashboard. Not a raw archive -- do not parse JSONL for this view.",
        "directional_result, market_outcome, and every error field are read verbatim from the WU2 starter-prop-evaluation archive -- no independent grading logic exists here.",
        "Rows are grouped by market (passing_yards/rushing_yards/receiving_yards); WR and TE share receiving_yards.",
      ],
      generatedAt,
    }),
    schemaVersion: PROPS_PERFORMANCE_SCHEMA_VERSION,
    performanceMeta: {
      schemaVersion: PROPS_PERFORMANCE_SCHEMA_VERSION,
      generatedAt,
      seasons,
      modelVersions,
      gradedStarterProps: rows.length,
      latestPredictionTimestamp: predictionTimestamps.length ? predictionTimestamps[predictionTimestamps.length - 1] : null,
    },
    summary,
    buckets,
    coverage,
    rows,
  };

  return { artifact, evaluationRowsCount: evaluationRows.length };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const generatedAt = args.find((a) => a.startsWith("--generated-at="))?.slice(15) ?? new Date().toISOString();

  const { artifact, evaluationRowsCount } = buildPropsPerformanceArtifact(generatedAt);

  console.log(
    `[nfl:props-performance] graded=${artifact.rows.length} evaluationRows=${evaluationRowsCount} excluded=${artifact.coverage.excluded_rows}`,
  );

  if (dryRun) {
    console.log(`[nfl:props-performance] dry-run -- not writing ${OUT_FILE}`);
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }
  console.log(`[nfl:props-performance] wrote ${OUT_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`[nfl:props-performance] FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
