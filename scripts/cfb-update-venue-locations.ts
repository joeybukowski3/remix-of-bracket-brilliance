import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildVenueIdByGameId,
  buildVenueLocationById,
  mergeScheduleVenueLocations,
} from "../src/lib/cfb/pipeline";
import type { CfbdGame, CfbdVenue } from "../src/lib/cfb/pipeline/types";
import type { CfbGame } from "../src/data/cfb/types";
import { writeAtomic } from "./lib/cfb-cfbd-client";

const ROOT = process.env.CFB_TEST_ROOT?.trim() || resolve(import.meta.dirname, "..");
const RAW = resolve(ROOT, "data", "cfb", "cfbd", "raw");
const OUTPUT = resolve(ROOT, "data", "generated", "cfb");
const SCHEDULE_PATH = resolve(OUTPUT, "2026-schedule-v1.json");
const SEASON = Number(process.env.CFB_SEASON ?? 2026);

const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/**
 * Venue-location-only schedule update: rewrites ONLY each game's
 * `venueCity`/`venueState` fields, joined strictly by CFBD venue ID
 * (raw /games venueId -> raw /venues city/state). No rating/odds/rankings
 * recompute, no schedule/date/time/venue-name/team-identity changes — every
 * other field on every game object passes through byte-for-byte.
 *
 * Never infers a location: a game whose venueId is missing/unmapped keeps
 * venue name only (venueCity/venueState stay null) rather than guessing from
 * a home team's city.
 */
function main() {
  const schedule = read<CfbGame[]>(SCHEDULE_PATH);
  const rawGames = read<CfbdGame[]>(resolve(RAW, `games-${SEASON}.json`));
  const rawVenues = read<CfbdVenue[]>(resolve(RAW, "venues.json"));

  const venueIdByGameId = buildVenueIdByGameId(rawGames);
  const venueLocationById = buildVenueLocationById(rawVenues);
  const updated = mergeScheduleVenueLocations(schedule, venueIdByGameId, venueLocationById);

  if (updated.length !== schedule.length) {
    throw new Error(
      `[cfb:update-venue-locations] game count changed (${schedule.length} -> ${updated.length}) — refusing to write`,
    );
  }
  for (let index = 0; index < schedule.length; index += 1) {
    if (updated[index].id !== schedule[index].id) {
      throw new Error(
        `[cfb:update-venue-locations] game order/identity changed at index ${index} (${schedule[index].id} -> ${updated[index].id}) — refusing to write`,
      );
    }
    for (const key of Object.keys(schedule[index]) as Array<keyof CfbGame>) {
      if (key === "venueCity" || key === "venueState") continue;
      if (JSON.stringify(updated[index][key]) !== JSON.stringify(schedule[index][key])) {
        throw new Error(
          `[cfb:update-venue-locations] non-venue-location field "${key}" changed for game ${schedule[index].id} — refusing to write`,
        );
      }
    }
  }

  const withCity = updated.filter((game) => game.venueCity !== null).length;
  const week1 = updated.filter((game) => game.week === 1);
  const week1WithCity = week1.filter((game) => game.venueCity !== null).length;
  const neutralWeek1 = week1.filter((game) => game.neutralSite);
  const neutralWeek1WithCity = neutralWeek1.filter((game) => game.venueCity !== null).length;
  console.log(
    `[cfb:update-venue-locations] ${withCity}/${updated.length} games with a verified venue city ` +
      `(${week1WithCity}/${week1.length} in Week 1; ${neutralWeek1WithCity}/${neutralWeek1.length} Week 1 neutral-site)`,
  );

  writeAtomic(SCHEDULE_PATH, `${JSON.stringify(updated, null, 2)}\n`);
}

main();
