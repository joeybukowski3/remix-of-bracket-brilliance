import { describe, expect, it } from "vitest";
import {
  classifyRushingShadowCohorts,
  computeRushingPromotionReadiness,
  computeShadowVsProductionErrors,
  summarizeRushingShadowCohort,
  type ShadowVsProductionErrors,
  type ShadowVsProductionRow,
} from "./shadowVsProductionEvaluation";

function row(overrides: Partial<ShadowVsProductionRow> = {}): ShadowVsProductionRow {
  return {
    playerId: "p1", gameId: "2026_01_HOU_BUF", season: 2026, week: 1,
    productionCarries: 9.3, shadowCarries: 18.2, actualCarries: 17,
    roleConflictScore: null, roleConflictFlag: null, teamChanged: null,
    roleSourced: false, noHistory: false, depthRank: null, starterFlag: null,
    position: "RB", rushingConflictLevel: null, rushingConflictDiagnosticAvailable: true,
    ...overrides,
  };
}

describe("computeShadowVsProductionErrors", () => {
  it("computes carries error from the archived pregame values, not a recomputation", () => {
    const [result] = computeShadowVsProductionErrors([row()], () => null, () => null, () => null);
    expect(result.productionCarriesError).toBeCloseTo(Math.abs(9.3 - 17));
    expect(result.shadowCarriesError).toBeCloseTo(Math.abs(18.2 - 17));
  });

  it("returns null shadow error (not zero, not a fabricated number) when shadow was unavailable that week", () => {
    const [result] = computeShadowVsProductionErrors([row({ shadowCarries: null })], () => null, () => null, () => null);
    expect(result.shadowCarriesError).toBeNull();
    // production error is unaffected by shadow being unavailable.
    expect(result.productionCarriesError).toBeCloseTo(Math.abs(9.3 - 17));
  });

  it("uses the caller-supplied share accessors rather than deriving shares itself (no hidden recomputation)", () => {
    const r = row();
    const [result] = computeShadowVsProductionErrors(
      [r],
      () => 0.6,   // actual share
      () => 0.35,  // production share
      () => 0.79,  // shadow share
    );
    expect(result.productionShareError).toBeCloseTo(Math.abs(0.35 - 0.6));
    expect(result.shadowShareError).toBeCloseTo(Math.abs(0.79 - 0.6));
  });

  it("is deterministic and does not mutate its input rows", () => {
    const rows = [row(), row({ playerId: "p2" })];
    const snapshot = JSON.stringify(rows);
    computeShadowVsProductionErrors(rows, () => null, () => null, () => null);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it("computes signed errors and a shadow-minus-production delta (negative = shadow better)", () => {
    const [result] = computeShadowVsProductionErrors([row()], () => null, () => null, () => null);
    expect(result.signedProductionCarriesError).toBeCloseTo(9.3 - 17);
    expect(result.signedShadowCarriesError).toBeCloseTo(18.2 - 17);
    // production abs error = 7.7, shadow abs error = 1.2 -> shadow is better -> negative delta
    expect(result.shadowMinusProductionAbsoluteError).toBeCloseTo(Math.abs(18.2 - 17) - Math.abs(9.3 - 17));
    expect(result.shadowMinusProductionAbsoluteError).toBeLessThan(0);
  });

  it("returns null shadowMinusProductionAbsoluteError when shadow is unavailable", () => {
    const [result] = computeShadowVsProductionErrors([row({ shadowCarries: null })], () => null, () => null, () => null);
    expect(result.shadowMinusProductionAbsoluteError).toBeNull();
    expect(result.signedShadowCarriesError).toBeNull();
  });
});

describe("classifyRushingShadowCohorts", () => {
  it("always includes overall", () => {
    expect(classifyRushingShadowCohorts(row())).toContain("overall");
  });

  it("classifies week1 and weeks1to4 together for a week-1 row, and weeks1to4 only for week 3", () => {
    expect(classifyRushingShadowCohorts(row({ week: 1 }))).toEqual(expect.arrayContaining(["week1", "weeks1to4"]));
    const week3 = classifyRushingShadowCohorts(row({ week: 3 }));
    expect(week3).not.toContain("week1");
    expect(week3).toContain("weeks1to4");
  });

  it("classifies teamChanged xor sameTeam, and neither when unknown", () => {
    expect(classifyRushingShadowCohorts(row({ teamChanged: true }))).toContain("teamChanged");
    expect(classifyRushingShadowCohorts(row({ teamChanged: false }))).toContain("sameTeam");
    expect(classifyRushingShadowCohorts(row({ teamChanged: null }))).not.toEqual(expect.arrayContaining(["teamChanged", "sameTeam"]));
  });

  it("classifies sourcedStarter/sourcedBackup by roleSourced + starterFlag", () => {
    expect(classifyRushingShadowCohorts(row({ roleSourced: true, starterFlag: true }))).toContain("sourcedStarter");
    expect(classifyRushingShadowCohorts(row({ roleSourced: true, starterFlag: false }))).toContain("sourcedBackup");
    expect(classifyRushingShadowCohorts(row({ roleSourced: false, starterFlag: true }))).not.toContain("sourcedStarter");
  });

  it("classifies noHistory rows", () => {
    expect(classifyRushingShadowCohorts(row({ noHistory: true }))).toContain("noHistory");
  });

  it("buckets by the CORRECTED rushingConflictLevel, not the raw score", () => {
    expect(classifyRushingShadowCohorts(row({ rushingConflictLevel: "low" }))).toContain("roleConflictLow");
    expect(classifyRushingShadowCohorts(row({ rushingConflictLevel: "medium" }))).toContain("roleConflictMedium");
    expect(classifyRushingShadowCohorts(row({ rushingConflictLevel: "high" }))).toContain("roleConflictHigh");
    expect(classifyRushingShadowCohorts(row({ rushingConflictLevel: null }))).not.toEqual(
      expect.arrayContaining(["roleConflictLow", "roleConflictMedium", "roleConflictHigh"]),
    );
  });

  // WU4G.2 §1-2: the OLD allocator score/flag must never feed severity
  // cohorts, even when it disagrees with the corrected V2 level.
  it("never uses the OLD roleConflictScore for severity, even when it strongly disagrees with rushingConflictLevel", () => {
    // OLD score would bucket this HIGH (0.7), but the archived V2 diagnostic says LOW.
    const cohorts = classifyRushingShadowCohorts(row({ roleConflictScore: 0.7, roleConflictFlag: true, rushingConflictLevel: "low" }));
    expect(cohorts).toContain("roleConflictLow");
    expect(cohorts).not.toContain("roleConflictHigh");
  });

  it("does not classify a severity cohort for a structurally-unavailable V2 diagnostic, even if the OLD score is set", () => {
    const cohorts = classifyRushingShadowCohorts(row({ roleConflictScore: 0.5, rushingConflictLevel: null, rushingConflictDiagnosticAvailable: false }));
    expect(cohorts).not.toEqual(expect.arrayContaining(["roleConflictLow", "roleConflictMedium", "roleConflictHigh"]));
    expect(cohorts).toContain("overall"); // still contributes to overall evaluation
  });

  it("flags productionShadowOrderingDisagreement only when production and shadow miss on opposite sides of actual", () => {
    // production over-projects (9.3 > 17? no -- use explicit opposite-side values)
    const disagreeing = row({ productionCarries: 20, shadowCarries: 10, actualCarries: 15 });
    expect(classifyRushingShadowCohorts(disagreeing)).toContain("productionShadowOrderingDisagreement");
    const agreeing = row({ productionCarries: 20, shadowCarries: 18, actualCarries: 15 });
    expect(classifyRushingShadowCohorts(agreeing)).not.toContain("productionShadowOrderingDisagreement");
  });

  it("never flags ordering disagreement when shadow is unavailable", () => {
    expect(classifyRushingShadowCohorts(row({ shadowCarries: null }))).not.toContain("productionShadowOrderingDisagreement");
  });
});

describe("summarizeRushingShadowCohort", () => {
  it("aggregates mean absolute/signed carries error for cohort members, using archived errors only", () => {
    const rows = [
      row({ playerId: "p1", teamChanged: true }),
      row({ playerId: "p2", teamChanged: true, productionCarries: 15, shadowCarries: 16, actualCarries: 15 }),
      row({ playerId: "p3", teamChanged: false }),
    ];
    const errors = computeShadowVsProductionErrors(rows, () => null, () => null, () => null);
    const byKey = new Map(errors.map((e) => [`${e.gameId}|${e.playerId}`, e]));
    const summary = summarizeRushingShadowCohort("teamChanged", rows, byKey);
    expect(summary.n).toBe(2);
    expect(summary.meanAbsoluteShadowCarriesError).toBeCloseTo((Math.abs(18.2 - 17) + Math.abs(16 - 15)) / 2);
  });

  it("returns n=0 and NaN means for an empty cohort rather than throwing", () => {
    const summary = summarizeRushingShadowCohort("roleConflictHigh", [], new Map());
    expect(summary.n).toBe(0);
    expect(Number.isNaN(summary.meanAbsoluteProductionCarriesError)).toBe(true);
  });

  it("excludes shadow-unavailable rows from the shadow mean but keeps them in the production mean", () => {
    const rows = [row({ playerId: "p1" }), row({ playerId: "p2", shadowCarries: null })];
    const errors = computeShadowVsProductionErrors(rows, () => null, () => null, () => null);
    const byKey = new Map(errors.map((e) => [`${e.gameId}|${e.playerId}`, e]));
    const summary = summarizeRushingShadowCohort("overall", rows, byKey);
    expect(summary.n).toBe(2);
    expect(summary.shadowCoverageN).toBe(1);
    expect(summary.meanAbsoluteProductionCarriesError).toBeCloseTo(Math.abs(9.3 - 17));
  });
});

describe("computeRushingPromotionReadiness", () => {
  function buildRowsAndErrors(rows: ShadowVsProductionRow[]): { rows: ShadowVsProductionRow[]; errorsByPlayerGame: Map<string, ShadowVsProductionErrors> } {
    const errors = computeShadowVsProductionErrors(rows, () => null, () => null, () => null);
    return { rows, errorsByPlayerGame: new Map(errors.map((e) => [`${e.gameId}|${e.playerId}`, e])) };
  }

  it("is NOT_READY below the minimum completed-week threshold even with a perfect shadow", () => {
    const { rows, errorsByPlayerGame } = buildRowsAndErrors([row({ shadowCarries: 17, actualCarries: 17 })]);
    const readiness = computeRushingPromotionReadiness({ completedWeeks: 1, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
    expect(readiness.status).toBe("NOT_READY");
    expect(readiness.reasons.some((r) => r.includes("completed week"))).toBe(true);
  });

  it("is NOT_READY when shadow does not improve on production overall", () => {
    const { rows, errorsByPlayerGame } = buildRowsAndErrors([row({ productionCarries: 17, shadowCarries: 5, actualCarries: 17 })]);
    const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
    expect(readiness.status).toBe("NOT_READY");
  });

  it("is NOT_READY when any pool-coherence failure exists, even if shadow otherwise wins", () => {
    const { rows, errorsByPlayerGame } = buildRowsAndErrors([row({ shadowCarries: 17, actualCarries: 17 })]);
    const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 1 });
    expect(readiness.status).toBe("NOT_READY");
    expect(readiness.poolCoherenceFailureCount).toBe(1);
  });

  it("never returns a binary promote/reject decision beyond NOT_READY/READY_FOR_REVIEW -- always non-binding", () => {
    const { rows, errorsByPlayerGame } = buildRowsAndErrors([row({ shadowCarries: 17, actualCarries: 17 })]);
    const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
    expect(["NOT_READY", "READY_FOR_REVIEW"]).toContain(readiness.status);
  });

  it("is READY_FOR_REVIEW when every gate passes", () => {
    const rows = [
      row({ playerId: "p1", teamChanged: false, roleSourced: true, starterFlag: true, productionCarries: 17, shadowCarries: 17, actualCarries: 17 }),
      row({ playerId: "p2", teamChanged: true, productionCarries: 20, shadowCarries: 10, actualCarries: 10 }),
      row({ playerId: "p3", rushingConflictLevel: "high", productionCarries: 20, shadowCarries: 8, actualCarries: 8 }),
    ];
    const { errorsByPlayerGame } = buildRowsAndErrors(rows);
    const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
    expect(readiness.status).toBe("READY_FOR_REVIEW");
    expect(readiness.reasons).toEqual([]);
  });

  // WU4G.1 §3: pool coherence is not persisted per row today. `null` must
  // NEVER be silently treated as "affirmatively zero failures".
  describe("pool-coherence null semantics (WU4G.1 §3)", () => {
    function perfectRows() {
      return [
        row({ playerId: "p1", teamChanged: false, roleSourced: true, starterFlag: true, productionCarries: 17, shadowCarries: 17, actualCarries: 17 }),
        row({ playerId: "p2", teamChanged: true, productionCarries: 20, shadowCarries: 10, actualCarries: 10 }),
        row({ playerId: "p3", rushingConflictLevel: "high", productionCarries: 20, shadowCarries: 8, actualCarries: 8 }),
      ];
    }

    it("is NOT_READY when poolCoherenceFailureCount is null, even though every other gate passes", () => {
      const rows = perfectRows();
      const { errorsByPlayerGame } = buildRowsAndErrors(rows);
      const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: null });
      expect(readiness.status).toBe("NOT_READY");
      expect(readiness.reasons.some((r) => r.includes("unavailable"))).toBe(true);
      expect(readiness.poolCoherenceFailureCount).toBeNull();
    });

    it("may pass the coherence gate with an explicit 0 (affirmative evidence of zero failures)", () => {
      const rows = perfectRows();
      const { errorsByPlayerGame } = buildRowsAndErrors(rows);
      const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
      expect(readiness.status).toBe("READY_FOR_REVIEW");
    });

    it("is NOT_READY for any positive poolCoherenceFailureCount", () => {
      const rows = perfectRows();
      const { errorsByPlayerGame } = buildRowsAndErrors(rows);
      const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 3 });
      expect(readiness.status).toBe("NOT_READY");
      expect(readiness.reasons.some((r) => r.includes("3 pool-coherence"))).toBe(true);
    });
  });

  // WU4G.2 §10: promotion gate lock -- shadow coverage must be EXACTLY
  // 100%, never a tolerated rate (the prior 90% default is removed, not
  // just relabeled).
  describe("shadow coverage gate is locked at exactly 100% (WU4G.2 §10)", () => {
    function perfectRows() {
      return [
        row({ playerId: "p1", teamChanged: false, roleSourced: true, starterFlag: true, productionCarries: 17, shadowCarries: 17, actualCarries: 17 }),
        row({ playerId: "p2", teamChanged: true, productionCarries: 20, shadowCarries: 10, actualCarries: 10 }),
        row({ playerId: "p3", rushingConflictLevel: "high", productionCarries: 20, shadowCarries: 8, actualCarries: 8 }),
      ];
    }

    it("is READY_FOR_REVIEW at exactly 100% shadow coverage (every gate otherwise passing)", () => {
      const rows = perfectRows();
      const { errorsByPlayerGame } = buildRowsAndErrors(rows);
      const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
      expect(readiness.shadowCoverageRate).toBe(1);
      expect(readiness.status).toBe("READY_FOR_REVIEW");
    });

    it("is NOT_READY at 90% shadow coverage -- the old 90% default no longer passes", () => {
      // 9 of 10 rows have shadow -- a coverage rate the OLD 90% default would have accepted.
      const rows = [
        ...Array.from({ length: 9 }, (_v, i) => row({ playerId: `p-${i}`, teamChanged: false, roleSourced: true, starterFlag: true, productionCarries: 17, shadowCarries: 17, actualCarries: 17 })),
        row({ playerId: "p-missing", teamChanged: false, roleSourced: true, starterFlag: true, productionCarries: 17, shadowCarries: null, actualCarries: 17 }),
      ];
      const { errorsByPlayerGame } = buildRowsAndErrors(rows);
      const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
      expect(readiness.shadowCoverageRate).toBeCloseTo(0.9);
      expect(readiness.materialShadowCoverageFailures).toBe(true);
      expect(readiness.status).toBe("NOT_READY");
      expect(readiness.reasons.some((r) => r.includes("required 100%"))).toBe(true);
    });
  });

  // WU4G.2 §10: rushing conflict-diagnostic coverage, scoped to
  // structurally-expected (RB) rows only.
  describe("rushing conflict-diagnostic coverage gate (WU4G.2 §10)", () => {
    function perfectRows() {
      return [
        row({ playerId: "p1", teamChanged: false, roleSourced: true, starterFlag: true, productionCarries: 17, shadowCarries: 17, actualCarries: 17 }),
        row({ playerId: "p2", teamChanged: true, productionCarries: 20, shadowCarries: 10, actualCarries: 10 }),
        row({ playerId: "p3", rushingConflictLevel: "high", productionCarries: 20, shadowCarries: 8, actualCarries: 8 }),
      ];
    }

    it("is READY_FOR_REVIEW when every RB row has the diagnostic available (100% coverage)", () => {
      const rows = perfectRows();
      const { errorsByPlayerGame } = buildRowsAndErrors(rows);
      const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
      expect(readiness.rushingConflictDiagnosticCoverageRate).toBe(1);
      expect(readiness.status).toBe("READY_FOR_REVIEW");
    });

    it("is NOT_READY when any RB row's V2 diagnostic is unavailable, even though shadow coverage is 100%", () => {
      const rows = [
        ...perfectRows(),
        row({ playerId: "p4", teamChanged: false, roleSourced: true, starterFlag: true, productionCarries: 12, shadowCarries: 12, actualCarries: 12, rushingConflictDiagnosticAvailable: false, rushingConflictLevel: null }),
      ];
      const { errorsByPlayerGame } = buildRowsAndErrors(rows);
      const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
      expect(readiness.shadowCoverageRate).toBe(1); // shadow itself is unaffected
      expect(readiness.rushingConflictDiagnosticCoverageRate).toBeLessThan(1);
      expect(readiness.status).toBe("NOT_READY");
      expect(readiness.reasons.some((r) => r.includes("conflict-diagnostic coverage"))).toBe(true);
    });

    it("does NOT count a legitimate noHistory null severity against diagnostic coverage", () => {
      const rows = [
        ...perfectRows(),
        row({ playerId: "p4", noHistory: true, rushingConflictLevel: null, rushingConflictDiagnosticAvailable: true, productionCarries: 5, shadowCarries: 5, actualCarries: 5 }),
      ];
      const { errorsByPlayerGame } = buildRowsAndErrors(rows);
      const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
      expect(readiness.rushingConflictDiagnosticCoverageRate).toBe(1);
    });

    it("excludes non-RB rows from the diagnostic-coverage denominator entirely", () => {
      const rows = [
        ...perfectRows(),
        row({ playerId: "qb1", position: "QB", rushingConflictDiagnosticAvailable: false, rushingConflictLevel: null, productionCarries: 3, shadowCarries: 3, actualCarries: 3 }),
      ];
      const { errorsByPlayerGame } = buildRowsAndErrors(rows);
      const readiness = computeRushingPromotionReadiness({ completedWeeks: 4, rows, errorsByPlayerGame, poolCoherenceFailureCount: 0 });
      expect(readiness.rushingConflictDiagnosticCoverageRate).toBe(1); // the unavailable QB row never entered the denominator
    });
  });
});
