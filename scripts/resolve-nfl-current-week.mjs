/**
 * Resolves which (season, week) the NFL refresh pipelines (yardage
 * projections, fantasy points allowed, TDs allowed, DFS, TD preview) should
 * generate for right now, so no workflow has to be told the current week by
 * hand.
 *
 * Primary rule: earliest week that still has a `scheduled` game in the
 * committed schedule (same as `resolveCurrentWeek` in nfl-market-coverage.mjs).
 * Calendar guard: games that are still `scheduled` long after kickoff are
 * "overdue" and cannot hold the week (see lib/nfl-current-week.mjs) -- this is
 * what keeps a stalled results refresh from pinning every downstream job to a
 * finished week.
 *
 * Prints GitHub Actions `$GITHUB_OUTPUT`-style `key=value` lines on stdout
 * (`season`, `week`, then provenance: `week_source`, `status_week`,
 * `overdue_games`). When the calendar fallback fires, a `::warning::`
 * annotation and the overdue game list go to stderr so the run is visibly
 * degraded rather than silently "green". Fails closed (non-zero exit, nothing
 * on stdout) when no week can be resolved.
 *
 * Usage:
 *   node scripts/resolve-nfl-current-week.mjs
 *   node scripts/resolve-nfl-current-week.mjs --season=2026
 *   node scripts/resolve-nfl-current-week.mjs --now=2026-11-12T15:00:00Z   # deterministic override (tests/backfill)
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCurrentWeekOutput, resolveCurrentWeekDetailed } from "./lib/nfl-current-week.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SEASON = 2026;

function parseArgs(argv) {
  const args = { season: DEFAULT_SEASON, now: new Date() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--now=")) args.now = new Date(raw.slice(6));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season)) throw new Error("--season must be an integer");
  if (Number.isNaN(args.now.getTime())) throw new Error("--now must be an ISO timestamp");
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const path = join(ROOT, "public", "data", "nfl", String(args.season), "games.json");
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  const games = Array.isArray(artifact.games) ? artifact.games : [];

  const result = resolveCurrentWeekDetailed(games, { now: args.now });
  if (result.week == null) {
    throw new Error(`cannot resolve a current week for season ${args.season} from ${path}: ${result.reason}`);
  }

  if (result.source !== "status" || result.overdueGames.length > 0) {
    const sample = result.overdueGames.slice(0, 8).map((g) => `${g.gameId}(+${g.hoursOverdue}h)`).join(", ");
    const level = result.source === "calendar-fallback" ? "warning" : "notice";
    console.error(`::${level}::[resolve-nfl-current-week] week=${result.week} source=${result.source} statusWeek=${result.statusWeek} overdueScheduledGames=${result.overdueGames.length}: ${result.reason}`);
    if (sample) console.error(`[resolve-nfl-current-week] overdue games still marked scheduled: ${sample}${result.overdueGames.length > 8 ? ", ..." : ""}`);
  }

  for (const line of formatCurrentWeekOutput(args.season, result)) console.log(line);
}

try {
  main();
} catch (err) {
  console.error(`[resolve-nfl-current-week] FAILED: ${err.message}`);
  process.exit(1);
}
