import { describe, expect, test } from "vitest";
import {
  DEFAULT_YARDAGE_REVIEW_FILTERS,
  applyYardageReviewFilters,
  nextYardageReviewSort,
  sortYardageReviewRows,
  type NflYardageReviewFilters,
} from "./reviewFilters";
import type { NflYardageReviewRow } from "./yardageMarketJoin";
import type { NflCurrentWeekProjectionRow } from "../types/currentWeekProjection";

function buildRow(overrides: Partial<NflCurrentWeekProjectionRow> & { playerName: string }): NflYardageReviewRow {
  const row = {
    schemaVersion: "nfl-current-week-yardage-projection-v1",
    season: 2026,
    week: 1,
    gameId: overrides.gameId ?? "2026_01_NE_SEA",
    kickoff: "2026-09-07T17:00:00Z",
    playerId: `gsis:${overrides.playerName}`,
    team: "ne",
    opponent: "sea",
    homeAway: "away",
    position: "RB",
    market: "rushing",
    status: "projected",
    historyStatus: "normal",
    generatedAt: "2026-08-26T14:09:24.393Z",
    modelVersion: "v1",
    fallbackProvenance: "historicalVolume",
    roleSource: "historicalVolume",
    roleSourceUpdatedAt: null,
    depthRank: 1,
    starterFlag: true,
    roleConfidence: "inferred",
    projectedCarries: 15,
    projectedYardsPerCarry: 4.2,
    projectedYards: 63,
    estimatedRange: null,
    matchupScore: { matchupScore: 70, opportunityScore: 60, environmentScore: 60 } as never,
    hardCaseFlags: {
      noHistory: false,
      limitedHistory: false,
      multiQbRoleUncertain: false,
      committeeRole: false,
      zeroTargetRisk: false,
      teamChanged: false,
      roleUncertain: false,
    },
    diagnostics: { gamesWithCarriesPriorThisSeason: 5, recentTeamTopCarryShareConcentration: 0.7 },
    ...overrides,
  } as unknown as NflCurrentWeekProjectionRow;
  return { row, marketInfo: { available: false }, band: "strong" };
}

describe("applyYardageReviewFilters", () => {
  const rowA = buildRow({ playerName: "A", team: "ne", opponent: "sea", position: "RB", gameId: "2026_01_NE_SEA" });
  const rowB = { ...buildRow({ playerName: "B", team: "sea", opponent: "ne", position: "WR", gameId: "2026_01_NE_SEA" }), band: "poor" as const };
  const rowC = {
    ...buildRow({
      playerName: "C",
      team: "buf",
      opponent: "mia",
      gameId: "2026_01_BUF_MIA",
      hardCaseFlags: { noHistory: false, limitedHistory: false, multiQbRoleUncertain: false, committeeRole: false, zeroTargetRisk: false, teamChanged: false, roleUncertain: true } as never,
    }),
    marketInfo: { available: true, line: 55, book: "draftkings", overPrice: "-110", underPrice: "-110", rawDifference: 8, lastUpdate: "x" } as const,
  };
  const entries = [rowA, rowB, rowC];

  test("default filters return every row", () => {
    expect(applyYardageReviewFilters(entries, DEFAULT_YARDAGE_REVIEW_FILTERS)).toHaveLength(3);
  });

  test("matchup filter matches both teams playing in that game, by gameId", () => {
    const filters: NflYardageReviewFilters = { ...DEFAULT_YARDAGE_REVIEW_FILTERS, matchup: "2026_01_NE_SEA" };
    const result = applyYardageReviewFilters(entries, filters);
    expect(result.map((e) => e.row.playerId)).toEqual(["gsis:A", "gsis:B"]);
  });

  test("position filter", () => {
    const filters: NflYardageReviewFilters = { ...DEFAULT_YARDAGE_REVIEW_FILTERS, position: "WR" };
    expect(applyYardageReviewFilters(entries, filters).map((e) => e.row.playerId)).toEqual(["gsis:B"]);
  });

  test("band filter", () => {
    const filters: NflYardageReviewFilters = { ...DEFAULT_YARDAGE_REVIEW_FILTERS, band: "poor" };
    expect(applyYardageReviewFilters(entries, filters).map((e) => e.row.playerId)).toEqual(["gsis:B"]);
  });

  test("line availability filter", () => {
    const available: NflYardageReviewFilters = { ...DEFAULT_YARDAGE_REVIEW_FILTERS, lineAvailability: "available" };
    expect(applyYardageReviewFilters(entries, available).map((e) => e.row.playerId)).toEqual(["gsis:C"]);

    const unavailable: NflYardageReviewFilters = { ...DEFAULT_YARDAGE_REVIEW_FILTERS, lineAvailability: "unavailable" };
    expect(applyYardageReviewFilters(entries, unavailable).map((e) => e.row.playerId)).toEqual(["gsis:A", "gsis:B"]);
  });
});

