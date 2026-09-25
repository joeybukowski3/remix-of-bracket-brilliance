import { describe, expect, it } from "vitest";
import { biggestMoneyGap, compactSplitsForGame, consensusSides, contrarianSides, formatSplitsGap, formatSplitsLine, formatSplitsOdds, publicSides, sharpSides, sortSplitsRows, splitsSignal, SPLITS_SIGNAL_LABEL, type SplitsRow } from "./bettingSplitsView";
import type { NflDkBettingSplitsArtifact } from "./bettingSplitsData";
import { moneyGap, publicGap } from "./bettingSplitsData";

function row(id: string, handlePct: number, betsPct: number): SplitsRow {
  return { game: { gameId: id, away: "buf", home: "mia" } as SplitsRow["game"], market: "spread", side: { side: "away", team: "buf", line: -2.5, odds: -110, handlePct, betsPct, capturedAt: "2026-09-25T14:47:13Z" }, gap: handlePct - betsPct, publicGap: betsPct - handlePct };
}

describe("betting splits presentation selectors", () => {
  it("computes opposite percentage-point gaps and exact signal boundaries", () => {
    expect(moneyGap({ handlePct: 70, betsPct: 50 })).toBe(20);
    expect(publicGap({ handlePct: 70, betsPct: 50 })).toBe(-20);
    expect(splitsSignal(20)).toBe("strong");
    expect(splitsSignal(19)).toBe("lean");
    expect(splitsSignal(10)).toBe("lean");
    expect(splitsSignal(9)).toBe("balanced");
    expect(splitsSignal(-9)).toBe("balanced");
    expect(splitsSignal(-10)).toBe("public");
  });

  it("ranks disagreement once per game/market and ranks the public by bets", () => {
    const rows = [row("small", 55, 50), row("large", 85, 55), row("middle", 20, 40)];
    expect(biggestMoneyGap(rows).map((item) => item.game.gameId)).toEqual(["large", "middle", "small"]);
    expect(publicSides(rows).map((item) => item.game.gameId)).toEqual(["large", "small", "middle"]);
    expect(sortSplitsRows(rows, "gap", "asc")[0].game.gameId).toBe("middle");
  });

  it("applies the sharp, contrarian and consensus definitions at their boundaries", () => {
    const rows = [row("sharp", 60, 40), row("lean", 50, 40), row("below", 49, 40), row("contrarian", 51, 39), row("consensus", 70, 70), row("almost", 70, 69)];
    expect(sharpSides(rows).map((item) => item.game.gameId)).toEqual(["sharp", "contrarian", "lean"]);
    expect(contrarianSides(rows).map((item) => item.game.gameId)).toEqual(["contrarian"]);
    expect(consensusSides(rows).map((item) => item.game.gameId)).toEqual(["consensus"]);
  });

  it("shares line, odds, gap, and signal wording across the board and matchup", () => {
    expect(formatSplitsLine("spread", 2.5)).toBe("+2.5");
    expect(formatSplitsLine("total", 45.5)).toBe("45.5");
    expect(formatSplitsLine("moneyline", null)).toBe("—");
    expect(formatSplitsOdds(120)).toBe("+120");
    expect(formatSplitsOdds(-118)).toBe("-118");
    expect(formatSplitsGap(14)).toBe("+14 pp");
    expect(formatSplitsGap(-14)).toBe("-14 pp");
    expect(SPLITS_SIGNAL_LABEL[splitsSignal(20)]).toBe("Strong Money Gap");
  });
});

describe("compact weekly matchup selector", () => {
  const side = (name: "away" | "home" | "over" | "under", handlePct: number, betsPct: number) => ({
    side: name, line: name === "over" || name === "under" ? 44.5 : 2.5,
    odds: -110, handlePct, betsPct, capturedAt: "2026-09-25T14:47:13Z",
  });
  const artifact = { games: [{
    gameId: "2026_03_CAR_IND", away: "car", home: "ind", markets: {
      spread: [side("away", 57, 43), side("home", 43, 57)],
      moneyline: [side("away", 44, 56), side("home", 56, 44)],
      total: [side("over", 33, 67), side("under", 67, 33)],
    },
  }] } as unknown as NflDkBettingSplitsArtifact;

  it("joins only exact gameId and chooses the highest gap per market", () => {
    const summary = compactSplitsForGame({ artifact, freshness: "fresh" }, "2026_03_CAR_IND");
    expect(summary).toMatchObject({ state: "fresh", spread: { side: "CAR", moneyGap: 14, signal: "lean", sharp: true }, moneyline: { side: "IND", moneyGap: 12, signal: "lean" }, total: { side: "Under", moneyGap: 34, signal: "strong" } });
    expect(compactSplitsForGame({ artifact, freshness: "fresh" }, "CAR at IND").state).toBe("missing");
    expect(compactSplitsForGame({ artifact, freshness: "fresh" }, "2026_03_CAR_IND_extra").state).toBe("missing");
  });

  it("keeps balanced gaps descriptive and resolves equal gaps by artifact order", () => {
    const altered = structuredClone(artifact);
    altered.games[0].markets.spread = [side("away", 50, 50), side("home", 50, 50)];
    altered.games[0].markets.moneyline = [side("away", 53, 50), side("home", 47, 50)];
    const summary = compactSplitsForGame({ artifact: altered, freshness: "fresh" }, "2026_03_CAR_IND");
    expect(summary.spread).toMatchObject({ side: "CAR", moneyGap: 0, signal: "balanced", sharp: false });
    expect(summary.moneyline).toMatchObject({ side: "CAR", moneyGap: 3, signal: "balanced", sharp: false });
    expect(splitsSignal(-8)).toBe("balanced");
  });

  it("distinguishes stale, absent, and unavailable states", () => {
    expect(compactSplitsForGame({ artifact, freshness: "stale" }, "2026_03_CAR_IND")).toMatchObject({ state: "stale", spread: { side: "CAR" } });
    expect(compactSplitsForGame({ artifact, freshness: "stale" }, "2026_03_NE_SEA")).toMatchObject({ state: "missing", spread: null });
    expect(compactSplitsForGame({ artifact: null, freshness: "unavailable" }, "2026_03_CAR_IND")).toMatchObject({ state: "unavailable", spread: null });
  });
});
