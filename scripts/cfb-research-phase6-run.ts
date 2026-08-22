import { resolve } from "node:path";
import { writeAtomic } from "../src/lib/cfb/research/ingestion/cfbdClient";
import { buildMarketModelJoin } from "../src/lib/cfb/research/phase6/marketDataLoader";
import { verifyMarketSignConvention } from "../src/lib/cfb/research/phase6/marketSignConventionQa";
import { computeSpreadEdgeRows } from "../src/lib/cfb/research/phase6/spreadEdge";
import { computeTotalEdgeRows } from "../src/lib/cfb/research/phase6/totalEdge";
import { computeMoneylineEdgeRows } from "../src/lib/cfb/research/phase6/moneylineEdge";
import { computeMoneylineRoi } from "../src/lib/cfb/research/phase6/roiAnalysis";
import { bucketByEdgeMagnitude } from "../src/lib/cfb/research/phase6/bucketAnalysis";
import { validateThresholdWalkForward } from "../src/lib/cfb/research/phase6/thresholdValidation";
import { fitIncrementalInformationRegression } from "../src/lib/cfb/research/phase6/incrementalInformation";
import { compareMarginAccuracy, compareTotalAccuracy, compareWinnerProbabilityAccuracy } from "../src/lib/cfb/research/phase6/modelVsMarketAccuracy";
import {
  CFB_RESEARCH_PHASE6_EXPERIMENTS_DIR,
  MONEYLINE_EV_THRESHOLDS,
  PROBABILITY_EDGE_BUCKETS,
  PROBABILITY_EDGE_THRESHOLDS,
  SPREAD_EDGE_BUCKETS,
  SPREAD_EDGE_THRESHOLDS_POINTS,
} from "../src/lib/cfb/research/phase6/config";
import type { CfbLineSemantic, MarketModelJoinRow, MoneylineEdgeRow, SpreadEdgeRow, TotalEdgeRow } from "../src/lib/cfb/research/phase6/types";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, CFB_RESEARCH_PHASE6_EXPERIMENTS_DIR);

