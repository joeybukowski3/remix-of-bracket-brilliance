/**
 * RESEARCH ONLY -- tests for the workload-dispersion estimators.
 * Run with: node --test scripts/research/lib/mlb-k-workload-estimators.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BF_CANDIDATES,
  BF_ESTIMATORS,
  IP_ESTIMATORS,
  STARTER_BF_MAX,
  STARTER_BF_MIN,
  ewmaMean,
  excludeShortStarts,
  expectedKsOverWorkload,
  flagShortStarts,
  recencyWeightedMean,
  robustShortStartBf,
  sampleSizeBlendBf,
  seasonBfPerStart,
  seasonBlendBf,
  shrunkWorkloadSd,
  startSeries,
  trimmedMean,
  volatilityWeightedBf,
  winsorizedMean,
} from "./mlb-k-workload-estimators.mjs";

import { assertTemporalOrder, rollingOriginFolds, temporalSplit } from "./mlb-k-shrinkage-helpers.mjs";
import { classifyRow, partitionByOutcomeValidity } from "./mlb-k-outcome-validity.mjs";
import { filterLeakageSafe } from "./mlb-k-research-helpers.mjs";

const ARCHIVE = path.join(
  process.cwd(),
  "data",
  "mlb",
  "k-research",
  "high-line-calibration",
  "pregame-archive.json",
);

/** Fixed expectation, so a silent archive change is caught rather than absorbed. */
const CLEAN_LINE_BUCKET_COUNTS = { "<=3.5": 251, "4.5": 336, "5.5": 213, "6.5": 92, "7.5": 41, "8.5+": 11 };

const cleanRows = () => {
  const archive = JSON.parse(readFileSync(ARCHIVE, "utf8"));
  return partitionByOutcomeValidity(filterLeakageSafe(archive.rows), { classify: classifyRow }).kept;
};

// --------------------------------- series extraction ---------------------------------

test("startSeries reads newest first and drops non-positive placeholder readings", () => {
  const row = {
    recentStarts: [
      { bf: 24, ip: 6 },
      { bf: 0, ip: 5 },
      { bf: 19, ip: 4 },
      { bf: null, ip: 6 },
      { bf: 22, ip: 7 },
    ],
  };
  assert.deepEqual(startSeries(row, "bf", 5), [24, 19, 22]);
  assert.deepEqual(startSeries(row, "bf", 2), [24]);
  assert.deepEqual(startSeries({}, "bf"), []);
});

test("recency weighting puts the most weight on the newest start", () => {
  // Newest first: weights 3, 2, 1 over [30, 0, 0] -> 30 * 3/6 = 15.
  assert.equal(recencyWeightedMean([30, 0, 0]), 15);
  assert.equal(recencyWeightedMean([0, 0, 30]), 5);
  assert.equal(recencyWeightedMean([]), null);
  // A flat series is unchanged by any weighting.
  assert.equal(recencyWeightedMean([22, 22, 22]), 22);
});

test("EWMA decays with half-life and reduces to the value for a single start", () => {
  assert.equal(ewmaMean([20]), 20);
  assert.ok(Math.abs(ewmaMean([22, 22, 22, 22]) - 22) < 1e-12, "a flat series is unchanged by any decay");
  const recentHeavy = ewmaMean([30, 10, 10], { halfLife: 1 });
  const evenlyWeighted = (30 + 10 + 10) / 3;
  assert.ok(recentHeavy > evenlyWeighted, "a short half-life must favour the newest start");
});

// --------------------------------- robust estimators ---------------------------------

test("trimmed and winsorized means resist a single extreme low reading", () => {
  const series = [24, 23, 25, 22, 4];
  const plain = (24 + 23 + 25 + 22 + 4) / 5;
  assert.ok(trimmedMean(series, { trim: 0.2 }) > plain);
  assert.ok(winsorizedMean(series, { limit: 0.2 }) > plain);
  // Winsorizing keeps every observation, so it moves less than trimming.
  assert.ok(winsorizedMean(series, { limit: 0.2 }) <= trimmedMean(series, { trim: 0.2 }));
});

test("short-start flagging judges a start against the OTHER starts, not itself", () => {
  assert.deepEqual(flagShortStarts([5, 24, 23, 25, 22]), [true, false, false, false, false]);
  // A uniformly short pitcher has no short start: nothing is anomalous.
  assert.deepEqual(flagShortStarts([5, 5, 5, 5, 5]), [false, false, false, false, false]);
});

test("short-start exclusion never empties the series", () => {
  assert.deepEqual(excludeShortStarts([5, 24, 23, 25, 22]), [24, 23, 25, 22]);
  assert.deepEqual(excludeShortStarts([12, 12, 12]), [12, 12, 12]);
  // Too few other starts to judge against: nothing is excluded.
  assert.deepEqual(excludeShortStarts([4, 24, 23]), [4, 24, 23]);
});

