import { describe, expect, it } from "vitest";
import type { StatProjection } from "../../projection";
import { commonSample, decompose, DIAGNOSTIC_SEGMENTS, PREGAME_SEGMENTS, rateErrors, RATE_MIN_MINUTES, scoreMethods, segmentTable, summarize, THIN_SEGMENT_ROWS, pairedAgainstBaselines } from "./backtestMetrics";
import { biasCorrectionGains, compareVariant, MIN_LEARNING_ROWS, secondHalfStart, VARIANTS } from "./opportunities";
import { METHODS, type Actual, type BacktestRow, type Method } from "./walkForward";

const proj = (minutes: number, pts: number, reb = 0, ast = 0): StatProjection => ({ minutes, pts, reb, ast });

/** A scored row where every method projects the same thing unless overridden. Invented numbers. */
function row(over: Omit<Partial<BacktestRow>, "actual" | "predictions"> & { predict?: Partial<Record<Method, StatProjection>>; actual?: Partial<Actual> } = {}): BacktestRow {
  const base = proj(30, 15, 6, 4);
  const { predict, actual, ...rest } = over;
  return {
    season: "2025-26", gameDate: "2025-12-01", gameId: "g1", playerId: "p1", team: "BOS", isHome: true, priorGames: 25, historyTier: "full",
    flags: { teamChangedRecently: false, returningFromAbsence: false, roleChange: false }, teamRestDays: 2, marginAbs: 8, expectedAbsMargin: 4, opponentDefense: 0,
    predictions: { v0: base, naive_l5: base, naive_l10: base, naive_season_to_date: base, ...predict },
    actual: { minutes: 30, pts: 15, reb: 6, ast: 4, ...actual },
    ...rest,
  };
}

describe("scoreMethods and commonSample", () => {
  it("computes MAE, RMSE and signed bias per method and measure", () => {
    const rows = [row({ predict: { v0: proj(30, 20) }, actual: { pts: 15 } }), row({ predict: { v0: proj(30, 10) }, actual: { pts: 16 } })];
    const pts = scoreMethods(rows).v0.pts;
    expect(pts).toMatchObject({ n: 2, mae: (5 + 6) / 2, bias: (5 - 6) / 2 });
    expect(pts.rmse).toBeCloseTo(Math.sqrt((25 + 36) / 2), 12);
    expect(scoreMethods(rows).naive_l5.pts.mae).toBe((0 + 1) / 2);
  });

  it("scores every method on the same rows: a row any method cannot project is left out for all", () => {
    const hole = row({ predict: { naive_season_to_date: { minutes: null, pts: null, reb: null, ast: null } } });
    const rows = [row(), hole];
    expect(commonSample(rows)).toHaveLength(1);
    expect(summarize(rows).rows).toBe(1);
    expect(scoreMethods(commonSample(rows)).v0.minutes.n).toBe(1);
  });
});

describe("pairedAgainstBaselines", () => {
  it("is negative when v0 is closer than the baseline, and clusters errors by player and by calendar week", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row({ playerId: `p${i % 8}`, gameDate: `2025-12-${String((i % 28) + 1).padStart(2, "0")}`, predict: { v0: proj(30, 15), naive_l5: proj(30, 20) }, actual: { pts: 15 + (i % 2) } }));
    const diff = pairedAgainstBaselines(rows).pts.naive_l5;
    expect(diff.n).toBe(40);
    expect(diff.meanDiff).toBeLessThan(0);
    expect(diff.clusters).toBeGreaterThan(1);
    expect(diff.ci95?.[1]).toBeLessThan(0);
  });
});

describe("rateErrors", () => {
  it("measures the per-minute rate as projected stat over projected minutes against stat over minutes played", () => {
    const rows = [row({ predict: { v0: proj(30, 15) }, actual: { minutes: 20, pts: 20 } })];
    // projected 0.5 per minute, actual 1.0 per minute
    expect(rateErrors(rows).v0.pts.mae).toBeCloseTo(0.5, 12);
    expect(rateErrors(rows).v0.pts.minutesWeightedMae).toBeCloseTo(0.5, 12);
  });

  it("leaves cameos out of the unweighted rate error but keeps them in the minutes-weighted one", () => {
    expect(RATE_MIN_MINUTES).toBe(10);
    const rows = [row({ predict: { v0: proj(30, 15) }, actual: { minutes: 20, pts: 10 } }), row({ predict: { v0: proj(30, 15) }, actual: { minutes: 2, pts: 2 } })];
    const e = rateErrors(rows).v0.pts;
    expect(e.n).toBe(1);
    expect(e.mae).toBeCloseTo(0, 12);
    expect(e.minutesWeightedMae).toBeCloseTo((0 * 20 + 0.5 * 2) / 22, 12);
  });
});

