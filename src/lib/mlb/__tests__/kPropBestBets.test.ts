import { describe, expect, it } from "vitest";
import { buildKPropBestBets } from "@/lib/mlb/kPropBestBets";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

// Defaults represent a solid, standard-workload starter -- comfortably
// past MIN_STANDARD_K_PROP_IP/BF/PROJECTED_KS (see
// kPropRecommendationEligibility.ts) -- so tests that don't care about
// workload eligibility can ignore it entirely, matching pre-fix behavior.
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

describe("buildKPropBestBets", () => {
  it("selects an over when a standard-workload projection clears the line by at least 0.4", () => {
    const result = buildKPropBestBets([row()]);
    expect(result.overs).toHaveLength(1);
    expect(result.overs[0]).toMatchObject({ side: "over", pitcher: "Test Pitcher", line: 5.5, projectedKs: 6.4 });
  });

  it("selects an under when a standard-workload projection trails the line by at least 0.4", () => {
    const result = buildKPropBestBets([row({ projectedKs: 5.6, kLine: 7.5, kOddsUnder: "+105" })]);
    expect(result.unders).toHaveLength(1);
    expect(result.unders[0]).toMatchObject({ side: "under", projectionEdge: -1.9, odds: "+105" });
  });

  it("does not create a play without the relevant odds", () => {
    const result = buildKPropBestBets([row({ kOddsOver: null, projectedKs: 6.8, kLine: 5.5 })]);
    expect(result.overs).toHaveLength(0);
  });

  it("does not force marginal plays below the minimum projection gap", () => {
    const result = buildKPropBestBets([row({ projectedKs: 5.8, kLine: 5.5 })]);
    expect(result.overs).toHaveLength(0);
    expect(result.unders).toHaveLength(0);
  });

  it("limits each side to the requested maximum", () => {
    const rows = [
      row({ pitcher: "One", projectedKs: 7, kLine: 5.5 }),
      row({ pitcher: "Two", projectedKs: 6.8, kLine: 5.5 }),
      row({ pitcher: "Three", projectedKs: 6.6, kLine: 5.5 }),
      row({ pitcher: "Four", projectedKs: 6.4, kLine: 5.5 }),
    ];
    expect(buildKPropBestBets(rows, 3).overs).toHaveLength(3);
  });

  it("uses deterministic sorting for ties", () => {
    const result = buildKPropBestBets([
      row({ pitcher: "Zulu", projectedKs: 6.5, kLine: 5.5 }),
      row({ pitcher: "Alpha", projectedKs: 6.5, kLine: 5.5 }),
    ]);
    expect(result.overs.map((bet) => bet.pitcher)).toEqual(["Alpha", "Zulu"]);
  });

  it("starter parity: ordering among several normal, full-workload starters is unchanged by the workload-reliability adjustment", () => {
    // All at/above the 5.5 IP / 22 BF reference point, so each clamps to
    // workloadReliability=1 -- adjustedRecommendationEdge equals rawEdge
    // for every one of them, and the pre-existing valueScore-based ordering
    // (by matchup score / skill / price, with edge as one input) holds
    // exactly as it did before this fix.
    const rows = [
      row({ pitcher: "Ace", projectedKs: 7.5, kLine: 5.5, strikeoutMatchupScore: 80, pitcherKSkillScore: 82 }),
      row({ pitcher: "Solid Starter", projectedKs: 6.6, kLine: 5.5, strikeoutMatchupScore: 68, pitcherKSkillScore: 70 }),
      row({ pitcher: "Deep Workhorse", projectedKs: 7.0, kLine: 5.5, effectiveProjectedIP: 7, workloadExpectedBF: 26, strikeoutMatchupScore: 74, pitcherKSkillScore: 76 }),
    ];
    const result = buildKPropBestBets(rows);
    for (const bet of result.overs) {
      expect(bet.workloadReliability).toBe(1);
      expect(bet.adjustedRecommendationEdge).toBe(bet.rawEdge);
    }
    // Ordering matches what valueScore alone (unaffected by the new
    // adjustment, since it's a no-op at reliability=1) already produced.
    expect(result.overs.map((bet) => bet.pitcher)).toEqual(["Ace", "Deep Workhorse", "Solid Starter"]);
  });

  it("excludes a reliever/opener flagged publicRecommendationEligible: false even when its projection would otherwise clear the line", () => {
    const result = buildKPropBestBets([
      row({ pitcher: "Ineligible Reliever", projectedKs: 6.8, kLine: 2.5, publicRecommendationEligible: false }),
    ]);
    expect(result.overs).toHaveLength(0);
    expect(result.unders).toHaveLength(0);
  });

  it("still includes a row with publicRecommendationEligible: true (or unset, for backward compatibility)", () => {
    const result = buildKPropBestBets([row({ projectedKs: 6.4, kLine: 5.5, publicRecommendationEligible: true })]);
    expect(result.overs).toHaveLength(1);
  });

  // Chris-Murphy-shaped regression: a low-workload reliever/opener with a
  // correct, bounded projection must not rank as a Top Over purely because
  // a very low sportsbook line makes any realistic projection "clear" the
  // generic 0.4-K threshold. See kPropRecommendationEligibility.test.ts for
  // the full standard/exceptional/Under threshold matrix; this just proves
  // buildKPropBestBets actually applies that evaluator end-to-end.
  it("excludes a Chris-Murphy-shaped low-workload reliever from Top Over even against an extremely low line", () => {
    const lowWorkloadRow = row({
      pitcher: "Low Workload Reliever",
      projectedIP: 1,
      projectedK9: 8.1,
      projectedKs: 0.9,
      kLine: 0.5,
      workloadRole: "reliever",
      effectiveProjectedIP: 1,
      workloadExpectedBF: 3.8,
      workloadConfidenceGrade: "A",
      workloadConfidenceScore: 1,
      teamAdjustedKRate: 0.236,
      workloadFlags: ["RELIEVER_PROFILE", "RELIEVER_WORKLOAD_CAP", "LOW_PITCHER_SAMPLE"],
    });
    const result = buildKPropBestBets([lowWorkloadRow]);
    expect(result.overs).toHaveLength(0);
  });

  it("keeps rawEdge visible on a qualifying bet while ranking uses adjustedRecommendationEdge", () => {
    const result = buildKPropBestBets([row()]);
    expect(result.overs[0].rawEdge).toBe(result.overs[0].projectionEdge);
    expect(result.overs[0].recommendationTier).toBe("standard");
    expect(result.overs[0].isExceptionalLowWorkload).toBe(false);
  });

  it("down-ranks a low-workload Over's adjusted edge relative to a standard starter with the same raw edge", () => {
    // Both pitchers project a 1.2-K raw edge -- large enough to also clear
    // the exceptional override's own MIN_EXCEPTIONAL_EDGE (1.0) bar.
    const standardStarter = row({ pitcher: "Standard Starter", projectedKs: 6.7, kLine: 5.5 }); // raw edge 1.2
    const exceptionalLowWorkload = row({
      pitcher: "Exceptional Reliever",
      projectedIP: 2,
      projectedKs: 3.7,
      kLine: 2.5, // raw edge 1.2
      workloadRole: "reliever",
      effectiveProjectedIP: 2,
      workloadExpectedBF: 8,
      workloadConfidenceGrade: "A",
      workloadConfidenceScore: 0.9,
      teamAdjustedKRate: 0.32,
      opponentTeamKRate: 27,
      strikeoutMatchupScore: 80,
      workloadFlags: [],
    });
    const result = buildKPropBestBets([standardStarter, exceptionalLowWorkload]);
    const standardBet = result.overs.find((bet) => bet.pitcher === "Standard Starter");
    const exceptionalBet = result.overs.find((bet) => bet.pitcher === "Exceptional Reliever");
    expect(standardBet?.projectionEdge).toBe(exceptionalBet?.projectionEdge); // same raw edge
    expect(exceptionalBet?.recommendationTier).toBe("exceptional-low-workload");
    expect(exceptionalBet!.adjustedRecommendationEdge).toBeLessThan(standardBet!.adjustedRecommendationEdge);
    // ...and the standard starter (full workload) ranks first despite the tied raw edge.
    expect(result.overs[0].pitcher).toBe("Standard Starter");
  });
});