test("short-start exclusion is a no-op when no start is anomalous", () => {
  const series = [24, 23, 25, 22, 24];
  assert.deepEqual(excludeShortStarts(series), series);
  assert.equal(robustShortStartBf({ v2ProjectedBF: 23, recentStarts: series.map((bf) => ({ bf })) }), 23);
});

// ------------------------------- candidate variants -------------------------------

test("every BF candidate respects the production starter clamp", () => {
  const extreme = {
    v2ProjectedBF: 29.5,
    seasonBattersFaced: 900,
    seasonGamesStarted: 5,
    recentStarts: [{ bf: 40 }, { bf: 41 }, { bf: 39 }, { bf: 42 }, { bf: 40 }],
  };
  for (const [name, estimator] of Object.entries(BF_CANDIDATES)) {
    const value = estimator(extreme);
    if (value === null) continue;
    assert.ok(value >= STARTER_BF_MIN && value <= STARTER_BF_MAX, `${name} escaped the clamp with ${value}`);
  }
});

test("candidates fail closed to the production projection when their inputs are missing", () => {
  const bare = { v2ProjectedBF: 22.5 };
  assert.equal(robustShortStartBf(bare), 22.5);
  assert.equal(seasonBlendBf(bare, { weight: 0.5 }), 22.5);
  assert.equal(volatilityWeightedBf(bare), 22.5);
  assert.equal(sampleSizeBlendBf(bare), 22.5);
  // No production projection at all means no candidate projection.
  assert.equal(robustShortStartBf({}), null);
  assert.equal(seasonBlendBf({}), null);
});

test("season blend interpolates between the projection and season BF per start", () => {
  const row = { v2ProjectedBF: 20, seasonBattersFaced: 240, seasonGamesStarted: 10 };
  assert.equal(seasonBfPerStart(row), 24);
  assert.equal(seasonBlendBf(row, { weight: 0 }), 20);
  assert.equal(seasonBlendBf(row, { weight: 0.5 }), 22);
  assert.equal(seasonBlendBf(row, { weight: 1 }), 24);
  assert.equal(seasonBfPerStart({ seasonBattersFaced: 240, seasonGamesStarted: 0 }), null);
});

test("sample-size blend leans on season BF only as starts accumulate", () => {
  const few = { v2ProjectedBF: 20, seasonBattersFaced: 48, seasonGamesStarted: 2 };
  const many = { v2ProjectedBF: 20, seasonBattersFaced: 720, seasonGamesStarted: 30 };
  // Both have season BF/start of 24, so the blend weight is the only difference.
  assert.ok(sampleSizeBlendBf(few) < sampleSizeBlendBf(many));
  assert.ok(sampleSizeBlendBf(many) > 22);
});

test("volatility weighting moves toward the recent mean only when starts are stable", () => {
  const stable = {
    v2ProjectedBF: 20,
    recentStarts: [{ bf: 24 }, { bf: 24 }, { bf: 24 }, { bf: 24 }, { bf: 24 }],
  };
  const volatile = {
    v2ProjectedBF: 20,
    recentStarts: [{ bf: 30 }, { bf: 12 }, { bf: 28 }, { bf: 14 }, { bf: 26 }],
  };
  assert.ok(volatilityWeightedBf(stable) > 20, "stable workload should pull toward the recent mean");
  assert.ok(
    Math.abs(volatilityWeightedBf(volatile) - 20) < Math.abs(volatilityWeightedBf(stable) - 20),
    "volatile workload should stay closer to the production projection",
  );
});

// ----------------------------- probabilistic workload -----------------------------

test("integrating over workload uncertainty cannot move an unclamped expected-K estimate", () => {
  // E[rate * BF] = rate * E[BF]: the workload spread cancels exactly.
  const point = 0.25 * 22;
  for (const workloadSd of [0, 1, 2, 4]) {
    const integrated = expectedKsOverWorkload({
      kRate: 0.25,
      expectedBf: 22,
      workloadSd,
      clampBf: false,
    });
    assert.ok(Math.abs(integrated - point) < 1e-12, `sd ${workloadSd} moved the central estimate`);
  }
});

test("the only movement from integration comes from the starter BF clamp", () => {
  // Centred well inside the clamp: no truncation, no movement.
  const inside = expectedKsOverWorkload({ kRate: 0.25, expectedBf: 21, workloadSd: 1, clampBf: true });
  assert.ok(Math.abs(inside - 0.25 * 21) < 1e-12);
  // Centred near the floor: the lower nodes are truncated upward.
  const nearFloor = expectedKsOverWorkload({ kRate: 0.25, expectedBf: 13, workloadSd: 4, clampBf: true });
  assert.ok(nearFloor > 0.25 * 13);
});

