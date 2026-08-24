import { describe, expect, it } from "vitest";
import { buildCfbV2ScheduleGraph } from "./scheduleGraph";
import type { CfbNormalizedHistoricalGame } from "../../pipeline/types";

function game(overrides: Partial<CfbNormalizedHistoricalGame> = {}): CfbNormalizedHistoricalGame {
  return {
    gameId: "g1",
    season: 2026,
    week: 1,
    date: "2026-09-05",
    homeTeamId: "alpha",
    awayTeamId: "bravo",
    homeExternalOpponentId: null,
    awayExternalOpponentId: null,
    homeScore: 30,
    awayScore: 20,
    neutralSite: false,
    completed: true,
    status: "final",
    seasonType: "regular",
    gameType: "regular",
    homeClassification: "fbs",
    awayClassification: "fbs",
    includesFcsOpponent: false,
    ...overrides,
  };
}

describe("buildCfbV2ScheduleGraph — leakage safety (§8)", () => {
  it("week N game is absent from its own pregame graph", () => {
    const games = [game({ gameId: "wk2", week: 2, homeTeamId: "alpha", awayTeamId: "bravo" })];
    const graph = buildCfbV2ScheduleGraph(2026, 2, ["alpha", "bravo"], games);
    // asOfWeek=2 excludes week===2 games (strictly before cutoff only)
    expect(graph.byTeam.get("alpha")!.gamesPlayed).toBe(0);
    expect(graph.byTeam.get("bravo")!.gamesPlayed).toBe(0);
    expect(graph.byTeam.get("alpha")!.componentSize).toBe(1);
  });

  it("week N+1 game cannot alter week N's graph", () => {
    const games = [
      game({ gameId: "wk1", week: 1, homeTeamId: "alpha", awayTeamId: "bravo" }),
      game({ gameId: "wk2", week: 2, homeTeamId: "charlie", awayTeamId: "delta" }),
    ];
    const graphAtWeek2 = buildCfbV2ScheduleGraph(2026, 2, ["alpha", "bravo", "charlie", "delta"], games);
    expect(graphAtWeek2.byTeam.get("alpha")!.gamesPlayed).toBe(1); // week 1 game folded in
    expect(graphAtWeek2.byTeam.get("charlie")!.gamesPlayed).toBe(0); // week 2 game NOT folded in (not strictly before cutoff 2)
  });

  it("isolated teams at zero games get componentSize=1, never fabricated as connected", () => {
    const graph = buildCfbV2ScheduleGraph(2026, 1, ["alpha", "bravo", "charlie"], []);
    for (const teamId of ["alpha", "bravo", "charlie"]) {
      expect(graph.byTeam.get(teamId)!.componentSize).toBe(1);
      expect(graph.byTeam.get(teamId)!.gamesPlayed).toBe(0);
    }
  });

  it("connects teams transitively through a shared opponent", () => {
    const games = [
      game({ gameId: "g1", week: 1, homeTeamId: "alpha", awayTeamId: "bravo" }),
      game({ gameId: "g2", week: 2, homeTeamId: "bravo", awayTeamId: "charlie" }),
    ];
    const graph = buildCfbV2ScheduleGraph(2026, 3, ["alpha", "bravo", "charlie", "delta"], games);
    expect(graph.byTeam.get("alpha")!.componentSize).toBe(3);
    expect(graph.byTeam.get("bravo")!.componentSize).toBe(3);
    expect(graph.byTeam.get("charlie")!.componentSize).toBe(3);
    expect(graph.byTeam.get("delta")!.componentSize).toBe(1);
  });

  it("excludes FBS-vs-FCS games from the network", () => {
    const games = [game({ gameId: "g1", week: 1, homeTeamId: "alpha", awayTeamId: "fcsteam", awayClassification: "fcs" })];
    const graph = buildCfbV2ScheduleGraph(2026, 2, ["alpha", "bravo"], games);
    expect(graph.byTeam.get("alpha")!.gamesPlayed).toBe(0);
    expect(graph.byTeam.get("alpha")!.componentSize).toBe(1);
  });

  it("excludes non-completed games even if week is before the cutoff", () => {
    const games = [game({ gameId: "g1", week: 1, status: "scheduled", completed: false })];
    const graph = buildCfbV2ScheduleGraph(2026, 2, ["alpha", "bravo"], games);
    expect(graph.byTeam.get("alpha")!.gamesPlayed).toBe(0);
  });
});
