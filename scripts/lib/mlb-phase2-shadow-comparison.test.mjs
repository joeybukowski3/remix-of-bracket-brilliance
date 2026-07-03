/**
 * mlb-phase2-shadow-comparison.test.mjs
 * Run via: node --test scripts/lib/mlb-phase2-shadow-comparison.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mean,
  median,
  safeRate,
  spearmanCorrelation,
  selectTopMovers,
  selectTopPositiveMovers,
  selectTopNegativeMovers,
  buildDataQualityDistribution,
  buildContributionDistribution,
  buildMoneylineComparisonRecord,
  buildMoneylineComparison,
  computeShadowRanks,
  buildHrComparisonRecord,
  buildHrComparison,
  buildPhase2ShadowComparison,
} from "./mlb-phase2-shadow-comparison.mjs";

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

describe("mean / median / safeRate", () => {
  it("mean/median return null for empty or all-non-finite input", () => {
    assert.equal(mean([]), null);
    assert.equal(mean([null, undefined, NaN]), null);
    assert.equal(median([]), null);
    assert.equal(median([NaN, null]), null);
  });

  it("mean/median ignore non-finite entries mixed with valid ones", () => {
    assert.equal(mean([1, 2, null, 3, NaN]), 2);
    assert.equal(median([5, null, 1, 3]), 3);
  });

  it("median handles even and odd counts", () => {
    assert.equal(median([1, 2, 3]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  it("safeRate is bounded [0,1] and never divides by zero", () => {
    assert.equal(safeRate(5, 10), 0.5);
    assert.equal(safeRate(5, 0), 0);
    assert.equal(safeRate(NaN, 10), 0);
    assert.equal(safeRate(10, 5), 1); // clamped, never > 1
    assert.equal(safeRate(-3, 10), 0); // clamped, never negative
  });
});

describe("spearmanCorrelation", () => {
  it("returns null for fewer than 2 valid pairs", () => {
    assert.equal(spearmanCorrelation([]), null);
    assert.equal(spearmanCorrelation([{ x: 1, y: 1 }]), null);
  });

  it("returns exactly 1 for perfectly correlated values", () => {
    const pairs = [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }, { x: 4, y: 40 }];
    assert.equal(spearmanCorrelation(pairs), 1);
  });

  it("returns exactly -1 for perfectly inversely correlated values", () => {
    const pairs = [{ x: 1, y: 40 }, { x: 2, y: 30 }, { x: 3, y: 20 }, { x: 4, y: 10 }];
    assert.equal(spearmanCorrelation(pairs), -1);
  });

  it("returns null when one side has zero variance (undefined correlation, not fabricated 0)", () => {
    const pairs = [{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }];
    assert.equal(spearmanCorrelation(pairs), null);
  });

  it("handles ties via average rank without throwing", () => {
    const pairs = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }];
    const result = spearmanCorrelation(pairs);
    assert.ok(Number.isFinite(result));
  });

  it("drops pairs with a non-finite side before computing", () => {
    const withNaN = [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: NaN, y: 30 }, { x: 4, y: 40 }];
    const withoutNaN = [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 4, y: 40 }];
    assert.equal(spearmanCorrelation(withNaN), spearmanCorrelation(withoutNaN));
  });
});

describe("selectTopMovers / selectTopPositiveMovers / selectTopNegativeMovers", () => {
  const records = [
    { id: "a", value: 3 },
    { id: "b", value: -8 },
    { id: "c", value: 5 },
    { id: "d", value: -2 },
    { id: "e", value: NaN },
    { id: "f", value: 5 }, // tie with c, later in original order
  ];

  it("selectTopMovers sorts by |value| descending, stable tiebreak by original order", () => {
    const top = selectTopMovers(records, { valueFn: (r) => r.value, limit: 3 });
    assert.deepEqual(top.map((r) => r.id), ["b", "c", "f"]);
  });

  it("selectTopPositiveMovers excludes non-positive values", () => {
    const top = selectTopPositiveMovers(records, { valueFn: (r) => r.value, limit: 10 });
    assert.deepEqual(top.map((r) => r.id), ["c", "f", "a"]);
  });

  it("selectTopNegativeMovers excludes non-negative values, most negative first", () => {
    const top = selectTopNegativeMovers(records, { valueFn: (r) => r.value, limit: 10 });
    assert.deepEqual(top.map((r) => r.id), ["b", "d"]);
  });

  it("respects the limit and handles an empty input", () => {
    assert.equal(selectTopMovers([], { valueFn: (r) => r.value }).length, 0);
    assert.equal(selectTopMovers(records, { valueFn: (r) => r.value, limit: 1 }).length, 1);
  });
});

describe("buildDataQualityDistribution / buildContributionDistribution", () => {
  it("counts distinct values including null", () => {
    const dist = buildDataQualityDistribution(["high", "high", null, "low", undefined]);
    assert.deepEqual(dist, { high: 2, null: 2, low: 1 });
  });

  it("contribution distribution is well-formed for empty/all-non-finite input", () => {
    assert.deepEqual(buildContributionDistribution([]), { count: 0, mean: null, median: null, min: null, max: null });
    assert.deepEqual(buildContributionDistribution([null, NaN]), { count: 0, mean: null, median: null, min: null, max: null });
  });

  it("contribution distribution summarizes valid numeric values", () => {
    const dist = buildContributionDistribution([1, 2, 3, null]);
    assert.equal(dist.count, 3);
    assert.equal(dist.mean, 2);
    assert.equal(dist.median, 2);
    assert.equal(dist.min, 1);
    assert.equal(dist.max, 3);
  });
});

// ---------------------------------------------------------------------------
// Moneyline
// ---------------------------------------------------------------------------

function mlPickFixture(overrides = {}) {
  return {
    gameId: 1001,
    gameKey: "NYY@BOS",
    pick: "away",
    pickAbbr: "NYY",
    confidence: 62,
    differential: 6,
    factors: [],
    topFactor: "Pitcher Quality",
    ...overrides,
  };
}

function mlShadowFixture(overrides = {}) {
  return {
    liveModelVersion: "mlb-ml-edge-v1.0",
    shadowExperimentVersion: "mlb-ml-phase2-shadow-v1",
    enabledComponents: { projectedIp: true, park: true, bullpen: true },
    live: { pick: "away", differential: 6, confidence: 62 },
    projectedIpShadow: {
      awayBullpenShadow: { available: true, dataQuality: "high", contribution: 1.5 },
      homeBullpenShadow: { available: false, dataQuality: null, contribution: 0 },
    },
    parkShadow: { parkDataQuality: "known_venue" },
    combinedShadowPick: "away",
    combinedShadowDifferential: 8,
    combinedShadowTier: "slight",
    pickFlipped: false,
    ...overrides,
  };
}

describe("buildMoneylineComparisonRecord", () => {
  it("returns null for a malformed record missing identity fields", () => {
    assert.equal(buildMoneylineComparisonRecord({ pick: "away" }), null);
    assert.equal(buildMoneylineComparisonRecord(null), null);
    assert.equal(buildMoneylineComparisonRecord("not-an-object"), null);
  });

  it("builds a record with no shadow data safely (not an error)", () => {
    const record = buildMoneylineComparisonRecord(mlPickFixture(), { date: "2026-07-03" });
    assert.equal(record.hasShadow, false);
    assert.equal(record.pickFlip, false);
    assert.equal(record.combinedShadowPick, null);
    assert.equal(record.differentialDelta, null);
    assert.equal(record.componentAvailability, null);
    assert.equal(record.liveTier, "slight"); // confidence 62 -> slight (56-63)
  });

  it("builds a full record when shadow data is present", () => {
    const pick = mlPickFixture({ phase2Shadow: mlShadowFixture() });
    const record = buildMoneylineComparisonRecord(pick, { date: "2026-07-03" });
    assert.equal(record.hasShadow, true);
    assert.equal(record.combinedShadowPick, "away");
    assert.equal(record.combinedShadowDifferential, 8);
    assert.equal(record.differentialDelta, 2); // 8 - 6
    assert.equal(record.pickFlip, false);
    assert.equal(record.componentAvailability.bullpenAway, true);
    assert.equal(record.componentAvailability.bullpenHome, false);
    assert.equal(record.componentContributions.bullpenAway, 1.5);
    assert.equal(record.productionModelVersion, "mlb-ml-edge-v1.0");
    assert.equal(record.shadowExperimentVersion, "mlb-ml-phase2-shadow-v1");
  });

  it("detects a pick flip", () => {
    const pick = mlPickFixture({ pick: "away", phase2Shadow: mlShadowFixture({ combinedShadowPick: "home", pickFlipped: true }) });
    const record = buildMoneylineComparisonRecord(pick, {});
    assert.equal(record.pickFlip, true);
  });
});

describe("buildMoneylineComparison", () => {
  it("returns a well-formed empty artifact for zero records", () => {
    const result = buildMoneylineComparison([], {});
    assert.equal(result.records.length, 0);
    assert.equal(result.summary.totalRecords, 0);
    assert.equal(result.summary.shadowAvailabilityRate, 0);
    assert.equal(result.summary.pickFlipRate, 0);
    assert.deepEqual(result.summary.topMovers, []);
  });

  it("handles input that is missing/not an array", () => {
    const result = buildMoneylineComparison(undefined, {});
    assert.equal(result.records.length, 0);
  });

  it("handles all-no-shadow records without treating them as errors", () => {
    const result = buildMoneylineComparison([mlPickFixture({ gameId: 1 }), mlPickFixture({ gameId: 2, gameKey: "TB@HOU" })], {});
    assert.equal(result.summary.totalRecords, 2);
    assert.equal(result.summary.recordsWithShadow, 0);
    assert.equal(result.summary.recordsWithoutShadow, 2);
    assert.equal(result.summary.pickFlipCount, 0);
  });

  it("handles a mix of shadow and no-shadow records", () => {
    const picks = [
      mlPickFixture({ gameId: 1, gameKey: "A@B", phase2Shadow: mlShadowFixture() }),
      mlPickFixture({ gameId: 2, gameKey: "C@D" }),
    ];
    const result = buildMoneylineComparison(picks, {});
    assert.equal(result.summary.totalRecords, 2);
    assert.equal(result.summary.recordsWithShadow, 1);
    assert.equal(result.summary.recordsWithoutShadow, 1);
    assert.equal(result.summary.shadowAvailabilityRate, 0.5);
  });

  it("counts zero pick flips correctly", () => {
    const picks = [mlPickFixture({ gameId: 1, gameKey: "A@B", phase2Shadow: mlShadowFixture() })];
    const result = buildMoneylineComparison(picks, {});
    assert.equal(result.summary.pickFlipCount, 0);
    assert.equal(result.summary.pickFlipRate, 0);
  });

  it("counts one or multiple pick flips and computes the rate over records-with-shadow", () => {
    const flip = mlShadowFixture({ combinedShadowPick: "home", pickFlipped: true });
    const noFlip = mlShadowFixture();
    const picks = [
      mlPickFixture({ gameId: 1, gameKey: "A@B", phase2Shadow: flip }),
      mlPickFixture({ gameId: 2, gameKey: "C@D", phase2Shadow: flip }),
      mlPickFixture({ gameId: 3, gameKey: "E@F", phase2Shadow: noFlip }),
      mlPickFixture({ gameId: 4, gameKey: "G@H" }), // no shadow, excluded from rate denominator
    ];
    const result = buildMoneylineComparison(picks, {});
    assert.equal(result.summary.pickFlipCount, 2);
    assert.equal(result.summary.pickFlipRate, round(2 / 3));
  });

  it("computes positive and negative differential deltas and their distributions", () => {
    const picks = [
      mlPickFixture({ gameId: 1, gameKey: "A@B", differential: 5, phase2Shadow: mlShadowFixture({ combinedShadowDifferential: 8 }) }), // +3
      mlPickFixture({ gameId: 2, gameKey: "C@D", differential: 10, phase2Shadow: mlShadowFixture({ combinedShadowDifferential: 4 }) }), // -6
    ];
    const result = buildMoneylineComparison(picks, {});
    assert.equal(result.summary.averageAbsoluteDifferentialDelta, 4.5);
    assert.equal(result.summary.medianAbsoluteDifferentialDelta, 4.5);
    assert.equal(result.summary.maxAbsoluteDifferentialDelta, 6);
  });

  it("produces deterministic top-mover ordering", () => {
    const picks = [
      mlPickFixture({ gameId: 1, gameKey: "A@B", differential: 5, phase2Shadow: mlShadowFixture({ combinedShadowDifferential: 6 }) }), // +1
      mlPickFixture({ gameId: 2, gameKey: "C@D", differential: 5, phase2Shadow: mlShadowFixture({ combinedShadowDifferential: 15 }) }), // +10
      mlPickFixture({ gameId: 3, gameKey: "E@F", differential: 5, phase2Shadow: mlShadowFixture({ combinedShadowDifferential: -3 }) }), // -8
    ];
    const result = buildMoneylineComparison(picks, {});
    assert.deepEqual(result.summary.topMovers.map((m) => m.gameKey), ["C@D", "E@F", "A@B"]);
  });

  it("summarizes component availability/data-quality distributions", () => {
    const picks = [
      mlPickFixture({ gameId: 1, gameKey: "A@B", phase2Shadow: mlShadowFixture() }),
      mlPickFixture({ gameId: 2, gameKey: "C@D", phase2Shadow: mlShadowFixture() }),
    ];
    const result = buildMoneylineComparison(picks, {});
    assert.equal(result.summary.componentAvailabilityRates.bullpenAway, 1);
    assert.equal(result.summary.componentAvailabilityRates.bullpenHome, 0);
    assert.deepEqual(result.summary.componentDataQualityDistribution.bullpenAway, { high: 2 });
  });

  it("skips a malformed record rather than throwing, and reports the skip count", () => {
    const result = buildMoneylineComparison([mlPickFixture({ gameId: 1 }), { pick: "away" }, "not-an-object"], {});
    assert.equal(result.records.length, 1);
    assert.equal(result.skippedCount, 2);
  });
});

function round(v) {
  return Math.round(v * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// HR
// ---------------------------------------------------------------------------

function hrBatterFixture(overrides = {}) {
  return {
    playerId: 1,
    player: "Player One",
    gameId: 1001,
    gameKey: "NYY@BOS",
    hrScore: 60,
    hrScoreRank: 1,
    ...overrides,
  };
}

function hrShadowFixture(overrides = {}) {
  return {
    liveModelVersion: "mlb-hr-quality-v1.1",
    shadowExperimentVersion: "mlb-hr-phase2-shadow-v1",
    enabledComponents: { bullpen: true, handSplit: true },
    live: { hrScore: 60 },
    bullpenShadow: { available: true, dataQuality: "high", contribution: 1 },
    handSplitShadow: { available: true, dataQuality: "high", contribution: 1 },
    componentAvailability: { bullpen: true, handSplit: true },
    componentDataQuality: { bullpen: "high", handSplit: "high" },
    componentContributions: { bullpen: 1, handSplit: 1 },
    combinedShadowScore: 62,
    ...overrides,
  };
}

describe("computeShadowRanks", () => {
  it("ranks higher combinedShadowScore as better (rank 1), keyed by array index", () => {
    const batters = [
      hrBatterFixture({ playerId: 1, phase2Shadow: hrShadowFixture({ combinedShadowScore: 50 }) }), // index 0 -> worst -> rank 3
      hrBatterFixture({ playerId: 2, phase2Shadow: hrShadowFixture({ combinedShadowScore: 90 }) }), // index 1 -> best -> rank 1
      hrBatterFixture({ playerId: 3, phase2Shadow: hrShadowFixture({ combinedShadowScore: 70 }) }), // index 2 -> middle -> rank 2
    ];
    const ranks = computeShadowRanks(batters);
    assert.equal(ranks.get(0), 3);
    assert.equal(ranks.get(1), 1);
    assert.equal(ranks.get(2), 2);
  });

  it("maps by array INDEX, not playerId", () => {
    const batters = [
      hrBatterFixture({ playerId: 5, phase2Shadow: hrShadowFixture({ combinedShadowScore: 50 }) }), // index 0
      hrBatterFixture({ playerId: 6, phase2Shadow: hrShadowFixture({ combinedShadowScore: 90 }) }), // index 1
    ];
    const ranks = computeShadowRanks(batters);
    assert.equal(ranks.get(1), 1); // index 1 (score 90) is rank 1
    assert.equal(ranks.get(0), 2); // index 0 (score 50) is rank 2
  });

  it("uses a stable, deterministic tiebreaker: live rank ascending, then playerId ascending", () => {
    const tiedScore = 70;
    const batters = [
      hrBatterFixture({ playerId: 30, hrScoreRank: 5, phase2Shadow: hrShadowFixture({ combinedShadowScore: tiedScore }) }), // index 0
      hrBatterFixture({ playerId: 10, hrScoreRank: 2, phase2Shadow: hrShadowFixture({ combinedShadowScore: tiedScore }) }), // index 1
      hrBatterFixture({ playerId: 20, hrScoreRank: 2, phase2Shadow: hrShadowFixture({ combinedShadowScore: tiedScore }) }), // index 2
    ];
    const ranks = computeShadowRanks(batters);
    // liveRank 2 beats liveRank 5; between the two liveRank-2 ties, lower playerId (10) wins.
    assert.equal(ranks.get(1), 1); // playerId 10, liveRank 2
    assert.equal(ranks.get(2), 2); // playerId 20, liveRank 2
    assert.equal(ranks.get(0), 3); // playerId 30, liveRank 5
  });

  it("excludes batters without a finite combinedShadowScore from the ranking entirely", () => {
    const batters = [
      hrBatterFixture({ playerId: 1 }), // no phase2Shadow at all
      hrBatterFixture({ playerId: 2, phase2Shadow: hrShadowFixture({ combinedShadowScore: 80 }) }),
    ];
    const ranks = computeShadowRanks(batters);
    assert.equal(ranks.has(0), false);
    assert.equal(ranks.get(1), 1);
  });

  it("is deterministic for identical input", () => {
    const batters = [
      hrBatterFixture({ playerId: 1, phase2Shadow: hrShadowFixture({ combinedShadowScore: 50 }) }),
      hrBatterFixture({ playerId: 2, phase2Shadow: hrShadowFixture({ combinedShadowScore: 90 }) }),
    ];
    assert.deepEqual([...computeShadowRanks(batters)], [...computeShadowRanks(batters)]);
  });
});

describe("buildHrComparisonRecord", () => {
  it("returns null for a malformed record missing identity fields", () => {
    assert.equal(buildHrComparisonRecord({ player: "X" }), null);
    assert.equal(buildHrComparisonRecord(null), null);
  });

  it("builds a record with no shadow data safely", () => {
    const record = buildHrComparisonRecord(hrBatterFixture(), { date: "2026-07-03", shadowRank: null });
    assert.equal(record.hasShadow, false);
    assert.equal(record.combinedShadowScore, null);
    assert.equal(record.rankMovement, null);
    assert.equal(record.scoreDelta, null);
  });

  it("computes rankMovement as liveRank - shadowRank (positive = moved up)", () => {
    const record = buildHrComparisonRecord(hrBatterFixture({ hrScoreRank: 10, phase2Shadow: hrShadowFixture() }), { shadowRank: 3 });
    assert.equal(record.rankMovement, 7);
  });

  it("computes scoreDelta as combinedShadowScore - liveScore", () => {
    const record = buildHrComparisonRecord(hrBatterFixture({ hrScore: 60, phase2Shadow: hrShadowFixture({ combinedShadowScore: 55 }) }), { shadowRank: 1 });
    assert.equal(record.scoreDelta, -5);
  });
});

describe("buildHrComparison", () => {
  it("returns a well-formed empty artifact for zero records", () => {
    const result = buildHrComparison([], {});
    assert.equal(result.records.length, 0);
    assert.equal(result.summary.totalRecords, 0);
    assert.equal(result.summary.liveVsShadowSpearman, null);
    assert.deepEqual(result.summary.topPositiveMovers, []);
    assert.deepEqual(result.summary.topNegativeMovers, []);
  });

  it("handles missing ranks (hrScoreRank absent) without throwing", () => {
    const batters = [hrBatterFixture({ hrScoreRank: undefined, phase2Shadow: hrShadowFixture() })];
    const result = buildHrComparison(batters, {});
    assert.equal(result.records[0].liveRank, null);
  });

  it("handles tied shadow scores with stable tiebreaking end to end", () => {
    const batters = [
      hrBatterFixture({ playerId: 30, hrScoreRank: 5, phase2Shadow: hrShadowFixture({ combinedShadowScore: 70 }) }),
      hrBatterFixture({ playerId: 10, hrScoreRank: 2, phase2Shadow: hrShadowFixture({ combinedShadowScore: 70 }) }),
    ];
    const result = buildHrComparison(batters, {});
    const byPlayerId = new Map(result.records.map((r) => [r.playerId, r]));
    assert.equal(byPlayerId.get(10).shadowRank, 1);
    assert.equal(byPlayerId.get(30).shadowRank, 2);
  });

  it("computes positive and negative rank movement correctly", () => {
    const batters = [
      hrBatterFixture({ playerId: 1, hrScoreRank: 10, phase2Shadow: hrShadowFixture({ combinedShadowScore: 90 }) }), // best shadow score -> shadowRank 1, movement +9
      hrBatterFixture({ playerId: 2, hrScoreRank: 1, phase2Shadow: hrShadowFixture({ combinedShadowScore: 10 }) }), // worst shadow score -> shadowRank 2, movement -1
    ];
    const result = buildHrComparison(batters, {});
    const byPlayerId = new Map(result.records.map((r) => [r.playerId, r]));
    assert.equal(byPlayerId.get(1).rankMovement, 9);
    assert.equal(byPlayerId.get(2).rankMovement, -1);
    assert.deepEqual(result.summary.topPositiveMovers.map((m) => m.playerId), [1]);
    assert.deepEqual(result.summary.topNegativeMovers.map((m) => m.playerId), [2]);
  });

  it("computes a perfect Spearman correlation when shadow order exactly matches live order", () => {
    const batters = [
      hrBatterFixture({ playerId: 1, hrScore: 90, phase2Shadow: hrShadowFixture({ combinedShadowScore: 95 }) }),
      hrBatterFixture({ playerId: 2, hrScore: 60, phase2Shadow: hrShadowFixture({ combinedShadowScore: 65 }) }),
      hrBatterFixture({ playerId: 3, hrScore: 30, phase2Shadow: hrShadowFixture({ combinedShadowScore: 35 }) }),
    ];
    const result = buildHrComparison(batters, {});
    assert.equal(result.summary.liveVsShadowSpearman, 1);
  });

  it("computes an inverse Spearman correlation when shadow order exactly reverses live order", () => {
    const batters = [
      hrBatterFixture({ playerId: 1, hrScore: 90, phase2Shadow: hrShadowFixture({ combinedShadowScore: 10 }) }),
      hrBatterFixture({ playerId: 2, hrScore: 60, phase2Shadow: hrShadowFixture({ combinedShadowScore: 50 }) }),
      hrBatterFixture({ playerId: 3, hrScore: 30, phase2Shadow: hrShadowFixture({ combinedShadowScore: 90 }) }),
    ];
    const result = buildHrComparison(batters, {});
    assert.equal(result.summary.liveVsShadowSpearman, -1);
  });

  it("handles partial missing-shadow records in overall summary without corrupting Spearman/rank stats", () => {
    const batters = [
      hrBatterFixture({ playerId: 1, hrScore: 90, phase2Shadow: hrShadowFixture({ combinedShadowScore: 95 }) }),
      hrBatterFixture({ playerId: 2, hrScore: 60 }), // no shadow
      hrBatterFixture({ playerId: 3, hrScore: 30, phase2Shadow: hrShadowFixture({ combinedShadowScore: 35 }) }),
    ];
    const result = buildHrComparison(batters, {});
    assert.equal(result.summary.recordsWithShadow, 2);
    assert.equal(result.summary.recordsWithoutShadow, 1);
    assert.equal(result.summary.liveVsShadowSpearman, 1);
  });

  it("summarizes score deltas", () => {
    const batters = [
      hrBatterFixture({ playerId: 1, hrScore: 50, phase2Shadow: hrShadowFixture({ combinedShadowScore: 55 }) }), // +5
      hrBatterFixture({ playerId: 2, hrScore: 50, phase2Shadow: hrShadowFixture({ combinedShadowScore: 40 }) }), // -10
    ];
    const result = buildHrComparison(batters, {});
    assert.equal(result.summary.averageAbsoluteScoreDelta, 7.5);
  });

  it("skips a malformed record rather than throwing, and reports the skip count", () => {
    const result = buildHrComparison([hrBatterFixture({ playerId: 1 }), { player: "no id" }, 42], {});
    assert.equal(result.records.length, 1);
    assert.equal(result.skippedCount, 2);
  });
});

// ---------------------------------------------------------------------------
// Top-level artifact
// ---------------------------------------------------------------------------

describe("buildPhase2ShadowComparison", () => {
  it("produces a well-formed artifact for entirely missing input (both raw files unavailable)", () => {
    const artifact = buildPhase2ShadowComparison({ mlRaw: null, hrRaw: null, generatedAt: "2026-07-03T00:00:00.000Z" });
    assert.equal(artifact.schemaVersion, "1.0.0");
    assert.equal(artifact.moneyline.records.length, 0);
    assert.equal(artifact.hr.records.length, 0);
    assert.ok(artifact.summary.warnings.some((w) => w.includes("ml-picks-raw.json")));
    assert.ok(artifact.summary.warnings.some((w) => w.includes("hr-props-raw.json")));
    assert.ok(Array.isArray(artifact.notes) && artifact.notes.length > 0);
  });

  it("carries the experimental-shadow-only note verbatim", () => {
    const artifact = buildPhase2ShadowComparison({});
    assert.match(artifact.summary.experimentalNote, /experimental/i);
    assert.match(artifact.summary.experimentalNote, /do not affect/i);
  });

  it("is deterministic for identical input (including generatedAt injection)", () => {
    const mlRaw = { date: "2026-07-03", generatedAt: "2026-07-03T10:00:00Z", picks: [mlPickFixture({ phase2Shadow: mlShadowFixture() })] };
    const hrRaw = { date: "2026-07-03", generatedAt: "2026-07-03T10:00:00Z", batters: [hrBatterFixture({ phase2Shadow: hrShadowFixture() })] };
    const first = buildPhase2ShadowComparison({ mlRaw, hrRaw, generatedAt: "2026-07-03T12:00:00Z" });
    const second = buildPhase2ShadowComparison({ mlRaw, hrRaw, generatedAt: "2026-07-03T12:00:00Z" });
    assert.deepEqual(first, second);
  });

  it("carries source generatedAt timestamps through to the top-level summary", () => {
    const mlRaw = { generatedAt: "2026-07-03T09:00:00Z", picks: [] };
    const hrRaw = { generatedAt: "2026-07-03T09:30:00Z", batters: [] };
    const artifact = buildPhase2ShadowComparison({ mlRaw, hrRaw });
    assert.equal(artifact.summary.moneylineSourceGeneratedAt, "2026-07-03T09:00:00Z");
    assert.equal(artifact.summary.hrSourceGeneratedAt, "2026-07-03T09:30:00Z");
  });
});
