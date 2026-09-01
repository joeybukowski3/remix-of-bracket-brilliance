import { describe, expect, it } from "vitest";
import {
  buildPowerRatingsHeat,
  POWER_RATINGS_HEAT_COLUMNS,
  type PowerRatingsHeatColumn,
} from "@/lib/nfl/powerRatingsHeat";
import { jkbHeatStyle, tierToWeeklyHeatTone } from "@/lib/shared/jkbHeat";
import type { PowerRatingsRow } from "@/hooks/useNflPowerRatingsBoard";

/** A 32-team population where `ovr.value === index` (T31 best, T00 worst). */
function board(overrides: Partial<Record<string, number | null>> = {}): PowerRatingsRow[] {
  return Array.from({ length: 32 }, (_, i) => {
    const abbr = `T${String(i).padStart(2, "0")}`;
    const v = abbr in overrides ? overrides[abbr]! : i;
    const cell = (value: number | null) => ({ value, rank: null });
    return {
      abbr,
      name: abbr,
      slug: null,
      color: "#000",
      rank: null,
      ovr: cell(v),
      off: cell(v),
      def: cell(v),
      ypp: cell(v),
      epa: cell(v),
      success: cell(v),
      sos: { value: 10, rank: 1 },
      record: null,
      recordStats: null,
    } as PowerRatingsRow;
  });
}

const tierOf = (rows: PowerRatingsRow[], abbr: string, col: PowerRatingsHeatColumn = "ovr") =>
  buildPowerRatingsHeat(rows).resolve(col, abbr)?.tierId ?? null;

describe("buildPowerRatingsHeat — canonical shared JKB Heat", () => {
  it("only the six scored composite columns are heated (no SoS / Record / Team)", () => {
    expect([...POWER_RATINGS_HEAT_COLUMNS]).toEqual(["ovr", "off", "def", "ypp", "epa", "success"]);
  });

  it("cell style is exactly the shared jkbHeatStyle for the resolved tier — no local palette", () => {
    const heat = buildPowerRatingsHeat(board());
    const resolved = heat.resolve("ovr", "T31");
    expect(resolved?.tierId).toBe("elite");
    expect(resolved?.style).toEqual(jkbHeatStyle(tierToWeeklyHeatTone("elite")));
  });

  it("fixed-team n−1 percentile: best finite team reaches Elite, worst reaches Poor", () => {
    const rows = board();
    expect(tierOf(rows, "T31")).toBe("elite");
    expect(tierOf(rows, "T00")).toBe("poor");
    expect(buildPowerRatingsHeat(rows).resolve("ovr", "T31")?.percentile).toBe(100);
    expect(buildPowerRatingsHeat(rows).resolve("ovr", "T00")?.percentile).toBe(0);
  });

  it("mid-pack resolves to Average (neutral slate), 60–79 to Above Average (soft green)", () => {
    const rows = board();
    expect(tierOf(rows, "T16")).toBe("average");
    expect(tierOf(rows, "T20")).toBe("aboveAverage");
  });

  it("unfavorable bands use the red half of the one scale", () => {
    const rows = board();
    expect(tierOf(rows, "T12")).toBe("belowAverage");
    expect(tierOf(rows, "T05")).toBe("weak");
    expect(tierOf(rows, "T02")).toBe("poor");
  });

  it("near-top ranks step down through Excellent then Great", () => {
    const rows = board();
    expect(tierOf(rows, "T30")).toBe("excellent");
    expect(tierOf(rows, "T29")).toBe("great");
  });

  it("tied values receive an identical percentile and tier", () => {
    const rows = board({ T10: 10, T11: 10 });
    const heat = buildPowerRatingsHeat(rows);
    expect(heat.resolve("ovr", "T10")?.percentile).toBe(heat.resolve("ovr", "T11")?.percentile);
    expect(heat.resolve("ovr", "T10")?.tierId).toBe(heat.resolve("ovr", "T11")?.tierId);
  });

  it("missing / non-finite value → no heat (never an Average fill)", () => {
    const rows = board({ T15: null });
    expect(buildPowerRatingsHeat(rows).resolve("ovr", "T15")).toBeNull();
  });

  it("every scored column is higher-is-better (highest value → Elite, lowest → Poor)", () => {
    const rows = board();
    for (const col of POWER_RATINGS_HEAT_COLUMNS) {
      expect(tierOf(rows, "T31", col)).toBe("elite");
      expect(tierOf(rows, "T00", col)).toBe("poor");
    }
  });

  it("heat depends only on the population, not on row order", () => {
    const rows = board();
    const forward = buildPowerRatingsHeat(rows).resolve("ovr", "T20")?.tierId;
    const reversed = buildPowerRatingsHeat([...rows].reverse()).resolve("ovr", "T20")?.tierId;
    expect(forward).toBe(reversed);
  });

  it("a column no team can supply yields no heat rather than a fabricated spread", () => {
    const rows = board().map((r) => ({ ...r, epa: { value: null, rank: null } }));
    const heat = buildPowerRatingsHeat(rows);
    expect(rows.every((r) => heat.resolve("epa", r.abbr) === null)).toBe(true);
  });
});
