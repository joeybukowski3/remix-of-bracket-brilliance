/**
 * One-time migration: split the legacy monolithic WU3 evaluation files
 * (`<dataset>/<season>.jsonl`) into week shards (`<dataset>/<season>/<WW>.jsonl`).
 *
 * Lossless by construction -- operates on raw lines, verifies the row multiset
 * before deleting the monolith, and aborts without changing anything on any
 * anomaly. See scripts/lib/nfl-evaluation-shards.ts for why this exists
 * (receiving/2026.jsonl outgrew GitHub's 100 MB push limit; issue 454).
 *
 * Usage:
 *   npx tsx scripts/migrate-nfl-evaluation-shards.ts --season=2026
 *   npx tsx scripts/migrate-nfl-evaluation-shards.ts --season=2026 --evaluation-root=path/to/prediction-evaluations
 */
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { legacyEvaluationPath, migrateLegacyToShards } from "./lib/nfl-evaluation-shards";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATASETS = ["spread", "passing", "rushing", "receiving", "team_opportunity", "team_total", "resolution-status"] as const;

function parseArgs(argv: string[]) {
  const args = { season: NaN, evaluationRoot: join(ROOT, "data", "nfl", "prediction-evaluations") };
  for (const raw of argv) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice("--season=".length));
    else if (raw.startsWith("--evaluation-root=")) args.evaluationRoot = resolve(raw.slice("--evaluation-root=".length));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || args.season < 2000 || args.season > 2100) throw new Error("--season is required (2000-2100)");
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const versionRoot = join(args.evaluationRoot, "jkb-football-evaluation-v1");
  for (const dataset of DATASETS) {
    const legacy = legacyEvaluationPath(versionRoot, dataset, args.season);
    let beforeMb = "-";
    try {
      beforeMb = (statSync(legacy).size / 1048576).toFixed(1);
    } catch {
      // no legacy file for this dataset
    }
    const result = migrateLegacyToShards(versionRoot, dataset, args.season);
    if (!result) {
      console.log(`[nfl:eval-shards] ${dataset}/${args.season}: no legacy file, nothing to do`);
      continue;
    }
    const largest = Math.max(...result.shards.map((path) => statSync(path).size)) / 1048576;
    console.log(`[nfl:eval-shards] ${dataset}/${args.season}: ${result.rows} rows ${beforeMb} MB -> ${result.shards.length} shards (largest ${largest.toFixed(1)} MB), verified`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[nfl:eval-shards] FAILED: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
