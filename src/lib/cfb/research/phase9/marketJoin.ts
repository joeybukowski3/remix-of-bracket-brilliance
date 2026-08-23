import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_NORMALIZED_DIR } from "../config/researchConfig";
import type { CfbResearchMarketLine } from "../types";
import type { CalibratedPrediction, ProbabilityOutputs } from "../phase5/types";
import type { MarketModelJoinRow } from "../phase6/types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

function loadSeasonMarketLines(season: number): CfbResearchMarketLine[] {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_NORMALIZED_DIR, String(season), "market-lines.json"), "utf8")) as CfbResearchMarketLine[];
}

/**
 * Reconstructs the same walk-forward "strictly prior rows" residual pool
 * Phase 5's own bootstrap uses internally — duplicated here exactly the
 * way Phase 6's marketDataLoader.ts and Phase 7's missDataset.ts already
 * duplicate it (not imported/modified), so Phase 9 can price arbitrary
 * market lines against Phase 9's OWN pipeline output (baseline or
 * finalist) without touching Phase 5/6.
 */
function buildResidualPools(sortedCalibrated: readonly CalibratedPrediction[]): Map<string, { home: number[]; away: number[] }> {
  const pools = new Map<string, { home: number[]; away: number[] }>();
  for (const row of sortedCalibrated) {
    const priorRows = sortedCalibrated.filter((c) => c.season < row.season || (c.season === row.season && c.week < row.week));
    pools.set(row.gameId, {
      home: priorRows.map((c) => c.actualHomePoints - c.calibratedExpectedHome),
      away: priorRows.map((c) => c.actualAwayPoints - c.calibratedExpectedAway),
    });
  }
  return pools;
}

/**
 * Section 14 — market enters ONLY here, downstream of the already-frozen
 * (baseline or finalist) calibrated predictions/probabilities. Mirrors
 * Phase 6's buildMarketModelJoin() exactly, generalized to accept ANY
 * pipeline's output (not hardcoded to Phase 4/5's own walk-forward).
 */
export function buildPhase9MarketJoin(
  calibrated: readonly CalibratedPrediction[],
  probabilities: readonly ProbabilityOutputs[],
  testSeasons: readonly number[],
): MarketModelJoinRow[] {
  const sorted = [...calibrated].sort((a, b) => a.season - b.season || a.week - b.week);
  const residualPools = buildResidualPools(sorted);
  const probabilityByGame = new Map(probabilities.map((p) => [p.gameId, p]));
  const calibratedByGame = new Map(sorted.map((c) => [c.gameId, c]));

  const rows: MarketModelJoinRow[] = [];
  for (const season of testSeasons) {
    const marketLines = loadSeasonMarketLines(season);
    for (const line of marketLines) {
      const c = calibratedByGame.get(line.gameId);
      const probability = probabilityByGame.get(line.gameId);
      const pool = residualPools.get(line.gameId);
      if (!c || !probability || !pool || pool.home.length < 10) continue;

      rows.push({
        gameId: line.gameId,
        season: c.season,
        week: c.week,
        provider: line.provider,
        homeTeamExternalId: c.homeTeamExternalId,
        awayTeamExternalId: c.awayTeamExternalId,
        modelExpectedHome: c.calibratedExpectedHome,
        modelExpectedAway: c.calibratedExpectedAway,
        modelProjectedMargin: c.calibratedProjectedMargin,
        modelProjectedTotal: c.calibratedProjectedTotal,
        modelPHomeWin: probability.pHomeWin ?? 0.5,
        homeResidualPool: pool.home,
        awayResidualPool: pool.away,
        actualHomePoints: c.actualHomePoints,
        actualAwayPoints: c.actualAwayPoints,
        actualMargin: c.actualMargin,
        actualTotal: c.actualTotal,
        spreadOpen: line.spreadOpen,
        spreadLatestObserved: line.spreadLatestObserved,
        totalOpen: line.totalOpen,
        totalLatestObserved: line.totalLatestObserved,
        homeMoneyline: line.homeMoneyline,
        awayMoneyline: line.awayMoneyline,
      });
    }
  }
  return rows;
}

/** One market row per game — "consensus" provider if present, else alphabetically-first (same deterministic convention as Phase 6/7/8). */
export function pickOneRowPerGame(rows: readonly MarketModelJoinRow[]): MarketModelJoinRow[] {
  const byGame = new Map<string, MarketModelJoinRow[]>();
  for (const row of rows) {
    const arr = byGame.get(row.gameId) ?? [];
    arr.push(row);
    byGame.set(row.gameId, arr);
  }
  const result: MarketModelJoinRow[] = [];
  for (const [, gameRows] of byGame) {
    const consensus = gameRows.find((r) => r.provider.toLowerCase() === "consensus");
    result.push(consensus ?? [...gameRows].sort((a, b) => a.provider.localeCompare(b.provider))[0]);
  }
  return result;
}
