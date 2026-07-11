import { describe, expect, it } from "vitest";
import { selectConfirmedHrProps } from "../../../scripts/lib/mlb-hr-x-selection-core.mjs";

function batter(player: string, hrScore: number, lineupStatus: string, battingOrder: number | null, extra: Record<string, unknown> = {}) {
  return { player, hrScore, hrScoreRank: 100 - hrScore, lineupStatus, battingOrder, ...extra };
}

describe("selectConfirmedHrProps", () => {
  it("excludes projected hitters, includes confirmed, backfills next-highest confirmed", () => {
    // Top-by-score: A(proj) B(conf) C(proj) D(conf) E(conf)
    const batters = [
      batter("A", 40, "projected", 1),
      batter("B", 38, "confirmed", 2),
      batter("C", 36, "projected", 3),
      batter("D", 34, "confirmed", 4),
      batter("E", 32, "confirmed", 5),
    ];
    const { selected, confirmedCount, projectedExcludedCount } = selectConfirmedHrProps({ batters });
    expect(selected.map((r) => r.player)).toEqual(["B", "D", "E"]);
    expect(confirmedCount).toBe(3);
    expect(projectedExcludedCount).toBe(2);
  });

  it("does not merely filter the pre-selected top 3 (would give a one-row table)", () => {
    const batters = [
      batter("A", 40, "projected", 1),
      batter("B", 38, "confirmed", 2),
      batter("C", 36, "projected", 3),
      batter("D", 34, "confirmed", 4),
      batter("E", 32, "confirmed", 5),
    ];
    const { selected } = selectConfirmedHrProps({ batters });
    expect(selected).toHaveLength(3);
  });

  it("posts a smaller table when fewer confirmed candidates exist", () => {
    const batters = [
      batter("A", 40, "projected", 1),
      batter("B", 38, "confirmed", 2),
      batter("C", 36, "projected", 3),
    ];
    const { selected, confirmedCount } = selectConfirmedHrProps({ batters });
    expect(selected.map((r) => r.player)).toEqual(["B"]);
    expect(confirmedCount).toBe(1);
  });

  it("returns zero confirmed when all are projected", () => {
    const batters = [batter("A", 40, "projected", 1), batter("C", 36, "projected", 3)];
    const { selected, confirmedCount } = selectConfirmedHrProps({ batters });
    expect(selected).toHaveLength(0);
    expect(confirmedCount).toBe(0);
  });

  it("excludes a confirmed hitter whose batting order is outside 1-9", () => {
    const batters = [batter("A", 40, "confirmed", 12), batter("B", 38, "confirmed", 3)];
    const { selected } = selectConfirmedHrProps({ batters });
    expect(selected.map((r) => r.player)).toEqual(["B"]);
  });

  it("excludes confirmed hitters whose game has already started", () => {
    const batters = [batter("A", 40, "confirmed", 1, { gameId: 1 }), batter("B", 38, "confirmed", 3, { gameId: 2 })];
    const { selected, startedExcludedCount } = selectConfirmedHrProps({
      batters,
      isGameStarted: (row) => row.gameId === 1,
    });
    expect(selected.map((r) => r.player)).toEqual(["B"]);
    expect(startedExcludedCount).toBe(1);
  });

  it("re-ranks strictly by HR score then rank, independent of input order", () => {
    const batters = [
      batter("low", 30, "confirmed", 1),
      batter("high", 45, "confirmed", 2),
      batter("mid", 37, "confirmed", 3),
    ];
    const { selected } = selectConfirmedHrProps({ batters });
    expect(selected.map((r) => r.player)).toEqual(["high", "mid", "low"]);
  });

  it("fails closed when live re-confirmation vetoes a generated-confirmed row", () => {
    const batters = [batter("A", 40, "confirmed", 1, { playerId: 1 }), batter("B", 38, "confirmed", 2, { playerId: 2 })];
    const { selected, unconfirmedExcludedCount } = selectConfirmedHrProps({
      batters,
      liveConfirm: (row) => (row.playerId === 1 ? false : null),
    });
    expect(selected.map((r) => r.player)).toEqual(["B"]);
    expect(unconfirmedExcludedCount).toBe(1);
  });

  it("respects maxTableSize", () => {
    const batters = [
      batter("A", 40, "confirmed", 1),
      batter("B", 38, "confirmed", 2),
      batter("C", 36, "confirmed", 3),
      batter("D", 34, "confirmed", 4),
    ];
    const { selected } = selectConfirmedHrProps({ batters, maxTableSize: 5 });
    expect(selected).toHaveLength(4);
  });
});
