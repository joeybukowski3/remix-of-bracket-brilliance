import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  materializeEvaluation,
  type MaterializerOptions,
} from "./lib/nfl-evaluation-materializer";
import type { EvaluationPredictionType } from "./lib/nfl-evaluation-dataset";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PREDICTION_TYPES = new Set<EvaluationPredictionType>(["spread", "passing", "rushing", "receiving"]);

export function parseMaterializerArgs(argv: string[]): MaterializerOptions {
  const options: MaterializerOptions = {
    predictionRoot: join(ROOT, "data", "nfl", "predictions"),
    outcomeRoot: join(ROOT, "data", "nfl", "prediction-outcomes"),
    evaluationRoot: join(ROOT, "data", "nfl", "prediction-evaluations"),
    repoRoot: ROOT,
    season: null,
    week: null,
    predictionType: null,
    dryRun: false,
  };
  for (const raw of argv) {
    if (raw === "--dry-run") options.dryRun = true;
    else if (raw === "--all") options.season = null;
    else if (raw.startsWith("--season=")) options.season = Number(raw.slice("--season=".length));
    else if (raw.startsWith("--week=")) options.week = Number(raw.slice("--week=".length));
    else if (raw.startsWith("--prediction-type=")) {
      const value = raw.slice("--prediction-type=".length) as EvaluationPredictionType;
      if (!PREDICTION_TYPES.has(value)) throw new Error("--prediction-type must be spread, passing, rushing, or receiving");
      options.predictionType = value;
    } else if (raw.startsWith("--prediction-root=")) options.predictionRoot = resolve(raw.slice("--prediction-root=".length));
    else if (raw.startsWith("--outcome-root=")) options.outcomeRoot = resolve(raw.slice("--outcome-root=".length));
    else if (raw.startsWith("--evaluation-root=")) options.evaluationRoot = resolve(raw.slice("--evaluation-root=".length));
    else if (raw.startsWith("--repo-root=")) options.repoRoot = resolve(raw.slice("--repo-root=".length));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (options.season != null && (!Number.isInteger(options.season) || options.season < 2000 || options.season > 2100)) {
    throw new Error("--season must be an integer from 2000 through 2100");
  }
  if (options.week != null && options.season == null) throw new Error("--week requires --season");
  if (options.week != null && (!Number.isInteger(options.week) || options.week < 1 || options.week > 25)) {
    throw new Error("--week must be an integer from 1 through 25");
  }
  return options;
}

export function runMaterializer(options: MaterializerOptions): ReturnType<typeof materializeEvaluation> {
  return materializeEvaluation(options);
}

function main(): void {
  const options = parseMaterializerArgs(process.argv.slice(2));
  const result = runMaterializer(options);
  console.log(JSON.stringify({ dry_run: options.dryRun, ...result }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[nfl:evaluation-materializer] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
