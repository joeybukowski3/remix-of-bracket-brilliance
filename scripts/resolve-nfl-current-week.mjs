/**
 * Resolves which (season, week) the NFL Yardage Projections refresh
 * pipeline should generate for right now, so the workflow never has to be
 * told the current week by hand. Reuses `resolveCurrentWeek` from
 * `nfl-market-coverage.mjs` verbatim (earliest week among games not yet
 * `status: "final"` in the committed schedule) -- the same resolution the
 * yardage-market fetch pipeline already relies on -- rather than
 * re-deriving current-week logic here.
 *
 * Prints GitHub Actions `$GITHUB_OUTPUT`-style `key=value` lines
 * (`season=<n>` then `week=<n>`) on success. Fails closed (non-zero exit,
 * nothing printed) when no scheduled game exists for the season -- e.g. the
 * committed schedule is stale or the season is already fully final.
 *
 * Usage:
 *   node scripts/resolve-nfl-current-week.mjs
 *   node scripts/resolve-nfl-current-week.mjs --season=2026
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCurrentWeek } from "./lib/nfl-market-coverage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SEASON = 2026;

function parseArgs(argv) {
  const args = { season: DEFAULT_SEASON };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season)) throw new Error("--season must be an integer");
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const path = join(ROOT, "public", "data", "nfl", String(args.season), "games.json");
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  const games = Array.isArray(artifact.games) ? artifact.games : [];

  const week = resolveCurrentWeek(games);
  if (week == null) {
    throw new Error(`no scheduled (not-yet-final) game found for season ${args.season} in ${path} -- cannot resolve a current week`);
  }

  console.log(`season=${args.season}`);
  console.log(`week=${week}`);
}

try {
  main();
} catch (err) {
  console.error(`[resolve-nfl-current-week] FAILED: ${err.message}`);
  process.exit(1);
}
