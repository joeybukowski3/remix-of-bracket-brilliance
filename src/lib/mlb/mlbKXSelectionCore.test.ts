import { describe, expect, it } from "vitest";
import {
  kProjectionEdge,
  hasValidOddsForSide,
  isValidCurrentStarterRow,
  selectConfirmedKRows,
} from "../../../scripts/lib/mlb-k-x-selection-core.mjs";

function kRow(overrides: Record<string, unknown> = {}) {
  return {
    pitcher: "Zack Wheeler",
    team: "PHI",
    opponent: "DET",
    status: "VALID",
    kLine: 6.5,
    direction: "OVER",
    oddsOver: "-115",
    oddsUnder: "-105",
    projectedKs: 8.2,
    projectionEdge: 1.7,
    isCurrentStarter: true,
    gameStarted: false,
    opposingLineupConfirmed: true,
    ...overrides,
  };
}

describe("K row market validity", () => {
  it("OVER uses oddsOver, UNDER uses oddsUnder", () => {
    expect(hasValidOddsForSide(kRow({ direction: "OVER", oddsOver: "-115" }))).toBe(true);
    expect(hasValidOddsForSide(kRow({ direction: "OVER", oddsOver: "" }))).toBe(false);
    expect(hasValidOddsForSide(kRow({ direction: "UNDER", oddsUnder: "+100" }))).toBe(true);
    expect(hasValidOddsForSide(kRow({ direction: "UNDER", oddsUnder: null }))).toBe(false);
  });

  it("excludes lines below 3.5", () => {
    expect(isValidCurrentStarterRow(kRow({ kLine: 3.5 }))).toBe(true);
    expect(isValidCurrentStarterRow(kRow({ kLine: 3.0 }))).toBe(false);
  });

  it("excludes non-VALID rows", () => {
    expect(isValidCurrentStarterRow(kRow({ status: "LOW_CONFIDENCE" }))).toBe(false);
  });

  it("excludes already-started games and non-current starters", () => {
    expect(isValidCurrentStarterRow(kRow({ gameStarted: true }))).toBe(false);
    expect(isValidCurrentStarterRow(kRow({ isCurrentStarter: false }))).toBe(false);
  });
});

describe("selectConfirmedKRows ranking + confirmation", () => {
  it("ranks by strongest absolute projection edge, OVER/UNDER both eligible", () => {
    const rows = [
      kRow({ pitcher: "A", projectionEdge: 1.0 }),
      kRow({ pitcher: "B", direction: "UNDER", oddsUnder: "-120", projectionEdge: -2.5 }),
      kRow({ pitcher: "C", projectionEdge: 1.8 }),
    ];
    const { selected } = selectConfirmedKRows({ rows });
    expect(selected.map((r) => r.pitcher)).toEqual(["B", "C", "A"]);
  });

  it("computes edge from projectedKs - kLine when projectionEdge is absent", () => {
    expect(kProjectionEdge({ projectedKs: 8, kLine: 6.5 })).toBeCloseTo(1.5);
    expect(kProjectionEdge({ projectedKs: 4, kLine: 6.5 })).toBeCloseTo(2.5);
  });

  it("excludes a replaced/stale starter", () => {
    const rows = [kRow({ pitcher: "current" }), kRow({ pitcher: "replaced", isCurrentStarter: false })];
    const { selected, excludedStaleStarterCount } = selectConfirmedKRows({ rows });
    expect(selected.map((r) => r.pitcher)).toEqual(["current"]);
    expect(excludedStaleStarterCount).toBe(1);
  });

  it("during polling, prefers rows whose opposing lineup is confirmed and holds the rest", () => {
    const rows = [
      kRow({ pitcher: "confirmedOpp", opposingLineupConfirmed: true, projectionEdge: 1.2 }),
      kRow({ pitcher: "pendingOpp", opposingLineupConfirmed: false, projectionEdge: 3.0 }),
    ];
    const { selected, heldForOpposingCount } = selectConfirmedKRows({ rows, atCutoff: false });
    expect(selected.map((r) => r.pitcher)).toEqual(["confirmedOpp"]);
    expect(heldForOpposingCount).toBe(1);
  });

  it("at the cutoff, allows valid current starters even without a confirmed opposing lineup", () => {
    const rows = [
      kRow({ pitcher: "confirmedOpp", opposingLineupConfirmed: true, projectionEdge: 1.2 }),
      kRow({ pitcher: "pendingOpp", opposingLineupConfirmed: false, projectionEdge: 3.0 }),
    ];
    const { selected, heldForOpposingCount } = selectConfirmedKRows({ rows, atCutoff: true });
    expect(selected.map((r) => r.pitcher)).toEqual(["pendingOpp", "confirmedOpp"]);
    expect(heldForOpposingCount).toBe(0);
  });

  it("posts fewer rows safely and posts nothing when zero qualify", () => {
    expect(selectConfirmedKRows({ rows: [kRow()] }).selected).toHaveLength(1);
    const noneValid = selectConfirmedKRows({ rows: [kRow({ status: "NO_MARKET" })] });
    expect(noneValid.selected).toHaveLength(0);
    expect(noneValid.validStarterCount).toBe(0);
  });

  it("respects maxTableSize", () => {
    const rows = Array.from({ length: 8 }, (_, i) => kRow({ pitcher: `P${i}`, projectionEdge: i + 1 }));
    expect(selectConfirmedKRows({ rows, maxTableSize: 5 }).selected).toHaveLength(5);
  });
});
