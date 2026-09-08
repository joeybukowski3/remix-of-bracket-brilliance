/**
 * mlb-k-projection-v4-core.test.mjs
 * Run via: node --test scripts/mlb-k/mlb-k-projection-v4-core.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  projectInningsV4,
  projectKPerInningV4,
  projectStrikeoutsV4,
  offensiveStrengthIndex,
  V4_DEFAULTS,
  K_PROJECTION_V4_MODEL_VERSION,
} from "./mlb-k-projection-v4-core.mjs";
import { computeKProjectionV4, declineV4 } from "./compute-k-projection-v4.mjs";
import { buildLeagueStarterIndex, leagueStarterLevelsAsOf } from "./mlb-k-league-starter-index.mjs";

/** A well-established, league-average-ish starter. */
const BASE = {
  seasonIPPerStart: 6,
  last10IPPerStart: 6,
  last5IPPerStart: 6,
  seasonGamesStarted: 25,
  seasonKPerIP: 1,
  last10KPerIP: 1,
  last5KPerIP: 1,
  seasonInnings: 150,
  leagueIPPerStart: 5,
  leagueKPerIP: 0.91,
  leagueKRate: 0.2187,
  bfPerIP: 4.2,
  opponentIPFactor: 1,
  opponentKRateFactor: 1,
  opponentKRateVsHand: 0.2187,
  opponentRecentKRate: 0.2187,
  offensiveStrengthIndex: 0,
  opponentConfidence: 0.6,
};

describe("V4 innings model", () => {
  it("keeps SEASON as the dominant anchor", () => {
    // Season 6.0, both recent windows 4.0. A 0.55 season weight must keep the
    // blend nearer season than recent.
    const out = projectInningsV4({ ...BASE, last10IPPerStart: 4, last5IPPerStart: 4 });
    assert.ok(out.neutralPitcherIP > 5.0, `neutral ${out.neutralPitcherIP} should stay above the midpoint`);
    assert.ok(out.neutralPitcherIP < 6, "recent form must still move it");
  });

  it("lets recent form move the projection but never replace it", () => {
    const hot = projectInningsV4({ ...BASE, last10IPPerStart: 9, last5IPPerStart: 9 });
    const cold = projectInningsV4({ ...BASE, last10IPPerStart: 2, last5IPPerStart: 2 });
    // The +/- cap on the recent blend bounds the move at recentFormIPCap.
    assert.ok(hot.neutralPitcherIP <= 6 + V4_DEFAULTS.recentFormIPCap + 1e-9);
    assert.ok(cold.neutralPitcherIP >= 6 - V4_DEFAULTS.recentFormIPCap - 1e-9);
    assert.ok(hot.warnings.includes("RECENT_FORM_IP_CAPPED"));
    assert.ok(cold.warnings.includes("RECENT_FORM_IP_CAPPED"));
  });

  it("lowers projected innings when the opponent suppresses starter workload", () => {
    const neutral = projectInningsV4(BASE);
    const suppressed = projectInningsV4({ ...BASE, opponentIPFactor: 0.88 });
    assert.ok(suppressed.finalProjectedIP < neutral.finalProjectedIP);
  });

  it("raises projected innings when the opponent lets starters go deeper", () => {
    const neutral = projectInningsV4(BASE);
    const enhanced = projectInningsV4({ ...BASE, opponentIPFactor: 1.12 });
    assert.ok(enhanced.finalProjectedIP > neutral.finalProjectedIP);
  });

  it("regresses a thin-sample starter toward the league level", () => {
    const thin = projectInningsV4({ ...BASE, seasonGamesStarted: 2 });
    const deep = projectInningsV4({ ...BASE, seasonGamesStarted: 30 });
    assert.ok(thin.finalProjectedIP < deep.finalProjectedIP, "thin sample pulled toward league 5.0");
    assert.ok(thin.warnings.includes("THIN_STARTER_SAMPLE"));
  });

  it("applies only a small wRC+ effect, and in the suppressing direction", () => {
    const neutral = projectInningsV4(BASE);
    const strong = projectInningsV4({ ...BASE, offensiveStrengthIndex: 1 });
    const weak = projectInningsV4({ ...BASE, offensiveStrengthIndex: -1 });
    assert.ok(strong.finalProjectedIP < neutral.finalProjectedIP);
    assert.ok(weak.finalProjectedIP > neutral.finalProjectedIP);
    const swing = (weak.finalProjectedIP - strong.finalProjectedIP) / neutral.finalProjectedIP;
    assert.ok(swing <= 2 * V4_DEFAULTS.wrcIpScale + 1e-6, `wRC+ swing ${swing} must stay small`);
  });
});

