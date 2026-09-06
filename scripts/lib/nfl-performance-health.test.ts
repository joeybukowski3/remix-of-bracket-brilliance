import { describe, expect, it } from "vitest";
import {
  buildCoachingHealthSection,
  buildPropsHealthSection,
  buildSidesHealthSection,
  buildTotalsHealthSection,
  buildWorkflowHealthSection,
  COACHING_ARTIFACT_STALE_AFTER_HOURS,
  computeFamilyStatus,
  DAILY_ARTIFACT_STALE_THRESHOLD_MS,
} from "./nfl-performance-health";

describe("buildCoachingHealthSection", () => {
  const base = {
    currentArtifactExists: true,
    ratingVersion: "coaching-v1.0.0",
    artifactGeneratedAt: "2026-09-06T00:00:00.000Z",
    sourceCutoff: "completed games through 2025 season",
    expectedTeamCount: 32,
    ratedTeamCount: 32,
    smallSampleCoachCount: 11,
    firstYearCoachCount: 4,
    historicalSnapshotFileCount: 215,
    latestSnapshotSeason: 2025,
    latestSnapshotWeek: 22,
    publicArtifactAgeMs: 60 * 60 * 1000,
  };

  it("is HEALTHY with a fresh full-coverage artifact even with first-year / small-sample coaches", () => {
    const section = buildCoachingHealthSection(base);
    expect(section.status).toBe("HEALTHY");
    expect(section.first_year_count).toBe(4);
    expect(section.small_sample_coach_count).toBe(11);
    expect(section.stale_after_hours).toBe(COACHING_ARTIFACT_STALE_AFTER_HOURS);
  });

  it("is NOT_AVAILABLE when the current-ratings artifact is missing", () => {
    expect(buildCoachingHealthSection({ ...base, currentArtifactExists: false }).status).toBe("NOT_AVAILABLE");
  });

  it("is STALE when the artifact is older than the staleness allowance", () => {
    const section = buildCoachingHealthSection({
      ...base,
      publicArtifactAgeMs: (COACHING_ARTIFACT_STALE_AFTER_HOURS + 1) * 60 * 60 * 1000,
    });
    expect(section.status).toBe("STALE");
  });

  it("DEGRADES when teams are missing a current coach rating", () => {
    const section = buildCoachingHealthSection({ ...base, ratedTeamCount: 30 });
    expect(section.unrated_coach_count).toBe(2);
    expect(section.status).toBe("DEGRADED");
  });

  it("DEGRADES when there is no historical snapshot coverage", () => {
    expect(buildCoachingHealthSection({ ...base, historicalSnapshotFileCount: 0 }).status).toBe("DEGRADED");
  });

  it("does not degrade purely because every coach is first-year / small-sample", () => {
    const section = buildCoachingHealthSection({
      ...base,
      smallSampleCoachCount: 32,
      firstYearCoachCount: 32,
    });
    expect(section.status).toBe("HEALTHY");
  });
});

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
  const baseInput = {
    ledgerExists: true,
    latestSpreadPredictionTimestamp: "2026-09-04T17:58:46.030Z",
    latestSpreadEvaluationTimestamp: "2026-09-05T09:32:43.533Z",
    evaluationAgeMs: 1000,
    modelVersionsSeen: ["jkb-power-number-v1.0.0"],
    unresolvedFinalGames: 0,
    sidesArtifactExists: true,
    sidesArtifactGenerationTimestamp: "2026-09-05T12:00:00.000Z",
    sidesArtifactGradedGames: 0,
    sidesArtifactAgeMs: 1000,
  };

  it("reports HEALTHY for a fresh sides.json while computing an operational status", () => {
    const section = buildSidesHealthSection(baseInput);
    expect(section.status).toBe("HEALTHY");
    expect(section.public_performance_view_status).toBe("HEALTHY");
    expect(section.sides_artifact_graded_games).toBe(0);
  });

  it("reports NOT_AVAILABLE for the public view when sides.json has not been generated yet", () => {
    const section = buildSidesHealthSection({
      ...baseInput,
      sidesArtifactExists: false,
      sidesArtifactGenerationTimestamp: null,
      sidesArtifactAgeMs: null,
    });
    expect(section.public_performance_view_status).toBe("NOT_AVAILABLE");
  });

  it("reports STALE for the public view when sides.json is past the daily threshold", () => {
    const section = buildSidesHealthSection({ ...baseInput, sidesArtifactAgeMs: 48 * 60 * 60 * 1000 });
    expect(section.public_performance_view_status).toBe("STALE");
  });

  it("is NOT_AVAILABLE when no resolution-status ledger exists for the season", () => {
    const section = buildSidesHealthSection({
      ...baseInput,
      ledgerExists: false,
      latestSpreadPredictionTimestamp: null,
      latestSpreadEvaluationTimestamp: null,
      evaluationAgeMs: null,
      modelVersionsSeen: [],
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
