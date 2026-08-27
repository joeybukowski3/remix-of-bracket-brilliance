import { describe, expect, it } from "vitest";
import {
  aggregateCell,
  buildDefenseWeekIndex,
  buildProductionAllowedTeams,
  normalizeStatRows,
  selectWindowWeeks,
} from "./nfl-production-allowed-core.mjs";

function row(overrides) {
  return {
    season: "2025",
    season_type: "REG",
    recent_team: "KC",
    opponent_team: "DEN",
    week: "1",
    position: "QB",
    passing_yards: "0",
    rushing_yards: "0",
    receiving_yards: "0",
    ...overrides,
  };
}

describe("normalizeStatRows", () => {
  it("keeps only the requested season and REG season_type", () => {
    const rows = [
      row({ season: "2025", season_type: "REG" }),
      row({ season: "2024", season_type: "REG" }),
      row({ season: "2025", season_type: "POST" }),
    ];
    expect(normalizeStatRows(rows, 2025)).toHaveLength(1);
  });

  it("drops rows missing opponent_team or a parseable week", () => {
    const rows = [row({ opponent_team: "" }), row({ week: "" }), row()];
    expect(normalizeStatRows(rows, 2025)).toHaveLength(1);
  });
});

describe("buildDefenseWeekIndex", () => {
  it("returns each defense team's distinct sorted weeks", () => {
    const rows = normalizeStatRows(
      [
        row({ opponent_team: "DEN", week: "3" }),
        row({ opponent_team: "DEN", week: "1" }),
        row({ opponent_team: "DEN", week: "1" }),
        row({ opponent_team: "KC", week: "2" }),
      ],
      2025,
    );
    const index = buildDefenseWeekIndex(rows);
    expect(index.get("DEN")).toEqual([1, 3]);
    expect(index.get("KC")).toEqual([2]);
  });
});

describe("selectWindowWeeks", () => {
  it("season returns every week", () => {
    expect(selectWindowWeeks([1, 2, 3, 4, 5, 6], "season")).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("last5 returns the final five weeks by week number, byes never counted", () => {
    expect(selectWindowWeeks([1, 2, 3, 4, 5, 6, 8], "last5")).toEqual([2, 3, 4, 5, 6, 8].slice(-5));
  });

  it("last5 returns fewer than five weeks early in a season, never a fabricated pad", () => {
    expect(selectWindowWeeks([1, 2], "last5")).toEqual([1, 2]);
  });

  it("throws on an unknown mode instead of silently returning an empty window", () => {
    expect(() => selectWindowWeeks([1], "monthly")).toThrow();
  });
});

describe("aggregateCell", () => {
  it("sums passing yards allowed to opposing QBs only, per game", () => {
    const rows = normalizeStatRows(
      [
        row({ opponent_team: "DEN", week: "1", position: "QB", passing_yards: "300" }),
        // A WR trick-play pass in the same game must not count as passing offense allowed.
        row({ opponent_team: "DEN", week: "1", position: "WR", passing_yards: "20" }),
        row({ opponent_team: "DEN", week: "2", position: "QB", passing_yards: "200" }),
      ],
      2025,
    );
    const cell = aggregateCell(rows, "DEN", [1, 2], "passing", "QB");
    expect(cell.totalYardsAllowed).toBe(500);
    expect(cell.gamesIncluded).toBe(2);
    expect(cell.yardsAllowedPerGame).toBe(250);
  });

  it("rushing ALL sums every ball-carrier position; RB isolates the RB slice", () => {
    const rows = normalizeStatRows(
      [
        row({ opponent_team: "DEN", week: "1", position: "RB", rushing_yards: "80" }),
        row({ opponent_team: "DEN", week: "1", position: "QB", rushing_yards: "20" }),
      ],
      2025,
    );
    expect(aggregateCell(rows, "DEN", [1], "rushing", "ALL").totalYardsAllowed).toBe(100);
    expect(aggregateCell(rows, "DEN", [1], "rushing", "RB").totalYardsAllowed).toBe(80);
  });

  it("receiving is position-specific with no team-wide fallback", () => {
    const rows = normalizeStatRows(
      [
        row({ opponent_team: "DEN", week: "1", position: "WR", receiving_yards: "60" }),
        row({ opponent_team: "DEN", week: "1", position: "TE", receiving_yards: "40" }),
        row({ opponent_team: "DEN", week: "1", position: "RB", receiving_yards: "10" }),
      ],
      2025,
    );
    expect(aggregateCell(rows, "DEN", [1], "receiving", "WR").totalYardsAllowed).toBe(60);
    expect(aggregateCell(rows, "DEN", [1], "receiving", "TE").totalYardsAllowed).toBe(40);
    expect(aggregateCell(rows, "DEN", [1], "receiving", "RB").totalYardsAllowed).toBe(10);
  });

  it("returns null (never a fabricated zero) when the window has no weeks", () => {
    expect(aggregateCell([], "DEN", [], "passing", "QB")).toBeNull();
  });

  it("never mixes another team's opponent rows into the aggregate", () => {
    const rows = normalizeStatRows(
      [
        row({ opponent_team: "DEN", week: "1", position: "QB", passing_yards: "300" }),
        row({ opponent_team: "KC", week: "1", position: "QB", passing_yards: "999" }),
      ],
      2025,
    );
    expect(aggregateCell(rows, "DEN", [1], "passing", "QB").totalYardsAllowed).toBe(300);
  });
});

describe("buildProductionAllowedTeams", () => {
  it("builds every configured market/position/window cell for a team with games", () => {
    const rows = normalizeStatRows(
      [
        row({ opponent_team: "DEN", week: "1", position: "QB", passing_yards: "300" }),
        row({ opponent_team: "DEN", week: "1", position: "RB", rushing_yards: "80", receiving_yards: "10" }),
        row({ opponent_team: "DEN", week: "1", position: "WR", receiving_yards: "60" }),
        row({ opponent_team: "DEN", week: "1", position: "TE", receiving_yards: "40" }),
      ],
      2025,
    );
    const teams = buildProductionAllowedTeams(rows, ["DEN", "KC"]);
    expect(Object.keys(teams)).toEqual(["DEN"]); // KC never appeared as a defense -> omitted, not zero-filled.
    expect(teams.DEN.passing.QB.season.yardsAllowedPerGame).toBe(300);
    expect(teams.DEN.rushing.ALL.season.yardsAllowedPerGame).toBe(80);
    expect(teams.DEN.rushing.RB.season.yardsAllowedPerGame).toBe(80);
    expect(teams.DEN.receiving.WR.season.yardsAllowedPerGame).toBe(60);
    expect(teams.DEN.receiving.TE.season.yardsAllowedPerGame).toBe(40);
    expect(teams.DEN.receiving.RB.season.yardsAllowedPerGame).toBe(10);
    // last5 with only one game in the fixture equals season.
    expect(teams.DEN.passing.QB.last5.gamesIncluded).toBe(1);
  });

  it("omits a team entirely rather than zero-filling when it never appears as a defense", () => {
    const teams = buildProductionAllowedTeams([], ["DEN"]);
    expect(teams).toEqual({});
  });
});