describe("V4 strikeouts-per-inning model", () => {
  it("keeps SEASON as the dominant anchor", () => {
    const out = projectKPerInningV4({ ...BASE, last10KPerIP: 0.6, last5KPerIP: 0.6 });
    assert.ok(out.neutralPitcherKPerIP > 0.8, `neutral ${out.neutralPitcherKPerIP}`);
    assert.ok(out.neutralPitcherKPerIP < 1);
  });

  it("caps how far recent strikeout form can pull the anchor", () => {
    const cold = projectKPerInningV4({ ...BASE, last10KPerIP: 0.2, last5KPerIP: 0.2 });
    assert.ok(cold.neutralPitcherKPerIP >= 1 - V4_DEFAULTS.recentFormKCap - 1e-9);
    assert.ok(cold.warnings.includes("RECENT_FORM_K_CAPPED"));
  });

  it("lowers K/IP when the opponent suppresses starter strikeout rate", () => {
    const neutral = projectKPerInningV4(BASE);
    const suppressed = projectKPerInningV4({ ...BASE, opponentKRateFactor: 0.88 });
    assert.ok(suppressed.finalProjectedKPerIP < neutral.finalProjectedKPerIP);
    assert.ok(suppressed.opponentKEnvironment < 0);
  });

  it("raises K/IP when the opponent inflates starter strikeout rate", () => {
    const neutral = projectKPerInningV4(BASE);
    const enhanced = projectKPerInningV4({ ...BASE, opponentKRateFactor: 1.12 });
    assert.ok(enhanced.finalProjectedKPerIP > neutral.finalProjectedKPerIP);
  });

  it("adjusts for opponent K% versus this handedness", () => {
    const contact = projectKPerInningV4({ ...BASE, opponentKRateVsHand: 0.18 });
    const whiffy = projectKPerInningV4({ ...BASE, opponentKRateVsHand: 0.26 });
    assert.ok(contact.finalProjectedKPerIP < whiffy.finalProjectedKPerIP);
  });

  it("caps the combined opponent strikeout environment", () => {
    const extreme = projectKPerInningV4({
      ...BASE,
      opponentKRateFactor: 0.5,
      opponentKRateVsHand: 0.10,
      opponentRecentKRate: 0.10,
    });
    assert.ok(extreme.opponentKEnvironment >= -V4_DEFAULTS.maxOpponentKEnvironmentAdjustment - 1e-9);
    assert.ok(extreme.warnings.includes("OPPONENT_K_ENVIRONMENT_CAPPED"));
  });

  it("does not let three correlated opponent signals stack multiplicatively", () => {
    // Each signal alone is -12%; multiplied that would be about -30%.
    const combined = projectKPerInningV4({
      ...BASE,
      opponentKRateFactor: 0.88,
      opponentKRateVsHand: 0.2187 * 0.88,
      opponentRecentKRate: 0.2187 * 0.88,
    });
    assert.ok(combined.opponentKEnvironment >= -0.13, `env ${combined.opponentKEnvironment} must not compound`);
  });

  it("pulls the environment toward neutral when signals are missing", () => {
    const full = projectKPerInningV4({ ...BASE, opponentKRateFactor: 0.85 });
    const partial = projectKPerInningV4({
      ...BASE,
      opponentKRateFactor: 0.85,
      opponentKRateVsHand: null,
      opponentRecentKRate: null,
    });
    assert.ok(Math.abs(partial.opponentKEnvironment) < Math.abs(full.opponentKEnvironment) + 1e-9);
    assert.ok(partial.warnings.includes("OPPONENT_HAND_K_RATE_UNAVAILABLE"));
  });
});

