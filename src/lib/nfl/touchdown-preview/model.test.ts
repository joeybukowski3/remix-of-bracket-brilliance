import { describe, expect, it } from "vitest";
import { aggregateScorerTouchdownsByPosition, buildAllTouchdownWindows, buildTouchdownScores, defaultTouchdownSort, isTouchdownOpportunity, selectPlayerGames, TD_SUCCESS_PRIOR_OPPORTUNITIES } from "./model";
import type { TouchdownCandidateInput, TouchdownOpponentGame, TouchdownPlayerGame, TouchdownPosition } from "./types";

function game(overrides: Partial<TouchdownPlayerGame> = {}): TouchdownPlayerGame {
  return { gameId: "2025_01_AAA_BBB", season: 2025, week: 1, date: null, team: "aaa", opponent: "bbb", homeAway: "home", teamScore: 24, opponentScore: 17,
    carries: 10, targets: 4, scorerOpportunities: 14, teamScorerOpportunities: 50, teamRzOpportunities: 8, teamGoalLineOpportunities: 3, rushingTds: 1, receivingTds: 0, touchdowns: 1,
    rzOpportunities: 3, inside10Opportunities: 2, goalLineOpportunities: 1, ...overrides };
}
function defense(overrides: Partial<TouchdownOpponentGame> = {}): TouchdownOpponentGame {
  return { gameId: "2025_01_CCC_BBB", season: 2025, week: 1, date: null, defense: "bbb", opponent: "ccc", homeAway: "away", defenseScore: 17, opponentScore: 24,
    offensiveTdsAllowed: 3, rzOpportunitiesAllowed: 5, inside10OpportunitiesAllowed: 3, goalLineOpportunitiesAllowed: 2,
    touchdownsAllowedByPosition: { QB: 0, RB: 1, WR: 2, TE: 0 }, ...overrides };
}
function candidate(id: string, multiplier: number, position: TouchdownPosition = "RB"): TouchdownCandidateInput {
  return { playerId: id, playerName: `Player ${id}`, team: "aaa", opponent: "bbb", homeAway: "home", position, gameId: "2026_01_AAA_BBB", kickoff: null,
    impliedTeamPoints: 20 + multiplier, playerGames: [game({ scorerOpportunities: 8 + multiplier, carries: 8 + multiplier, targets: 0, teamScorerOpportunities: 50,
      touchdowns: multiplier > 1 ? 1 : 0, rushingTds: multiplier > 1 ? 1 : 0, rzOpportunities: multiplier, inside10Opportunities: multiplier, goalLineOpportunities: multiplier })],
    opponentGames: [defense({ rzOpportunitiesAllowed: 3 + multiplier, inside10OpportunitiesAllowed: 2 + multiplier, goalLineOpportunitiesAllowed: 1 + multiplier,
      touchdownsAllowedByPosition: { QB: 0, RB: multiplier, WR: 1, TE: 0 } })] };
}

