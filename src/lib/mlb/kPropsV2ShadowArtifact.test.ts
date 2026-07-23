import { describe, expect, it } from "vitest";

import { projectStrikeoutsV2 } from "./kProjectionV2";
// @ts-expect-error -- plain JS module, no type declarations
import { buildKPropsShadowArtifact } from "../../../scripts/lib/mlb-k-props-v2-shadow-core.mjs";
// @ts-expect-error -- plain JS module, no type declarations
import { validateKPropsV2ShadowArtifact } from "../../../scripts/lib/mlb-k-props-v2-shadow-validator.mjs";

const rawPayload = {
  date: "2026-07-23",
  pitchers: [
    {
      gameKey: "AAA@BBB",
      gameId: 1,
      pitcher: "Right Starter",
      pitcherId: 101,
      team: "BBB",
      opponent: "AAA",
      hand: "R",
      ballpark: "Test Park",
      kRate: 28,
      whiffRate: 31,
      projectedIP: 5.5,
      projectedK9: 10,
      projectedKs: 6.1,
      legacyProjectedIP: 5.5,
      legacyProjectedK9: 10,
      legacyProjectedKs: 6.1,
      projectionSource: "legacy",
      projectionFallbackReason: "MODE_SHADOW_COMPARISON",
      kLine: 5.5,
      kOddsOver: "-115",
      kOddsUnder: "-105",
      kOddsBook: "draftkings",
      kOddsSlateDate: "2026-07-23",
    },
    {
      gameKey: "CCC@DDD",
      gameId: 2,
      pitcher: "Legacy Only",
      pitcherId: 202,
      team: "CCC",
      opponent: "DDD",
      hand: null,
      kRate: null,
      whiffRate: null,
      projectedIP: 5,
      projectedK9: null,
      projectedKs: 3.9,
      kLine: 4.5,
    },
  ],
  batters: [
    { gameKey: "AAA@BBB", team: "AAA", batter: "A1", kRate: 25, whiffRate: 29, bats: "L", battingOrder: 1, lineupStatus: "confirmed" },
    { gameKey: "AAA@BBB", team: "AAA", batter: "A2", kRate: 27, whiffRate: 31, bats: "R", battingOrder: 2, lineupStatus: "confirmed" },
  ],
};

const workloadPayload = {
  date: "2026-07-23",
  leagueContext: {
    kRate: 0.225,
    whiffRate: 0.25,
  },
  pitchers: [
    {
      gamePk: 1,
      gameKey: "AAA@BBB",
      gameDate: "2026-07-23T23:00:00Z",
      venue: "Test Park",
      pitcherId: 101,
      pitcher: "Right Starter",
      team: "BBB",
      opponent: "AAA",
      isHome: true,
      role: "starter",
      workloadFetchOk: true,
      pitcherContext: {
        seasonKRate: 0.28,
        recentKRate: 0.3,
        whiffRate: 0.31,
        hand: "R",
      },
      opponentContext: {
        seasonKRate: 0.24,
        recent14KRate: 0.27,
        seasonPlateAppearances: 3000,
        recent14PlateAppearances: 380,
      },
      inputs: {
        recentPitchAverage: 92,
        recentBfAverage: 23,
        recentIpAverage: 5.7,
      },
      projection: {
        expectedBF: 24,
        expectedInnings: 5.8,
        expectedPitchLimit: 94,
      },
      confidence: {
        grade: "A",
        score: 0.95,
      },
      flags: [],
    },
  ],
};

const detailsPayload = {
  date: "2026-07-23",
  details: [
    {
      key: "right-starter|bbb|aaa|2026-07-23",
      pitcherLastFiveStarts: [
        { date: "2026-07-18", opponent: "EEE", inningsPitched: "6.1", strikeouts: 8 },
        { date: "2026-07-12", opponent: "FFF", inningsPitched: "5.2", strikeouts: 7 },
      ],
      opponentLastFiveGames: [
        {
          date: "2026-07-21",
          opponent: "GGG",
          opposingStartingPitcher: "Other Starter",
          opposingStarterInningsPitched: "6.0",
          opposingStarterStrikeouts: 6,
          teamTotalStrikeouts: 10,
        },
      ],
    },
  ],
};

