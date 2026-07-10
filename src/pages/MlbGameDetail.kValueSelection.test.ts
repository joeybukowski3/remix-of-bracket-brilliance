import { describe, expect, it } from "vitest";
import { selectTopKValuePlays } from "@/pages/MlbGameDetail";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

// Defaults represent a solid, standard-workload starter (see
// kPropRecommendationEligibility.ts's MIN_STANDARD_* constants), matching
// kPropBestBets.test.ts's fixture convention.
function row(overrides: Partial<PitcherStrikeoutTeamRow> = {}): PitcherStrikeoutTeamRow {
  return {
    rank: 1,
    gameKey: "AAA@BBB",
    pitcher: "Test Pitcher",
    team: "AAA",
    opponent: "BBB",
    park: "Test Park",
    parkFactor: 1,
    pitcherKRate: 28,
    pitcherWhiffRate: 31,
    pitcherKVs: 75,
    opponentTeamKRate: 25,
    opponentTeamWhiffRate: 28,
    opponentTeamXba: 0.24,
    pitcherKSkillScore: 74,
    opponentTeamStrikeoutScore: 66,
    strikeoutMatchupScore: 72,
    whyItRanksWell: "Strong K indicators.",
    projectedIP: 6,
    projectedK9: 10,
    projectedKs: 6.4,
    kLine: 5.5,
    kAdjustment: 0,
    kOddsOver: "+110",
    kOddsUnder: "-140",
    kOddsBook: "draftkings",
    workloadRole: "starter",
    effectiveProjectedIP: 6,
    workloadExpectedBF: 22,
    workloadConfidenceGrade: "A",
    workloadConfidenceScore: 0.9,
    teamAdjustedKRate: 0.25,
    workloadFlags: [],
    publicRecommendationEligible: true,
    ...overrides,
  };
}

describe("selectTopKValuePlays (social value-widget K selection)", () => {
  it("selects and ranks pitchers by projection-vs-line edge", () => {
    const result = selectTopKValuePlays([
      row({ pitcher: "Low Edge", projectedKs: 6, kLine: 5.5 }),
      row({ pitcher: "High Edge", projectedKs: 8, kLine: 5.5 }),
    ]);
    expect(result[0].pitcher).toBe("High Edge");
  });

  it("excludes rows without a posted K line", () => {
    const result = selectTopKValuePlays([row({ kLine: null })]);
    expect(result).toHaveLength(0);
  });

  it("excludes a reliever/opener flagged publicRecommendationEligible: false, even with a large nominal edge", () => {
    const result = selectTopKValuePlays([
      row({ pitcher: "Ineligible Reliever", projectedKs: 6.8, kLine: 2.5, publicRecommendationEligible: false }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("does not select an ineligible reliever even when it would otherwise rank #1 by edge", () => {
    const result = selectTopKValuePlays([
      row({ pitcher: "Ineligible Reliever", projectedKs: 9, kLine: 1, publicRecommendationEligible: false }),
      row({ pitcher: "Eligible Starter", projectedKs: 7, kLine: 5.5 }),
    ]);
    expect(result.map((r) => r.pitcher)).toEqual(["Eligible Starter"]);
  });

  it("limits results to the requested maximum", () => {
    const rows = [
      row({ pitcher: "One", projectedKs: 9, kLine: 5.5 }),
      row({ pitcher: "Two", projectedKs: 8, kLine: 5.5 }),
      row({ pitcher: "Three", projectedKs: 7, kLine: 5.5 }),
      row({ pitcher: "Four", projectedKs: 6, kLine: 5.5 }),
    ];
    expect(selectTopKValuePlays(rows, 2)).toHaveLength(2);
  });

  it("does not select a Chris-Murphy-shaped low-workload reliever, even against an extremely low line", () => {
    const result = selectTopKValuePlays([
      row({
        pitcher: "Low Workload Reliever",
        projectedIP: 1,
        projectedKs: 0.9,
        kLine: 0.5,
        workloadRole: "reliever",
        effectiveProjectedIP: 1,
        workloadExpectedBF: 3.8,
        workloadConfidenceGrade: "A",
        workloadConfidenceScore: 1,
        teamAdjustedKRate: 0.236,
        workloadFlags: ["RELIEVER_PROFILE", "RELIEVER_WORKLOAD_CAP", "LOW_PITCHER_SAMPLE"],
      }),
    ]);
    expect(result).toHaveLength(0);
  });
});
