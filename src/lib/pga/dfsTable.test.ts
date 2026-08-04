import { describe, expect, it } from "vitest";
import {
  filterPgaDfsRows,
  PGA_DFS_VALUE_THRESHOLD,
  sortPgaDfsRows,
  type PgaDfsSortKey,
  type PgaDfsTableRow,
} from "@/lib/pga/dfsUpload";

function row(overrides: Partial<PgaDfsTableRow> & Pick<PgaDfsTableRow, "player" | "salaryRank">): PgaDfsTableRow {
  return {
    salary: 9_000,
    modelRank: 10,
    tournamentRank: 11,
    customRank: 12,
    vsModel: 2,
    vsTournament: 3,
    vsCustom: 4,
    coverageState: "FULL_MODEL",
    canonicalPlayer: null,
    ...overrides,
  };
}

const lower = row({
  player: "Alpha Player",
  salaryRank: 1,
  salary: 8_000,
  modelRank: 2,
  tournamentRank: 3,
  customRank: 4,
  vsModel: -5,
  vsTournament: -4,
  vsCustom: -3,
});
const higher = row({
  player: "Bravo Player",
  salaryRank: 2,
  salary: 10_000,
  modelRank: 20,
  tournamentRank: 21,
  customRank: 22,
  vsModel: 10,
  vsTournament: 11,
  vsCustom: 12,
});
const missing = row({
  player: "Missing Player",
  salaryRank: 3,
  modelRank: null,
  tournamentRank: null,
  customRank: null,
  vsModel: null,
  vsTournament: null,
  vsCustom: null,
  coverageState: "SALARY_BASELINE",
});

describe("PGA DFS table sorting", () => {
  const sortableFields: PgaDfsSortKey[] = [
    "salaryRank",
    "player",
    "salary",
    "modelRank",
    "tournamentRank",
    "customRank",
    "vsModel",
    "vsTournament",
    "vsCustom",
  ];

  it.each(sortableFields)("sorts %s independently in both directions", (sortKey) => {
    expect(sortPgaDfsRows([higher, lower], sortKey, "asc").map((entry) => entry.player)).toEqual([
      "Alpha Player",
      "Bravo Player",
    ]);
    expect(sortPgaDfsRows([lower, higher], sortKey, "desc").map((entry) => entry.player)).toEqual([
      "Bravo Player",
      "Alpha Player",
    ]);
  });

  it.each(["modelRank", "tournamentRank", "customRank", "vsModel", "vsTournament", "vsCustom"] as PgaDfsSortKey[])(
    "keeps missing %s after real values in both directions",
    (sortKey) => {
      expect(sortPgaDfsRows([missing, higher, lower], sortKey, "asc").at(-1)?.player).toBe("Missing Player");
      expect(sortPgaDfsRows([missing, lower, higher], sortKey, "desc").at(-1)?.player).toBe("Missing Player");
    },
  );

  it("uses player name and salary rank as deterministic tie breakers", () => {
    const zulu = row({ player: "Zulu Player", salaryRank: 8, modelRank: 10 });
    const alphaSecond = row({ player: "Alpha Player", salaryRank: 9, modelRank: 10 });
    const alphaFirst = row({ player: "Alpha Player", salaryRank: 4, modelRank: 10 });
    expect(sortPgaDfsRows([zulu, alphaSecond, alphaFirst], "modelRank", "asc").map((entry) => entry.salaryRank)).toEqual([4, 9, 8]);
  });
});

describe("PGA DFS table filters", () => {
  const rows = [lower, higher, missing];
  const baseFilters = {
    salaryBounds: [0, 20_000] as const,
    compareMode: "model" as const,
    showValueOnly: false,
  };

  it("filters by partial player name and restores rows when cleared", () => {
    expect(filterPgaDfsRows(rows, { ...baseFilters, search: "rav" }).map((entry) => entry.player)).toEqual(["Bravo Player"]);
    expect(filterPgaDfsRows(rows, { ...baseFilters, search: "" })).toHaveLength(3);
  });

  it("applies inclusive minimum and maximum salary bounds", () => {
    expect(filterPgaDfsRows(rows, { ...baseFilters, search: "", salaryBounds: [8_000, 9_000] }).map((entry) => entry.player)).toEqual([
      "Alpha Player",
      "Missing Player",
    ]);
  });

  it("uses the selected comparison for Value Plays Only and excludes missing values", () => {
    const modelRows = filterPgaDfsRows(rows, { ...baseFilters, search: "", showValueOnly: true, compareMode: "model" });
    const tournamentRows = filterPgaDfsRows(rows, { ...baseFilters, search: "", showValueOnly: true, compareMode: "tournament" });
    const customRows = filterPgaDfsRows(rows, { ...baseFilters, search: "", showValueOnly: true, compareMode: "custom" });
    expect(PGA_DFS_VALUE_THRESHOLD).toBe(3);
    expect(modelRows.map((entry) => entry.player)).toEqual(["Bravo Player"]);
    expect(tournamentRows.map((entry) => entry.player)).toEqual(["Bravo Player"]);
    expect(customRows.map((entry) => entry.player)).toEqual(["Bravo Player"]);
    expect([...modelRows, ...tournamentRows, ...customRows]).not.toContainEqual(expect.objectContaining({ player: "Missing Player" }));
  });

  it("shows the normal eligible field when Value Plays Only is off", () => {
    expect(filterPgaDfsRows(rows, { ...baseFilters, search: "" }).map((entry) => entry.player)).toEqual([
      "Alpha Player",
      "Bravo Player",
      "Missing Player",
    ]);
  });
});
