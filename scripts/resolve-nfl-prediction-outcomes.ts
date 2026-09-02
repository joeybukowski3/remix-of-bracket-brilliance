import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePredictionSnapshot, type PredictionSnapshotV1, type PredictionType } from "./lib/nfl-production-prediction-archive";
import {
  appendOutcomeDrafts,
  loadResolverSeasonSources,
  resolvePredictionOutcome,
  summarizeResolution,
} from "./lib/nfl-prediction-outcome-resolver";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export type ResolverCliArgs = {
  season: number | null;
  week: number | null;
  dryRun: boolean;
  predictionRoot: string;
  outcomeRoot: string;
  repoRoot: string;
  recordedAt: string;
  predictionTypes: PredictionType[] | null;
};

export function parseResolverArgs(argv: string[]): ResolverCliArgs {
  const args: ResolverCliArgs = {
    season: null, week: null, dryRun: false,
    predictionRoot: join(ROOT, "data", "nfl", "predictions"),
    outcomeRoot: join(ROOT, "data", "nfl", "prediction-outcomes"), repoRoot: ROOT,
    recordedAt: new Date().toISOString(), predictionTypes: null,
  };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--prediction-types=")) {
      const types = raw.slice(19).split(",").filter(Boolean) as PredictionType[];
      const supported = new Set<PredictionType>(["spread", "passing", "rushing", "receiving"]);
      if (!types.length || types.some((type) => !supported.has(type))) throw new Error("--prediction-types must contain spread, passing, rushing, and/or receiving");
      args.predictionTypes = [...new Set(types)];
    }
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw.startsWith("--prediction-root=")) args.predictionRoot = resolve(raw.slice(18));
    else if (raw.startsWith("--outcome-root=")) args.outcomeRoot = resolve(raw.slice(15));
    else if (raw.startsWith("--repo-root=")) args.repoRoot = resolve(raw.slice(12));
    else if (raw.startsWith("--recorded-at=")) args.recordedAt = raw.slice(14);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (args.season != null && (!Number.isInteger(args.season) || args.season < 2000 || args.season > 2100)) throw new Error("--season must be an integer from 2000 through 2100");
  if (args.week != null && args.season == null) throw new Error("--week requires --season");
  if (args.week != null && (!Number.isInteger(args.week) || args.week < 1 || args.week > 25)) throw new Error("--week must be an integer from 1 through 25");
  if (!Number.isFinite(Date.parse(args.recordedAt)) || !args.recordedAt.endsWith("Z")) throw new Error("--recorded-at must be a UTC ISO-8601 timestamp");
  return args;
}

export function loadArchivedPredictions(root: string, season: number | null, week: number | null): PredictionSnapshotV1[] {
  if (!existsSync(root)) return [];
  const seasonNames = season == null
    ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name)).map((entry) => entry.name)
    : [String(season)];
  const records: PredictionSnapshotV1[] = [];
  for (const seasonName of seasonNames) {
    const seasonDir = join(root, seasonName);
    if (!existsSync(seasonDir)) continue;
    const weekNames = week == null
      ? readdirSync(seasonDir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /^\d{2}$/.test(entry.name)).map((entry) => entry.name)
      : [String(week).padStart(2, "0")];
    for (const weekName of weekNames) {
      const weekDir = join(seasonDir, weekName);
      if (!existsSync(weekDir)) continue;
      for (const file of readdirSync(weekDir).filter((name) => name.endsWith(".jsonl")).sort()) {
        for (const line of readFileSync(join(weekDir, file), "utf8").split(/\r?\n/).filter(Boolean)) {
          const record = JSON.parse(line) as PredictionSnapshotV1;
          validatePredictionSnapshot(record);
          records.push(record);
        }
      }
    }
  }
  return records.sort((a, b) => a.season - b.season || a.week - b.week || a.prediction_id.localeCompare(b.prediction_id));
}

export function runResolver(args: ResolverCliArgs) {
  const predictions = loadArchivedPredictions(args.predictionRoot, args.season, args.week)
    .filter((prediction) => args.predictionTypes == null || args.predictionTypes.includes(prediction.prediction_type));
  const sourceBySeason = new Map<number, ReturnType<typeof loadResolverSeasonSources>>();
  const drafts = predictions.map((prediction) => {
    let sources = sourceBySeason.get(prediction.season);
    if (!sources) {
      sources = loadResolverSeasonSources(args.repoRoot, prediction.season);
      sourceBySeason.set(prediction.season, sources);
    }
    return resolvePredictionOutcome(prediction, sources, args.recordedAt);
  });
  const write = appendOutcomeDrafts({ rootDir: args.outcomeRoot, drafts, dryRun: args.dryRun });
  return { predictions: predictions.length, summary: summarizeResolution(drafts, write), files: write.files };
}

function main(): void {
  const args = parseResolverArgs(process.argv.slice(2));
  const result = runResolver(args);
  console.log(JSON.stringify({ dry_run: args.dryRun, predictions: result.predictions, ...result.summary, files_written: result.files }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[nfl:prediction-outcomes] FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
