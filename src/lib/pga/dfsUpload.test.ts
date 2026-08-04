import { describe, expect, it } from "vitest";
import {
  buildPgaDfsCanonicalPlayers,
  buildPgaDfsComparisonData,
  getPgaDfsComparisonValue,
  type PgaDfsSalaryRow,
} from "@/lib/pga/dfsUpload";
import type { PgaTournamentModelRow } from "@/lib/pga/historyModel";

function salaryRow(player: string, salary: number): PgaDfsSalaryRow {
  return {
    player,
    salary,
    normalizedName: player.toLowerCase(),
    canonicalName: player.toLowerCase(),
  };
}

function modelRow(player: string, modelRank: number, fieldRank: number | null): PgaTournamentModelRow {
  return {
    player,
    sgTotal: 1.2,
    sgOTT: 0.2,
    sgApp: 0.5,
    sgAtG: 0.1,
    sgPutt: 0.4,
    trendRank: 5,
    drivingAccuracy: 64,
    bogeyAvoidance: 0.14,
    birdieBogeyRatio: 1.4,
    drivingDistance: 305,
    baseScore: 78,
    modelScore: 82,
    modelRank,
    fieldRank,
    recentResults: [],
    eventResults: [],
    specificMajorResults: [],
    allMajorResults: [],
    recentScore: 80,
    eventHistoryScore: 70,
    specificMajorScore: null,
    allMajorScore: null,
    courseFit: 76,
    trend: { score: 75, delta: 4, direction: "up", label: "Rising" },
    displayPercentiles: { sgTotal: 90, sgApp: 85 },
  };
}

describe("PGA DFS canonical comparisons", () => {
  it("uses the canonical current-field model rank instead of tour rank", () => {
    const canonicalPlayers = buildPgaDfsCanonicalPlayers(
      [modelRow("Player One", 6, 1)],
      new Map([["playerone", "12345"]]),
      new Map(),
    );

    const comparison = buildPgaDfsComparisonData(
      [salaryRow("Player One", 10_000)],
      canonicalPlayers,
      new Map([["Player One", 8]]),
      new Map([["Player One", 4]]),
    );

    expect(comparison.entries[0]).toMatchObject({
      salaryRank: 1,
      modelRank: 1,
      tournamentRank: 8,
      vsModel: 0,
      vsTournament: -7,
      vsCustom: -3,
      status: "matched",
    });
    expect(comparison.entries[0]?.canonicalPlayer).toMatchObject({
      playerId: "12345",
      currentModelRank: 1,
      tourModelRank: 6,
    });
  });

  it("calculates zero, positive, and negative model value from salary rank minus model rank", () => {
    const canonicalPlayers = buildPgaDfsCanonicalPlayers(
      [modelRow("Value Player", 5, 5), modelRow("Fade Player", 20, 20)],
      new Map(),
      new Map(),
    );
    const salaries = Array.from({ length: 20 }, (_, index) => salaryRow(
      index === 4 ? "Fade Player" : index === 19 ? "Value Player" : `Unmatched ${index}`,
      10_000 - index * 100,
    ));
    const ranks = new Map([["Value Player", 3], ["Fade Player", 7]]);
    const comparison = buildPgaDfsComparisonData(salaries, canonicalPlayers, ranks, ranks);

    expect(comparison.entries[19]).toMatchObject({ salaryRank: 20, modelRank: 5, vsModel: 15 });
    expect(comparison.entries[4]).toMatchObject({ salaryRank: 5, modelRank: 20, vsModel: -15 });
  });

  it("keeps ungraded salary rows without fabricating ranks or values", () => {
    const gradedPlayers = buildPgaDfsCanonicalPlayers(
      [modelRow("Graded Player", 5, 5)],
      new Map(),
      new Map(),
    );
    const ranks = new Map([["Graded Player", 7]]);
    const comparison = buildPgaDfsComparisonData(
      [salaryRow("Ungraded Player", 10_000), salaryRow("Graded Player", 9_900)],
      gradedPlayers,
      ranks,
      ranks,
    );

    expect(comparison.entries[0]).toMatchObject({
      uploadedPlayer: "Ungraded Player",
      salary: 10_000,
      salaryRank: 1,
      modelRank: null,
      tournamentRank: null,
      vsModel: null,
      vsTournament: null,
      coverageState: "SALARY_BASELINE",
    });
    expect(comparison.entries[1]).toMatchObject({
      modelRank: 5,
      tournamentRank: 7,
      coverageState: "FULL_MODEL",
    });
  });

  it("does not substitute an all-tour rank for a player outside the current field", () => {
    const canonicalPlayers = buildPgaDfsCanonicalPlayers(
      [modelRow("Off Field Player", 12, null)],
      new Map(),
      new Map(),
    );
    const comparison = buildPgaDfsComparisonData(
      [salaryRow("Off Field Player", 10_000)],
      canonicalPlayers,
      new Map(),
      new Map(),
    );

    expect(comparison.entries[0]).toMatchObject({
      salaryRank: 1,
      modelRank: null,
      tournamentRank: null,
      vsModel: null,
      vsTournament: null,
      coverageState: "PARTIAL",
    });
  });

  it("calculates each available value independently for partial coverage", () => {
    const canonicalPlayers = buildPgaDfsCanonicalPlayers(
      [modelRow("Partial Player", 4, 4)],
      new Map(),
      new Map(),
    );
    const comparison = buildPgaDfsComparisonData(
      [salaryRow("Partial Player", 10_000)],
      canonicalPlayers,
      new Map(),
      new Map([["Partial Player", 3]]),
    );

    expect(comparison.entries[0]).toMatchObject({
      modelRank: 4,
      tournamentRank: null,
      customRank: 3,
      vsModel: -3,
      vsTournament: null,
      vsCustom: -2,
      coverageState: "PARTIAL",
    });
  });

  it("uses the selected comparison column for value filtering", () => {
    const row = { vsModel: 6, vsTournament: -2, vsCustom: 3 };
    expect(getPgaDfsComparisonValue(row, "model")).toBe(6);
    expect(getPgaDfsComparisonValue(row, "tournament")).toBe(-2);
    expect(getPgaDfsComparisonValue(row, "custom")).toBe(3);
  });

  it("keeps DFS Model Rank aligned with canonical /pga field rank across ten players", () => {
    const modelRows = Array.from({ length: 10 }, (_, index) => modelRow(
      `Canonical Player ${index + 1}`,
      index + 11,
      index + 1,
    ));
    const canonicalPlayers = buildPgaDfsCanonicalPlayers(modelRows, new Map(), new Map());
    const salaries = modelRows.map((row, index) => salaryRow(row.player, 10_000 - index * 100));
    const comparisonRanks = new Map(modelRows.map((row, index) => [row.player, index + 1]));
    const comparison = buildPgaDfsComparisonData(salaries, canonicalPlayers, comparisonRanks, comparisonRanks);

    expect(comparison.entries.map((entry) => entry.modelRank)).toEqual(modelRows.map((row) => row.fieldRank));
  });
});
