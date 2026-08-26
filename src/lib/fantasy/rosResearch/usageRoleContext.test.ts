import { describe, expect, it } from "vitest";
import { buildUsageRoleContext, type UsageRoleSourceRow } from "@/lib/fantasy/rosResearch/usageRoleContext";

const UNIVERSE = [{ playerId: "gsis:1", playerName: "Test Player", position: "WR" as const }];

function row(overrides: Partial<UsageRoleSourceRow["usage"]>): UsageRoleSourceRow {
  return {
    season: 2024,
    playerId: "gsis:1",
    playerName: "Test Player",
    position: "WR",
    usage: {
      offensiveSnaps: 40, snapShare: 0.8, targets: 8, receptions: 5,
      rushAttempts: 0, targetShare: 0.25, airYardsShare: 0.3,
      ...overrides,
    },
  };
}

describe("buildUsageRoleContext", () => {
  it("averages only present values and reports sample size per field -- missing data handling", () => {
    const rows = [row({ snapShare: 0.8 }), row({ snapShare: null })];
    const result = buildUsageRoleContext(rows, UNIVERSE);
    const season = result.players[0].seasons[0];
    expect(season.snapShare).toEqual({ average: 0.8, sampleSize: 1 });
    expect(season.gamesWithStats).toBe(2);
  });

  it("keeps season-level context only, one row per season", () => {
    const rows = [
      { ...row({}), season: 2023 },
      { ...row({}), season: 2023 },
      { ...row({}), season: 2024 },
    ];
    const result = buildUsageRoleContext(rows, UNIVERSE);
    expect(result.players[0].seasons.map((season) => season.season)).toEqual([2023, 2024]);
  });

  it("declares nflverse-unavailable fields explicitly rather than omitting them", () => {
    const result = buildUsageRoleContext([], UNIVERSE);
    expect(result.players[0].unavailableFields).toContain("routeParticipation");
    expect(result.players[0].unavailableFields).toContain("redZoneTouches");
  });
});
