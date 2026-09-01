import { describe, expect, it } from "vitest";
import type { PowerRatingsRow } from "@/hooks/useNflPowerRatingsBoard";
import { groupRowsByConference, groupRowsByDivision } from "@/lib/nfl/powerRatingsGroups";

const CELL = { value: null, rank: null } as const;

function row(abbr: string, conference: "AFC" | "NFC", division: string, rank: number): PowerRatingsRow {
  return {
    abbr,
    name: abbr.toUpperCase(),
    slug: null,
    color: "#000000",
    conference,
    division,
    rank,
    off: CELL,
    def: CELL,
    ovr: CELL,
    ypp: CELL,
    epa: CELL,
    success: CELL,
    sos: CELL,
    record: null,
    recordStats: null,
  };
}

const ROWS: PowerRatingsRow[] = [
  row("buf", "AFC", "AFC East", 1),
  row("mia", "AFC", "AFC East", 2),
  row("kc", "AFC", "AFC West", 3),
  row("den", "AFC", "AFC West", 4),
  row("dal", "NFC", "NFC East", 5),
  row("phi", "NFC", "NFC East", 6),
  row("sf", "NFC", "NFC West", 7),
  row("sea", "NFC", "NFC West", 8),
];

describe("groupRowsByConference", () => {
  it("splits into AFC then NFC, preserving the input's relative order and every team exactly once", () => {
    const groups = groupRowsByConference(ROWS);
    expect(groups.map((g) => g.key)).toEqual(["AFC", "NFC"]);
    expect(groups[0].rows.map((r) => r.abbr)).toEqual(["buf", "mia", "kc", "den"]);
    expect(groups[1].rows.map((r) => r.abbr)).toEqual(["dal", "phi", "sf", "sea"]);

    const allAbbrs = groups.flatMap((g) => g.rows.map((r) => r.abbr));
    expect(new Set(allAbbrs).size).toBe(ROWS.length);
  });

  it("never lets a team cross a conference boundary", () => {
    const groups = groupRowsByConference(ROWS);
    for (const group of groups) {
      for (const r of group.rows) {
        expect(r.conference).toBe(group.key);
      }
    }
  });
});

describe("groupRowsByDivision", () => {
  it("renders exactly 8 divisions in AFC/NFC, E/N/S/W order and every team exactly once", () => {
    const groups = groupRowsByDivision(ROWS);
    expect(groups).toHaveLength(8);
    expect(groups.map((g) => g.key)).toEqual([
      "AFC East",
      "AFC North",
      "AFC South",
      "AFC West",
      "NFC East",
      "NFC North",
      "NFC South",
      "NFC West",
    ]);

    const allAbbrs = groups.flatMap((g) => g.rows.map((r) => r.abbr));
    expect(new Set(allAbbrs).size).toBe(ROWS.length);
  });

  it("keeps the input's relative order within each division and never crosses a boundary", () => {
    const groups = groupRowsByDivision(ROWS);
    const afcEast = groups.find((g) => g.key === "AFC East");
    expect(afcEast?.rows.map((r) => r.abbr)).toEqual(["buf", "mia"]);

    for (const group of groups) {
      for (const r of group.rows) {
        expect(r.division).toBe(group.key);
      }
    }
  });
});
