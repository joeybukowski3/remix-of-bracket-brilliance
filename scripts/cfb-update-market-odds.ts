import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildOddsByGameId,
  mergeScheduleOdds,
  previousOddsByGameId,
  type CfbdLinesGameRaw,
} from "../src/lib/cfb/pipeline";
import type { CfbGame } from "../src/data/cfb/types";
import { writeAtomic } from "./lib/cfb-cfbd-client";

const ROOT = process.env.CFB_TEST_ROOT?.trim() || resolve(import.meta.dirname, "..");
const RAW = resolve(ROOT, "data", "cfb", "cfbd", "raw");
const OUTPUT = resolve(ROOT, "data", "generated", "cfb");
const SCHEDULE_PATH = resolve(OUTPUT, "2026-schedule-v1.json");
const SEASON = Number(process.env.CFB_SEASON ?? 2026);

const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/**
 * Odds-only schedule update: takes the already-committed schedule artifact
 * and rewrites ONLY each game's `odds` field from the freshly-fetched raw
 * /lines cache, joined strictly by CFBD game ID. No rating/calibration
 * recompute, no schedule/date/time/venue/team-identity changes — every
 * other field on every game object passes through byte-for-byte via
 * mergeScheduleOdds's spread (`{ ...game, odds }`).
 *
 * Last-known-good policy (see mergeScheduleOdds.ts): the "previous" odds
 * map is built from the committed schedule's own current odds, so a
 * missing/unreadable raw cache (endpoint-wide failure) or a per-game
 * absence in an otherwise-successful fetch both fall back to what's
 * already committed rather than nulling anything out.
 */
function main() {
  const schedule = read<CfbGame[]>(SCHEDULE_PATH);
  const previousOdds = previousOddsByGameId(schedule);

  let freshOddsByGameId: ReturnType<typeof buildOddsByGameId> | null = null;
  let endpointError: string | null = null;
  try {
    const rawLines = read<CfbdLinesGameRaw[]>(resolve(RAW, `lines-${SEASON}.json`));
    freshOddsByGameId = buildOddsByGameId(rawLines);
  } catch (error) {
    endpointError = (error as Error).message;
    console.warn(
      `[cfb:update-market-odds] raw lines cache unavailable this run (falling back to last-known-good): ${endpointError}`,
    );
  }

  const updated = mergeScheduleOdds(schedule, freshOddsByGameId, previousOdds);

  // Validate: odds-only rewrite must never change which games exist, how
  // many there are, or their order — anything else means the committed
  // schedule and the raw cache have drifted out of sync and this run
  // should fail loudly rather than write a corrupted artifact.
  if (updated.length !== schedule.length) {
    throw new Error(
      `[cfb:update-market-odds] game count changed (${schedule.length} -> ${updated.length}) — refusing to write`,
    );
  }
  for (let index = 0; index < schedule.length; index += 1) {
    if (updated[index].id !== schedule[index].id) {
      throw new Error(
        `[cfb:update-market-odds] game order/identity changed at index ${index} (${schedule[index].id} -> ${updated[index].id}) — refusing to write`,
      );
    }
    for (const key of Object.keys(schedule[index]) as Array<keyof CfbGame>) {
      if (key === "odds") continue;
      if (JSON.stringify(updated[index][key]) !== JSON.stringify(schedule[index][key])) {
        throw new Error(
          `[cfb:update-market-odds] non-odds field "${key}" changed for game ${schedule[index].id} — refusing to write`,
        );
      }
    }
  }

  const week1 = updated.filter((game) => game.week === 1);
  const withSpread = updated.filter((game) => game.odds.currentSpread !== null).length;
  const week1WithSpread = week1.filter((game) => game.odds.currentSpread !== null).length;
  console.log(
    `[cfb:update-market-odds] endpoint ${freshOddsByGameId ? "available" : "unavailable (LKG fallback)"}; ` +
      `${withSpread}/${updated.length} games with a current spread (${week1WithSpread}/${week1.length} in Week 1)`,
  );

  writeAtomic(SCHEDULE_PATH, `${JSON.stringify(updated, null, 2)}\n`);
}

main();
