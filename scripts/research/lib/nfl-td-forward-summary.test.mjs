import { describe, expect, it } from "vitest";
import { buildForwardValidationSummary } from "./nfl-td-forward-summary.mjs";

/** Minimal forward-archive row joined to a grade. */
function row(overrides = {}) {
  return {
    season: 2026,
    week: 6,
    gameId: "2026_06_AAA_BBB",
    playerId: "p",
    position: "WR",
    team: "aaa",
    opponent: "bbb",
    teamChanged: false,
    jkbTdScoreProductionWindow: 55,
    jkbTdScoreTrailing8: 55,
    candidateCalibratedProbabilityProductionWindow: 0.22,
    candidateCalibratedProbabilityTrailing8: 0.22,
    novigNoVigProbability: 0.2,
    rawMarketImpliedProbability: 0.24,
    bestSportsbookOdds: 320,
    actualTd: 0,
    ...overrides,
  };
}

describe("buildForwardValidationSummary", () => {
  it("summarizes the four probability series and separates graded from ungraded", () => {
    const rows = [
      ...Array(20)
        .fill(0)
        .map((_, i) => row({ playerId: `g${i}`, actualTd: i < 4 ? 1 : 0 })),
      row({ playerId: "ungraded", actualTd: null }),
    ];
    const s = buildForwardValidationSummary(rows, { calibratorVersion: "v-test" });
    expect(s.coverage.totalObservations).toBe(21);
    expect(s.coverage.gradedObservations).toBe(20);
    expect(s.overall.series.A_productionWindowCalibrated.n).toBe(20);
    expect(s.overall.series.D_sportsbookRawImplied.tdRate).toBeCloseTo(0.2, 5);
    expect(s.calibratorVersion).toBe("v-test");
  });

  it("reports completed-week coverage and gate status without auto-promoting", () => {
    const rows = [1, 2, 3, 4, 5].flatMap((week) =>
      Array(15)
        .fill(0)
        .map((_, i) => row({ week, playerId: `w${week}p${i}`, actualTd: i % 5 === 0 ? 1 : 0 })),
    );
    const s = buildForwardValidationSummary(rows, { calibratorVersion: "v", historicalStudy: { ece: 0.008 } });
    expect(s.promotionGates.autoPromote).toBe(false);
    expect(s.promotionGates.gates.minimumCompletedWeeks.pass).toBe(true);
    expect(s.coverage.completedWeekCount).toBe(5);
  });

  it("only reports model-vs-market thresholds with a meaningful sample", () => {
    const rows = Array(30)
      .fill(0)
      .map((_, i) =>
        row({
          playerId: `e${i}`,
          candidateCalibratedProbabilityTrailing8: 0.3,
          novigNoVigProbability: 0.18, // +12pp edge on every row
          actualTd: i < 9 ? 1 : 0,
        }),
      );
    const s = buildForwardValidationSummary(rows, { calibratorVersion: "v" });
    const t0 = s.modelVsMarket.vsNovig.byThreshold.find((b) => b.threshold === 0);
    expect(t0.reported).toBe(true);
    expect(t0.n).toBe(30);
    expect(t0.flatStakeRoi.nBets).toBe(30);
    const tHigh = s.modelVsMarket.vsNovig.byThreshold.find((b) => b.threshold === 0.1);
    expect(tHigh.reported).toBe(true); // 10pp edge on all rows
    const tTooHigh = s.modelVsMarket.vsBook.byThreshold.find((b) => b.threshold === 0.1);
    expect(tTooHigh.reported).toBe(false); // book edge is -? — no rows clear +10pp
  });

  it("never sets autoPromote true even when every gate passes", () => {
    const rows = [1, 2, 3, 4, 5, 6].flatMap((week) =>
      Array(30)
        .fill(0)
        .map((_, i) =>
          row({
            week,
            playerId: `w${week}p${i}`,
            candidateCalibratedProbabilityTrailing8: i < 15 ? 0.45 : 0.2,
            actualTd: i < 15 ? (i % 2) : 0,
          }),
        ),
    );
    const s = buildForwardValidationSummary(rows, { calibratorVersion: "v", historicalStudy: { ece: 0.02 } });
    expect(s.promotionGates.autoPromote).toBe(false);
    expect(typeof s.promotionGates.allGatesPass).toBe("boolean");
  });
});
