import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_NORMALIZED_DIR } from "../config/researchConfig";
import { computePhase4Predictions, runPhase5WalkForward } from "../phase5/phase5WalkForward";
import type { CalibratedPrediction } from "../phase5/types";
import type { CfbResearchMarketLine } from "../types";
import { PHASE6_TEST_SEASONS } from "./config";
import type { MarketModelJoinRow } from "./types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

function loadSeasonMarketLines(season: number): CfbResearchMarketLine[] {
  return JSON.parse(
    readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_NORMALIZED_DIR, String(season), "market-lines.json"), "utf8"),
  ) as CfbResearchMarketLine[];
}

/**
 * Reconstructs, for each calibrated prediction, the same walk-forward
 * "strictly prior rows" residual pool Phase 5's own bootstrap uses
 * internally (src/lib/cfb/research/phase5/phase5WalkForwardCore.ts) —
 * duplicated here (not imported/modified) so Phase 6 can price ARBITRARY
 * market lines, not just Phase 5's fixed 50/80/90/95% intervals, without
 * touching Phase 5 code at all (IPR stays frozen — Section 1/30).
 */
function buildResidualPools(sortedCalibrated: readonly CalibratedPrediction[]): Map<string, { home: number[]; away: number[] }> {
  const pools = new Map<string, { home: number[]; away: number[] }>();
  for (let i = 0; i < sortedCalibrated.length; i += 1) {
    const row = sortedCalibrated[i];
    const priorRows = sortedCalibrated.filter((c) => c.season < row.season || (c.season === row.season && c.week < row.week));
    pools.set(row.gameId, {
      home: priorRows.map((c) => c.actualHomePoints - c.calibratedExpectedHome),
      away: priorRows.map((c) => c.actualAwayPoints - c.calibratedExpectedAway),
    });
  }
  return pools;
}

/**
 * Joins frozen Phase 5 model output with raw historical market lines
 * (Work Unit 2), one row per (game, provider). This is the ONLY function
 * in the entire research tree that reads market-line data — see
 * architectureGuard.test.ts.
 */
export function buildMarketModelJoin(): MarketModelJoinRow[] {
  const phase4Predictions = computePhase4Predictions();
  const phase5Result = runPhase5WalkForward(phase4Predictions);
  const sorted = [...phase5Result.calibrated].sort((a, b) => a.season - b.season || a.week - b.week);
  const residualPools = buildResidualPools(sorted);
  const probabilityByGame = new Map(phase5Result.probabilities.map((p) => [p.gameId, p]));
  const calibratedByGame = new Map(sorted.map((c) => [c.gameId, c]));

  const rows: MarketModelJoinRow[] = [];
  for (const season of PHASE6_TEST_SEASONS) {
    const marketLines = loadSeasonMarketLines(season);
    for (const line of marketLines) {
      const calibrated = calibratedByGame.get(line.gameId);
      const probability = probabilityByGame.get(line.gameId);
      const pool = residualPools.get(line.gameId);
      if (!calibrated || !probability || !pool || pool.home.length < 10) continue; // no frozen model output for this game yet — skip, never fabricate

      rows.push({
        gameId: line.gameId,
        season: calibrated.season,
        week: calibrated.week,
        provider: line.provider,
        homeTeamExternalId: calibrated.homeTeamExternalId,
        awayTeamExternalId: calibrated.awayTeamExternalId,
        modelExpectedHome: calibrated.calibratedExpectedHome,
        modelExpectedAway: calibrated.calibratedExpectedAway,
        modelProjectedMargin: calibrated.calibratedProjectedMargin,
        modelProjectedTotal: calibrated.calibratedProjectedTotal,
        modelPHomeWin: probability.pHomeWin,
        homeResidualPool: pool.home,
        awayResidualPool: pool.away,
        actualHomePoints: calibrated.actualHomePoints,
        actualAwayPoints: calibrated.actualAwayPoints,
        actualMargin: calibrated.actualMargin,
        actualTotal: calibrated.actualTotal,
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
