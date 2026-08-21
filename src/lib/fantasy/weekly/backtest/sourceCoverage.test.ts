import { describe, expect, it } from "vitest";
import { validateCompletedPlayerWeekSeason } from "../../../../../scripts/lib/fantasy-player-week-source-core.mjs";

function completeRows(season = 2024) {
  return (["QB", "RB", "WR", "TE"] as const).flatMap((position) =>
    Array.from({ length: 18 }, (_, index) => ({
      season, week: index + 1, position, player_id: `${position}-${index + 1}`,
    }))
  );
}

describe("historical player-week source coverage", () => {
  it("accepts only complete Weeks 1-18 coverage for every supported position", () => {
    expect(validateCompletedPlayerWeekSeason(completeRows(), 2024)).toMatchObject({
      QB: { rows: 18, players: 18, weeks: Array.from({ length: 18 }, (_, index) => index + 1) },
    });
    expect(() => validateCompletedPlayerWeekSeason(
      completeRows().filter((row) => !(row.position === "TE" && row.week === 18)), 2024,
    )).toThrow(/TE coverage is incomplete/);
  });

  it("rejects rows from another season", () => {
    const rows = completeRows();
    rows[0].season = 2025;
    expect(() => validateCompletedPlayerWeekSeason(rows, 2024)).toThrow(/outside season 2024/);
  });
});
