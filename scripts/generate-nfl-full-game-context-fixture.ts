/**
 * WU1 (docs/nfl-grok-chatgpt-handicap-architecture.md §4/§21/§22) -- builds a
 * private/dev Game Context Packet for a game and writes it to
 * data/nfl/game-context/<season>/<week>/<gameId>.json.
 *
 * This is a manual/dev fixture script, NOT a scheduled workflow -- it is not
 * wired into any GitHub Actions cron (WU1 explicitly forbids adding
 * workflows). Run it by hand:
 *   `npx tsx scripts/generate-nfl-full-game-context-fixture.ts [--game=2026_01_BAL_IND]`
 * Defaults to 2026_01_BAL_IND (the original WU1 documented first-test game,
 * §22's rule: current, not-yet-final week-1 game with a live market line and
 * full EPA/YPP/trench/yardage/TD-score coverage for both teams) when --game
 * is omitted, for backward compatibility with existing callers/docs.
 *
 * WU3.3.1 -- all I/O wiring (reading every upstream artifact and calling the
 * pure builder) lives in scripts/lib/nfl-full-game-context-loader.ts, shared
 * with the update-mode pipelines.
 *
 * WU4.6.3 -- build+validate+write is now ONE shared helper
 * (scripts/lib/nfl-game-context-preflight.ts's rebuildAndPersistGameContext),
 * shared with every other WU4.6 consumer that needs the persisted artifact to
 * exist, so this script is now just: parse --game, call the shared helper,
 * report the result.
 */
import { rebuildAndPersistGameContext } from "./lib/nfl-game-context-preflight";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]): { gameId: string } {
  const match = argv.map((a) => /^--game=(.+)$/.exec(a)).find(Boolean);
  return { gameId: match ? match[1] : "2026_01_BAL_IND" };
}

function parseSeasonWeek(gameId: string): { season: number; week: number } {
  const [seasonStr, weekStr] = gameId.split("_");
  const season = Number(seasonStr);
  const week = Number(weekStr);
  if (!Number.isFinite(season) || !Number.isFinite(week)) {
    throw new Error(`Cannot parse season/week out of gameId "${gameId}" -- expected "<season>_<week>_<AWAY>_<HOME>".`);
  }
  return { season, week };
}

function main(): void {
  const { gameId } = parseArgs(process.argv.slice(2));
  const { season, week } = parseSeasonWeek(gameId);

  const result = rebuildAndPersistGameContext({ root: ROOT, gameId, season, week });
  if (!result.ok) {
    console.error(result.reason);
    if (result.issues.length > 0) console.error("Validation errors:", JSON.stringify(result.issues, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(`Wrote ${result.contextArtifactPath}`);
  console.log("Validation: PASSED");
}

main();