describe("decompose", () => {
  it("equals the projected error when minutes are right (oracle minutes) or when the rate is right (oracle rate)", () => {
    const minutesRight = [row({ predict: { v0: proj(30, 15) }, actual: { minutes: 30, pts: 24 } })];
    const d1 = decompose(minutesRight).pts;
    expect(d1).toMatchObject({ actualMae: 9, oracleMinutesMae: 9, oracleRateMae: 0 });
    const rateRight = [row({ predict: { v0: proj(30, 15) }, actual: { minutes: 20, pts: 10 } })];
    const d2 = decompose(rateRight).pts;
    expect(d2.actualMae).toBeCloseTo(5, 12);
    expect(d2.oracleRateMae).toBeCloseTo(5, 12);
    expect(d2.oracleMinutesMae).toBeCloseTo(0, 12);
  });
});

describe("segments", () => {
  it("tiers projected minutes at 15 and 28, as the board's role does, and sample size at 5, 10, 20 and 40 prior games", () => {
    const tier = PREGAME_SEGMENTS.projectedMinutesTier;
    expect([14.9, 15, 27.9, 28].map((m) => tier(row({ predict: { v0: proj(m, 1) } })))).toEqual(["bench", "rotation", "rotation", "core"]);
    const band = PREGAME_SEGMENTS.priorGames;
    expect([1, 4, 5, 9, 10, 19, 20, 39, 40, 80].map((n) => band(row({ priorGames: n })))).toEqual(["1-4", "1-4", "05-09", "05-09", "10-19", "10-19", "20-39", "20-39", "40+", "40+"]);
  });

  it("bands rest, expected margin and opponent defense, with an explicit bucket for too little history", () => {
    expect([null, 1, 2, 4].map((d) => PREGAME_SEGMENTS.teamRest(row({ teamRestDays: d })))).toEqual(["first game", "back-to-back", "1 day rest", "2+ days rest"]);
    expect([null, 2.9, 3, 6].map((m) => PREGAME_SEGMENTS.expectedMarginBand(row({ expectedAbsMargin: m })))).toEqual(["too early", "0-3", "3-6", "6+"]);
    expect([null, 3, 0, -3].map((m) => PREGAME_SEGMENTS.opponentDefenseBand(row({ opponentDefense: m })))).toEqual(["too early", "weak defense", "average", "strong defense"]);
  });

  it("labels the outcome-dependent segmentations as diagnostics, apart from the pregame ones", () => {
    expect(Object.keys(DIAGNOSTIC_SEGMENTS).sort()).toEqual(["actualMinutesBand", "finalMarginBand"]);
    expect(Object.keys(PREGAME_SEGMENTS)).not.toContain("actualMinutesBand");
    expect(Object.keys(PREGAME_SEGMENTS)).not.toContain("finalMarginBand");
  });

  it("flags a segment too small to read as a finding", () => {
    const rows = [...Array.from({ length: THIN_SEGMENT_ROWS }, () => row({ isHome: true })), row({ isHome: false })];
    const table = segmentTable(rows, PREGAME_SEGMENTS.homeAway);
    expect(table.home).toMatchObject({ rows: THIN_SEGMENT_ROWS, thin: false });
    expect(table.away).toMatchObject({ rows: 1, thin: true });
  });

  it("scores each method inside each segment", () => {
    const rows = [row({ isHome: true, predict: { v0: proj(30, 20) } }), row({ isHome: false, predict: { v0: proj(30, 12) } })];
    const table = segmentTable(rows, PREGAME_SEGMENTS.homeAway);
    expect(table.home.errors.v0.pts.mae).toBe(5);
    expect(table.away.errors.v0.pts.mae).toBe(3);
    expect(METHODS.every((m) => table.home.errors[m])).toBe(true);
  });
});

