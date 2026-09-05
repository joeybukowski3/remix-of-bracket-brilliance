import { describe, expect, it } from "vitest";
import {
  buildPropsHealthSection,
  buildSidesHealthSection,
  buildTotalsHealthSection,
  buildWorkflowHealthSection,
  computeFamilyStatus,
  DAILY_ARTIFACT_STALE_THRESHOLD_MS,
} from "./nfl-performance-health";

describe("computeFamilyStatus", () => {
  it("returns NOT_AVAILABLE when the artifact does not exist, regardless of other inputs", () => {
    expect(computeFamilyStatus({ artifactExists: false, ageMs: 0, staleThresholdMs: 1000, backlogCount: 0, missingCount: 0 })).toBe(
      "NOT_AVAILABLE",
    );
  });

  it("returns STALE when age exceeds the threshold, checked before backlog/missing", () => {
    expect(
      computeFamilyStatus({ artifactExists: true, ageMs: 2000, staleThresholdMs: 1000, backlogCount: 0, missingCount: 0 }),
    ).toBe("STALE");
  });

  it("returns DEGRADED for a genuine backlog even when not stale", () => {
    expect(
      computeFamilyStatus({ artifactExists: true, ageMs: 0, staleThresholdMs: 1000, backlogCount: 1, missingCount: 0 }),
    ).toBe("DEGRADED");
  });

  it("returns DEGRADED for missing expected rows even without a backlog", () => {
    expect(
      computeFamilyStatus({ artifactExists: true, ageMs: 0, staleThresholdMs: 1000, backlogCount: 0, missingCount: 3 }),
    ).toBe("DEGRADED");
  });

  it("returns HEALTHY when the artifact is fresh with zero backlog and zero missing rows", () => {
    expect(
      computeFamilyStatus({ artifactExists: true, ageMs: 0, staleThresholdMs: 1000, backlogCount: 0, missingCount: 0 }),
    ).toBe("HEALTHY");
  });

  it("does not treat a null age (unknown/never generated timestamp) as stale", () => {
    expect(
      computeFamilyStatus({ artifactExists: true, ageMs: null, staleThresholdMs: 1000, backlogCount: 0, missingCount: 0 }),
    ).toBe("HEALTHY");
  });
});

describe("buildTotalsHealthSection", () => {
  it("is HEALTHY pregame: zero expected games (nothing has kicked off yet) means zero missing rows", () => {
    const section = buildTotalsHealthSection({
      artifactExists: true,
      latestPredictionTimestamp: "2026-09-04T17:58:46.030Z",
      latestGenerationTimestamp: "2026-09-05T12:00:00.000Z",
      expectedGames: 0,
      archivedGames: 0,
      duplicatePredictionIds: 0,
      unresolvedCompletedGames: 0,
      modelVersionsSeen: ["jkb-nfl-total-ridge-v1.0.0"],
      fittedHashesSeen: ["hash-1"],
      publicArtifactAgeMs: 1000,
    });
    expect(section.status).toBe("HEALTHY");
    expect(section.missing_team_total_rows).toBe(0);
  });

  it("is DEGRADED when a genuine unresolved-completed-game backlog exists", () => {
    const section = buildTotalsHealthSection({
      artifactExists: true,
      latestPredictionTimestamp: "2026-09-04T17:58:46.030Z",
      latestGenerationTimestamp: "2026-09-05T12:00:00.000Z",
      expectedGames: 16,
      archivedGames: 16,
      duplicatePredictionIds: 0,
      unresolvedCompletedGames: 2,
      modelVersionsSeen: ["jkb-nfl-total-ridge-v1.0.0"],
      fittedHashesSeen: ["hash-1"],
      publicArtifactAgeMs: 1000,
    });
    expect(section.status).toBe("DEGRADED");
  });

  it("is DEGRADED when expected games exceed archived games (a real coverage gap)", () => {
    const section = buildTotalsHealthSection({
      artifactExists: true,
      latestPredictionTimestamp: "2026-09-04T17:58:46.030Z",
      latestGenerationTimestamp: "2026-09-05T12:00:00.000Z",
      expectedGames: 16,
      archivedGames: 14,
      duplicatePredictionIds: 0,
      unresolvedCompletedGames: 0,
      modelVersionsSeen: ["jkb-nfl-total-ridge-v1.0.0"],
      fittedHashesSeen: ["hash-1"],
      publicArtifactAgeMs: 1000,
    });
    expect(section.status).toBe("DEGRADED");
    expect(section.missing_team_total_rows).toBe(2);
  });

  it("is STALE when the public artifact age exceeds the daily threshold", () => {
    const section = buildTotalsHealthSection({
      artifactExists: true,
      latestPredictionTimestamp: "2026-09-04T17:58:46.030Z",
      latestGenerationTimestamp: "2026-09-01T12:00:00.000Z",
      expectedGames: 0,
      archivedGames: 0,
      duplicatePredictionIds: 0,
      unresolvedCompletedGames: 0,
      modelVersionsSeen: [],
      fittedHashesSeen: [],
      publicArtifactAgeMs: DAILY_ARTIFACT_STALE_THRESHOLD_MS + 1,
    });
    expect(section.status).toBe("STALE");
  });

  it("is NOT_AVAILABLE when the totals artifact does not exist", () => {
    const section = buildTotalsHealthSection({
      artifactExists: false,
      latestPredictionTimestamp: null,
      latestGenerationTimestamp: null,
      expectedGames: 0,
      archivedGames: 0,
      duplicatePredictionIds: 0,
      unresolvedCompletedGames: 0,
      modelVersionsSeen: [],
      fittedHashesSeen: [],
      publicArtifactAgeMs: null,
    });
    expect(section.status).toBe("NOT_AVAILABLE");
  });
});