describe("buildKPropsShadowArtifact", () => {
  it("builds the canonical shadow artifact with legacy and V2 projections", () => {
    const artifact = buildKPropsShadowArtifact({
      rawPayload,
      workloadPayload,
      detailsPayload,
      projectStrikeoutsV2,
      generatedAt: "2026-07-23T12:00:00.000Z",
    });

    expect(artifact.schemaVersion).toBe(1);
    expect(artifact.projectionMode).toBe("shadow");
    expect(artifact.slateDate).toBe("2026-07-23");
    expect(artifact.rows).toHaveLength(2);
    expect(artifact.diagnostics).toMatchObject({
      totalRows: 2,
      v2ComputedRows: 1,
      legacyOnlyRows: 1,
      missingWorkloadRows: 1,
      missingOpponentRows: 1,
      missingLineupRows: 1,
    });

    const row = artifact.rows[0];
    expect(row.legacy.projectedKs).toBe(6.1);
    expect(row.v2.projectedStrikeouts).toBeGreaterThan(6);
    expect(row.comparison.v2MinusLegacyKs).not.toBeNull();
    expect(row.inputs.v2Input.pitcher.projectedBattersFaced).toBe(24);
    expect(row.inputs.lineup.projectedLineupKRate).toBe(26);
    expect(row.game.pitcherIsHome).toBe(true);
    expect(validateKPropsV2ShadowArtifact(artifact)).toEqual({ ok: true, errors: [] });
  });

  it("does not mutate source payloads", () => {
    const before = structuredClone({ rawPayload, workloadPayload, detailsPayload });

    buildKPropsShadowArtifact({
      rawPayload,
      workloadPayload,
      detailsPayload,
      projectStrikeoutsV2,
      generatedAt: "2026-07-23T12:00:00.000Z",
    });

    expect({ rawPayload, workloadPayload, detailsPayload }).toEqual(before);
  });

  it("records date mismatch diagnostics without blocking artifact generation", () => {
    const artifact = buildKPropsShadowArtifact({
      rawPayload,
      workloadPayload: { ...workloadPayload, date: "2026-07-22" },
      detailsPayload,
      projectStrikeoutsV2,
      generatedAt: "2026-07-23T12:00:00.000Z",
    });

    expect(artifact.diagnostics.warnings).toContain("Workload shadow date 2026-07-22 does not match slate date 2026-07-23.");
  });

  it("rejects duplicate pitcher/game identities", () => {
    const artifact = buildKPropsShadowArtifact({
      rawPayload: {
        ...rawPayload,
        pitchers: [rawPayload.pitchers[0], { ...rawPayload.pitchers[0] }],
      },
      workloadPayload,
      detailsPayload,
      projectStrikeoutsV2,
      generatedAt: "2026-07-23T12:00:00.000Z",
    });

    const result = validateKPropsV2ShadowArtifact(artifact);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error: string) => error.includes("duplicate pitcher/game identity"))).toBe(true);
  });

  it("rejects diagnostics that do not reconcile with rows", () => {
    const artifact = buildKPropsShadowArtifact({
      rawPayload,
      workloadPayload,
      detailsPayload,
      projectStrikeoutsV2,
      generatedAt: "2026-07-23T12:00:00.000Z",
    });

    const result = validateKPropsV2ShadowArtifact({
      ...artifact,
      diagnostics: {
        ...artifact.diagnostics,
        totalRows: 99,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("diagnostics.totalRows=99 does not reconcile with actual 2.");
  });

  it("rejects sportsbook fields inside V2 inputs", () => {
    const artifact = buildKPropsShadowArtifact({
      rawPayload,
      workloadPayload,
      detailsPayload,
      projectStrikeoutsV2,
      generatedAt: "2026-07-23T12:00:00.000Z",
    });

    const result = validateKPropsV2ShadowArtifact({
      ...artifact,
      rows: [
        {
          ...artifact.rows[0],
          inputs: {
            ...artifact.rows[0].inputs,
            v2Input: {
              ...artifact.rows[0].inputs.v2Input,
              sportsbook: "draftkings",
            },
          },
        },
        artifact.rows[1],
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error: string) => error.includes("sportsbook/market field"))).toBe(true);
  });
});