describe("opportunities", () => {
  const dated = (day: number, over: Parameters<typeof row>[0] = {}) => row({ gameDate: `2025-12-${String(day).padStart(2, "0")}`, ...over });

  it("splits the sample at the middle game date", () => {
    expect(secondHalfStart([dated(1), dated(2), dated(3), dated(4)])).toBe("2025-12-03");
    expect(secondHalfStart([dated(1)])).toBeNull();
  });

  it("learns a segment's median error in the first half and removes it from the second half", () => {
    // Home v0 minutes are 4 too high in the first half, away rows are unbiased.
    const first = Array.from({ length: MIN_LEARNING_ROWS }, (_, i) => dated(1 + (i % 10), { isHome: true, predict: { v0: proj(34, 15) }, actual: { minutes: 30 } }));
    const second = Array.from({ length: MIN_LEARNING_ROWS }, (_, i) => dated(15 + (i % 10), { isHome: true, predict: { v0: proj(34, 15) }, actual: { minutes: 30 } }));
    const gain = biasCorrectionGains([...first, ...second], ["minutes"]).find((g) => g.segmentation === "homeAway");
    expect(gain).toMatchObject({ measure: "minutes", rows: MIN_LEARNING_ROWS, maeBefore: 4, maeAfter: 0 });
    expect(gain?.difference.meanDiff).toBe(-4);
  });

  it("gives a segment with too few learning rows no correction, so it cannot overfit", () => {
    const first = Array.from({ length: MIN_LEARNING_ROWS - 1 }, (_, i) => dated(1 + (i % 10), { predict: { v0: proj(34, 15) }, actual: { minutes: 30 } }));
    const second = Array.from({ length: 10 }, (_, i) => dated(15 + i, { predict: { v0: proj(34, 15) }, actual: { minutes: 30 } }));
    const gain = biasCorrectionGains([...first, ...second], ["minutes"]).find((g) => g.segmentation === "all");
    expect(gain?.maeAfter).toBe(gain?.maeBefore);
  });

  it("learns nothing from the later half: the correction is the same whatever happens after the split", () => {
    const first = Array.from({ length: MIN_LEARNING_ROWS }, (_, i) => dated(1 + (i % 10), { predict: { v0: proj(34, 15) }, actual: { minutes: 30 } }));
    const second = (minutes: number) => Array.from({ length: 20 }, (_, i) => dated(15 + i, { predict: { v0: proj(34, 15) }, actual: { minutes } }));
    const shiftFrom = (rows: BacktestRow[]) => biasCorrectionGains(rows, ["minutes"]).find((g) => g.segmentation === "all");
    const a = shiftFrom([...first, ...second(30)]);
    const b = shiftFrom([...first, ...second(10)]);
    // The correction learned on the first half is 4 in both; only the later-half error differs.
    expect(a?.maeBefore).toBe(4);
    expect(a?.maeAfter).toBe(0);
    expect(b?.maeBefore).toBe(24);
    expect(b?.maeAfter).toBe(20);
  });

  it("compares a variant with the default on the same player-games, paired", () => {
    const defaults = Array.from({ length: 30 }, (_, i) => dated(1 + (i % 28), { gameId: `g${i}`, predict: { v0: proj(34, 15) }, actual: { minutes: 30 } }));
    const better = defaults.map((r) => ({ ...r, predictions: { ...r.predictions, v0: proj(30, 15) } }));
    const result = compareVariant(VARIANTS[0], better, defaults);
    expect(result.id).toBe(VARIANTS[0].id);
    expect(result.all.minutes.meanDiff).toBe(-4);
    expect(result.all.pts.meanDiff).toBe(0);
    expect(result.mae.minutes).toBe(0);
    expect(compareVariant(VARIANTS[0], defaults, defaults).all.minutes.meanDiff).toBe(0);
  });

  it("fixes the sensitivity variants in advance, each changing only the parameters it names", () => {
    expect(VARIANTS.map((v) => v.id)).toEqual(["minutes-no-shrink", "minutes-recent-no-shrink", "rate-shrink-0", "rate-shrink-25", "rate-shrink-50", "rate-shrink-400"]);
    expect(VARIANTS[0].params.minutesShrinkGames).toBe(0);
    expect(VARIANTS[3].params.rateShrinkMinutes).toEqual({ pts: 25, reb: 25, ast: 25 });
    expect(VARIANTS[3].params.minutesShrinkGames).toBe(2);
  });
});
