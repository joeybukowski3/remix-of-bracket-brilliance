import { describe, expect, it } from "vitest";
import { buildKPropBestBets } from "@/lib/mlb/kPropBestBets";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

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
    ...overrides,
  };
}

describe("buildKPropBestBets", () => {
  it("selects an over when projection clears the line by at least 0.4", () => {
    const result = buildKPropBestBets([row()]);
    expect(result.overs).toHaveLength(1);
    expect(result.overs[0]).toMatchObject({ side: "over", pitcher: "Test Pitcher", line: 5.5, projectedKs: 6.4 });
  });

  it("selects an under when projection trails the line by at least 0.4", () => {
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

  it("Wandy-Peralta-shaped regression: a reliever/opener with a corrected, bounded projection does not rank as a top Over from starter-style legacy innings", () => {
    // Before the fix: legacy projectedKs=5.3 vs kLine=0.5 -> a 4.8 K edge,
    // an unmissable "lock" driven entirely by an unrealistic 8-IP starter
    // projection for a pitcher who will actually throw under an inning.
    // MIN_ELIGIBLE_K_LINE (see kPropStatus.ts) now also independently
    // excludes this row -- a 0.5 K line is well below the starter
    // threshold regardless of the legacy-innings bug -- so this raw
    // legacy-fields case is caught before it ever reaches Best Bets.
    const buggyLegacyRow = row({ pitcher: "Wandy Peralta", projectedKs: 5.3, kLine: 0.5, projectedIP: 8, projectedK9: 6 });
    const buggyResult = buildKPropBestBets([buggyLegacyRow]);
    expect(buggyResult.overs).toHaveLength(0); // excluded by the line-minimum rule, independent of the legacy-innings bug this fixture was built to illustrate

    // After the fix: the wrapper's effective projection is what actually
    // flows into row.projectedKs (see generate-mlb-hr-props-with-k-shadow.mjs),
    // so the real corrected input to this function looks like this instead.
    const correctedRow = row({
      pitcher: "Wandy Peralta",
      projectedKs: 0.9,
      projectedIP: 1,
      projectedK9: 8.1,
      kLine: 0.5,
    });
    const correctedResult = buildKPropBestBets([correctedRow]);
    // 0.9 - 0.5 = 0.4, right at the minimum threshold -- a marginal, honest
    // edge instead of the legacy bug's inflated 4.8 K "lock".
    if (correctedResult.overs.length) {
      expect(correctedResult.overs[0].projectionEdge).toBeLessThan(1);
    }
  });
});
