import { describe, expect, it } from "vitest";
import { buildTeamMarketContext, type TeamMarketSourceGame } from "@/lib/fantasy/rosResearch/teamMarketContext";

const PROVENANCE = { source: "test-market", generatedAt: "2026-08-26T00:00:00.000Z" };

describe("buildTeamMarketContext", () => {
  it("reports coverage as a fraction and never collapses multiple games into a single number", () => {
    const games: TeamMarketSourceGame[] = [
      { gameId: "g1", week: 1, homeAbbr: "buf", awayAbbr: "mia", neutralSite: false, spread: { home: -3, away: 3 }, total: 45 },
      { gameId: "g2", week: 2, homeAbbr: "nyj", awayAbbr: "buf", neutralSite: false, spread: { home: null, away: null }, total: null },
    ];
    const result = buildTeamMarketContext(games, ["buf"], PROVENANCE);
    const buf = result.teams[0];
    expect(buf.games).toHaveLength(2);
    expect(buf.coverage).toEqual({ gamesWithMarketData: 1, gamesScheduled: 2, fraction: 0.5 });
  });

  it("does not fabricate an implied total when spread/total are unavailable -- missing data handling", () => {
    const games: TeamMarketSourceGame[] = [
      { gameId: "g1", week: 1, homeAbbr: "buf", awayAbbr: "mia", neutralSite: false, spread: { home: null, away: null }, total: null },
    ];
    const result = buildTeamMarketContext(games, ["buf"], PROVENANCE);
    expect(result.teams[0].games[0].impliedTeamTotal).toBeNull();
  });

  it("computes the correct implied total for the home team and matches away for the opponent", () => {
    const games: TeamMarketSourceGame[] = [
      { gameId: "g1", week: 1, homeAbbr: "buf", awayAbbr: "mia", neutralSite: false, spread: { home: -3, away: 3 }, total: 45 },
    ];
    const result = buildTeamMarketContext(games, ["buf", "mia"], PROVENANCE);
    const buf = result.teams.find((team) => team.team === "buf")!;
    const mia = result.teams.find((team) => team.team === "mia")!;
    expect(buf.games[0].impliedTeamTotal).toBeCloseTo(24, 5);
    expect(mia.games[0].impliedTeamTotal).toBeCloseTo(21, 5);
  });

  it("is deterministic across repeated runs on the same input", () => {
    const games: TeamMarketSourceGame[] = [
      { gameId: "g1", week: 1, homeAbbr: "buf", awayAbbr: "mia", neutralSite: false, spread: { home: -3, away: 3 }, total: 45 },
    ];
    expect(buildTeamMarketContext(games, ["buf"], PROVENANCE)).toEqual(buildTeamMarketContext(games, ["buf"], PROVENANCE));
  });
});