describe("JKB TD Score V1", () => {
  it("calculates deterministically, normalizes the fixed population, and sorts descending by default", () => {
    const population = [candidate("a", 1), candidate("b", 2), candidate("c", 3)];
    const first = buildTouchdownScores(population, "2025");
    const second = buildTouchdownScores(population, "2025");
    expect(first).toEqual(second);
    expect(first.map((row) => row.windows["2025"].jkbTdScore)).toEqual([0, 38.33, 61.67]);
    expect(defaultTouchdownSort(first, "2025").map((row) => row.playerId)).toEqual(["c", "b", "a"]);
  });

  it("keeps scores fixed when consumers filter the already-scored population", () => {
    const scored = buildTouchdownScores([candidate("a", 1), candidate("b", 2), candidate("c", 3)], "2025");
    const before = scored.find((row) => row.playerId === "b")!.windows["2025"].jkbTdScore;
    const filtered = scored.filter((row) => row.playerId === "b");
    expect(filtered[0].windows["2025"].jkbTdScore).toBe(before);
    expect(filtered[0].windows["2025"].scorePoolSize).toBe(3);
  });

  it("uses the 25/35/40 normalized TD opportunity blend", () => {
    const scored = buildTouchdownScores([candidate("low", 1), candidate("high", 2)], "2025");
    expect(scored[1].windows["2025"].components.tdOpportunities.value).toBe(50);
  });

  it("uses inclusive scoring-area boundaries", () => {
    expect(isTouchdownOpportunity(20, 20)).toBe(true);
    expect(isTouchdownOpportunity(10, 10)).toBe(true);
    expect(isTouchdownOpportunity(5, 5)).toBe(true);
    expect(isTouchdownOpportunity(21, 20)).toBe(false);
  });

  it("shrinks tiny-sample TD conversion toward the population rate", () => {
    const lucky = candidate("lucky", 1); lucky.playerGames = [game({ scorerOpportunities: 1, carries: 1, targets: 0, touchdowns: 1, rushingTds: 1 })];
    const normal = candidate("normal", 2); normal.playerGames = [game({ scorerOpportunities: 19, carries: 19, targets: 0, touchdowns: 1, rushingTds: 1 })];
    const rows = buildTouchdownScores([lucky, normal], "2025");
    expect(TD_SUCCESS_PRIOR_OPPORTUNITIES).toBe(20);
    expect(rows[0].windows["2025"].tdSuccessRate).toBeLessThan(0.2);
  });

  it("selects season windows and Last 8 across a season boundary", () => {
    const games = [1, 2, 3].map((week) => game({ season: 2026, week, gameId: `2026_${week}` }))
      .concat([14, 15, 16, 17, 18, 13].map((week) => game({ season: 2025, week, gameId: `2025_${week}` })));
    expect(selectPlayerGames(games, "2026")).toHaveLength(3);
    expect(selectPlayerGames(games, "2025")).toHaveLength(6);
    expect(selectPlayerGames(games, "last8").map((row) => row.gameId)).toEqual(["2026_3", "2026_2", "2026_1", "2025_18", "2025_17", "2025_16", "2025_15", "2025_14"]);
  });

  it("distinguishes missing from a real zero-game current-season sample", () => {
    const missing = candidate("missing", 1); missing.playerGames = null; missing.opponentGames = null;
    const zero = candidate("zero", 2); zero.playerGames = [game()]; zero.opponentGames = [defense()];
    const rows = buildAllTouchdownWindows([missing, zero]);
    expect(rows[0].windows["2026"].sampleState).toBe("missing");
    expect(rows[1].windows["2026"].sampleState).toBe("zero");
    expect(rows[1].windows["2026"].tdPerGame).toBeNull();
  });

  it("fails the score closed when any required component is unavailable", () => {
    const row = candidate("missing-rz", 1); row.playerGames = [game({ rzOpportunities: null })];
    expect(buildTouchdownScores([row], "2025")[0].windows["2025"].jkbTdScore).toBeNull();
  });

  it("integrates actual implied team points and positional TD allowed rates", () => {
    const rows = buildTouchdownScores([candidate("low", 1), candidate("high", 3)], "2025");
    expect(rows[1].windows["2025"].components.impliedTeamPoints.percentile).toBe(50);
    expect(rows[1].windows["2025"].opponentPositionTdsAllowedPerGame).toBe(3);
  });

  it("aggregates scorer TDs by position without passing or special-teams double counts", () => {
    expect(aggregateScorerTouchdownsByPosition([
      { position: "QB", rushingTds: 1, receivingTds: 0, passingTds: 4, specialTeamsTds: 0 },
      { position: "WR", rushingTds: 0, receivingTds: 1, passingTds: 0, specialTeamsTds: 1 },
    ])).toEqual({ QB: 1, RB: 0, WR: 1, TE: 0 });
  });

  it("aggregates opponent scoring opportunities with closer chances weighted more", () => {
    const row = buildTouchdownScores([candidate("only", 2)], "2025")[0].windows["2025"];
    expect(row.opponentTdOpportunitiesPerGame).toBe(3.85);
  });
});
