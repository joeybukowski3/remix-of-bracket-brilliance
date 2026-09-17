import { describe, expect, it } from "vitest";
import { buildDfsTeamRankContext, resolveDfsDefRank, resolveDfsOppOffRank } from "@/lib/nfl/dfs/teamRankContext";
import type { CurrentRatingBoard } from "@/lib/nfl/currentRating2026";

function board(teams: ReadonlyArray<{ abbr: string; offenseRank: number; defenseRank: number }>): CurrentRatingBoard {
  return {
    season: 2026,
    state: "live",
    teams: teams.map((team) => ({
      abbr: team.abbr,
      team: team.abbr,
      division: "AFC East",
      rating: 50,
      rank: 16,
      offenseRating: 50,
      offenseRank: team.offenseRank,
      defenseRating: 50,
      defenseRank: team.defenseRank,
      performanceRating: null,
      performanceRank: null,
      gamesPlayed: 0,
      preseasonWeight: 1,
      performanceWeight: 0,
      state: "preseason",
      preseasonV04Rating: 50,
      preseasonOffenseRating: 50,
      preseasonDefenseRating: 50,
    })),
  };
}

describe("buildDfsTeamRankContext", () => {
  it("returns an empty map when the board has not loaded", () => {
    expect(buildDfsTeamRankContext(null).size).toBe(0);
  });

  it("keys by normalized (lowercase) team abbreviation", () => {
    const context = buildDfsTeamRankContext(board([{ abbr: "BUF", offenseRank: 3, defenseRank: 12 }]));
    expect(context.get("buf")).toEqual({ offenseRank: 3, defenseRank: 12 });
    expect(context.get("BUF")).toBeUndefined();
  });
});

describe("resolveDfsDefRank / resolveDfsOppOffRank", () => {
  const context = buildDfsTeamRankContext(board([
    { abbr: "BUF", offenseRank: 3, defenseRank: 12 },
    { abbr: "MIA", offenseRank: 20, defenseRank: 5 },
  ]));

  it("resolves the DST's own team defense rank", () => {
    expect(resolveDfsDefRank(context, "BUF")).toBe(12);
  });

  it("resolves the opponent's offense rank", () => {
    expect(resolveDfsOppOffRank(context, "MIA")).toBe(20);
  });

  it("returns null for an unresolvable team or missing input", () => {
    expect(resolveDfsDefRank(context, null)).toBeNull();
    expect(resolveDfsOppOffRank(context, "XYZ")).toBeNull();
  });
});
