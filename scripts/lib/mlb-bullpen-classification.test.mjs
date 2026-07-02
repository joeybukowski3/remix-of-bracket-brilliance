/**
 * mlb-bullpen-classification.test.mjs
 * Run via: node --test scripts/lib/mlb-bullpen-classification.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPitcherRole,
  buildRelieverPool,
  APPROXIMATION_METHOD,
} from "./mlb-bullpen-classification.mjs";

describe("classifyPitcherRole", () => {
  it("classifies a pure reliever (0 starts) as reliever", () => {
    assert.equal(classifyPitcherRole({ gamesStarted: 0, gamesPlayed: 42 }), "reliever");
  });

  it("excludes a full-time starter", () => {
    assert.equal(classifyPitcherRole({ gamesStarted: 15, gamesPlayed: 15 }), "excluded-starter-or-swingman");
  });

  it("excludes a swingman who both started and relieved", () => {
    assert.equal(classifyPitcherRole({ gamesStarted: 2, gamesPlayed: 20 }), "excluded-starter-or-swingman");
  });

  it("treats missing/null gamesStarted as missing-stats, not reliever", () => {
    assert.equal(classifyPitcherRole(null), "missing-stats");
    assert.equal(classifyPitcherRole(undefined), "missing-stats");
    assert.equal(classifyPitcherRole({ gamesStarted: null }), "missing-stats");
    assert.equal(classifyPitcherRole({}), "missing-stats");
    assert.equal(classifyPitcherRole({ gamesStarted: "N/A" }), "missing-stats");
  });
});

describe("buildRelieverPool", () => {
  const roster = [{ pitcherId: 1 }, { pitcherId: 2 }, { pitcherId: 3 }, { pitcherId: 4 }];

  it("splits roster into reliever / excluded / missing-stats buckets", () => {
    const seasonStats = new Map([
      [1, { gamesStarted: 0 }], // reliever
      [2, { gamesStarted: 0 }], // reliever
      [3, { gamesStarted: 12 }], // excluded (starter)
      // pitcher 4 has no stats entry at all -> missing-stats
    ]);
    const pool = buildRelieverPool(roster, seasonStats);
    assert.deepEqual(pool.relieverPitcherIds.sort(), [1, 2]);
    assert.deepEqual(pool.excludedPitcherIds, [3]);
    assert.deepEqual(pool.missingStatsPitcherIds, [4]);
    assert.equal(pool.rosterPitcherCount, 4);
    assert.equal(pool.approximationMethod, APPROXIMATION_METHOD);
  });

  it("excludes a swingman even though they also relieved", () => {
    const seasonStats = new Map([
      [1, { gamesStarted: 0 }],
      [2, { gamesStarted: 3 }], // swingman: 3 starts + relief outings elsewhere
    ]);
    const pool = buildRelieverPool([{ pitcherId: 1 }, { pitcherId: 2 }], seasonStats);
    assert.deepEqual(pool.relieverPitcherIds, [1]);
    assert.deepEqual(pool.excludedPitcherIds, [2]);
  });

  it("handles an empty roster", () => {
    const pool = buildRelieverPool([], new Map());
    assert.deepEqual(pool.relieverPitcherIds, []);
    assert.equal(pool.rosterPitcherCount, 0);
  });

  it("ignores malformed roster entries without a valid pitcherId", () => {
    const pool = buildRelieverPool([{ pitcherId: null }, { pitcherId: 5 }], new Map([[5, { gamesStarted: 0 }]]));
    assert.deepEqual(pool.relieverPitcherIds, [5]);
    assert.equal(pool.rosterPitcherCount, 2);
  });
});
