/**
 * Regression coverage for the K Props social-table empty-state bug:
 * getKRowsForSocial previously checked strikeoutRows (the leaner "matchup
 * summary" shape from buildPitcherStrikeoutMatchupRows) BEFORE
 * strikeoutDetailRows (the full per-pitcher shape from
 * buildPitcherStrikeoutRows). strikeoutRows structurally lacks
 * projectedKs/projectedIP/workloadConfidenceGrade/workloadFlags -- fields
 * resolveKPropStatus requires before it will ever classify a row as VALID
 * -- so every row built from it always resolved to INSUFFICIENT_DATA
 * ("Missing workload"), and selectTopSocialKRows / selectTopKValuePlays
 * always filtered the whole slate down to zero rows, even on a slate with
 * real, complete K model data. strikeoutRows is populated on every normal
 * slate, so this was not an intermittent bug -- the K tab (and the K
 * portion of the Value tab) was empty on every production render.
 */
import { describe, expect, it } from "vitest";
import { getKRowsForSocial, selectTopKValuePlays } from "@/pages/MlbGameDetail";
import { selectTopSocialKRows } from "@/lib/mlb/kPropValueSorting";
import { resolveKPropStatus } from "@/lib/mlb/kPropStatus";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

/** Shaped exactly like buildPitcherStrikeoutRows' full per-pitcher output (strikeoutDetailRows). */
function detailRow(overrides: Partial<PitcherStrikeoutTeamRow> = {}): PitcherStrikeoutTeamRow {
  return {
    rank: 1,
    gameKey: "PIT@CLE",
    pitcher: "Gavin Williams",
    team: "CLE",
    opponent: "PIT",
    park: "Progressive Field",
    parkFactor: 0.91,
    pitcherKRate: 29.1,
    pitcherWhiffRate: 29.6,
    pitcherKVs: 73.5,
    opponentTeamKRate: 25.98,
    opponentTeamWhiffRate: 28.52,
    opponentTeamXba: 0.236,
    pitcherKSkillScore: 77.5,
    opponentTeamStrikeoutScore: 73.7,
    strikeoutMatchupScore: 75.1,
    whyItRanksWell: "Strong K indicators meet meaningful team K tendency.",
    kLine: 6.5,
    kOddsOver: "-150",
    kOddsUnder: "+118",
    kOddsBook: "draftkings",
    projectedIP: 5.3,
    projectedK9: 10.6,
    projectedKs: 6.2,
    workloadRole: "starter",
    projectionSource: "legacy",
    publicRecommendationEligible: true,
    workloadConfidenceGrade: "A",
    workloadConfidenceScore: 1,
    workloadFlags: [],
    ...overrides,
  };
}

/**
 * Shaped exactly like buildPitcherStrikeoutMatchupRows' leaner "matchup
 * summary" output (strikeoutRows) -- deliberately does NOT include
 * projectedKs/projectedIP/workloadConfidenceGrade/workloadFlags, since the
 * real function never puts them there. Field names (kRate/whiffRate/
 * kMatchupScore, not pitcherKRate/pitcherWhiffRate/strikeoutMatchupScore)
 * intentionally mirror the real shape too.
 */
function matchupRow(overrides: Record<string, unknown> = {}) {
  return {
    rank: 1,
    gameKey: "PIT@CLE",
    pitcher: "Gavin Williams",
    team: "CLE",
    opponent: "PIT",
    park: "Progressive Field",
    parkFactor: 0.91,
    opponentTeamKRate: 25.98,
    opponentKSampleSize: 9,
    pitcherKAbilityScore: 77.5,
    kRate: 29.1,
    whiffRate: 29.6,
    kMatchupScore: 75.1,
    reasonTags: ["Strong K pitcher"],
    kLine: 6.5,
    kOddsOver: "-150",
    kOddsUnder: "+118",
    kOddsBook: "draftkings",
    ...overrides,
  };
}

describe("getKRowsForSocial", () => {
  it("prefers strikeoutDetailRows over strikeoutRows when both are present", () => {
    const detail = [detailRow()];
    const matchup = [matchupRow()];
    const result = getKRowsForSocial(matchup, detail, [], [], []);
    expect(result).toBe(detail);
  });

  it("regression: a real-shaped slate (both row sets populated, exactly like production) yields VALID rows through the full social pipeline", () => {
    const detail = [detailRow()];
    const matchup = [matchupRow()];
    const kRows = getKRowsForSocial(matchup, detail, [], [], []);

    const top = selectTopSocialKRows(kRows, 5);
    expect(top.length).toBeGreaterThan(0);
    expect(resolveKPropStatus(kRows[0]).status).toBe("VALID");
  });

  it("BUG (must stay fixed): strikeoutRows alone -- the shape that caused the outage -- always resolves to INSUFFICIENT_DATA, confirming detail rows must be preferred whenever available", () => {
    const matchupOnlyResult = getKRowsForSocial([matchupRow()], [], [], [], []);
    // getKRowsForSocial's own fallback aliasing still can't invent projectedKs/projectedIP
    // out of nothing -- this documents *why* the priority order in the function above matters,
    // it does not mean matchup-shaped rows are an acceptable primary source.
    expect(resolveKPropStatus(matchupOnlyResult[0]).status).toBe("INSUFFICIENT_DATA");
  });

  it("falls back to strikeoutRows (aliased field names) when strikeoutDetailRows is empty", () => {
    const matchup = [matchupRow({ pitcher: "Fallback Pitcher" })];
    const result = getKRowsForSocial(matchup, [], [], [], []);
    expect(result).toHaveLength(1);
    expect(result[0].pitcherKRate).toBe(29.1); // aliased from kRate
    expect(result[0].pitcherWhiffRate).toBe(29.6); // aliased from whiffRate
    expect(result[0].strikeoutMatchupScore).toBe(75.1); // aliased from kMatchupScore
  });

  it("falls back to a pitchers-derived synthesis when both row sets are empty but pitchers exist", () => {
    const pitchers = [{ pitcher: "Synth Pitcher", team: "AAA", opponent: "BBB", gameKey: "AAA@BBB", kRate: 25, whiffRate: 30, kVs: 60 }];
    const result = getKRowsForSocial([], [], pitchers, [], []);
    expect(result).toHaveLength(1);
    expect(result[0].pitcher).toBe("Synth Pitcher");
  });

  it("returns an empty array when there is truly nothing to show (no rows, no pitchers)", () => {
    expect(getKRowsForSocial([], [], [], [], [])).toEqual([]);
  });
});

describe("Value tab shares the same fixed data path (selectTopKValuePlays)", () => {
  it("regression: the Value tab's K portion also resolves VALID rows once fed detail-shaped kRows", () => {
    const detail = [detailRow()];
    const matchup = [matchupRow()];
    const kRows = getKRowsForSocial(matchup, detail, [], [], []);
    const valuePlays = selectTopKValuePlays(kRows, 3);
    expect(valuePlays.length).toBeGreaterThan(0);
  });
});