describe("V4 composition and safety", () => {
  it("projects Ks as innings x strikeouts-per-inning", () => {
    const out = projectStrikeoutsV4(BASE);
    // Published fields are rounded (Ks to 3dp, components to 4dp), so compare
    // within that rounding rather than to exact float equality.
    assert.ok(Math.abs(out.projectedKs - out.finalProjectedIP * out.finalProjectedKPerIP) < 2e-3);
    assert.strictEqual(out.modelVersion, K_PROJECTION_V4_MODEL_VERSION);
  });

  it("is deterministic", () => {
    const a = projectStrikeoutsV4(BASE);
    const b = projectStrikeoutsV4({ ...BASE });
    assert.deepStrictEqual(a, b);
  });

  it("NEVER reads a sportsbook line or price", () => {
    const clean = projectStrikeoutsV4(BASE);
    const polluted = projectStrikeoutsV4({
      ...BASE,
      kLine: 4.5,
      oddsOver: "+129",
      oddsUnder: "-166",
      impliedProbability: 0.41,
      market: { kLine: 9.5, oddsOver: "-2000" },
    });
    assert.deepStrictEqual(polluted, clean, "market fields must not change the projection");
  });

  it("declines openers and relievers instead of applying a starter innings model", () => {
    for (const role of ["opener", "reliever"]) {
      const out = computeKProjectionV4({ role, asOfDate: "2026-09-07" });
      assert.strictEqual(out.projectedKs, null);
      assert.strictEqual(out.confidence, "insufficient");
      assert.ok(out.warnings[0].startsWith("ROLE_OUT_OF_V4_SCOPE_"));
    }
  });

  it("declines rather than guessing when there is no pitcher history at all", () => {
    const out = computeKProjectionV4({ role: "starter", asOfDate: "2026-09-07", pitcherStarts: [] });
    assert.strictEqual(out.projectedKs, null);
    assert.ok(out.warnings.includes("NO_PITCHER_HISTORY"));
  });

  it("throws on look-ahead rather than silently degrading", () => {
    assert.throws(
      () =>
        computeKProjectionV4({
          role: "starter",
          asOfDate: "2026-09-01",
          pitcherStarts: [{ date: "2026-08-01", outs: 18, strikeouts: 6 }],
          opponentObservations: [{ date: "2026-09-03", pitcherKey: "x", outs: 18, strikeouts: 6 }],
          baselineFor: () => ({ ipPerStart: 6, kPerIP: 1, starts: 10 }),
        }),
      /not strictly before/,
    );
  });

  it("declineV4 produces a null-shaped block", () => {
    const out = declineV4("TEST_REASON", "2026-09-07", "reliever");
    assert.strictEqual(out.projectedKs, null);
    assert.strictEqual(out.finalProjectedIP, null);
    assert.deepStrictEqual(out.warnings, ["TEST_REASON"]);
  });

  it("maps wRC+ ranks to a bounded, correctly signed strength index", () => {
    assert.ok(offensiveStrengthIndex(1, 1) > 0.9, "rank 1 is a strong offence");
    assert.ok(offensiveStrengthIndex(30, 30) < -0.9, "rank 30 is a weak offence");
    assert.ok(Math.abs(offensiveStrengthIndex(15, 16)) < 0.1, "middle ranks are ~neutral");
    assert.strictEqual(offensiveStrengthIndex(null, null), null);
  });
});

describe("league starter index", () => {
  const log = [
    { date: "2026-07-01", outs: 18, strikeouts: 6, bf: 24 },
    { date: "2026-07-02", outs: 15, strikeouts: 5, bf: 21 },
    { date: "2026-07-03", outs: 21, strikeouts: 9, bf: 27 },
  ];

  it("exposes only starts strictly before the requested date", () => {
    const index = buildLeagueStarterIndex(log);
    const first = leagueStarterLevelsAsOf(index, "2026-07-01");
    assert.strictEqual(first.source, "fallback-empty-history", "nothing precedes the first date");
    const second = leagueStarterLevelsAsOf(index, "2026-07-02");
    assert.strictEqual(second.startsSeen, 1);
    const third = leagueStarterLevelsAsOf(index, "2026-07-03");
    assert.strictEqual(third.startsSeen, 2);
  });

  it("computes K/IP as totals over totals", () => {
    const index = buildLeagueStarterIndex(log);
    const levels = leagueStarterLevelsAsOf(index, "2026-07-03");
    // 11 K over 11 IP
    assert.ok(Math.abs(levels.kPerIP - 1) < 1e-9);
  });
});
