import assert from "node:assert/strict";
import { test } from "node:test";

import { shrinkRow, DEFAULT_ALPHA_GRID } from "./mlb-k-shrinkage-experiment.mjs";

function row({ skill, bf = 24, matchup = null, league = 0.225 }) {
  return {
    v2: { pitcherSkillRate: skill, projectedBattersFaced: bf, matchupAdjustment: matchup },
    inputs: { league: { kRate: league } },
  };
}

test("alpha = 1 is an identity on the skill term", () => {
  const out = shrinkRow(row({ skill: 0.30 }), 1.0);
  assert.equal(out.skillAdjusted, 0.30);
  assert.ok(Math.abs(out.projectedStrikeouts - 0.30 * 24) < 1e-12);
});

test("alpha < 1 pulls the skill term toward the contemporaneous league rate", () => {
  const out = shrinkRow(row({ skill: 0.30, league: 0.22 }), 0.6);
  // 0.22 + 0.6 * (0.30 - 0.22) = 0.268
  assert.ok(Math.abs(out.skillAdjusted - 0.268) < 1e-12);
});

test("shrinkage narrows the spread symmetrically for above/below league pitchers", () => {
  const league = 0.22;
  const high = shrinkRow(row({ skill: 0.32, league }), 0.5).skillAdjusted;
  const low = shrinkRow(row({ skill: 0.12, league }), 0.5).skillAdjusted;
  assert.ok(Math.abs((high - league) - (league - low)) < 1e-12);
  assert.ok(high - low < 0.32 - 0.12);
});

test("matchup adjustment is preserved verbatim and added after shrink", () => {
  const out = shrinkRow(row({ skill: 0.30, league: 0.22, matchup: 0.01 }), 0.5);
  assert.ok(Math.abs(out.projectedKRate - (0.22 + 0.5 * 0.08 + 0.01)) < 1e-12);
});

test("projected K rate stays clamped to the V2 [0.1, 0.4] band", () => {
  const hi = shrinkRow(row({ skill: 0.39, league: 0.5, matchup: 0.03 }), 1.0);
  assert.ok(hi.projectedKRate <= 0.4);
  assert.equal(hi.clampBound, "max");
  const lo = shrinkRow(row({ skill: 0.05, league: 0.05, matchup: -0.03 }), 1.0);
  assert.ok(lo.projectedKRate >= 0.1);
  assert.equal(lo.clampBound, "min");
});

test("missing skill or batters-faced yields a null projection, never a throw", () => {
  assert.equal(shrinkRow(row({ skill: null }), 0.8).projectedStrikeouts, null);
  assert.equal(shrinkRow(row({ skill: 0.25, bf: null }), 0.8).projectedStrikeouts, null);
});

test("league K rate falls back to the V2 default when the row has none", () => {
  const out = shrinkRow({ v2: { pitcherSkillRate: 0.3, projectedBattersFaced: 24 }, inputs: { league: {} } }, 0.5);
  assert.equal(out.leagueKRate, 0.225);
});

test("default alpha grid leads with the untouched baseline", () => {
  assert.equal(DEFAULT_ALPHA_GRID[0], 1.0);
});
