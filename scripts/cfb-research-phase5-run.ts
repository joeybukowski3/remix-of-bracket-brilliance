import { resolve } from "node:path";
import { writeAtomic } from "../src/lib/cfb/research/ingestion/cfbdClient";
import { computePhase4Predictions, runPhase5WalkForward } from "../src/lib/cfb/research/phase5/phase5WalkForward";
import type { Phase5Config, Phase5Result } from "../src/lib/cfb/research/phase5/phase5WalkForwardCore";
import { diagnoseTotalCalibration } from "../src/lib/cfb/research/phase5/totalDiagnostics";
import { computeDistributionStats, pearsonCorrelation } from "../src/lib/cfb/research/phase5/residualStats";
import {
  computeBrierScore,
  computeCalibrationBuckets,
  computeExpectedCalibrationError,
  computeIntervalCoverage,
  computeLogLoss,
} from "../src/lib/cfb/research/phase5/probabilityEvaluation";
import { CFB_RESEARCH_PHASE5_EXPERIMENTS_DIR, INTERVAL_LEVELS } from "../src/lib/cfb/research/phase5/config";
import type {
  CalibratedPrediction,
  CfbDistributionFamily,
  CfbScoreCalibrationMode,
  CfbTotalCalibrationMethod,
  ProbabilityOutputs,
} from "../src/lib/cfb/research/phase5/types";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, CFB_RESEARCH_PHASE5_EXPERIMENTS_DIR);

