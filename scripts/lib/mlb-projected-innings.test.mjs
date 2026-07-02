/**
 * mlb-projected-innings.test.mjs
 * Run via: node --test scripts/lib/mlb-projected-innings.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROJECTED_INNINGS_BOUNDS,
  classifyPitcherRole,
  getAverageIPForRole,
  hasRealProjectedInningsData,
  calculateProjectedInnings,
  parseInningsPitchedString,
} from "./mlb-projected-innings.mjs";

describe("classifyPitcherRole", () => {
  it("classifies seasonGS === 0 as reliever", () => {
    assert.equal(classifyPitcherRole({ seasonGS: 0 }), "reliever");
  });

  it("classifies any positive seasonGS as starter", () => {
    assert.equal(classifyPitcherRole({ seasonGS: 1 }), "starter");
    assert.equal(classifyPitcherRole({ seasonGS: 30 }), "starter");
  });

  it("defaults to starter when seasonGS is missing", () => {
    assert.equal(classifyPitcherRole({}), "starter");
    assert.equal(classifyPitcherRole({ seasonGS: null }), "starter");
  });
});

describe("hasRealProjectedInningsData", () => {
  it("true when both seasonIP and positive seasonGS present", () => {
    assert.equal(hasRealProjectedInningsData({ seasonIP: 120, seasonGS: 20 }), true);
  });

  it("false when seasonGS is 0 (would divide by zero)", () => {
    assert.equal(hasRealProjectedInningsData({ seasonIP: 40, seasonGS: 0 }), false);
  });

  it("false when either field is missing", () => {
    assert.equal(hasRealProjectedInningsData({ seasonIP: 120 }), false);
    assert.equal(hasRealProjectedInningsData({ seasonGS: 20 }), false);
    assert.equal(hasRealProjectedInningsData({}), false);
  });
});

describe("calculateProjectedInnings", () => {
  it("typical starter scenario: real season data within bounds", () => {
    // 180 IP / 30 GS = 6.0 avg
    const result = calculateProjectedInnings({ seasonIP: 180, seasonGS: 30 });
    assert.equal(result, 6.0);
  });

  it("workhorse scenario: clamps to starter max (8.0)", () => {
    // 200 IP / 20 GS = 10.0 avg, should clamp to 8.0
    const result = calculateProjectedInnings({ seasonIP: 200, seasonGS: 20 });
    assert.equal(result, PROJECTED_INNINGS_BOUNDS.starter.max);
  });

  it("short-stint starter clamps to starter min (3.0), not treated as reliever", () => {
    // 20 IP / 15 GS ~= 1.33 avg -- still classified as starter (GS > 0),
    // clamped up to the starter floor rather than dropping to reliever range
    const result = calculateProjectedInnings({ seasonIP: 20, seasonGS: 15 });
    assert.equal(result, PROJECTED_INNINGS_BOUNDS.starter.min);
  });

  it("opener/reliever scenario: seasonGS === 0 uses reliever bounds", () => {
    // 25 IP / 0 GS is impossible to average -- falls back to reliever default
    const result = calculateProjectedInnings({ seasonIP: 25, seasonGS: 0 });
    assert.equal(result, PROJECTED_INNINGS_BOUNDS.reliever.roleDefault);
  });

  it("reliever with real appearance data clamps within reliever bounds", () => {
    // Not directly reachable via seasonGS (0 GS blocks the real-data branch
    // by hasRealProjectedInningsData), so this exercises the default path.
    const result = calculateProjectedInnings({ seasonIP: 60, seasonGS: 0 });
    assert.ok(result >= PROJECTED_INNINGS_BOUNDS.reliever.min);
    assert.ok(result <= PROJECTED_INNINGS_BOUNDS.reliever.max);
  });

  it("missing-data scenario: no seasonIP/seasonGS falls back to starter role default", () => {
    const result = calculateProjectedInnings({});
    assert.equal(result, PROJECTED_INNINGS_BOUNDS.starter.roleDefault);
  });

  it("missing-data scenario: seasonGS present but seasonIP missing falls back", () => {
    const result = calculateProjectedInnings({ seasonGS: 20 });
    assert.equal(result, PROJECTED_INNINGS_BOUNDS.starter.roleDefault);
  });

  it("score-bound test: result is always within [reliever.min, starter.max] regardless of input", () => {
    const cases = [
      { seasonIP: 0.1, seasonGS: 1 },
      { seasonIP: 999, seasonGS: 1 },
      { seasonIP: 1, seasonGS: 999 },
      {},
      { seasonGS: 0 },
    ];
    for (const pitcher of cases) {
      const result = calculateProjectedInnings(pitcher);
      assert.ok(Number.isFinite(result), `expected finite result for ${JSON.stringify(pitcher)}`);
      assert.ok(result >= PROJECTED_INNINGS_BOUNDS.reliever.min);
      assert.ok(result <= PROJECTED_INNINGS_BOUNDS.starter.max);
    }
  });
});

describe("getAverageIPForRole", () => {
  it("returns role defaults", () => {
    assert.equal(getAverageIPForRole("starter"), PROJECTED_INNINGS_BOUNDS.starter.roleDefault);
    assert.equal(getAverageIPForRole("reliever"), PROJECTED_INNINGS_BOUNDS.reliever.roleDefault);
  });

  it("falls back to starter default for an unrecognized role", () => {
    assert.equal(getAverageIPForRole("unknown"), PROJECTED_INNINGS_BOUNDS.starter.roleDefault);
  });
});

describe("parseInningsPitchedString", () => {
  it("parses whole innings", () => {
    assert.equal(parseInningsPitchedString("142"), 142);
  });

  it("parses partial innings as outs (.1 = 1/3, .2 = 2/3)", () => {
    assert.equal(Math.round(parseInningsPitchedString("142.1") * 3) / 3, 142 + 1 / 3);
    assert.equal(Math.round(parseInningsPitchedString("142.2") * 3) / 3, 142 + 2 / 3);
  });

  it("returns null for null/undefined input", () => {
    assert.equal(parseInningsPitchedString(null), null);
    assert.equal(parseInningsPitchedString(undefined), null);
  });

  it("returns null for non-numeric input", () => {
    assert.equal(parseInningsPitchedString("abc"), null);
  });

  it("accepts numeric input", () => {
    assert.equal(parseInningsPitchedString(142), 142);
  });
});
