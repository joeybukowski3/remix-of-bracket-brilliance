import { describe, expect, it } from "vitest";
import {
  computeOpponentHistoryAverages,
  computePlayerHistoryAverages,
  deltaTone,
  formatOpportunityDelta,
  historyAverageRowLabel,
  opportunityDelta,
} from "./historyAverages";
import type { TouchdownOpponentGame, TouchdownPlayerGame } from "./types";

function playerGame(overrides: Partial<TouchdownPlayerGame> = {}): TouchdownPlayerGame {
  return {
    gameId: "2025_01_NE_SEA", season: 2025, week: 1, date: null, team: "ne", opponent: "sea", homeAway: "away",
    teamScore: 20, opponentScore: 17, carries: 10, targets: 2, scorerOpportunities: 3, teamScorerOpportunities: 10,
    teamRzOpportunities: 6, teamGoalLineOpportunities: 2, rushingTds: 1, receivingTds: 0, touchdowns: 1,
    rzOpportunities: 2, inside10Opportunities: 1, goalLineOpportunities: 1,
    ...overrides,
  };
}

function opponentGame(overrides: Partial<TouchdownOpponentGame> = {}): TouchdownOpponentGame {
  return {
    gameId: "2025_01_NE_SEA", season: 2025, week: 1, date: null, defense: "sea", opponent: "ne", homeAway: "home",
    defenseScore: 17, opponentScore: 20, offensiveTdsAllowed: 2, rzOpportunitiesAllowed: 4,
    inside10OpportunitiesAllowed: 2, goalLineOpportunitiesAllowed: 1,
    touchdownsAllowedByPosition: { QB: 0, RB: 1, WR: 1, TE: 0 },
    ...overrides,
  };
}

describe("historyAverageRowLabel", () => {
  it("labels a full 10-game sample", () => {
    expect(historyAverageRowLabel(10)).toBe("10-Game Avg");
  });

  it("labels a smaller displayed sample by its actual size", () => {
    expect(historyAverageRowLabel(3)).toBe("3-Game Avg");
  });

  it("falls back to a generic label for an empty sample", () => {
    expect(historyAverageRowLabel(0)).toBe("Sample Avg");
  });
});

describe("computePlayerHistoryAverages", () => {
  it("averages only the displayed sample rows", () => {
    const games = [
      playerGame({ touchdowns: 2, rushingTds: 2, receivingTds: 0, rzOpportunities: 4, inside10Opportunities: 2, goalLineOpportunities: 2, scorerOpportunities: 5 }),
      playerGame({ touchdowns: 0, rushingTds: 0, receivingTds: 0, rzOpportunities: 0, inside10Opportunities: 0, goalLineOpportunities: 0, scorerOpportunities: 3 }),
    ];
    const averages = computePlayerHistoryAverages(games);
    expect(averages.touchdowns).toBe(1);
    expect(averages.rushingTds).toBe(1);
    expect(averages.rzOpportunities).toBe(2);
    expect(averages.inside10Opportunities).toBe(1);
    expect(averages.goalLineOpportunities).toBe(1);
    expect(averages.scorerOpportunities).toBe(4);
  });

  it("ignores rows outside the passed-in sample entirely (a 3rd hidden game does not shift the average)", () => {
    const displayed = [playerGame({ rzOpportunities: 2 }), playerGame({ rzOpportunities: 4 })];
    const hidden = playerGame({ rzOpportunities: 100 });
    expect(computePlayerHistoryAverages(displayed).rzOpportunities).toBe(3);
    expect(computePlayerHistoryAverages([...displayed, hidden]).rzOpportunities).not.toBe(3);
  });

  it("returns null averages for an empty sample rather than dividing by zero", () => {
    const averages = computePlayerHistoryAverages([]);
    expect(averages.touchdowns).toBeNull();
    expect(averages.rzOpportunities).toBeNull();
  });
});

describe("computeOpponentHistoryAverages", () => {
  it("averages the position-specific TD-allowed column for the requested position", () => {
    const games = [
      opponentGame({ touchdownsAllowedByPosition: { QB: 0, RB: 2, WR: 0, TE: 0 } }),
      opponentGame({ touchdownsAllowedByPosition: { QB: 0, RB: 0, WR: 0, TE: 0 } }),
    ];
    expect(computeOpponentHistoryAverages(games, "RB").positionTdsAllowed).toBe(1);
    expect(computeOpponentHistoryAverages(games, "WR").positionTdsAllowed).toBe(0);
  });

  it("averages RZ/Inside-10/Goal-Line opportunities allowed and offensive TDs allowed over only the displayed sample", () => {
    const games = [
      opponentGame({ offensiveTdsAllowed: 3, rzOpportunitiesAllowed: 5, inside10OpportunitiesAllowed: 3, goalLineOpportunitiesAllowed: 2 }),
      opponentGame({ offensiveTdsAllowed: 1, rzOpportunitiesAllowed: 3, inside10OpportunitiesAllowed: 1, goalLineOpportunitiesAllowed: 0 }),
    ];
    const averages = computeOpponentHistoryAverages(games, "RB");
    expect(averages.offensiveTdsAllowed).toBe(2);
    expect(averages.rzOpportunitiesAllowed).toBe(4);
    expect(averages.inside10OpportunitiesAllowed).toBe(2);
    expect(averages.goalLineOpportunitiesAllowed).toBe(1);
  });
});

describe("opportunityDelta / formatOpportunityDelta / deltaTone", () => {
  it("computes a positive delta above the sample average", () => {
    expect(opportunityDelta(4, 2.8)).toBeCloseTo(1.2);
    expect(formatOpportunityDelta(opportunityDelta(4, 2.8))).toBe("(+1.2)");
    expect(deltaTone(opportunityDelta(4, 2.8))).toBe("positive");
  });

  it("computes a negative delta below the sample average", () => {
    expect(opportunityDelta(1, 2.5)).toBeCloseTo(-1.5);
    expect(formatOpportunityDelta(opportunityDelta(1, 2.5))).toBe("(-1.5)");
    expect(deltaTone(opportunityDelta(1, 2.5))).toBe("negative");
  });

  it("treats a near-zero delta as neutral rather than falsely signaling above/below", () => {
    expect(deltaTone(opportunityDelta(2, 2.05))).toBe("neutral");
  });

  it("returns null (no fake delta) when either side is missing", () => {
    expect(opportunityDelta(null, 2)).toBeNull();
    expect(opportunityDelta(2, null)).toBeNull();
    expect(formatOpportunityDelta(null)).toBeNull();
  });
});
