import { describe, expect, it } from "vitest";
import { playsWeekBatchesFromGames } from "./cfb-cfbd-plays-client";
import type { CfbdGame } from "../../src/lib/cfb/pipeline/types";

function game(overrides: Partial<CfbdGame> = {}): CfbdGame {
  return {
    id: 1,
    season: 2026,
    week: 1,
    seasonType: "regular",
    startDate: "2026-08-29T00:00:00.000Z",
    startTimeTBD: false,
    completed: false,
    neutralSite: false,
    homeId: 1,
    homeTeam: "Alabama",
    awayId: 2,
    awayTeam: "Auburn",
    ...overrides,
  };
}

describe("playsWeekBatchesFromGames", () => {
  it("derives exactly one batch per distinct (week, seasonType) present in the games", () => {
    const batches = playsWeekBatchesFromGames([
      game({ week: 1, seasonType: "regular" }),
      game({ week: 1, seasonType: "regular", id: 2 }),
      game({ week: 2, seasonType: "regular", id: 3 }),
    ]);
    expect(batches).toEqual([
      { week: 1, seasonType: "regular" },
      { week: 2, seasonType: "regular" },
    ]);
  });

  it("supports Week 0 — no fixed 1-17 assumption", () => {
    const batches = playsWeekBatchesFromGames([game({ week: 0, seasonType: "regular" })]);
    expect(batches).toEqual([{ week: 0, seasonType: "regular" }]);
  });

  it("supports postseason seasonType as a structurally distinct batch (sorted alphabetically by seasonType, then week — matches research/ingestion/fetchPlays.ts's identical ordering)", () => {
    const batches = playsWeekBatchesFromGames([
      game({ week: 1, seasonType: "postseason" }),
      game({ week: 15, seasonType: "regular" }),
    ]);
    expect(batches).toEqual([
      { week: 1, seasonType: "postseason" },
      { week: 15, seasonType: "regular" },
    ]);
  });

  it("skips games with a non-integer week rather than fabricating a batch", () => {
    const batches = playsWeekBatchesFromGames([game({ week: Number.NaN })]);
    expect(batches).toEqual([]);
  });

  it("returns an empty array for an empty schedule", () => {
    expect(playsWeekBatchesFromGames([])).toEqual([]);
  });

  it("never produces a duplicate batch for repeated games in the same (week, seasonType)", () => {
    const batches = playsWeekBatchesFromGames([
      game({ week: 3, id: 10 }),
      game({ week: 3, id: 11 }),
      game({ week: 3, id: 12 }),
    ]);
    expect(batches).toHaveLength(1);
  });
});