describe("buildPropsHealthSection", () => {
  it("is HEALTHY when no starter slots are missing and there is no player-outcome backlog", () => {
    const section = buildPropsHealthSection({
      artifactExists: true,
      latestPassingPredictionTimestamp: "2026-09-04T17:58:46.030Z",
      latestRushingPredictionTimestamp: "2026-09-04T17:58:46.030Z",
      latestReceivingPredictionTimestamp: "2026-09-04T17:58:46.030Z",
      starterCohortRowCount: 188,
      missingStarterSlots: 0,
      starterPropEvaluationRowCount: 0,
      unresolvedFinalGames: 0,
      missingComparisonLineCount: 40,
      playerOutcomeBacklog: 100,
      modelVersionsSeen: ["nfl-passing-direct-ridge-v1"],
      fittedHashesSeen: ["hash-1"],
      publicArtifactAgeMs: 1000,
    });
    expect(section.status).toBe("HEALTHY");
    expect(section.expected_starter_slot_count).toBe(188);
  });

  it("is DEGRADED when starter slots are missing", () => {
    const section = buildPropsHealthSection({
      artifactExists: true,
      latestPassingPredictionTimestamp: null,
      latestRushingPredictionTimestamp: null,
      latestReceivingPredictionTimestamp: null,
      starterCohortRowCount: 184,
      missingStarterSlots: 4,
      starterPropEvaluationRowCount: 0,
      unresolvedFinalGames: 0,
      missingComparisonLineCount: 0,
      playerOutcomeBacklog: 0,
      modelVersionsSeen: [],
      fittedHashesSeen: [],
      publicArtifactAgeMs: 1000,
    });
    expect(section.status).toBe("DEGRADED");
    expect(section.expected_starter_slot_count).toBe(188);
  });

  it("is DEGRADED when there is a genuine unresolved-final-game backlog", () => {
    const section = buildPropsHealthSection({
      artifactExists: true,
      latestPassingPredictionTimestamp: null,
      latestRushingPredictionTimestamp: null,
      latestReceivingPredictionTimestamp: null,
      starterCohortRowCount: 188,
      missingStarterSlots: 0,
      starterPropEvaluationRowCount: 150,
      unresolvedFinalGames: 5,
      missingComparisonLineCount: 0,
      playerOutcomeBacklog: 5,
      modelVersionsSeen: [],
      fittedHashesSeen: [],
      publicArtifactAgeMs: 1000,
    });
    expect(section.status).toBe("DEGRADED");
  });
});

describe("buildSidesHealthSection", () => {
  it("reports NOT_IMPLEMENTED for the dedicated public view while still computing an operational status", () => {
    const section = buildSidesHealthSection({
      ledgerExists: true,
      latestSpreadPredictionTimestamp: "2026-09-04T17:58:46.030Z",
      latestSpreadEvaluationTimestamp: "2026-09-05T09:32:43.533Z",
      evaluationAgeMs: 1000,
      modelVersionsSeen: ["jkb-power-number-v1.0.0"],
      unresolvedFinalGames: 0,
    });
    expect(section.status).toBe("HEALTHY");
    expect(section.public_performance_view_status).toBe("NOT_IMPLEMENTED");
  });

  it("is NOT_AVAILABLE when no resolution-status ledger exists for the season", () => {
    const section = buildSidesHealthSection({
      ledgerExists: false,
      latestSpreadPredictionTimestamp: null,
      latestSpreadEvaluationTimestamp: null,
      evaluationAgeMs: null,
      modelVersionsSeen: [],
      unresolvedFinalGames: 0,
    });
    expect(section.status).toBe("NOT_AVAILABLE");
  });
});

describe("buildWorkflowHealthSection", () => {
  it("passes through the generated-at-by-artifact map unchanged", () => {
    const section = buildWorkflowHealthSection({ totals: "2026-09-05T12:00:00.000Z", props: null });
    expect(section.generated_at_by_artifact).toEqual({ totals: "2026-09-05T12:00:00.000Z", props: null });
  });
});
