import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { acquireMlbKHistoryStatsApi } from "./lib/mlb-k-history-statsapi.mjs";

const ROOT = process.cwd();

export async function main(argv = process.argv.slice(2)) {
  const value = (prefix) => argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const numberValue = (prefix, fallback) => {
    const parsed = Number(value(prefix));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const result = await acquireMlbKHistoryStatsApi({
    startDate: value("--start="),
    endDate: value("--end="),
    outputRoot: value("--output-root=") ?? path.join(ROOT, "data", "mlb", "k-history", "raw", "statsapi"),
    concurrency: Math.max(1, Math.min(5, Math.trunc(numberValue("--concurrency=", 3)))),
    timeoutMs: Math.max(1_000, Math.trunc(numberValue("--timeout-ms=", 15_000))),
    maxAttempts: Math.max(1, Math.min(5, Math.trunc(numberValue("--max-attempts=", 3)))),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "complete") process.exitCode = 2;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[acquire-mlb-k-history-statsapi] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
