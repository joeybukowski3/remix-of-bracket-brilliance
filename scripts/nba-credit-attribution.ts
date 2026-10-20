/**
 * Read-only: where did the shared Odds API credits go, as far as COMMITTED files can show?
 *
 * For each interval between two readings of the provider's counter (data/market/betting-lines/quota-state.json,
 * written by the NFL job) it subtracts what the repository proves was spent in that interval:
 *   - the NFL job's own call (lastCost in the reading);
 *   - the NFL yardage cross-check (crossCheck.eventsChecked in the committed artifact, 1 credit per event);
 *   - MLB odds writes whose source is "the-odds-api" (1 credit each).
 * What is left is the residual: an upper bound on spend nothing committed explains.
 *
 * It reads local git history only: no network, no secret, no write. After the MLB pause has landed, the
 * residual column is the measurement of the unattributed consumer.
 *
 *   npm run nba:credit-attribution
 *   npm run nba:credit-attribution -- --ref origin/main --since 2026-10-01
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { reconcileIntervals, type DatedCredits, type QuotaObservation } from "../src/lib/nba/props/pipeline/zeroCostBudget";

const ROOT = resolve(import.meta.dirname, "..");
const QUOTA_FILE = "data/market/betting-lines/quota-state.json";
const YARDAGE_FILE = "public/data/nfl/nfl-yardage-market.json";
const MLB_FILE = "public/data/mlb/mlb-odds.json";

const git = (...args: string[]): string => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] ?? fallback : fallback;
};

/** Every committed version of a JSON file with its commit time; an unreadable version is skipped, not guessed at. */
function versions(ref: string, since: string, file: string): Array<{ committedAt: string; json: Record<string, unknown> }> {
  const lines = git("log", ref, "--format=%H %cI", `--since=${since}`, "--", file).split("\n").filter(Boolean);
  const out: Array<{ committedAt: string; json: Record<string, unknown> }> = [];
  for (const line of lines) {
    const [sha, committedAt] = line.split(" ");
    try {
      out.push({ committedAt, json: JSON.parse(git("show", `${sha}:${file}`)) as Record<string, unknown> });
    } catch {
      // not readable at that commit
    }
  }
  return out;
}

function main(): void {
  const ref = arg("--ref", "HEAD");
  const since = arg("--since", "2026-10-01");
  const readings = versions(ref, since, QUOTA_FILE)
    .map((v) => ({ at: String(v.json.updatedAt ?? v.committedAt), used: v.json.used, lastCost: typeof v.json.lastCost === "number" ? v.json.lastCost : null }))
    .filter((r): r is QuotaObservation & { lastCost: number | null } => typeof r.used === "number")
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const yardage: DatedCredits[] = versions(ref, since, YARDAGE_FILE).map((v) => {
    const cross = v.json.crossCheck as { eventsChecked?: number } | undefined;
    return { at: String(v.json.generatedAt ?? v.committedAt), credits: typeof cross?.eventsChecked === "number" ? cross.eventsChecked : 0 };
  });
  const mlb: DatedCredits[] = versions(ref, since, MLB_FILE).map((v) => ({ at: String(v.json.fetchedAt ?? v.committedAt), credits: v.json.source === "the-odds-api" ? 1 : 0 }));

  const rows = reconcileIntervals(readings, yardage, mlb);
  if (rows.length === 0) {
    console.log("No complete interval between two counter readings in range.");
    return;
  }
  console.log(`Counter readings from ${ref} since ${since}: ${readings.length}; latest ${readings.at(-1)?.used}/500 at ${readings.at(-1)?.at}\n`);
  console.log("interval end (UTC)      days  delta  NFL lines  yardage  MLB(committed)  residual");
  for (const r of rows) console.log(`${r.endAt.slice(0, 16)}  ${r.days.toFixed(2).padStart(6)}  ${String(r.delta).padStart(5)}  ${String(r.nflLines).padStart(9)}  ${String(r.yardage).padStart(7)}  ${String(r.mlb).padStart(14)}  ${String(r.residual).padStart(8)}`);
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((total, r) => total + pick(r), 0);
  const days = sum((r) => r.days);
  console.log(`\nTotal over ${days.toFixed(1)} days: ${sum((r) => r.delta)} credits (${(sum((r) => r.delta) / days).toFixed(2)}/day); residual ${sum((r) => r.residual)} (${(sum((r) => r.residual) / days).toFixed(2)}/day).`);
  console.log("The residual includes MLB runs that spent a credit but committed nothing, so it is an upper bound on the unattributed consumer.");
  console.log("Re-run after the MLB pause has been live for a week: what is left in the residual column is not MLB.");
}

main();
