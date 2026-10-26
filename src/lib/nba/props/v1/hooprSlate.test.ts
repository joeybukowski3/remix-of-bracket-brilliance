import { describe, expect, it } from "vitest";
import { buildHooprSlate, type HooprScheduleRow } from "./hooprSlate";
import { parseSlate } from "./slateBuild";

const game = (id: number, date: string, gameDate: string, away: string, home: string, over: Partial<HooprScheduleRow> = {}): HooprScheduleRow => ({
  id, date, game_date: gameDate, season: 2027, season_type: 2, status_type_state: "pre", status_type_completed: false, home_abbreviation: home, away_abbreviation: away, ...over,
});
const NOW = new Date("2026-10-23T15:00:00Z");

describe("buildHooprSlate", () => {
  const rows = [
    game(1, "2026-10-22T23:00Z", "2026-10-22", "CLE", "PHI", { status_type_state: "post", status_type_completed: true }),
    game(2, "2026-10-23T23:00Z", "2026-10-23", "ATL", "CHA"),
    game(3, "2026-10-24T02:00Z", "2026-10-23", "GS", "NO"),
    game(4, "2026-10-24T23:30Z", "2026-10-24", "BOS", "NY"),
  ];

  it("takes every game on the next date that still has games, with canonical team codes and a UTC tipoff", () => {
    const { slate, date } = buildHooprSlate(rows, NOW);
    expect(date).toBe("2026-10-23");
    expect(slate.games).toEqual([{ gameKey: "2026-10-23|ATL@CHA", tipoffUtc: "2026-10-23T23:00:00Z" }, { gameKey: "2026-10-23|GSW@NOP", tipoffUtc: "2026-10-24T02:00:00Z" }]);
  });

  it("produces a slate the V1 builder accepts (Eastern date matches the tipoff)", () => {
    expect(parseSlate(buildHooprSlate(rows, NOW).slate)).toHaveLength(2);
  });

  it("skips games already finished, in progress or past tipoff, and moves to the next date when today is over", () => {
    const later = new Date("2026-10-24T03:00:00Z");
    const { slate, date } = buildHooprSlate(rows, later);
    expect(date).toBe("2026-10-24");
    expect(slate.games.map((g) => g.gameKey)).toEqual(["2026-10-24|BOS@NYK"]);
    expect(buildHooprSlate([game(5, "2026-10-23T14:00Z", "2026-10-23", "ATL", "CHA", { status_type_state: "in" })], NOW).slate.games).toEqual([]);
  });

  it("uses regular-season games of 2026-27 only", () => {
    const other = [game(6, "2026-10-23T23:00Z", "2026-10-23", "ATL", "CHA", { season_type: 1 }), game(7, "2026-10-23T23:00Z", "2026-10-23", "ATL", "CHA", { season: 2026 })];
    expect(buildHooprSlate(other, NOW).slate.games).toEqual([]);
  });

  it("skips and reports a game with an unusable team code or tipoff instead of guessing", () => {
    const bad = [game(8, "2026-10-23T23:00Z", "2026-10-23", "XXX", "CHA"), game(9, "not a time", "2026-10-23", "ATL", "CHA"), game(10, "2026-10-23T23:00Z", "2026-10-23", "ATL", "ATL")];
    const result = buildHooprSlate(bad, NOW);
    expect(result.slate.games).toEqual([]);
    expect(result.skipped.map((s) => s.id)).toEqual(["8", "9", "10"]);
  });

  it("reports no date and an empty slate when nothing is left to play", () => {
    expect(buildHooprSlate([], NOW)).toMatchObject({ date: null, slate: { games: [] } });
  });
});
