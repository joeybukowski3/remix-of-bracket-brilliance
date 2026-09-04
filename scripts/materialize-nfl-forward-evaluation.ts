/**
 * WU4G: materializes the cumulative rushing shadow-vs-production and
 * receiving role-conflict forward-evaluation datasets.
 *
 * Reads ONLY the already-materialized WU3 evaluation datasets
 * (`data/nfl/prediction-evaluations/jkb-football-evaluation-v1/{rushing,receiving}/<season>.jsonl`)
 * -- never the WU1 prediction archive or WU2 outcome archive directly, and
 * never writes to either. Deterministic and idempotent: an unchanged rerun
 * over the same WU3 rows produces byte-identical output.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, type JsonValue } from "./lib/nfl-production-prediction-archive";
import type { ReceivingEvaluationRow, RushingEvaluationRow } from "./lib/nfl-evaluation-dataset";
import {
  buildReceivingForwardEvaluationSummary,
  buildReceivingRoleConflictRow,
  buildRushingForwardEvaluationSummary,
  buildRushingShadowVsProductionRow,
  derivePoolCoherenceFailureCount,
  selectFinalPregameEvaluationRows,
} from "./lib/nfl-forward-evaluation";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export type ForwardEvaluationCliArgs = {
  season: number;
  evaluationRoot: string;
  generatedAt: string;
  dryRun: boolean;
};

export function parseForwardEvaluationArgs(argv: string[]): ForwardEvaluationCliArgs {
  const args: ForwardEvaluationCliArgs = {
    season: NaN,
    evaluationRoot: join(ROOT, "data", "nfl", "prediction-evaluations"),
    generatedAt: new Date().toISOString(),
    dryRun: false,
  };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice("--season=".length));
    else if (raw.startsWith("--evaluation-root=")) args.evaluationRoot = resolve(raw.slice("--evaluation-root=".length));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice("--generated-at=".length);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || args.season < 2000 || args.season > 2100) {
    throw new Error("--season is required and must be an integer from 2000 through 2100");
  }
  if (!Number.isFinite(Date.parse(args.generatedAt)) || !args.generatedAt.endsWith("Z")) {
    throw new Error("--generated-at must be a UTC ISO-8601 timestamp");
  }
  return args;
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T);
}

function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function serializeJsonl(rows: readonly JsonValue[]): string {
  return rows.length === 0 ? "" : `${rows.map((row) => canonicalJson(row)).join("\n")}\n`;
}

export type ForwardEvaluationResult = {
  season: number;
  rushing_rows_read: number;
  rushing_rows_selected: number;
  receiving_rows_read: number;
  receiving_rows_selected: number;
  receiving_rows_excluded_unsupported_position: number;
  files_written: string[];
};

export function runForwardEvaluationMaterializer(args: ForwardEvaluationCliArgs): ForwardEvaluationResult {
  const versionRoot = join(args.evaluationRoot, "jkb-football-evaluation-v1");
  const rushingRows = readJsonl<RushingEvaluationRow>(join(versionRoot, "rushing", `${args.season}.jsonl`));
  const receivingRows = readJsonl<ReceivingEvaluationRow>(join(versionRoot, "receiving", `${args.season}.jsonl`));

  const selectedRushing = selectFinalPregameEvaluationRows(rushingRows);
  const selectedReceiving = selectFinalPregameEvaluationRows(receivingRows);

  const rushingMapped = selectedRushing.map(buildRushingShadowVsProductionRow);
  const receivingMappedNullable = selectedReceiving.map(buildReceivingRoleConflictRow);
  const receivingMapped = receivingMappedNullable.filter((row) => row != null);

  const rushingCompletedWeeks = new Set(rushingMapped.map((row) => row.week)).size;
  const receivingCompletedWeeks = new Set(receivingMapped.map((row) => row.week)).size;

  const rushingSummary = buildRushingForwardEvaluationSummary({
    season: args.season,
    generatedAt: args.generatedAt,
    completedWeeks: rushingCompletedWeeks,
    rows: rushingMapped,
    // WU4G.2 §11: read the run-level pool-coherence fact off the selected
    // rushing rows (persisted by the generator as a flat per-row mirror);
    // null (never 0) when the shadow allocator never ran for any of them.
    poolCoherenceFailureCount: derivePoolCoherenceFailureCount(selectedRushing),
  });
  const receivingSummary = buildReceivingForwardEvaluationSummary({
    season: args.season,
    generatedAt: args.generatedAt,
    completedWeeks: receivingCompletedWeeks,
    rows: receivingMapped,
  });

  const filesWritten: string[] = [];
  const rushingRowsPath = join(versionRoot, "forward-rushing", `${args.season}.jsonl`);
  const rushingSummaryPath = join(versionRoot, "forward-rushing-summary", `${args.season}.json`);
  const receivingRowsPath = join(versionRoot, "forward-receiving", `${args.season}.jsonl`);
  const receivingSummaryPath = join(versionRoot, "forward-receiving-summary", `${args.season}.json`);

  if (!args.dryRun) {
    atomicWrite(rushingRowsPath, serializeJsonl(rushingMapped.map((row) => row as unknown as JsonValue).sort(
      (a, b) => canonicalJson(a).localeCompare(canonicalJson(b)),
    )));
    filesWritten.push(rushingRowsPath);
    atomicWrite(rushingSummaryPath, `${JSON.stringify(JSON.parse(canonicalJson(rushingSummary as unknown as JsonValue)), null, 2)}\n`);
    filesWritten.push(rushingSummaryPath);
    atomicWrite(receivingRowsPath, serializeJsonl(receivingMapped.map((row) => row as unknown as JsonValue).sort(
      (a, b) => canonicalJson(a).localeCompare(canonicalJson(b)),
    )));
    filesWritten.push(receivingRowsPath);
    atomicWrite(receivingSummaryPath, `${JSON.stringify(JSON.parse(canonicalJson(receivingSummary as unknown as JsonValue)), null, 2)}\n`);
    filesWritten.push(receivingSummaryPath);
  }

  return {
    season: args.season,
    rushing_rows_read: rushingRows.length,
    rushing_rows_selected: selectedRushing.length,
    receiving_rows_read: receivingRows.length,
    receiving_rows_selected: selectedReceiving.length,
    receiving_rows_excluded_unsupported_position: receivingMappedNullable.length - receivingMapped.length,
    files_written: filesWritten,
  };
}

function main(): void {
  const args = parseForwardEvaluationArgs(process.argv.slice(2));
  const result = runForwardEvaluationMaterializer(args);
  console.log(JSON.stringify({ dry_run: args.dryRun, ...result }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[nfl:forward-evaluation] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
