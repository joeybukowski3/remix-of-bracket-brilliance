import { describe, expect, it } from "vitest";
import { makeHistoricalPlayerWeek } from "@/lib/nfl/fantasyAllowed/__fixtures__/historicalPlayerWeek";
import { buildOffenseGameLog } from "./aggregate";

describe("buildOffenseGameLog", () => {
  it("groups points scored by the offensive team, not the opponent", () => {
    const rows = [
      makeHistoricalPlayerWeek({ team: "buf", opponent: "mia", season: 2025, week: 1, position: "WR", actualFantasyPoints: 10 }),
      makeHistoricalPlayerWeek({ team: "buf", opponent: "mia", season: 2025, week: 1, position: "WR", actualFantasyPoints: 5 }),
    ];
    const log = buildOffenseGameLog(rows, "WR");
    expect(log).toEqual([{ team: "buf", season: 2025, week: 1, fantasyPointsAllowed: 15 }]);
  });

  it("filters out other positions", () => {
    const rows = [
      makeHistoricalPlayerWeek({ team: "buf", position: "QB", actualFantasyPoints: 20 }),
      makeHistoricalPlayerWeek({ team: "buf", position: "RB", actualFantasyPoints: 8 }),
    ];
    const log = buildOffenseGameLog(rows, "QB");
    expect(log).toHaveLength(1);
    expect(log[0].fantasyPointsAllowed).toBe(20);
  });

  it("keeps separate games from separate weeks distinct", () => {
    const rows = [
      makeHistoricalPlayerWeek({ team: "buf", position: "TE", season: 2025, week: 1, actualFantasyPoints: 5 }),
      makeHistoricalPlayerWeek({ team: "buf", position: "TE", season: 2025, week: 2, actualFantasyPoints: 7 }),
    ];
    const log = buildOffenseGameLog(rows, "TE");
    expect(log).toHaveLength(2);
  });
});
