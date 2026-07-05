/**
 * generate-mlb-hr-props-with-k-shadow.reliever-safety.test.mjs
 * Run via: node --test scripts/generate-mlb-hr-props-with-k-shadow.reliever-safety.test.mjs
 *
 * Covers the reliever/opener workload-role safety override in
 * applyKProjectionMode(): a relief pitcher's legacy (starter-oriented)
 * projection must never drive public K-prop ranking/eligibility when it's
 * incompatible with real relief-role bounds. See the root-cause writeup in
 * the fix/k-prop-reliever-live-eligibility branch for the Wandy Peralta
 * case this was built from.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyKProjectionMode } from "./generate-mlb-hr-props-with-k-shadow.mjs";

function shadowFor(row) {
  return {
    available: true,
    reason: null,
    byPitcherId: new Map([[String(row.pitcherId), row]]),
    byGameTeam: new Map([[`${row.gameKey}|${row.team}`, row]]),
  };
}

function shadowRow({ pitcherId, gameKey = "AAA@BBB", team = "AAA", role, expectedBF, expectedIP, fullShadowKs, grade = "B", eligibleConfidence = true }) {
  return {
    pitcherId,
    pitcher: "Test Pitcher",
    gameKey,
    team,
    role,
    workloadFetchOk: true,
    projection: {
      expectedBF,
      expectedInnings: expectedIP,
      workloadOnlyProjectedKs: fullShadowKs,
      teamAdjustedKRate: 0.22,
      fullShadowProjectedKs: fullShadowKs,
    },
    confidence: { grade, score: eligibleConfidence ? 0.8 : 0.3, publicEligible: eligibleConfidence },
    flags: [],
  };
}

function pitcherPayload({ pitcherId, gameKey = "AAA@BBB", team = "AAA", projectedIP, projectedK9, projectedKs, kLine }) {
  return { date: "2026-07-04", pitchers: [{ gameKey, pitcher: "Test Pitcher", pitcherId, team, opponent: "BBB", projectedIP, projectedK9, projectedKs, kLine }] };
}

describe("reliever with legacy IP incompatible (5.5) but an eligible bounded candidate (0.9)", () => {
  const row = shadowRow({ pitcherId: 1, role: "reliever", expectedBF: 6, expectedIP: 0.9, fullShadowKs: 1.2 });
  const payload = pitcherPayload({ pitcherId: 1, projectedIP: 5.5, projectedK9: 8, projectedKs: 4.9, kLine: 2.5 });
  const result = applyKProjectionMode(payload, shadowFor(row), "shadow").pitchers[0];

  it("the legacy projection cannot drive the public effective projection", () => {
    assert.notEqual(result.effectiveProjectedIP, 5.5);
  });

  it("substitutes the bounded candidate as the effective/public projection", () => {
    assert.equal(result.effectiveProjectedIP, 0.9);
    assert.equal(result.effectiveProjectedKs, 1.2);
    assert.equal(result.projectedIP, 0.9);
    assert.equal(result.projectedKs, 1.2);
  });

  it("labels the source as a reliever safety override, not official/workload-team", () => {
    assert.equal(result.projectionSource, "workload-role-safety");
    assert.equal(result.projectionFallbackReason, "LEGACY_WORKLOAD_INCOMPATIBLE_WITH_RELIEVER_ROLE");
  });

  it("remains eligible for public recommendation", () => {
    assert.equal(result.publicRecommendationEligible, true);
  });

  it("never promotes the pitcher to official mode", () => {
    assert.equal(result.kProjectionMode, "shadow");
  });

  it("retains the raw legacy value for debug/audit purposes", () => {
    assert.equal(result.legacyProjectedIP, 5.5);
    assert.equal(result.legacyProjectedKs, 4.9);
  });
});

describe("reliever with incompatible legacy IP and an unavailable/ineligible candidate", () => {
  const row = shadowRow({ pitcherId: 2, role: "reliever", expectedBF: 6, expectedIP: 0.9, fullShadowKs: 1.2, grade: "D", eligibleConfidence: false });
  const payload = pitcherPayload({ pitcherId: 2, projectedIP: 5.5, projectedK9: 8, projectedKs: 4.9, kLine: 2.5 });
  const result = applyKProjectionMode(payload, shadowFor(row), "shadow").pitchers[0];

  it("is excluded from public recommendations", () => {
    assert.equal(result.publicRecommendationEligible, false);
  });

  it("does not silently fall back to the unrealistic legacy projection as the effective/public value being recommended", () => {
    // The exclusion flag itself is the fix's mechanism -- the numeric field
    // remaining populated (for informational/debug display only) is fine
    // as long as nothing treats this pitcher as recommendation-eligible.
    assert.equal(result.publicRecommendationEligible, false);
    assert.equal(result.projectionFallbackReason, "RELIEVER_WORKLOAD_CANDIDATE_INELIGIBLE");
  });

  it("does not mark the source as a successful safety override", () => {
    assert.equal(result.projectionSource, "legacy");
  });
});

describe("opener with incompatible legacy IP (>4.0) and an eligible candidate", () => {
  const row = shadowRow({ pitcherId: 3, role: "opener", expectedBF: 8, expectedIP: 2.1, fullShadowKs: 2.5 });
  const payload = pitcherPayload({ pitcherId: 3, projectedIP: 6, projectedK9: 8, projectedKs: 5.3, kLine: 2.5 });
  const result = applyKProjectionMode(payload, shadowFor(row), "shadow").pitchers[0];

  it("substitutes the bounded opener candidate", () => {
    assert.equal(result.effectiveProjectedIP, 2.1);
    assert.equal(result.publicRecommendationEligible, true);
    assert.equal(result.projectionFallbackReason, "LEGACY_WORKLOAD_INCOMPATIBLE_WITH_RELIEVER_ROLE");
  });

  it("uses the opener-specific ineligible reason code when the candidate is unavailable instead", () => {
    const ineligibleRow = shadowRow({ pitcherId: 4, role: "opener", expectedBF: 8, expectedIP: 2.1, fullShadowKs: 2.5, grade: "D", eligibleConfidence: false });
    const ineligiblePayload = pitcherPayload({ pitcherId: 4, gameKey: "AAA@BBB", team: "AAA", projectedIP: 6, projectedK9: 8, projectedKs: 5.3, kLine: 2.5 });
    const ineligibleResult = applyKProjectionMode(ineligiblePayload, shadowFor(ineligibleRow), "shadow").pitchers[0];
    assert.equal(ineligibleResult.publicRecommendationEligible, false);
    assert.equal(ineligibleResult.projectionFallbackReason, "OPENER_WORKLOAD_CANDIDATE_INELIGIBLE");
  });
});

describe("starter in shadow mode: byte-identical legacy behavior, unaffected by the safety override", () => {
  const row = shadowRow({ pitcherId: 5, role: "starter", expectedBF: 24, expectedIP: 6, fullShadowKs: 6 });
  const payload = pitcherPayload({ pitcherId: 5, projectedIP: 6, projectedK9: 9, projectedKs: 6, kLine: 5.5 });
  const result = applyKProjectionMode(payload, shadowFor(row), "shadow").pitchers[0];

  it("keeps the legacy projection exactly as the effective/public value", () => {
    assert.equal(result.projectedIP, 6);
    assert.equal(result.projectedKs, 6);
    assert.equal(result.projectionSource, "legacy");
  });

  it("remains eligible (never excluded)", () => {
    assert.equal(result.publicRecommendationEligible, true);
  });

  it("carries the pre-existing MODE_SHADOW_COMPARISON fallback reason, unchanged from before this fix", () => {
    assert.equal(result.projectionFallbackReason, "MODE_SHADOW_COMPARISON");
  });
});

describe("legacy mode bypasses the reliever safety override entirely (complete rollback path)", () => {
  const row = shadowRow({ pitcherId: 6, role: "reliever", expectedBF: 6, expectedIP: 0.9, fullShadowKs: 1.2 });
  const payload = pitcherPayload({ pitcherId: 6, projectedIP: 5.5, projectedK9: 8, projectedKs: 4.9, kLine: 2.5 });
  const result = applyKProjectionMode(payload, shadowFor(row), "legacy").pitchers[0];

  it("keeps the legacy projection even though it would be flagged incompatible in shadow mode", () => {
    assert.equal(result.projectedIP, 5.5);
    assert.equal(result.projectedKs, 4.9);
    assert.equal(result.projectionSource, "legacy");
  });

  it("never excludes the pitcher from public recommendation in legacy mode", () => {
    assert.equal(result.publicRecommendationEligible, true);
  });

  it("reports MODE_LEGACY as the fallback reason", () => {
    assert.equal(result.projectionFallbackReason, "MODE_LEGACY");
  });
});

describe("Wandy-Peralta-shaped regression fixture", () => {
  // Shaped directly from the real bug report: role classified as opener
  // (short bulk starts), legacy projection an unrealistic 8 IP / 5.3 Ks
  // full-start workload, real bounded candidate ~1.0 IP / ~0.9 Ks.
  const row = shadowRow({ pitcherId: 593974, gameKey: "SD@LAD", team: "SD", role: "opener", expectedBF: 4.45, expectedIP: 1.04, fullShadowKs: 0.95 });
  const payload = pitcherPayload({ pitcherId: 593974, gameKey: "SD@LAD", team: "SD", projectedIP: 8, projectedK9: 6, projectedKs: 5.3, kLine: 0.5 });
  const result = applyKProjectionMode(payload, shadowFor(row), "shadow").pitchers[0];

  it("does not carry the starter-shaped 8 IP / 5.3 Ks legacy projection as the effective/public value", () => {
    assert.notEqual(result.effectiveProjectedIP, 8);
    assert.notEqual(result.effectiveProjectedKs, 5.3);
  });

  it("effective projection reflects a realistic short relief/opener workload", () => {
    assert.ok(result.effectiveProjectedIP < 2, `expected a short outing, got ${result.effectiveProjectedIP}`);
  });

  it("would not clear a 0.5 K line by the same wide 4.8-K margin the legacy bug produced", () => {
    const legacyEdge = 5.3 - 0.5;
    const effectiveEdge = result.effectiveProjectedKs - 0.5;
    assert.ok(effectiveEdge < legacyEdge, `effective edge (${effectiveEdge}) should be far smaller than the legacy bug's edge (${legacyEdge})`);
  });
});