test("shrunk workload SD falls back to the league SD when a pitcher has no readings", () => {
  assert.equal(shrunkWorkloadSd({ recentStarts: [] }, { leagueSd: 3 }), 3);
  const own = shrunkWorkloadSd(
    { recentStarts: [{ bf: 24 }, { bf: 24 }, { bf: 24 }, { bf: 24 }, { bf: 24 }] },
    { leagueSd: 3, k: 3 },
  );
  // A perfectly stable pitcher shrinks toward, but not all the way to, the league.
  assert.ok(own > 0 && own < 3);
});

// -------------------------------- leakage guards --------------------------------

const OUTCOME_FIELDS = ["actualKs", "actualBF", "actualIP", "actualOuts", "actualPitches"];
const MARKET_FIELDS = ["kLine", "oddsOver", "oddsUnder", "book"];

test("no workload estimator or candidate reads an outcome or the market line", () => {
  const row = {
    v2ProjectedBF: 22.5,
    v2ProjectedInnings: 5.4,
    seasonBattersFaced: 480,
    seasonGamesStarted: 20,
    recentStarts: [{ bf: 24, ip: 6 }, { bf: 23, ip: 6 }, { bf: 25, ip: 7 }, { bf: 22, ip: 5 }, { bf: 24, ip: 6 }],
  };
  const touched = new Set();
  const spy = new Proxy(
    { ...row, ...Object.fromEntries([...OUTCOME_FIELDS, ...MARKET_FIELDS].map((key) => [key, 99])) },
    {
      get(target, property) {
        if (typeof property === "string") touched.add(property);
        return target[property];
      },
    },
  );

  for (const estimator of [
    ...Object.values(BF_ESTIMATORS),
    ...Object.values(IP_ESTIMATORS),
    ...Object.values(BF_CANDIDATES),
  ]) {
    estimator(spy);
  }

  for (const field of [...OUTCOME_FIELDS, ...MARKET_FIELDS]) {
    assert.ok(!touched.has(field), `an estimator read the forbidden field ${field}`);
  }
});

test("estimators are pure: the same row yields the same value every time", () => {
  const rows = cleanRows().slice(0, 200);
  for (const [name, estimator] of Object.entries({ ...BF_ESTIMATORS, ...BF_CANDIDATES })) {
    for (const row of rows) {
      const first = estimator(row);
      const second = estimator(row);
      assert.equal(first, second, `${name} is not deterministic`);
    }
  }
});

// ------------------------------ temporal-split guards ------------------------------

test("the clean archive splits by date with no slate straddling the boundary", () => {
  const rows = cleanRows();
  const split = temporalSplit(rows, { devFraction: 0.6 });
  assert.ok(assertTemporalOrder(split.development, split.validation).ok);
  assert.equal(split.development.length + split.validation.length, rows.length);
  const devDates = new Set(split.development.map((row) => row.slateDate));
  for (const row of split.validation) {
    assert.ok(!devDates.has(row.slateDate), `slate ${row.slateDate} appears on both sides`);
  }
});

test("rolling-origin folds on the clean archive never score a slate at or before training", () => {
  const folds = rollingOriginFolds(cleanRows(), { folds: 4, minTrainDates: 20 });
  assert.ok(folds.length >= 1);
  for (const fold of folds) {
    const order = assertTemporalOrder(fold.train, fold.test);
    assert.ok(order.ok, `fold ${fold.fold} leaked ${order.violations.join(", ")}`);
  }
});

// ------------------------------ bucket determinism ------------------------------

test("line bucketing of the clean archive is stable under row reordering", () => {
  const rows = cleanRows();
  const bucketOf = (row) =>
    row.kLine <= 3.5 ? "<=3.5" : row.kLine <= 4.5 ? "4.5" : row.kLine <= 5.5 ? "5.5" : row.kLine <= 6.5 ? "6.5" : row.kLine <= 7.5 ? "7.5" : "8.5+";
  const tally = (list) => {
    const counts = {};
    for (const row of list) counts[bucketOf(row)] = (counts[bucketOf(row)] ?? 0) + 1;
    return counts;
  };
  assert.deepEqual(tally(rows), tally([...rows].reverse()));
  assert.deepEqual(tally(rows), CLEAN_LINE_BUCKET_COUNTS);
  assert.equal(Object.values(CLEAN_LINE_BUCKET_COUNTS).reduce((a, b) => a + b, 0), rows.length);
});