describe("nextYardageReviewSort", () => {
  test("cycles default -> reverse -> unsorted", () => {
    let sort = nextYardageReviewSort(null, "projectedYards", "desc");
    expect(sort).toEqual({ key: "projectedYards", direction: "desc" });
    sort = nextYardageReviewSort(sort, "projectedYards", "desc");
    expect(sort).toEqual({ key: "projectedYards", direction: "asc" });
    sort = nextYardageReviewSort(sort, "projectedYards", "desc");
    expect(sort).toBeNull();
  });

  test("switching keys resets to the default direction for the new key", () => {
    const sort = nextYardageReviewSort({ key: "projectedYards", direction: "asc" }, "matchupScore", "desc");
    expect(sort).toEqual({ key: "matchupScore", direction: "desc" });
  });
});

describe("sortYardageReviewRows", () => {
  const low = buildRow({ playerName: "Low", projectedYards: 20 });
  const high = buildRow({ playerName: "High", projectedYards: 80 });
  const missing = buildRow({ playerName: "Missing", projectedYards: null });

  test("null values always sort last regardless of direction", () => {
    const asc = sortYardageReviewRows([high, missing, low], { key: "projectedYards", direction: "asc" });
    expect(asc.map((e) => e.row.playerName)).toEqual(["Low", "High", "Missing"]);

    const desc = sortYardageReviewRows([high, missing, low], { key: "projectedYards", direction: "desc" });
    expect(desc.map((e) => e.row.playerName)).toEqual(["High", "Low", "Missing"]);
  });

  test("no sort state falls back to alphabetical by player name", () => {
    const result = sortYardageReviewRows([high, low, missing], null);
    expect(result.map((e) => e.row.playerName)).toEqual(["High", "Low", "Missing"]);
  });

  test("sorts by sportsbook line, ascending and descending, with unmatched lines sorting last", () => {
    const lowLine = { ...buildRow({ playerName: "LowLine" }), marketInfo: { available: true, line: 40, book: "draftkings", overPrice: "-110", underPrice: "-110", rawDifference: 0, lastUpdate: "x" } as const };
    const highLine = { ...buildRow({ playerName: "HighLine" }), marketInfo: { available: true, line: 90, book: "draftkings", overPrice: "-110", underPrice: "-110", rawDifference: 0, lastUpdate: "x" } as const };
    const noLine = { ...buildRow({ playerName: "NoLine" }), marketInfo: { available: false } as const };

    const asc = sortYardageReviewRows([highLine, noLine, lowLine], { key: "line", direction: "asc" });
    expect(asc.map((e) => e.row.playerName)).toEqual(["LowLine", "HighLine", "NoLine"]);

    const desc = sortYardageReviewRows([highLine, noLine, lowLine], { key: "line", direction: "desc" });
    expect(desc.map((e) => e.row.playerName)).toEqual(["HighLine", "LowLine", "NoLine"]);
  });
});
