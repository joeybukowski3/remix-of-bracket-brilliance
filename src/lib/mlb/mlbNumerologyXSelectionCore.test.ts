import { describe, expect, it } from "vitest";
import {
  NumerologyRowType,
  classifyNumerologyRowType,
  isNumerologyPlayEligible,
  selectEligibleNumerologyPlays,
} from "../../../scripts/lib/mlb-numerology-x-selection-core.mjs";

function play(overrides: Record<string, unknown> = {}) {
  return {
    playerId: 700932,
    playerName: "Kyle Manzardo",
    recommendedMarket: "Home run",
    marketModelSource: "jkb_hr_props",
    lineupStatus: "confirmed",
    battingOrder: 3,
    numerologyScore: 86,
    finalScore: 86,
    ...overrides,
  };
}

describe("classifyNumerologyRowType", () => {
  it("classifies HR/hitter markets as hitter", () => {
    expect(classifyNumerologyRowType(play())).toBe(NumerologyRowType.HITTER);
    expect(classifyNumerologyRowType(play({ marketModelSource: "", recommendedMarket: "Total bases" }))).toBe(NumerologyRowType.HITTER);
  });

  it("classifies strikeout/pitcher markets as pitcher", () => {
    expect(classifyNumerologyRowType(play({ marketModelSource: "jkb_k_props", recommendedMarket: "Strikeouts" }))).toBe(NumerologyRowType.PITCHER);
    expect(classifyNumerologyRowType(play({ marketModelSource: "", recommendedMarket: "Earned runs allowed" }))).toBe(NumerologyRowType.PITCHER);
  });

  it("classifies team markets without a player as team", () => {
    expect(classifyNumerologyRowType({ recommendedMarket: "Moneyline", playerId: null, playerName: "" })).toBe(NumerologyRowType.TEAM);
    expect(classifyNumerologyRowType({ recommendedMarket: "Team total runs", playerName: "" })).toBe(NumerologyRowType.TEAM);
  });

  it("classifies a non-player, non-team play as other", () => {
    expect(classifyNumerologyRowType({ recommendedMarket: "", playerName: "" })).toBe(NumerologyRowType.OTHER);
  });
});

describe("isNumerologyPlayEligible", () => {
  it("confirmed hitter is eligible; projected hitter is not", () => {
    expect(isNumerologyPlayEligible(play({ lineupStatus: "confirmed", battingOrder: 3 }))).toBe(true);
    expect(isNumerologyPlayEligible(play({ lineupStatus: "projected", battingOrder: 3 }))).toBe(false);
  });

  it("hitter with started game is ineligible", () => {
    expect(isNumerologyPlayEligible(play(), { gameStarted: true })).toBe(false);
  });

  it("current pitcher eligible; replaced pitcher not", () => {
    const p = play({ marketModelSource: "jkb_k_props", recommendedMarket: "Strikeouts" });
    expect(isNumerologyPlayEligible(p, { isCurrentStarter: true })).toBe(true);
    expect(isNumerologyPlayEligible(p, { isCurrentStarter: false })).toBe(false);
  });

  it("team/other rows follow an explicit non-lineup rule (eligible until game starts)", () => {
    const team = { recommendedMarket: "Moneyline", playerName: "" };
    expect(isNumerologyPlayEligible(team)).toBe(true);
    expect(isNumerologyPlayEligible(team, { gameStarted: true })).toBe(false);
    const other = { recommendedMarket: "", playerName: "" };
    expect(isNumerologyPlayEligible(other)).toBe(true);
  });

  it("fails closed when a live hitter confirmation vetoes generated status", () => {
    expect(isNumerologyPlayEligible(play(), { hitterLiveConfirmed: false })).toBe(false);
  });
});

describe("selectEligibleNumerologyPlays", () => {
  it("rebuilds from highest-rated eligible plays, backfilling past unconfirmed top rows", () => {
    const plays = [
      play({ playerName: "TopButProjected", finalScore: 95, lineupStatus: "projected" }),
      play({ playerName: "Confirmed1", finalScore: 90, lineupStatus: "confirmed", battingOrder: 2 }),
      play({ playerName: "TeamPlay", finalScore: 88, recommendedMarket: "Moneyline", playerId: null, playerName: "" }),
      play({ playerName: "Confirmed2", finalScore: 80, lineupStatus: "confirmed", battingOrder: 5 }),
    ];
    const { selected, eligibleCount, projectedExcludedCount } = selectEligibleNumerologyPlays({ plays });
    expect(selected.map((p) => p.playerName ?? "TeamPlay")).not.toContain("TopButProjected");
    expect(eligibleCount).toBe(3);
    expect(projectedExcludedCount).toBe(1);
    expect(selected[0].finalScore).toBe(90); // highest eligible first
  });

  it("allows a smaller confirmed table and posts nothing when none eligible", () => {
    const oneEligible = selectEligibleNumerologyPlays({ plays: [play({ lineupStatus: "confirmed", battingOrder: 1 })] });
    expect(oneEligible.selected).toHaveLength(1);

    const noneEligible = selectEligibleNumerologyPlays({ plays: [play({ lineupStatus: "projected" })] });
    expect(noneEligible.selected).toHaveLength(0);
    expect(noneEligible.eligibleCount).toBe(0);
  });

  it("never posts a stale fallback player (projected excluded, not backfilled with projected)", () => {
    const plays = [
      play({ playerName: "P1", lineupStatus: "projected", finalScore: 99 }),
      play({ playerName: "P2", lineupStatus: "projected", finalScore: 98 }),
    ];
    expect(selectEligibleNumerologyPlays({ plays }).selected).toHaveLength(0);
  });

  it("counts plays by type for the workflow summary", () => {
    const plays = [
      play(),
      play({ marketModelSource: "jkb_k_props", recommendedMarket: "Strikeouts", playerName: "Pitcher" }),
      { recommendedMarket: "Moneyline", playerName: "" },
    ];
    const { byType } = selectEligibleNumerologyPlays({
      plays,
      resolveFacts: (p) => ({ isCurrentStarter: p.recommendedMarket === "Strikeouts" }),
    });
    expect(byType.hitter).toBe(1);
    expect(byType.pitcher).toBe(1);
    expect(byType.team).toBe(1);
  });
});
