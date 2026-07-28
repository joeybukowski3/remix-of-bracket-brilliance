import { describe, expect, it } from "vitest";
import type { PgaTournamentModelRow } from "@/lib/pga/historyModel";
import {
  buildPgaScorePercentileLookup,
  getPgaScoreTier,
  selectPgaScoreComparisonRows,
} from "@/lib/pga/pgaScoreColorScale";

function row(player: string, modelScore: number, modelRank: number, fieldRank: number | null) {
  return { player, modelScore, modelRank, fieldRank } as PgaTournamentModelRow;
}

const allRows = [
  row("Alpha Player", 92, 1, 1),
  row("Bravo Player", 82, 2, null),
  row("Charlie Player", 72, 3, 2),
  row("Delta Player", 62, 4, null),
  row("Echo Player", 52, 5, 3),
];

describe("PGA score color comparison populations", () => {
  it("keeps a player's tier stable when search narrows and clears the visible rows", () => {
    const comparisonRows = selectPgaScoreComparisonRows(allRows, "tour");
    const lookup = buildPgaScorePercentileLookup(comparisonRows);
    const beforeSearch = getPgaScoreTier(72, lookup)?.id;

    const searchedRows = allRows.filter((candidate) => candidate.player === "Charlie Player");
    expect(searchedRows).toHaveLength(1);
    expect(getPgaScoreTier(searchedRows[0].modelScore, lookup)?.id).toBe(beforeSearch);

    const clearedRows = [...allRows];
    expect(getPgaScoreTier(clearedRows[2].modelScore, lookup)?.id).toBe(beforeSearch);
  });

  it("does not alter tier assignment when the visible result list is filtered", () => {
    const lookup = buildPgaScorePercentileLookup(selectPgaScoreComparisonRows(allRows, "tour"));
    const baseline = allRows.map((candidate) => [candidate.player, getPgaScoreTier(candidate.modelScore, lookup)?.id]);
    const visible = allRows.filter((candidate) => candidate.modelScore >= 70);
    const visibleTiers = visible.map((candidate) => [candidate.player, getPgaScoreTier(candidate.modelScore, lookup)?.id]);
    expect(visibleTiers).toEqual(baseline.slice(0, 3));
  });

  it("uses deterministic complete field and tour populations", () => {
    const fieldPool = selectPgaScoreComparisonRows(allRows, "field");
    const tourPool = selectPgaScoreComparisonRows(allRows, "tour");

    expect(fieldPool.map((candidate) => candidate.player)).toEqual(["Alpha Player", "Charlie Player", "Echo Player"]);
    expect(tourPool.map((candidate) => candidate.player)).toEqual(allRows.map((candidate) => candidate.player));
    expect(selectPgaScoreComparisonRows(allRows, "field")).toEqual(fieldPool);
    expect(selectPgaScoreComparisonRows(allRows, "tour")).toEqual(tourPool);
  });

  it("preserves row ordering, ranks, and model scores", () => {
    const snapshot = allRows.map(({ player, modelScore, modelRank, fieldRank }) => ({ player, modelScore, modelRank, fieldRank }));
    selectPgaScoreComparisonRows(allRows, "field");
    selectPgaScoreComparisonRows(allRows, "tour");
    expect(allRows.map(({ player, modelScore, modelRank, fieldRank }) => ({ player, modelScore, modelRank, fieldRank }))).toEqual(snapshot);
  });
});
