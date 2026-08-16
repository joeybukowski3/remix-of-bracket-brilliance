import { describe, expect, it } from "vitest";
import {
  buildScales,
  filterRows,
  getOutsideRows,
  getTieredRows,
} from "@/lib/fantasy/positionBoardModel";
import { getParPerGameTone } from "@/lib/fantasy/parPresentation";
import { PAR_POSITIONS, PAR_POSITION_LIMITS, PAR_TIER_BOUNDARIES } from "@/lib/fantasy/parRankings";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

describe.each(PAR_POSITIONS)("%s board rows", (position) => {
  const rows = getTieredRows(position);

  it("covers the full approved tier universe", () => {
    expect(rows).toHaveLength(PAR_POSITION_LIMITS[position]);
  });

  it("orders every row by projected PAR/G descending", () => {
    const parPerGame = rows.map((entry) => entry.row.par!.parPerGame);
    expect(parPerGame).toEqual([...parPerGame].sort((a, b) => b - a));
  });

  it("labels rank by PAR rank with the position abbreviation", () => {
    expect(rows.map((entry) => entry.positionRankLabel)).toEqual(
      rows.map((entry) => `${position}${entry.row.par!.parRank}`),
    );
    expect(rows[0].positionRankLabel).toBe(`${position}1`);
  });

  it("marks the first row of each approved tier, never the leading row", () => {
    const filtered = filterRows(rows, "");
    expect(filtered[0].isTierStart).toBe(false);
    expect(filtered.filter((entry) => entry.isTierStart)).toHaveLength(
      PAR_TIER_BOUNDARIES[position].length - 1,
    );
  });

  it("resolves three evidence metrics per row from the workbook", () => {
    expect(rows.every((entry) => entry.metrics.length === 3)).toBe(true);
  });

  it("leaves untiered rows without a rank label, tier or 2025 join", () => {
    const outside = getOutsideRows(position);
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.every((entry) => entry.positionRankLabel === undefined)).toBe(true);
    expect(outside.every((entry) => entry.row.tier === undefined)).toBe(true);
    expect(outside.every((entry) => entry.actual2025 === undefined)).toBe(true);
  });
});

describe("per-position scales", () => {
  const scales = Object.fromEntries(
    PAR_POSITIONS.map((position) => [position, buildScales(getTieredRows(position))]),
  ) as Record<FantasyPosition, ReturnType<typeof buildScales>>;

  it("derives a distinct PAR/G elite cutoff for each position", () => {
    const cutoffs = PAR_POSITIONS.map((position) => scales[position].par!.eliteMin);
    expect(new Set(cutoffs.map((value) => value.toFixed(3))).size).toBe(PAR_POSITIONS.length);
    // QB's cutoff must not leak onto the skill positions.
    expect(scales.WR.par!.eliteMin).toBeLessThan(scales.QB.par!.eliteMin);
    expect(scales.RB.par!.eliteMin).toBeGreaterThan(scales.QB.par!.eliteMin);
  });

  it("scales each gradient column to its own pool, so skill positions run wider", () => {
    for (const position of PAR_POSITIONS) {
      for (const key of ["metric0", "metric1", "metric2", "sos", "oline"] as const) {
        expect(scales[position][key]).toBeGreaterThan(1);
      }
    }
    expect(scales.WR.metric0!).toBeGreaterThan(scales.QB.metric0!);
    expect(scales.RB.metric0!).toBeGreaterThan(scales.QB.metric0!);
  });

  it("keeps the near-replacement band flat at ±1.0 across positions", () => {
    for (const position of PAR_POSITIONS) {
      expect(getParPerGameTone(0.9, scales[position].par)).toBe("near");
      expect(getParPerGameTone(-0.9, scales[position].par)).toBe("near");
      expect(getParPerGameTone(-1.4, scales[position].par)).toBe("below");
    }
  });
});

describe("2025 actual join across positions", () => {
  it("joins every tiered row that has populated 2025 stats", () => {
    const joined = Object.fromEntries(
      PAR_POSITIONS.map((position) => [
        position,
        getTieredRows(position).filter((entry) => entry.actual2025).length,
      ]),
    );
    // The gaps are the null-stat rookie rows, which must stay unjoined.
    expect(joined).toEqual({ QB: 18, RB: 59, WR: 70, TE: 18 });
  });

  it("joins on Source ID and never across positions", () => {
    for (const position of PAR_POSITIONS) {
      for (const entry of getTieredRows(position)) {
        if (!entry.actual2025) continue;
        expect(entry.actual2025.sourceId).toBe(entry.row.par!.sourceId);
        expect(entry.actual2025.position).toBe(position);
      }
    }
  });

  it("leaves the 2026 projection untouched by the join", () => {
    const gibbs = getTieredRows("RB").find((entry) => entry.row.player === "Jahmyr Gibbs");
    expect(gibbs?.actual2025?.seasonPar).toBe(160.7);
    expect(gibbs?.row.par?.projectedSeasonPar).toBeCloseTo(159.6, 1);
  });
});

describe("filterRows", () => {
  it("matches on player name and team", () => {
    expect(filterRows(getTieredRows("RB"), "jahmyr gibbs")).toHaveLength(1);
    expect(filterRows(getTieredRows("WR"), "zzz-no-player")).toHaveLength(0);
  });

  it("re-marks tier starts against the filtered subset", () => {
    const filtered = filterRows(getTieredRows("WR"), "phi");
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0].isTierStart).toBe(false);
  });
});