function write(name: string, data: unknown) {
  writeAtomic(resolve(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
}

function weekSegment(week: number): "1-4" | "5-8" | "9+" {
  return week <= 4 ? "1-4" : week <= 8 ? "5-8" : "9+";
}

async function main() {
  const t0 = Date.now();
  console.log("[phase6] Building market/model join (recomputes Phase 4+5 once)...");
  const joinRows = buildMarketModelJoin();
  console.log(`[phase6]   n=${joinRows.length} in ${Date.now() - t0}ms`);
  const joinByGame = new Map(joinRows.map((r) => [r.gameId, r]));

  // === Section 4: market coverage ===
  const providers = [...new Set(joinRows.map((r) => r.provider))].sort();
  const coverage = {
    totalRows: joinRows.length,
    uniqueGames: new Set(joinRows.map((r) => r.gameId)).size,
    providers,
    byProvider: Object.fromEntries(
      providers.map((p) => {
        const rows = joinRows.filter((r) => r.provider === p);
        return [
          p,
          {
            rows: rows.length,
            withSpreadOpen: rows.filter((r) => r.spreadOpen !== null).length,
            withSpreadLatest: rows.filter((r) => r.spreadLatestObserved !== null).length,
            withTotalOpen: rows.filter((r) => r.totalOpen !== null).length,
            withTotalLatest: rows.filter((r) => r.totalLatestObserved !== null).length,
            withMoneyline: rows.filter((r) => r.homeMoneyline !== null && r.awayMoneyline !== null).length,
          },
        ];
      }),
    ),
  };
  write("market-coverage.json", coverage);
  console.log(`[phase6] Coverage: ${coverage.uniqueGames} games, ${providers.length} providers`);

  // === Section 5: sign convention QA ===
  const signQa = verifyMarketSignConvention(joinRows);
  write("market-semantics-qa.json", signQa);
  console.log(`[phase6] Sign QA: correlation=${signQa.correlationSpreadVsActualMargin?.toFixed(3)}`);

  // === Section 11: OPEN vs LATEST_OBSERVED, computed separately throughout ===
  const semantics: CfbLineSemantic[] = ["OPEN", "LATEST_OBSERVED"];
  const spreadBySemantic: Record<CfbLineSemantic, SpreadEdgeRow[]> = {
    OPEN: computeSpreadEdgeRows(joinRows, "OPEN"),
    LATEST_OBSERVED: computeSpreadEdgeRows(joinRows, "LATEST_OBSERVED"),
  };
  const totalBySemantic: Record<CfbLineSemantic, TotalEdgeRow[]> = {
    OPEN: computeTotalEdgeRows(joinRows, "OPEN"),
    LATEST_OBSERVED: computeTotalEdgeRows(joinRows, "LATEST_OBSERVED"),
  };
  const mlRows = computeMoneylineEdgeRows(joinRows);
  console.log(`[phase6] Spread rows: OPEN=${spreadBySemantic.OPEN.length} LATEST=${spreadBySemantic.LATEST_OBSERVED.length}; Total rows: OPEN=${totalBySemantic.OPEN.length} LATEST=${totalBySemantic.LATEST_OBSERVED.length}; ML rows=${mlRows.length}`);

  // === Section 12: model vs market predictive accuracy (LATEST_OBSERVED, the fuller-coverage semantic) ===
  const marginAccuracy = compareMarginAccuracy(spreadBySemantic.LATEST_OBSERVED, joinByGame);
  const totalAccuracy = compareTotalAccuracy(totalBySemantic.LATEST_OBSERVED, joinByGame);
  const winnerAccuracy = compareWinnerProbabilityAccuracy(mlRows);
  write("model-vs-market.json", { marginAccuracy, totalAccuracy, winnerAccuracy });
  console.log(`[phase6] Model vs market: margin ${marginAccuracy?.modelMae.toFixed(2)} vs ${marginAccuracy?.marketMae.toFixed(2)}; total ${totalAccuracy?.modelMae.toFixed(2)} vs ${totalAccuracy?.marketMae.toFixed(2)}; brier ${winnerAccuracy.modelBrier?.toFixed(4)} vs ${winnerAccuracy.marketBrier?.toFixed(4)}`);

  // === Section 13: incremental information (LATEST_OBSERVED) ===
  const incrementalRows = spreadBySemantic.LATEST_OBSERVED.map((r) => {
    const join = joinByGame.get(r.gameId)!;
    return { modelMargin: join.modelProjectedMargin, marketMargin: r.marketImpliedHomeMargin, actualMargin: join.actualMargin };
  });
  const incrementalInfo = fitIncrementalInformationRegression(incrementalRows);
  write("incremental-information.json", incrementalInfo);
  console.log(`[phase6] Incremental info: modelCoef=${incrementalInfo.modelCoefficient.toFixed(3)} marketCoef=${incrementalInfo.marketCoefficient.toFixed(3)} R2 combined=${incrementalInfo.combinedR2.toFixed(4)} marketOnly=${incrementalInfo.marketOnlyR2.toFixed(4)}`);

  // === Section 14: spread edge-bucket analysis (both semantics) ===
  const spreadBuckets: Record<CfbLineSemantic, ReturnType<typeof bucketByEdgeMagnitude>> = {} as never;
  for (const semantic of semantics) {
    spreadBuckets[semantic] = bucketByEdgeMagnitude(spreadBySemantic[semantic], (r) => r.homeSpreadEdgePoints, (r) => r.homeCovered, SPREAD_EDGE_BUCKETS);
  }
  write("spread-edge-analysis.json", { buckets: spreadBuckets });

  // === Total edge-bucket analysis ===
  const totalBuckets: Record<CfbLineSemantic, ReturnType<typeof bucketByEdgeMagnitude>> = {} as never;
  for (const semantic of semantics) {
    totalBuckets[semantic] = bucketByEdgeMagnitude(totalBySemantic[semantic], (r) => r.totalEdgePoints, (r) => r.wentOver, SPREAD_EDGE_BUCKETS);
  }
  write("total-edge-analysis.json", { buckets: totalBuckets });

  // === Section 15: probability-edge buckets (moneyline) ===
  const probabilityBuckets = bucketByEdgeMagnitude(mlRows, (r) => r.homeProbabilityEdge, (r) => r.homeWon, PROBABILITY_EDGE_BUCKETS);
  write("moneyline-edge-analysis.json", {
    probabilityBuckets,
    roiByThreshold: Object.fromEntries(MONEYLINE_EV_THRESHOLDS.map((t) => [t, computeMoneylineRoi(mlRows, t)])),
  });

  // === Section 11: OPEN vs LATEST_OBSERVED summary artifact ===
  const bothSemantics = joinRows.filter((r) => r.spreadOpen !== null && r.spreadLatestObserved !== null);
  const movement = bothSemantics.map((r) => (r.spreadLatestObserved as number) - (r.spreadOpen as number));
  const meanMovement = movement.length === 0 ? null : movement.reduce((s, v) => s + v, 0) / movement.length;
  const meanAbsMovement = movement.length === 0 ? null : movement.reduce((s, v) => s + Math.abs(v), 0) / movement.length;
  write("open-vs-latest-observed.json", {
    note: "OPEN_TO_LATEST_OBSERVED_MOVEMENT only — not CLV, no closing-line semantics claimed (no reliable timestamps exist).",
    n: bothSemantics.length,
    meanMovement,
    meanAbsMovement,
    spreadBucketsOpen: spreadBuckets.OPEN,
    spreadBucketsLatestObserved: spreadBuckets.LATEST_OBSERVED,
  });

  // === Section 24: provider-by-provider (LATEST_OBSERVED spread + ML where available) ===
  const providerAnalysis = Object.fromEntries(
    providers.map((p) => {
      const pSpread = spreadBySemantic.LATEST_OBSERVED.filter((r) => r.provider === p);
      const pMl = mlRows.filter((r) => r.provider === p);
      const pMarginAcc = compareMarginAccuracy(pSpread, joinByGame);
      const coveredCount = pSpread.filter((r) => r.homeCovered !== null).length;
      const homeCoverCount = pSpread.filter((r) => r.homeCovered === true).length;
      return [
        p,
        {
          spreadRows: pSpread.length,
          mlRows: pMl.length,
          marketMae: pMarginAcc?.marketMae ?? null,
          homeCoverRate: coveredCount === 0 ? null : homeCoverCount / coveredCount,
          roiAt5pct: computeMoneylineRoi(pMl, 0.05),
        },
      ];
    }),
  );
  write("provider-analysis.json", providerAnalysis);

  // === Section 22/23: week-segment + favorite/underdog segmentation ===
  const weekSegments = ["1-4", "5-8", "9+"] as const;
  const bySegment = Object.fromEntries(
    weekSegments.map((seg) => {
      const segSpread = spreadBySemantic.LATEST_OBSERVED.filter((r) => weekSegment(r.week) === seg);
      const segTotal = totalBySemantic.LATEST_OBSERVED.filter((r) => weekSegment(r.week) === seg);
      const segMl = mlRows.filter((r) => weekSegment(r.week) === seg);
      return [
        seg,
        {
          marginAccuracy: compareMarginAccuracy(segSpread, joinByGame),
          totalAccuracy: compareTotalAccuracy(segTotal, joinByGame),
          winnerAccuracy: compareWinnerProbabilityAccuracy(segMl),
          spreadBuckets: bucketByEdgeMagnitude(segSpread, (r) => r.homeSpreadEdgePoints, (r) => r.homeCovered, SPREAD_EDGE_BUCKETS),
        },
      ];
    }),
  );

  const favoriteRows = spreadBySemantic.LATEST_OBSERVED.filter((r) => r.marketSpread < 0); // home favored
  const underdogRows = spreadBySemantic.LATEST_OBSERVED.filter((r) => r.marketSpread > 0); // home underdog
  const favoriteUnderdog = {
    homeFavoriteCoverRate: bucketByEdgeMagnitude(favoriteRows, () => 0, (r) => r.homeCovered, [{ label: "all", min: 0, max: Infinity }])[0],
    homeUnderdogCoverRate: bucketByEdgeMagnitude(underdogRows, () => 0, (r) => r.homeCovered, [{ label: "all", min: 0, max: Infinity }])[0],
    mlFavoritePerformance: computeMoneylineRoi(mlRows.filter((r) => r.homeMoneyline < 0), 0),
    mlUnderdogPerformance: computeMoneylineRoi(mlRows.filter((r) => r.homeMoneyline > 0), 0),
  };

  // === Section 19: leakage-safe threshold validation ===
  const spreadThresholdResult = validateThresholdWalkForward(spreadBySemantic.LATEST_OBSERVED, SPREAD_EDGE_THRESHOLDS_POINTS as unknown as number[], (r) => r.homeSpreadEdgePoints, (r) => r.homeCovered);
  const totalThresholdResult = validateThresholdWalkForward(totalBySemantic.LATEST_OBSERVED, SPREAD_EDGE_THRESHOLDS_POINTS as unknown as number[], (r) => r.totalEdgePoints, (r) => r.wentOver);
  const mlThresholdResult = validateThresholdWalkForward(mlRows, MONEYLINE_EV_THRESHOLDS as unknown as number[], (r) => r.homeProbabilityEdge, (r) => r.homeWon);
  const probabilityThresholdResult = validateThresholdWalkForward(mlRows, PROBABILITY_EDGE_THRESHOLDS as unknown as number[], (r) => r.homeProbabilityEdge, (r) => r.homeWon);
  write("threshold-validation.json", {
    spread: spreadThresholdResult,
    total: totalThresholdResult,
    moneylineEv: mlThresholdResult,
    moneylineProbability: probabilityThresholdResult,
  });

  // === Season-by-season ===
  const seasons = [...new Set(joinRows.map((r) => r.season))].sort();
  const bySeason = Object.fromEntries(
    seasons.map((season) => {
      const segSpread = spreadBySemantic.LATEST_OBSERVED.filter((r) => r.season === season);
      const segMl = mlRows.filter((r) => r.season === season);
      return [
        season,
        {
          marginAccuracy: compareMarginAccuracy(segSpread, joinByGame),
          winnerAccuracy: compareWinnerProbabilityAccuracy(segMl),
        },
      ];
    }),
  );

  // === Final artifact ===
  write("phase6-finalist.json", {
    generatedAt: new Date().toISOString(),
    coverage: { games: coverage.uniqueGames, providers: providers.length },
    modelVsMarket: { marginAccuracy, totalAccuracy, winnerAccuracy },
    incrementalInfo,
    spreadThresholdResult,
    totalThresholdResult,
    mlThresholdResult,
    bySegment,
    favoriteUnderdog,
    bySeason,
    elapsedMs: Date.now() - t0,
  });

  console.log(`[phase6] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error(`[phase6] FAILED: ${(error as Error).message}`);
  console.error(error);
  process.exitCode = 1;
});
