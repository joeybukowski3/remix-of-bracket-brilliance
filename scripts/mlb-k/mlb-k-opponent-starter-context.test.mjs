/**
 * mlb-k-opponent-starter-context.test.mjs
 * Run via: node --test scripts/mlb-k/mlb-k-opponent-starter-context.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildOpponentStarterContext,
  createStartLogBaselineResolver,
  assertNoLookahead,
  normalizePitcherKey,
  OPPONENT_CONTEXT_DEFAULTS,
} from "./mlb-k-opponent-starter-context.mjs";

/** Ten starters who all normally go 6 IP with 1.0 K/IP. */
const uniformBaseline = () => ({ ipPerStart: 6, kPerIP: 1, starts: 12 });

const observations = (rows) =>
  rows.map((row, index) => ({
    date: `2026-08-${String(10 + index).padStart(2, "0")}`,
    pitcherKey: `pitcher ${index}`,
    outs: row.outs,
    strikeouts: row.strikeouts,
  }));

const AS_OF = "2026-09-01";

describe("opponent starter context", () => {
  it("returns an exactly neutral result when there are no observations", () => {
    const context = buildOpponentStarterContext({
      observations: [],
      baselineFor: uniformBaseline,
      asOfDate: AS_OF,
    });
    assert.strictEqual(context.shrunkIpFactor, 1);
    assert.strictEqual(context.shrunkKRateFactor, 1);
    assert.strictEqual(context.confidence, 0);
    assert.ok(context.warnings.includes("NO_OPPONENT_OBSERVATIONS"));
  });

  it("returns neutral when no opposing starter has a usable baseline", () => {
    const context = buildOpponentStarterContext({
      observations: observations(Array.from({ length: 10 }, () => ({ outs: 12, strikeouts: 3 }))),
      baselineFor: () => null,
      asOfDate: AS_OF,
    });
    assert.strictEqual(context.shrunkIpFactor, 1);
    assert.strictEqual(context.shrunkKRateFactor, 1);
    assert.ok(context.warnings.includes("NO_USABLE_OPPONENT_OBSERVATIONS"));
  });

  it("detects innings suppression: starters going 4.0 against a 6.0 baseline", () => {
    const context = buildOpponentStarterContext({
      observations: observations(Array.from({ length: 10 }, () => ({ outs: 12, strikeouts: 6 }))),
      baselineFor: uniformBaseline,
      asOfDate: AS_OF,
    });
    assert.ok(context.rawIpFactor < 0.7, `raw ${context.rawIpFactor}`);
    assert.ok(context.shrunkIpFactor < 1, "suppression must lower the factor");
    assert.ok(context.shrunkIpFactor >= 1 - OPPONENT_CONTEXT_DEFAULTS.maxIpAdjustment - 1e-9);
  });

  it("detects innings enhancement: starters going 7.0 against a 6.0 baseline", () => {
    const context = buildOpponentStarterContext({
      observations: observations(Array.from({ length: 10 }, () => ({ outs: 21, strikeouts: 7 }))),
      baselineFor: uniformBaseline,
      asOfDate: AS_OF,
    });
    assert.ok(context.rawIpFactor > 1.1);
    assert.ok(context.shrunkIpFactor > 1, "enhancement must raise the factor");
  });

  it("measures strikeout suppression as a RATE, independent of innings", () => {
    // Same innings as baseline (6.0), but 0.7 K/IP instead of 1.0.
    const context = buildOpponentStarterContext({
      observations: observations(Array.from({ length: 10 }, () => ({ outs: 18, strikeouts: 4.2 }))),
      baselineFor: uniformBaseline,
      asOfDate: AS_OF,
    });
    assert.ok(Math.abs(context.rawIpFactor - 1) < 1e-6, "innings factor must stay neutral");
    assert.ok(context.rawKRateFactor < 0.75, `raw K ${context.rawKRateFactor}`);
    assert.ok(context.shrunkKRateFactor < 1);
  });

  it("does not let innings suppression leak into the strikeout factor", () => {
    // Half the innings, but the SAME 1.0 K/IP rate -> K factor must be neutral.
    const context = buildOpponentStarterContext({
      observations: observations(Array.from({ length: 10 }, () => ({ outs: 9, strikeouts: 3 }))),
      baselineFor: uniformBaseline,
      asOfDate: AS_OF,
    });
    assert.ok(context.rawIpFactor < 0.6, "innings clearly suppressed");
    assert.ok(Math.abs(context.rawKRateFactor - 1) < 1e-6, "K RATE must be unaffected");
  });

  it("shrinks a small sample harder than a large one", () => {
    const suppressed = (count) =>
      buildOpponentStarterContext({
        observations: observations(Array.from({ length: count }, () => ({ outs: 12, strikeouts: 4 }))),
        baselineFor: uniformBaseline,
        asOfDate: AS_OF,
      });
    const small = suppressed(2);
    const large = suppressed(10);
    assert.ok(large.confidence > small.confidence);
    assert.ok(small.shrunkIpFactor > large.shrunkIpFactor, "smaller sample must sit nearer 1.00");
  });

  it("caps an extreme factor at the configured maximum adjustment", () => {
    const context = buildOpponentStarterContext({
      // 1.0 IP against a 6.0 baseline is a ~0.35 ratio after clamping.
      observations: observations(Array.from({ length: 10 }, () => ({ outs: 3, strikeouts: 0 }))),
      baselineFor: () => ({ ipPerStart: 6, kPerIP: 1, starts: 30 }),
      asOfDate: AS_OF,
    });
    assert.ok(context.shrunkIpFactor >= 1 - OPPONENT_CONTEXT_DEFAULTS.maxIpAdjustment - 1e-9);
    assert.ok(context.shrunkKRateFactor >= 1 - OPPONENT_CONTEXT_DEFAULTS.maxKAdjustment - 1e-9);
  });

  it("excludes openers so their violent ratios cannot dominate", () => {
    const rows = observations([{ outs: 5, strikeouts: 2 }]);
    const context = buildOpponentStarterContext({
      observations: rows,
      baselineFor: () => ({ ipPerStart: 1.2, kPerIP: 0.9, starts: 6 }),
      asOfDate: AS_OF,
    });
    assert.strictEqual(context.usableGames, 0);
    assert.strictEqual(context.shrunkIpFactor, 1);
  });

  it("rejects an observation dated on or after the slate (look-ahead)", () => {
    assert.throws(
      () => assertNoLookahead([{ date: "2026-09-01" }], "2026-09-01"),
      /not strictly before/,
    );
    assert.throws(() => assertNoLookahead([{ date: "2026-09-05" }], "2026-09-01"), /not strictly before/);
    assert.ok(assertNoLookahead([{ date: "2026-08-31" }], "2026-09-01"));
  });

  it("silently ignores observations from the slate date onward", () => {
    const context = buildOpponentStarterContext({
      observations: [
        { date: "2026-09-02", pitcherKey: "future guy", outs: 3, strikeouts: 0 },
        { date: "2026-08-20", pitcherKey: "past guy", outs: 12, strikeouts: 4 },
      ],
      baselineFor: uniformBaseline,
      asOfDate: "2026-09-01",
    });
    assert.strictEqual(context.usableGames, 1);
    assert.strictEqual(context.observations[0].date, "2026-08-20");
  });

  it("is deterministic across repeated calls and input orderings", () => {
    const rows = observations([
      { outs: 12, strikeouts: 4 },
      { outs: 18, strikeouts: 7 },
      { outs: 15, strikeouts: 5 },
      { outs: 21, strikeouts: 9 },
      { outs: 9, strikeouts: 2 },
    ]);
    const a = buildOpponentStarterContext({ observations: rows, baselineFor: uniformBaseline, asOfDate: AS_OF });
    const b = buildOpponentStarterContext({ observations: [...rows].reverse(), baselineFor: uniformBaseline, asOfDate: AS_OF });
    assert.deepStrictEqual(a.shrunkIpFactor, b.shrunkIpFactor);
    assert.deepStrictEqual(a.shrunkKRateFactor, b.shrunkKRateFactor);
  });
});

