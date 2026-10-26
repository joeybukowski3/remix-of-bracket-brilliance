import { describe, expect, it } from "vitest";
import { basisFor, EARLY_SEASON_GAMES, marketRates, ratio, seasonColumns, type SeasonTotals } from "./seasonStats";

const totals = (season: string, games: number, minutes: number, pts: number, reb: number, ast: number): SeasonTotals => ({ season, games, minutes, pts, reb, ast });

describe("ratio", () => {
  it("divides over a positive denominator and is null otherwise: no zero is invented for a missing sample", () => {
    expect(ratio(10, 4)).toBe(2.5);
    expect(ratio(0, 4)).toBe(0);
    expect(ratio(10, 0)).toBeNull();
    expect(ratio(10, -1)).toBeNull();
    expect(ratio(Number.NaN, 4)).toBeNull();
    expect(ratio(10, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("basisFor", () => {
  it("computes per-game figures over games and per-minute figures over minutes", () => {
    const basis = basisFor(totals("2026-27", 4, 120, 80, 24, 16));
    expect(basis).toMatchObject({ season: "2026-27", games: 4, mpg: 30, ppg: 20, rpg: 6, apg: 4 });
    expect(basis?.ptsPerMinute).toBeCloseTo(80 / 120, 12);
    expect(basis?.rebPerMinute).toBeCloseTo(0.2, 12);
    expect(basis?.astPerMinute).toBeCloseTo(16 / 120, 12);
  });

  it("is null for no games, and keeps per-game figures but not rates when there are no minutes", () => {
    expect(basisFor(null)).toBeNull();
    expect(basisFor(totals("2026-27", 0, 0, 0, 0, 0))).toBeNull();
    const noMinutes = basisFor(totals("2026-27", 2, 0, 0, 0, 0));
    expect(noMinutes).toMatchObject({ mpg: 0, ppg: 0 });
    expect(noMinutes?.ptsPerMinute).toBeNull();
    expect(noMinutes?.rebPerMinute).toBeNull();
  });
});

describe("seasonColumns: two seasons, never blended", () => {
  const previous = totals("2025-26", 70, 2100, 1400, 420, 280);

  it("shows the previous season beside a short current sample, as its own basis with its own label", () => {
    const columns = seasonColumns({ current: totals("2026-27", 3, 90, 60, 18, 9), previous });
    expect(EARLY_SEASON_GAMES).toBe(15);
    expect(columns?.showPrevious).toBe(true);
    expect(columns?.current).toMatchObject({ season: "2026-27", games: 3, ppg: 20 });
    expect(columns?.previous).toMatchObject({ season: "2025-26", games: 70, ppg: 20 });
    // The current figures are the current season's own: nothing from last season is mixed in.
    expect(columns?.current?.mpg).toBe(30);
    expect(columns?.current?.ppg).toBe(20);
  });

  it("keeps the previous season out of the way once the current sample is large enough", () => {
    const full = seasonColumns({ current: totals("2026-27", EARLY_SEASON_GAMES, 450, 300, 90, 60), previous });
    expect(full?.showPrevious).toBe(false);
    const justUnder = seasonColumns({ current: totals("2026-27", EARLY_SEASON_GAMES - 1, 420, 300, 90, 60), previous });
    expect(justUnder?.showPrevious).toBe(true);
  });

  it("with no current games shows only last season, on its own, and no current figures", () => {
    const columns = seasonColumns({ current: null, previous });
    expect(columns?.current).toBeNull();
    expect(columns?.showPrevious).toBe(true);
    expect(columns?.previous?.games).toBe(70);
  });

  it("has nothing to show without any season, and never shows a previous season that does not exist", () => {
    expect(seasonColumns(undefined)).toBeNull();
    expect(seasonColumns(null)).toBeNull();
    expect(seasonColumns({ current: null, previous: null })).toBeNull();
    const rookie = seasonColumns({ current: totals("2026-27", 2, 40, 20, 10, 4), previous: null });
    expect(rookie?.showPrevious).toBe(false);
    expect(rookie?.previous).toBeNull();
  });
});

describe("marketRates", () => {
  const basis = basisFor(totals("2026-27", 10, 300, 200, 90, 60));

  it("picks the market's own per-game and per-minute figure", () => {
    expect(marketRates(basis, "pts")).toEqual({ perGame: 20, perMinute: 200 / 300 });
    expect(marketRates(basis, "reb")).toEqual({ perGame: 9, perMinute: 0.3 });
    expect(marketRates(basis, "ast")).toEqual({ perGame: 6, perMinute: 0.2 });
  });

  it("is null for a missing basis", () => {
    expect(marketRates(null, "reb")).toEqual({ perGame: null, perMinute: null });
  });
});
