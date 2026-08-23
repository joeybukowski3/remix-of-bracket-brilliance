/**
 * Resolves the season/week the Tuesday 4 AM ET rollover should generate,
 * using the SAME canonical `resolveNflWeekSelection` the public site uses --
 * no second week-resolution authority. Prints `{"season":N,"week":N}` to
 * stdout for the workflow to consume; exits non-zero (no output) if no
 * regular-season week can be resolved, so the workflow can no-op cleanly
 * rather than generate for a fabricated week.
 *
 * Usage:
 *   tsx scripts/resolve-fantasy-weekly-rollover-target.ts --season=2026
 */
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNflWeekSelection } from "../src/lib/nfl/weekSelection.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]) {
  const args = { season: 2026 };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function main(): void {
  const { season } = parseArgs(process.argv);
  const schedulePath = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  const schedule = JSON.parse(readFileSync(schedulePath, "utf8")) as { games: { seasonType: string; week: number; dateUtc: string | null }[] };
  const selection = resolveNflWeekSelection(schedule.games as never, { now: new Date() });
  if (selection.week === null) {
    console.error("[rollover-target] No regular-season week could be resolved; refusing to emit a target.");
    process.exit(1);
  }
  console.log(JSON.stringify({ season, week: selection.week }));
}

main();
