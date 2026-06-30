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
});
