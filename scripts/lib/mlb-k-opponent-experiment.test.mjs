import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASELINE_CLAMP_ABS,
  BASELINE_MULTIPLIER,
  defaultGrid,
  reprojectRow,
} from "./mlb-k-opponent-experiment.mjs";

function row({ shrunk = 0.24, bf = 24, oppEnv = 0.25, league = 0.225 }) {
  return {
    v2: { pitcherSkillRateShrunk: shrunk, projectedBattersFaced: bf, opponentEnvironmentRate: oppEnv },
    inputs: { league: { kRate: league } },
  };
}

test("baseline params reproduce the V2.1 matchup formula", () => {
  const out = reprojectRow(row({ shrunk: 0.24, oppEnv: 0.25, league: 0.225 }), BASELINE_MULTIPLIER, BASELINE_CLAMP_ABS);
  // (0.25 - 0.225) * 0.45 = 0.01125
  assert.ok(Math.abs(out.matchupAdjustment - 0.01125) < 1e-12);
  assert.ok(Math.abs(out.projectedKRate - (0.24 + 0.01125)) < 1e-12);
  assert.ok(Math.abs(out.projectedStrikeouts - (0.24 + 0.01125) * 24) < 1e-12);
});

test("higher multiplier widens the opponent adjustment linearly", () => {
  const lo = reprojectRow(row({ oppEnv: 0.26, league: 0.22 }), 0.45, 0.2).matchupAdjustment;
  const hi = reprojectRow(row({ oppEnv: 0.26, league: 0.22 }), 0.9, 0.2).matchupAdjustment;
  assert.ok(Math.abs(hi - 2 * lo) < 1e-12);
});

test("clamp binds symmetrically and is reported", () => {
  const pos = reprojectRow(row({ oppEnv: 0.32, league: 0.22 }), 1.0, 0.035);
  assert.equal(pos.matchupAdjustment, 0.035);
  assert.equal(pos.clampHit, true);
  const neg = reprojectRow(row({ oppEnv: 0.12, league: 0.22 }), 1.0, 0.035);
  assert.equal(neg.matchupAdjustment, -0.035);
  assert.equal(neg.clampHit, true);
});

test("a wider clamp lets a mid-size raw adjustment through unclamped", () => {
  const tight = reprojectRow(row({ oppEnv: 0.29, league: 0.22 }), 1.0, 0.035);
  const wide = reprojectRow(row({ oppEnv: 0.29, league: 0.22 }), 1.0, 0.075);
  // raw = (0.29 - 0.22) * 1.0 = 0.07
  assert.equal(tight.clampHit, true);
  assert.equal(tight.matchupAdjustment, 0.035);
  assert.equal(wide.clampHit, false);
  assert.ok(Math.abs(wide.matchupAdjustment - 0.07) < 1e-12);
});

test("pitcher skill (shrunk) is used verbatim and not re-shrunk", () => {
  const out = reprojectRow(row({ shrunk: 0.315, oppEnv: 0.225, league: 0.225 }), 1.0, 0.075);
  assert.equal(out.matchupAdjustment, 0); // oppEnv == league
  assert.ok(Math.abs(out.projectedKRate - 0.315) < 1e-12);
});

test("projected K rate stays clamped to the V2 [0.10, 0.40] band", () => {
  const hi = reprojectRow(row({ shrunk: 0.39, oppEnv: 0.34, league: 0.22 }), 1.0, 0.075);
  assert.ok(hi.projectedKRate <= 0.4);
  const lo = reprojectRow(row({ shrunk: 0.11, oppEnv: 0.14, league: 0.22 }), 1.0, 0.075);
  assert.ok(lo.projectedKRate >= 0.1);
});

test("rows with no opponent environment are invariant across the grid", () => {
  const base = reprojectRow(row({ oppEnv: null }), 0.45, 0.035);
  const strong = reprojectRow(row({ oppEnv: null }), 1.0, 0.075);
  assert.equal(base.matchupAdjustment, null);
  assert.equal(base.projectedStrikeouts, strong.projectedStrikeouts);
});

test("missing shrunk skill or BF yields a null projection, never a throw", () => {
  assert.equal(reprojectRow(row({ shrunk: null }), 0.65, 0.055).projectedStrikeouts, null);
  assert.equal(reprojectRow(row({ bf: null }), 0.65, 0.055).projectedStrikeouts, null);
});

test("default grid leads with the exact V2.1 baseline and has no duplicates", () => {
  const grid = defaultGrid();
  assert.deepEqual(grid[0], { multiplier: 0.45, clampAbs: 0.035, arm: "baseline" });
  const keys = grid.map((g) => `${g.multiplier}|${g.clampAbs}`);
  assert.equal(new Set(keys).size, keys.length);
});