describe("start-log baseline resolver", () => {
  const log = [
    { date: "2026-07-01", pitcher: "Sample Arm", outs: 18, strikeouts: 6, opponent: "MIN" },
    { date: "2026-07-08", pitcher: "Sample Arm", outs: 18, strikeouts: 6, opponent: "CLE" },
    { date: "2026-07-15", pitcher: "Sample Arm", outs: 12, strikeouts: 2, opponent: "MIN" },
    { date: "2026-07-22", pitcher: "Sample Arm", outs: 21, strikeouts: 9, opponent: "DET" },
  ].map((row) => ({ ...row, pitcherKey: normalizePitcherKey(row.pitcher) }));

  it("uses only starts strictly before the requested date", () => {
    const resolve = createStartLogBaselineResolver(log);
    assert.strictEqual(resolve("sample arm", "2026-07-01"), null, "nothing precedes the first start");
    const asOfJul16 = resolve("sample arm", "2026-07-16");
    assert.strictEqual(asOfJul16.starts, 3);
    const asOfEnd = resolve("sample arm", "2026-08-01");
    assert.strictEqual(asOfEnd.starts, 4);
  });

  it("excludes starts against the opponent being measured", () => {
    const resolve = createStartLogBaselineResolver(log, { excludeOpponent: "MIN" });
    const baseline = resolve("sample arm", "2026-08-01");
    assert.strictEqual(baseline.starts, 2, "both MIN starts must be excluded");
    assert.strictEqual(baseline.innings, 13, "6.0 + 7.0 innings");
  });

  it("computes K/IP as totals over totals, not a mean of per-start rates", () => {
    const resolve = createStartLogBaselineResolver(log);
    const baseline = resolve("sample arm", "2026-08-01");
    // 23 K over 23 IP
    assert.ok(Math.abs(baseline.kPerIP - 1) < 1e-9);
  });

  it("returns null for an unknown pitcher rather than a fabricated baseline", () => {
    const resolve = createStartLogBaselineResolver(log);
    assert.strictEqual(resolve("nobody at all", "2026-08-01"), null);
  });
});
