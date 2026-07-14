import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessPredictionTiming,
  isCleanEvaluationRecord,
  normalizeArchiveRecord,
  serializePhase2Shadow,
} from "./mlb-hr-tracking-integrity.mjs";

describe("HR prediction timing integrity", () => {
  it("marks a prediction before game start eligible", () => {
    assert.deepEqual(
      assessPredictionTiming("2026-07-14T16:00:00Z", "2026-07-14T17:00:00Z"),
      { timingStatus: "verified_pregame", eligibleForEvaluation: true, exclusionReason: null },
    );
  });

  it("excludes a prediction at or after game start", () => {
    const timing = assessPredictionTiming("2026-07-14T17:00:00Z", "2026-07-14T17:00:00Z");
    assert.equal(timing.timingStatus, "post_start");
    assert.equal(timing.eligibleForEvaluation, false);
    assert.equal(timing.exclusionReason, "prediction_generated_at_or_after_game_start");
  });

  it("marks a missing game start as timing-unverified", () => {
    const timing = assessPredictionTiming("2026-07-14T16:00:00Z", null);
    assert.equal(timing.timingStatus, "timing_unverified");
    assert.equal(timing.eligibleForEvaluation, false);
  });
});

describe("Phase 2 archive serialization", () => {
  it("persists combined score, rank, contributions, availability, freshness, and version", () => {
    const serialized = serializePhase2Shadow({
      phase2Rank: 3,
      phase2Shadow: {
        shadowExperimentVersion: "phase2-v1",
        enabledComponents: { bullpen: true, handSplit: true },
        combinedShadowScore: 67.2,
        componentContributions: { bullpen: 0, handSplit: -1.25 },
        componentAvailability: { bullpen: true, handSplit: false },
        bullpenShadow: { freshnessStatus: "fresh" },
        handSplitShadow: { freshnessStatus: "stale-fallback" },
      },
    });

    assert.deepEqual(serialized, {
      enabled: true,
      combinedShadowScore: 67.2,
      rank: 3,
      version: "phase2-v1",
      bullpenContribution: 0,
      handSplitContribution: -1.25,
      bullpenAvailable: true,
      handSplitAvailable: false,
      bullpenFreshness: "fresh",
      handSplitFreshness: "stale-fallback",
    });
  });

  it("keeps disabled Phase 2 explicitly unavailable and never substitutes zero", () => {
    const serialized = serializePhase2Shadow({});
    assert.equal(serialized.enabled, false);
    assert.equal(serialized.combinedShadowScore, null);
    assert.equal(serialized.bullpenContribution, null);
    assert.equal(serialized.handSplitContribution, null);
  });

  it("keeps a legitimate zero contribution only with availability metadata", () => {
    const serialized = serializePhase2Shadow({
      phase2Shadow: {
        enabledComponents: { bullpen: true, handSplit: false },
        combinedShadowScore: 60,
        componentContributions: { bullpen: 0, handSplit: 0 },
        componentAvailability: { bullpen: false, handSplit: null },
      },
    });
    assert.equal(serialized.bullpenContribution, 0);
    assert.equal(serialized.bullpenAvailable, false);
    assert.equal(serialized.handSplitContribution, null);
  });
});

describe("legacy archive compatibility", () => {
  it("normalizes legacy unresolved as retryable without fabricating Phase 2 or timing data", () => {
    const normalized = normalizeArchiveRecord({
      date: "2026-07-01",
      generatedAt: "2026-07-01T12:00:00Z",
      result: { status: "unresolved" },
    });
    assert.equal(normalized.result.status, "unresolved_retryable");
    assert.equal(normalized.result.legacyStatus, "unresolved");
    assert.equal(normalized.phase2Shadow.enabled, null);
    assert.equal(normalized.phase2Shadow.combinedShadowScore, null);
    assert.equal(normalized.timing.timingStatus, "timing_unverified");
  });

  it("requires binary outcome, both scores, stable IDs, and verified pregame timing", () => {
    const base = {
      playerId: 1,
      gameId: 2,
      hrQualityScore: 60,
      generatedAt: "2026-07-01T12:00:00Z",
      gameStartTime: "2026-07-01T13:00:00Z",
      phase2Shadow: { enabled: true, combinedShadowScore: 61 },
      result: { status: "hit" },
    };
    assert.equal(isCleanEvaluationRecord(base), true);
    assert.equal(isCleanEvaluationRecord({ ...base, phase2Shadow: null }), false);
    assert.equal(isCleanEvaluationRecord({ ...base, result: { status: "did_not_play" } }), false);
  });
});
