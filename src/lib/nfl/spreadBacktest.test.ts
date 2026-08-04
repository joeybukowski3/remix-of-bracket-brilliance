import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BACKTEST_SEASONS,
  loadSpreadDataset,
  runBacktest,
} from "../../../scripts/lib/nfl-spread-dataset.mjs";
import { homeFieldFor } from "../../../scripts/lib/nfl-spread-model.mjs";
import { parseCsv } from "../../../scripts/lib/nfl-schedules-results-core.mjs";

/**
 * Walk-forward regression tests for nfl-spread-v0.1.0.
 *
 * These lock in the accuracy the Phase 8B audit measured. They run the same
 * engine the artifact generator runs, over the same committed EPA cache and
 * schedules, so a silent change to the sample rule, the weights, the prior, the
 * opponent adjustment or the beta fit shows up here as a number moving.
 *
 * Tolerances are deliberately tight but not exact: they should survive an EPA
 * cache refresh that revises a handful of plays, and fail on a methodology
 * change.
 */

const ROOT = resolve(process.cwd());
const dataset = loadSpreadDataset(ROOT);
const { bySeason, pooled } = runBacktest(dataset);

/** Audited walk-forward results, entering each season. */
const EXPECTED = {
  2022: { mae: 9.19, beta: 5.05 },
  2023: { mae: 10.36, beta: 4.19 },
  2024: { mae: 10.2, beta: 4.3 },
  2025: { mae: 10.31, beta: 4.55 },
} as const;

const MAE_TOLERANCE = 0.25;
const BETA_TOLERANCE = 0.3;

describe("walk-forward backtest by season", () => {
  it.each(BACKTEST_SEASONS as number[])("reproduces the audited %i season", (season) => {
    const m = bySeason.get(season)!;
    const expected = EXPECTED[season as keyof typeof EXPECTED];
    expect(m.n).toBeGreaterThanOrEqual(270);
    expect(m.mae).toBeGreaterThan(expected.mae - MAE_TOLERANCE);
    expect(m.mae).toBeLessThan(expected.mae + MAE_TOLERANCE);
    expect(m.beta).toBeGreaterThan(expected.beta - BETA_TOLERANCE);
    expect(m.beta).toBeLessThan(expected.beta + BETA_TOLERANCE);
  });

  it("fits every season's beta only on strictly earlier seasons", () => {
    for (const season of BACKTEST_SEASONS as number[]) {
      const { fitSeasons } = dataset.betaFor(season);
      expect(fitSeasons.length).toBeGreaterThan(0);
      expect(Math.max(...fitSeasons)).toBeLessThan(season);
    }
  });

  it("keeps season bias small in both directions", () => {
    for (const season of BACKTEST_SEASONS as number[]) {
      expect(Math.abs(bySeason.get(season)!.bias)).toBeLessThan(1.0);
    }
  });
});

describe("pooled walk-forward accuracy", () => {
  it("covers four full seasons", () => {
    expect(pooled.n).toBeGreaterThanOrEqual(1080);
    expect(pooled.n).toBeLessThanOrEqual(1090);
  });

  it("reproduces the audited pooled MAE of about 10.02", () => {
    expect(pooled.mae).toBeGreaterThan(10.02 - MAE_TOLERANCE);
    expect(pooled.mae).toBeLessThan(10.02 + MAE_TOLERANCE);
  });

  it("is well calibrated: slope near 1 and intercept near 0", () => {
    expect(pooled.calibrationSlope).toBeGreaterThan(0.9);
    expect(pooled.calibrationSlope).toBeLessThan(1.06);
    expect(Math.abs(pooled.calibrationIntercept)).toBeLessThan(0.6);
  });

  it("picks the straight-up winner about 63.9% of the time", () => {
    expect(pooled.winnerAccuracy).toBeGreaterThan(0.615);
    expect(pooled.winnerAccuracy).toBeLessThan(0.665);
  });

  it("is close to unbiased overall", () => {
    expect(Math.abs(pooled.bias)).toBeLessThan(0.5);
  });
});

/**
 * The market benchmark exists to keep the product honest, not to tune the
 * model. It reads the settled historical line from the same nflverse games.csv
 * the Phase 5 pipeline uses, strictly after the projections are computed, and
 * nothing it measures feeds back into the model.
 */
describe("2025 market benchmark", () => {
  // Settled lines are read from a committed benchmark-only fixture so this runs
  // offline. Neither the model nor the generator can reach this file.
  const fixture = readFileSync(resolve(ROOT, "data/nfl/benchmark/market_lines_2025.csv"), "utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.startsWith("#"))
    .join("\n");
  const marketByGameId = new Map<string, number>(
    (parseCsv(fixture) as Array<Record<string, string>>).map((r) => [r.game_id, Number(r.spread_line)])
  );

  const { beta } = dataset.betaFor(2025);
  const rows = (dataset.observationsBySeason.get(2025) ?? [])
    .map((o: { gameId: string; strengthDiff: number; neutralSite: boolean; margin: number }) => {
      const market = marketByGameId.get(o.gameId);
      if (market == null || !Number.isFinite(market)) return null;
      return {
        model: beta * o.strengthDiff + homeFieldFor(o.neutralSite),
        market,
        actual: o.margin,
      };
    })
    .filter((r): r is { model: number; market: number; actual: number } => r !== null);

  const mae = (values: number[]) => values.reduce((s, v) => s + Math.abs(v), 0) / values.length;

  it("joins a settled line for essentially the whole season", () => {
    expect(rows.length).toBeGreaterThan(260);
  });

  it("states the market line as a home margin, matching the model's convention", () => {
    // A home favourite carries a positive nflverse spread_line, exactly as a
    // positive projectedHomeMargin means the home team is favoured.
    const philly = marketByGameId.get("2025_01_DAL_PHI");
    expect(philly).toBeGreaterThan(0);
  });

  it("does not beat the market, which is why no bet is recommended", () => {
    const modelMae = mae(rows.map((r) => r.model - r.actual));
    const marketMae = mae(rows.map((r) => r.market - r.actual));
    expect(modelMae).toBeGreaterThan(10.0);
    expect(modelMae).toBeLessThan(10.7);
    expect(marketMae).toBeGreaterThan(9.4);
    expect(marketMae).toBeLessThan(10.0);
    // The gap is the whole point: the market is the sharper estimate, so the UI
    // frames the difference as "Model vs Market" rather than an edge.
    expect(modelMae).toBeGreaterThan(marketMae);
  });

  it("does not turn its ATS diagnostic into an edge", () => {
    let wins = 0;
    let losses = 0;
    for (const r of rows) {
      const lean = r.model - r.market;
      const cover = r.actual - r.market;
      if (lean === 0 || cover === 0) continue;
      if (Math.sign(lean) === Math.sign(cover)) wins += 1;
      else losses += 1;
    }
    // Below the ~52.4% break-even. Recorded so a future change cannot quietly
    // claim an edge that the data does not support.
    expect(wins / (wins + losses)).toBeLessThan(0.524);
  });
});
