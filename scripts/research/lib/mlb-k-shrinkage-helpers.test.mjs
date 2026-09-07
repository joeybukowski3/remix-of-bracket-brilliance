/**
 * RESEARCH ONLY -- tests for the shrinkage-experiment helpers.
 * Run with: node --test scripts/research/lib/mlb-k-shrinkage-helpers.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  MIN_K_RATE,
  MAX_K_RATE,
  PRODUCTION_ALPHA,
  SKILL_EXCESS_REFERENCE_SD,
  assertTemporalOrder,
  combinedAlpha,
  continuousSkillAlpha,
  logisticSkillAlpha,
  percentileInSortedPool,
  piecewisePercentileAlpha,
  projectWithAlpha,
  rankCandidates,
  recoverLeagueAnchor,
  rollingOriginFolds,
  sampleSizeAlpha,
  temporalSplit,
} from "./mlb-k-shrinkage-helpers.mjs";

import { candidateMetrics, tallyDirection } from "./mlb-k-shrinkage-metrics.mjs";

// ------------------------------ sample-size alpha ------------------------------

test("sampleSizeAlpha computes BF / (BF + k)", () => {
  assert.equal(sampleSizeAlpha(100, 100).alpha, 0.5);
  assert.equal(sampleSizeAlpha(300, 100).alpha, 0.75);
  assert.equal(sampleSizeAlpha(0, 100).alpha, 0);
  assert.equal(sampleSizeAlpha(50, 50).source, "sample-size");
});

test("sampleSizeAlpha is monotone increasing in BF and decreasing in k", () => {
  let previous = -1;
  for (const bf of [0, 25, 50, 100, 200, 400, 800]) {
    const alpha = sampleSizeAlpha(bf, 100).alpha;
    assert.ok(alpha > previous, `alpha must rise with BF at BF=${bf}`);
    previous = alpha;
  }
  let last = 2;
  for (const k of [25, 50, 100, 200]) {
    const alpha = sampleSizeAlpha(300, k).alpha;
    assert.ok(alpha < last, `alpha must fall as k rises at k=${k}`);
    last = alpha;
  }
});

test("sampleSizeAlpha stays inside [0, 1] for extreme inputs", () => {
  for (const bf of [0, 1, 1e6, 1e12]) {
    const alpha = sampleSizeAlpha(bf, 100).alpha;
    assert.ok(alpha >= 0 && alpha <= 1, `alpha out of bounds for BF=${bf}`);
  }
});

test("sampleSizeAlpha fails closed to production alpha when BF is unavailable", () => {
  for (const missing of [null, undefined, "", Number.NaN, -1]) {
    const result = sampleSizeAlpha(missing, 100);
    assert.equal(result.alpha, PRODUCTION_ALPHA, `expected fallback for ${String(missing)}`);
    assert.equal(result.source, "fallback:missing-bf");
  }
});

test("sampleSizeAlpha treats BF of 0 as information, not as a missing input", () => {
  const zero = sampleSizeAlpha(0, 100);
  assert.equal(zero.alpha, 0);
  assert.equal(zero.source, "sample-size");
});

test("sampleSizeAlpha fails closed on an invalid k", () => {
  assert.equal(sampleSizeAlpha(300, 0).alpha, PRODUCTION_ALPHA);
  assert.equal(sampleSizeAlpha(300, -5).source, "fallback:invalid-k");
  assert.equal(sampleSizeAlpha(300, null).alpha, PRODUCTION_ALPHA);
});

// ------------------------------- percentile handling -------------------------------

test("percentileInSortedPool is deterministic and midpoint-tied", () => {
  const pool = [1, 2, 3, 4];
  assert.equal(percentileInSortedPool(pool, 1), 0.125);
  assert.equal(percentileInSortedPool(pool, 4), 0.875);
  // Ties share one percentile regardless of how many duplicates precede them.
  assert.equal(percentileInSortedPool([5, 5, 5, 5], 5), 0.5);
});

test("percentileInSortedPool repeats exactly across calls", () => {
  const pool = [0.11, 0.18, 0.19, 0.22, 0.28, 0.31];
  const first = percentileInSortedPool(pool, 0.22);
  for (let i = 0; i < 25; i += 1) {
    assert.equal(percentileInSortedPool(pool, 0.22), first);
  }
});

test("percentileInSortedPool returns null for an empty pool or absent value", () => {
  assert.equal(percentileInSortedPool([], 0.2), null);
  assert.equal(percentileInSortedPool([1, 2], null), null);
  assert.equal(percentileInSortedPool(null, 0.2), null);
});

// ---------------------------- skill-dependent monotonicity ----------------------------

test("piecewisePercentileAlpha is monotone non-decreasing in percentile", () => {
  let previous = -1;
  for (let pct = 0; pct <= 1.0001; pct += 0.01) {
    const alpha = piecewisePercentileAlpha(pct).alpha;
    assert.ok(alpha >= previous - 1e-12, `alpha fell at pct=${pct.toFixed(2)}`);
    assert.ok(alpha >= 0 && alpha <= 1);
    previous = alpha;
  }
});

test("piecewisePercentileAlpha holds the base alpha below p60 and reaches the top alpha at p100", () => {
  assert.equal(piecewisePercentileAlpha(0.0).alpha, PRODUCTION_ALPHA);
  assert.equal(piecewisePercentileAlpha(0.59).alpha, PRODUCTION_ALPHA);
  assert.equal(piecewisePercentileAlpha(1.0, { topAlpha: 0.95 }).alpha, 0.95);
});

test("piecewisePercentileAlpha fails closed to the base alpha with no percentile", () => {
  const result = piecewisePercentileAlpha(null);
  assert.equal(result.alpha, PRODUCTION_ALPHA);
  assert.equal(result.source, "fallback:no-percentile");
});

test("continuousSkillAlpha is monotone in skill and never drops below base", () => {
  const league = 0.22;
  let previous = -1;
  for (let skill = 0.1; skill <= 0.4; skill += 0.005) {
    const alpha = continuousSkillAlpha(skill, league).alpha;
    assert.ok(alpha >= previous - 1e-12, `alpha fell at skill=${skill.toFixed(3)}`);
    assert.ok(alpha >= PRODUCTION_ALPHA - 1e-12, "one-sided ramp must not shrink harder than production");
    assert.ok(alpha <= 1);
    previous = alpha;
  }
});

test("continuousSkillAlpha scales excess skill in reference-SD units", () => {
  const league = 0.22;
  const oneSd = continuousSkillAlpha(league + SKILL_EXCESS_REFERENCE_SD, league, { slope: 0.2 });
  assert.ok(Math.abs(oneSd.alpha - (PRODUCTION_ALPHA + 0.2)) < 1e-12);
  assert.ok(Math.abs(oneSd.z - 1) < 1e-12);
});

test("logisticSkillAlpha is monotone, bounded and centred on its midpoint", () => {
  const league = 0.22;
  let previous = -1;
  for (let skill = 0.1; skill <= 0.4; skill += 0.005) {
    const alpha = logisticSkillAlpha(skill, league).alpha;
    assert.ok(alpha >= previous - 1e-12);
    assert.ok(alpha >= 0 && alpha <= 1);
    previous = alpha;
  }
  const mid = logisticSkillAlpha(league + SKILL_EXCESS_REFERENCE_SD, league, {
    low: 0.5,
    high: 1,
    midpointZ: 1,
  });
  assert.ok(Math.abs(mid.alpha - 0.75) < 1e-9, "midpoint must sit halfway between low and high");
});

test("skill-dependent forms fail closed when skill or league is missing", () => {
  assert.equal(continuousSkillAlpha(null, 0.22).alpha, PRODUCTION_ALPHA);
  assert.equal(continuousSkillAlpha(0.28, null).source, "fallback:missing-skill");
  assert.equal(logisticSkillAlpha(null, 0.22).alpha, PRODUCTION_ALPHA);
});

test("combinedAlpha never falls below its sample-size base", () => {
  for (const bf of [0, 60, 200, 500]) {
    for (const skill of [0.15, 0.22, 0.3]) {
      const base = sampleSizeAlpha(bf, 100).alpha;
      const combined = combinedAlpha({ seasonBattersFaced: bf, k: 100, pitcherSkillRate: skill, leagueKRate: 0.22 });
      assert.ok(combined.alpha >= base - 1e-12);
      assert.ok(combined.alpha <= 1);
    }
  }
});

// ------------------------- no market-line dependency (hard rule) -------------------------

test("no alpha function reads the market line", () => {
  const source = readFileSync(
    path.join(process.cwd(), "scripts", "research", "lib", "mlb-k-shrinkage-helpers.mjs"),
    "utf8",
  );
  // The word may appear in prose; it must never appear as a property read.
  assert.equal(/\.kLine\b/.test(source), false, "helpers must not read row.kLine");
  assert.equal(/\boddsOver\b|\boddsUnder\b/.test(source), false, "helpers must not read market odds");
});

test("alpha is invariant to the market line at identical model inputs", () => {
  const inputs = { seasonBattersFaced: 320, k: 100, pitcherSkillRate: 0.29, leagueKRate: 0.22 };
  const a = combinedAlpha({ ...inputs });
  const b = combinedAlpha({ ...inputs, kLine: 8.5 });
  const c = combinedAlpha({ ...inputs, kLine: 3.5 });
  assert.equal(a.alpha, b.alpha);
  assert.equal(a.alpha, c.alpha);
});

// ------------------------------ projection replay ------------------------------

test("recoverLeagueAnchor inverts the matchup adjustment", () => {
  const league = 0.221;
  const env = 0.19;
  const adjustment = (env - league) * 0.75;
  assert.ok(Math.abs(recoverLeagueAnchor(env, adjustment) - league) < 1e-12);
  assert.equal(recoverLeagueAnchor(null, adjustment), null);
});

test("projectWithAlpha reproduces the production formula at alpha 0.55", () => {
  const league = 0.22;
  const skill = 0.28;
  const result = projectWithAlpha({
    alpha: PRODUCTION_ALPHA,
    pitcherSkillRate: skill,
    leagueAnchor: league,
    matchupAdjustment: -0.01,
    projectedBF: 24,
  });
  const expectedRate = league + PRODUCTION_ALPHA * (skill - league) - 0.01;
  assert.ok(Math.abs(result.projectedKRate - expectedRate) < 1e-12);
  assert.ok(Math.abs(result.projectedKs - expectedRate * 24) < 1e-12);
});

test("projectWithAlpha honours the production K-rate clamp and the alpha bound", () => {
  const high = projectWithAlpha({
    alpha: 5,
    pitcherSkillRate: 0.4,
    leagueAnchor: 0.22,
    matchupAdjustment: 0.035,
    projectedBF: 24,
  });
  assert.equal(high.alpha, 1, "alpha must be clamped into [0, 1]");
  assert.ok(high.projectedKRate <= MAX_K_RATE + 1e-12);
  const low = projectWithAlpha({
    alpha: 1,
    pitcherSkillRate: 0.02,
    leagueAnchor: 0.22,
    matchupAdjustment: -0.035,
    projectedBF: 24,
  });
  assert.ok(low.projectedKRate >= MIN_K_RATE - 1e-12);
  assert.equal(projectWithAlpha({ alpha: 0.5, pitcherSkillRate: null, leagueAnchor: 0.2, projectedBF: 24 }), null);
});

// ------------------------------ temporal split guards ------------------------------

const splitRows = [
  { slateDate: "2026-07-01" },
  { slateDate: "2026-07-01" },
  { slateDate: "2026-07-02" },
  { slateDate: "2026-07-03" },
  { slateDate: "2026-07-04" },
  { slateDate: "2026-07-05" },
];

test("temporalSplit never lets a slate straddle the boundary", () => {
  const split = temporalSplit(splitRows, { devFraction: 0.6 });
  const devSet = new Set(split.development.map((row) => row.slateDate));
  const valSet = new Set(split.validation.map((row) => row.slateDate));
  for (const date of devSet) assert.equal(valSet.has(date), false, `slate ${date} straddles the split`);
  assert.equal(split.development.length + split.validation.length, splitRows.length);
});

test("temporalSplit puts every validation slate strictly after every development slate", () => {
  const split = temporalSplit(splitRows, { devFraction: 0.6 });
  const guard = assertTemporalOrder(split.development, split.validation);
  assert.equal(guard.ok, true, `leakage: ${guard.violations.join(",")}`);
});

test("assertTemporalOrder flags an overlapping split", () => {
  const guard = assertTemporalOrder([{ slateDate: "2026-07-03" }], [{ slateDate: "2026-07-02" }]);
  assert.equal(guard.ok, false);
  assert.deepEqual(guard.violations, ["2026-07-02"]);
});

test("rollingOriginFolds only ever scores slates after their training window", () => {
  const rows = [];
  for (let day = 1; day <= 20; day += 1) {
    rows.push({ slateDate: `2026-07-${String(day).padStart(2, "0")}` });
  }
  const folds = rollingOriginFolds(rows, { folds: 3, minTrainDates: 8 });
  assert.ok(folds.length >= 2);
  for (const fold of folds) {
    const guard = assertTemporalOrder(fold.train, fold.test);
    assert.equal(guard.ok, true, `fold ${fold.fold} leaks: ${guard.violations.join(",")}`);
  }
});

// ------------------------------ metric aggregation ------------------------------

const metricRows = [
  { kLine: 4.5, actualKs: 5, projectedKs: 4.0, v2ProjectedInnings: 5.2, seasonBattersFaced: 300, v2PitcherSkillRate: 0.2 },
  { kLine: 7.5, actualKs: 9, projectedKs: 6.0, v2ProjectedInnings: 6.1, seasonBattersFaced: 500, v2PitcherSkillRate: 0.3 },
  { kLine: 8.5, actualKs: 6, projectedKs: 7.0, v2ProjectedInnings: 6.0, seasonBattersFaced: 450, v2PitcherSkillRate: 0.31 },
  { kLine: 5.5, actualKs: 5, projectedKs: 5.5, v2ProjectedInnings: 4.8, seasonBattersFaced: 120, v2PitcherSkillRate: 0.22 },
];

test("candidateMetrics aggregates errors, dispersion and bucketed high-line behaviour", () => {
  const m = candidateMetrics(metricRows, "projectedKs");
  assert.equal(m.n, 4);
  // errors: -1, -3, +1, +0.5 -> MAE 1.375, signed -0.625
  assert.equal(m.mae, 1.375);
  assert.equal(m.signedError, -0.625);
  assert.equal(m.highLineN, 2);
  assert.equal(m.highLineSignedError, -1);
  assert.equal(m.line75N, 1);
  assert.equal(m.line75PctUnder, 100);
  assert.equal(m.line85N, 1);
  assert.equal(m.line85PctUnder, 100);
  assert.equal(m.pctAtLeast7, 25);
  assert.equal(m.pctAtLeast8, 0);
  assert.equal(m.lowMidLineN, 2);
});

test("candidateMetrics ignores rows whose projection is unavailable", () => {
  const withNull = [...metricRows, { kLine: 6.5, actualKs: 4, projectedKs: null }];
  assert.equal(candidateMetrics(withNull, "projectedKs").n, 4);
});

test("tallyDirection grades an exact-line outcome as a push, not a win", () => {
  const t = tallyDirection([{ kLine: 5, actualKs: 5, projectedKs: 6 }], "projectedKs");
  assert.equal(t.PUSH, 1);
  assert.equal(t.decided, 0);
  assert.equal(t.hitRate, null);
});

// -------------------------------- deterministic ranking --------------------------------

test("rankCandidates is deterministic and independent of input order", () => {
  const keys = [
    { key: "mae", direction: "asc" },
    { key: "highLineSignedError", direction: "desc" },
  ];
  const candidates = [
    { id: "b", mae: 1.8, highLineSignedError: -0.4 },
    { id: "a", mae: 1.8, highLineSignedError: -0.4 },
    { id: "c", mae: 1.7, highLineSignedError: -0.9 },
  ];
  const forward = rankCandidates(candidates, keys).map((entry) => entry.id);
  const reversed = rankCandidates([...candidates].reverse(), keys).map((entry) => entry.id);
  assert.deepEqual(forward, ["c", "a", "b"]);
  assert.deepEqual(forward, reversed, "ranking must not depend on input order");
});

test("rankCandidates sorts null metrics last rather than treating them as zero", () => {
  const ranked = rankCandidates(
    [
      { id: "missing", mae: null },
      { id: "worst", mae: 9 },
      { id: "best", mae: 1 },
    ],
    [{ key: "mae", direction: "asc" }],
  ).map((entry) => entry.id);
  assert.deepEqual(ranked, ["best", "worst", "missing"]);
});