function write(name: string, data: unknown) {
  writeAtomic(resolve(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
}

function scoreMae(rows: readonly CalibratedPrediction[]) {
  const n = rows.length || 1;
  return {
    home: rows.reduce((s, r) => s + Math.abs(r.calibratedExpectedHome - r.actualHomePoints), 0) / n,
    away: rows.reduce((s, r) => s + Math.abs(r.calibratedExpectedAway - r.actualAwayPoints), 0) / n,
    margin: rows.reduce((s, r) => s + Math.abs(r.calibratedProjectedMargin - r.actualMargin), 0) / n,
    total: rows.reduce((s, r) => s + Math.abs(r.calibratedProjectedTotal - r.actualTotal), 0) / n,
  };
}

function calibrationOf(predicted: readonly number[], actual: readonly number[]) {
  const n = predicted.length;
  if (n < 2) return { slope: null, intercept: null };
  const meanP = predicted.reduce((s, v) => s + v, 0) / n;
  const meanA = actual.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varP = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (predicted[i] - meanP) * (actual[i] - meanA);
    varP += (predicted[i] - meanP) ** 2;
  }
  if (varP < 1e-9) return { slope: null, intercept: null };
  const slope = cov / varP;
  return { slope, intercept: meanA - slope * meanP };
}

function summarizeResult(label: string, result: Phase5Result) {
  const mae = scoreMae(result.calibrated);
  const totalCal = calibrationOf(result.calibrated.map((r) => r.calibratedProjectedTotal), result.calibrated.map((r) => r.actualTotal));
  const marginCal = calibrationOf(result.calibrated.map((r) => r.calibratedProjectedMargin), result.calibrated.map((r) => r.actualMargin));
  const winRows = result.probabilities.map((p) => ({ pHomeWin: p.pHomeWin, homeWon: p.actualHomePoints > p.actualAwayPoints }));
  const buckets = computeCalibrationBuckets(winRows);
  const intervalCoverage = Object.fromEntries(
    INTERVAL_LEVELS.map((level) => {
      const key = `${Math.round(level * 100)}` as "50" | "80" | "90" | "95";
      const marginField = `marginInterval${key}` as keyof ProbabilityOutputs;
      const totalField = `totalInterval${key}` as keyof ProbabilityOutputs;
      const marginRows = result.probabilities.filter((p) => p[marginField]).map((p) => ({ actual: p.actualMargin, interval: p[marginField] as [number, number] }));
      const totalRows = result.probabilities.filter((p) => p[totalField]).map((p) => ({ actual: p.actualTotal, interval: p[totalField] as [number, number] }));
      return [key, { margin: computeIntervalCoverage(marginRows), total: computeIntervalCoverage(totalRows) }];
    }),
  );

  return {
    label,
    n: result.calibrated.length,
    scoreMae: mae,
    totalCalibration: totalCal,
    marginCalibration: marginCal,
    brierScore: computeBrierScore(winRows),
    logLoss: computeLogLoss(winRows),
    calibrationBuckets: buckets,
    expectedCalibrationError: computeExpectedCalibrationError(buckets),
    intervalCoverage,
  };
}

async function main() {
  const t0 = Date.now();
  console.log("[phase5] Computing Phase 4 predictions (shared across all Phase 5 configs)...");
  const phase4Predictions = computePhase4Predictions();
  console.log(`[phase5]   n=${phase4Predictions.length} in ${Date.now() - t0}ms`);

  // === Section 2: total-calibration diagnosis ===
  console.log("[phase5] Total-calibration diagnosis");
  const diagnostics = diagnoseTotalCalibration(phase4Predictions);
  write("total-calibration-diagnostics.json", diagnostics);
  console.log(`[phase5]   predicted SD=${diagnostics.sdPredictedTotal?.toFixed(2)} actual SD=${diagnostics.sdActualTotal?.toFixed(2)}`);

  const BASE: Phase5Config = {
    totalCalibrationMethod: "LINEAR",
    scoreCalibrationMode: "TOTAL_ONLY",
    distributionFamily: "INDEPENDENT_NORMAL",
    heteroskedastic: false,
    simulationSeed: 20260101,
    simulationDraws: 20_000,
  };

  // === Section 3: total-calibration method comparison ===
  console.log("[phase5] Total-calibration method comparison");
  const calibrationMethods: CfbTotalCalibrationMethod[] = ["NONE", "LINEAR", "SEASON_AWARE", "WEEK_SEGMENT_AWARE"];
  const calibrationResults = calibrationMethods.map((method) => {
    const result = runPhase5WalkForward(phase4Predictions, { ...BASE, totalCalibrationMethod: method });
    const summary = summarizeResult(method, result);
    console.log(`[phase5]   ${method}: totalMAE=${summary.scoreMae.total.toFixed(3)} totalSlope=${summary.totalCalibration.slope?.toFixed(3)}`);
    return { method, result, summary };
  });
  const winningCalibration = calibrationResults.reduce((best, cur) => (cur.summary.scoreMae.total < best.summary.scoreMae.total ? cur : best));
  console.log(`[phase5] Winning total-calibration method: ${winningCalibration.method}`);
  write("total-calibration-comparison.json", { results: calibrationResults.map((r) => r.summary), winningMethod: winningCalibration.method });

  // === Section 4: score-calibration mode comparison (using winning total-calibration method) ===
  console.log("[phase5] Score-calibration mode comparison");
  const modes: CfbScoreCalibrationMode[] = ["RAW", "TOTAL_ONLY", "SEPARATE_HOME_AWAY"];
  const modeResults = modes.map((mode) => {
    const result = runPhase5WalkForward(phase4Predictions, { ...BASE, totalCalibrationMethod: winningCalibration.method, scoreCalibrationMode: mode });
    const summary = summarizeResult(mode, result);
    console.log(`[phase5]   ${mode}: home=${summary.scoreMae.home.toFixed(3)} away=${summary.scoreMae.away.toFixed(3)} margin=${summary.scoreMae.margin.toFixed(3)} total=${summary.scoreMae.total.toFixed(3)}`);
    return { mode, result, summary };
  });
  // Prefer simpler when tied (Section 4/20): require SEPARATE_HOME_AWAY to beat TOTAL_ONLY by a real margin.
  const totalOnlySummary = modeResults.find((m) => m.mode === "TOTAL_ONLY")!.summary;
  const separateSummary = modeResults.find((m) => m.mode === "SEPARATE_HOME_AWAY")!.summary;
  const winningMode: CfbScoreCalibrationMode =
    separateSummary.scoreMae.margin < totalOnlySummary.scoreMae.margin - 0.05 && separateSummary.scoreMae.total < totalOnlySummary.scoreMae.total - 0.05
      ? "SEPARATE_HOME_AWAY"
      : "TOTAL_ONLY";
  console.log(`[phase5] Winning score-calibration mode: ${winningMode}`);
  write("score-calibration-mode-comparison.json", { results: modeResults.map((r) => r.summary), winningMode });

  // === Section 6: residual structure analysis (winning calibration+mode) ===
  console.log("[phase5] Residual structure analysis");
  const winningBaseConfig: Phase5Config = { ...BASE, totalCalibrationMethod: winningCalibration.method, scoreCalibrationMode: winningMode };
  const winningBaseResult = runPhase5WalkForward(phase4Predictions, winningBaseConfig);
  const homeResiduals = winningBaseResult.calibrated.map((r) => r.actualHomePoints - r.calibratedExpectedHome);
  const awayResiduals = winningBaseResult.calibrated.map((r) => r.actualAwayPoints - r.calibratedExpectedAway);
  const marginResiduals = winningBaseResult.calibrated.map((r) => r.actualMargin - r.calibratedProjectedMargin);
  const totalResiduals = winningBaseResult.calibrated.map((r) => r.actualTotal - r.calibratedProjectedTotal);
  const bySeasonCorrelation = [...new Set(winningBaseResult.calibrated.map((r) => r.season))].sort().map((season) => {
    const rows = winningBaseResult.calibrated.filter((r) => r.season === season);
    return {
      season,
      correlation: pearsonCorrelation(rows.map((r) => r.actualHomePoints - r.calibratedExpectedHome), rows.map((r) => r.actualAwayPoints - r.calibratedExpectedAway)),
      n: rows.length,
    };
  });
  const byWeekSegmentCorrelation = (["1-4", "5-8", "9+"] as const).map((seg) => {
    const rows = winningBaseResult.calibrated.filter((r) => (seg === "1-4" ? r.week <= 4 : seg === "5-8" ? r.week >= 5 && r.week <= 8 : r.week >= 9));
    return {
      segment: seg,
      correlation: pearsonCorrelation(rows.map((r) => r.actualHomePoints - r.calibratedExpectedHome), rows.map((r) => r.actualAwayPoints - r.calibratedExpectedAway)),
      n: rows.length,
    };
  });
  write("residual-distribution-analysis.json", {
    home: computeDistributionStats(homeResiduals),
    away: computeDistributionStats(awayResiduals),
    margin: computeDistributionStats(marginResiduals),
    total: computeDistributionStats(totalResiduals),
    overallHomeAwayCorrelation: pearsonCorrelation(homeResiduals, awayResiduals),
    bySeasonCorrelation,
    byWeekSegmentCorrelation,
  });

  // === Section 7: distribution family comparison ===
  console.log("[phase5] Distribution family comparison");
  const families: CfbDistributionFamily[] = ["INDEPENDENT_NORMAL", "BIVARIATE_NORMAL", "EMPIRICAL_BOOTSTRAP", "STUDENT_T"];
  const familyResults = families.map((family) => {
    const result = runPhase5WalkForward(phase4Predictions, { ...winningBaseConfig, distributionFamily: family });
    const summary = summarizeResult(family, result);
    console.log(`[phase5]   ${family}: Brier=${summary.brierScore?.toFixed(4)} logLoss=${summary.logLoss?.toFixed(4)} ECE=${summary.expectedCalibrationError?.toFixed(4)}`);
    return { family, result, summary };
  });
  const winningFamily = familyResults.reduce((best, cur) => ((cur.summary.brierScore ?? 1) < (best.summary.brierScore ?? 1) ? cur : best));
  console.log(`[phase5] Winning distribution family: ${winningFamily.family}`);
  write("distribution-comparison.json", { results: familyResults.map((r) => r.summary), winningFamily: winningFamily.family });

  // === Section 13: heteroskedastic on/off ===
  console.log("[phase5] Heteroskedasticity test");
  const homoResult = runPhase5WalkForward(phase4Predictions, { ...winningBaseConfig, distributionFamily: winningFamily.family, heteroskedastic: false });
  const heteroResult = runPhase5WalkForward(phase4Predictions, { ...winningBaseConfig, distributionFamily: winningFamily.family, heteroskedastic: true });
  const homoSummary = summarizeResult("homoskedastic", homoResult);
  const heteroSummary = summarizeResult("heteroskedastic", heteroResult);
  const winningHeteroskedastic = heteroSummary.expectedCalibrationError !== null && homoSummary.expectedCalibrationError !== null && heteroSummary.expectedCalibrationError < homoSummary.expectedCalibrationError;
  console.log(`[phase5]   homoskedastic ECE=${homoSummary.expectedCalibrationError?.toFixed(4)} heteroskedastic ECE=${heteroSummary.expectedCalibrationError?.toFixed(4)} -> use heteroskedastic=${winningHeteroskedastic}`);
  write("heteroskedasticity-comparison.json", { homoskedastic: homoSummary, heteroskedastic: heteroSummary, winningHeteroskedastic });

  // === Final: win-probability + margin/total interval artifacts on the finalist config ===
  const finalConfig: Phase5Config = { ...winningBaseConfig, distributionFamily: winningFamily.family, heteroskedastic: winningHeteroskedastic };
  const finalResult = runPhase5WalkForward(phase4Predictions, finalConfig);
  const finalSummary = summarizeResult("finalist", finalResult);

  write("win-probability-calibration.json", {
    brierScore: finalSummary.brierScore,
    logLoss: finalSummary.logLoss,
    calibrationBuckets: finalSummary.calibrationBuckets,
    expectedCalibrationError: finalSummary.expectedCalibrationError,
  });
  write("margin-interval-calibration.json", Object.fromEntries(Object.entries(finalSummary.intervalCoverage).map(([k, v]) => [k, (v as { margin: unknown }).margin])));
  write("total-interval-calibration.json", Object.fromEntries(Object.entries(finalSummary.intervalCoverage).map(([k, v]) => [k, (v as { total: unknown }).total])));

  // === Weeks 1-4/5-8/9+ and season-by-season on the finalist config ===
  function segmentSummary(predicate: (p: ProbabilityOutputs) => boolean, calibratedPredicate: (c: CalibratedPrediction) => boolean) {
    const calibrated = finalResult.calibrated.filter(calibratedPredicate);
    const probabilities = finalResult.probabilities.filter(predicate);
    return summarizeResult("segment", { calibrated, probabilities });
  }
  const weeks1to4 = segmentSummary((p) => p.week <= 4, (c) => c.week <= 4);
  const weeks5to8 = segmentSummary((p) => p.week >= 5 && p.week <= 8, (c) => c.week >= 5 && c.week <= 8);
  const weeks9plus = segmentSummary((p) => p.week >= 9, (c) => c.week >= 9);
  const seasons = [...new Set(finalResult.calibrated.map((c) => c.season))].sort();
  const bySeason = Object.fromEntries(seasons.map((s) => [s, segmentSummary((p) => p.season === s, (c) => c.season === s)]));

  write("phase5-finalist.json", {
    generatedAt: new Date().toISOString(),
    config: finalConfig,
    winningTotalCalibrationMethod: winningCalibration.method,
    winningScoreCalibrationMode: winningMode,
    winningDistributionFamily: winningFamily.family,
    winningHeteroskedastic,
    overall: finalSummary,
    weeks1to4,
    weeks5to8,
    weeks9plus,
    bySeason,
    elapsedMs: Date.now() - t0,
  });

  console.log(`[phase5] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error(`[phase5] FAILED: ${(error as Error).message}`);
  console.error(error);
  process.exitCode = 1;
});
