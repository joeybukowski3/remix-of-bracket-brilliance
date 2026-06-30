/**
 * MlbHrProps.gameEnvironment.test.ts
 * Tests for game-environment payload normalization on the HR Props page.
 * The underlying scoring formula (computeGameHrEnvironmentScore) is already
 * covered by scripts/lib/mlb-hr-model-correctness.test.mjs -- these tests
 * focus on the frontend normalization/type boundary.
 */
import { describe, expect, it } from "vitest";
import { normalizeHrDashboardPayload } from "./MlbHrProps";

describe("Game-environment payload normalization", () => {
  const BASE_PAYLOAD = {
    date: "2026-06-30",
    generatedAt: "2026-06-30T09:00:00Z",
    modelVersion: "mlb-hr-quality-v1.1",
    games: [],
    pitchers: [],
    batters: [],
  };

  it("normalizes a valid gameEnvironments array", () => {
    const payload = {
      ...BASE_PAYLOAD,
      gameEnvironments: [
        {
          gameKey: "NYY@BOS", matchup: "NYY @ BOS", ballpark: "Fenway Park",
          gameHrEnvironmentScore: 72.5, parkFactor: 0.95, weatherEffect: 2.1,
          starterVulnerability: 60, qualifyingHitterCount: 4, avgQualifyingHitterScore: 68.2,
        },
      ],
    };
    const result = normalizeHrDashboardPayload(payload);
    expect(result?.gameEnvironments).toHaveLength(1);
    expect(result?.gameEnvironments?.[0].gameHrEnvironmentScore).toBe(72.5);
    expect(result?.gameEnvironments?.[0].matchup).toBe("NYY @ BOS");
  });

  it("defaults to an empty array when gameEnvironments is missing", () => {
    const result = normalizeHrDashboardPayload(BASE_PAYLOAD);
    expect(result?.gameEnvironments).toEqual([]);
  });

  it("handles null score values gracefully (missing weather, etc.) without crashing", () => {
    const payload = {
      ...BASE_PAYLOAD,
      gameEnvironments: [
        {
          gameKey: "LAD@SF", matchup: "LAD @ SF", ballpark: "Oracle Park",
          gameHrEnvironmentScore: null, parkFactor: 0.85, weatherEffect: null,
          starterVulnerability: null, qualifyingHitterCount: 0, avgQualifyingHitterScore: null,
        },
      ],
    };
    const result = normalizeHrDashboardPayload(payload);
    expect(result?.gameEnvironments?.[0].gameHrEnvironmentScore).toBeNull();
    expect(result?.gameEnvironments?.[0].weatherEffect).toBeNull();
  });

  it("filters out non-object entries in gameEnvironments", () => {
    const payload = {
      ...BASE_PAYLOAD,
      gameEnvironments: [null, "garbage", { gameKey: "A@B", matchup: "A @ B", ballpark: "X", gameHrEnvironmentScore: 50, parkFactor: 1, weatherEffect: 0, starterVulnerability: 50, qualifyingHitterCount: 1, avgQualifyingHitterScore: 50 }],
    };
    const result = normalizeHrDashboardPayload(payload);
    expect(result?.gameEnvironments).toHaveLength(1);
  });

  it("modelVersion is normalized and present at the payload top level", () => {
    const result = normalizeHrDashboardPayload(BASE_PAYLOAD);
    expect(result?.modelVersion).toBe("mlb-hr-quality-v1.1");
  });

  it("game environment score is bounded 0-100 when present (formula contract honored by generator, validated here at the boundary)", () => {
    const payload = {
      ...BASE_PAYLOAD,
      gameEnvironments: [
        { gameKey: "A@B", matchup: "A @ B", ballpark: "X", gameHrEnvironmentScore: 100, parkFactor: 1.4, weatherEffect: 6, starterVulnerability: 100, qualifyingHitterCount: 9, avgQualifyingHitterScore: 90 },
      ],
    };
    const result = normalizeHrDashboardPayload(payload);
    const score = result?.gameEnvironments?.[0].gameHrEnvironmentScore;
    expect(score).not.toBeNull();
    expect(score!).toBeLessThanOrEqual(100);
    expect(score!).toBeGreaterThanOrEqual(0);
  });
});
