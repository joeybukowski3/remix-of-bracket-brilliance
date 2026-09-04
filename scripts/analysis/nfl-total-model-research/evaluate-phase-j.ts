/**
 * Phase J -- controlled calibration/stability experiment (Models A-D).
 * Research-only, extends evaluate.ts. No new feature families (no
 * trenches/third-down/turnovers/sacks/pace/weather/injuries/Vegas), no
 * broad hyperparameter hunt.
 *
 * Usage: npx tsx scripts/analysis/nfl-total-model-research/evaluate-phase-j.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeScoringEnvironment, type ScoringEnvironmentObservation } from "@/lib/nfl/research/total/scoringEnvironment";
import { buildResearchDataset, buildScoringEnvironmentCorpus } from "@/lib/nfl/research/total/dataset";
import { buildScoringSupportIndex } from "@/lib/nfl/research/total/teamScoringFeatures";
import { fitBaseline0, fitBaseline1, scoreBaseline0, scoreBaseline1 } from "@/lib/nfl/research/total/baselines";
import { fitTotalRidge, scoreTotalRidge, isRowUsableForRidge } from "@/lib/nfl/research/total/ridgeModel";
import { fitReducedTotalRidge, scoreReducedTotalRidge, REDUCED_RIDGE_FEATURE_NAMES } from "@/lib/nfl/research/total/ridgeModelReduced";
import { fitCalibratedTotalRidge, scoreCalibratedTotalRidge } from "@/lib/nfl/research/total/biasCalibration";
import { mae, rmse, meanBias, pearsonCorrelation } from "@/lib/nfl/research/total/metrics";
import type { NflTotalResearchDatasetRow } from "@/lib/nfl/research/total/types";
import { loadOutcomesForSeasons, loadScoringSupportForSeasons, ROOT } from "./lib/loadData";

const OUT_DIR = join(ROOT, "scripts", "analysis", "nfl-total-model-research", "out");
const RIDGE_LAMBDA = 1; // same default as the Phase A-I build; see the lambda-sensitivity section below for 10/50/100.

const ENV_CORPUS_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];
const SCORING_SUPPORT_SEASONS = [2021, 2022, 2023, 2024, 2025];
const TARGET_SEASONS = [2022, 2023, 2024, 2025];

console.log("[load] outcomes + scoring support...");
const envCorpusGames = loadOutcomesForSeasons(ENV_CORPUS_SEASONS);
const targetGames = loadOutcomesForSeasons(TARGET_SEASONS);
const scoringSupportRows = loadScoringSupportForSeasons(SCORING_SUPPORT_SEASONS);
const scoringSupportIndex = buildScoringSupportIndex(scoringSupportRows);

// datasetA: existing Phase A-I dataset (priorSeasonOnly). datasetBCD: Models B/C/D (seasonToDateWithPriorFallback).
const datasetA = buildResearchDataset({ targetGames, environmentCorpusGames: envCorpusGames, scoringSupportIndex, environmentMode: "priorSeasonOnly" });
const datasetBCD = buildResearchDataset({ targetGames, environmentCorpusGames: envCorpusGames, scoringSupportIndex, environmentMode: "seasonToDateWithPriorFallback" });
console.log(`[load] datasetA rows=${datasetA.length}, datasetBCD rows=${datasetBCD.length}`);

type Fold = { name: string; trainSeasons: number[]; evalSeasons: number[] };
const FOLDS: Fold[] = [
  { name: "fold1", trainSeasons: [2022], evalSeasons: [2023] },
  { name: "fold2", trainSeasons: [2022, 2023], evalSeasons: [2024] },
  { name: "retrospective", trainSeasons: [2022, 2023, 2024], evalSeasons: [2025] },
];

function rowsForSeasons(dataset: readonly NflTotalResearchDatasetRow[], seasons: readonly number[]): NflTotalResearchDatasetRow[] {
  return dataset.filter((r) => seasons.includes(r.season));
}

type Projector = (row: NflTotalResearchDatasetRow) => number | null;

function teamPointMetrics(rows: readonly NflTotalResearchDatasetRow[], project: Projector) {
  const pairs = rows.map((r) => ({ projected: project(r), actual: r.actualTeamPoints })).filter((p) => p.projected !== null) as { projected: number; actual: number }[];
  const errors = pairs.map((p) => p.projected - p.actual);
  return { n: pairs.length, mae: mae(errors), rmse: rmse(errors), correlation: pearsonCorrelation(pairs.map((p) => p.projected), pairs.map((p) => p.actual)), meanBias: meanBias(errors) };
}

type GameTotalRow = { gameId: string; season: number; week: number; projectedTotal: number; actualTotal: number };

function gameTotals(rows: readonly NflTotalResearchDatasetRow[], project: Projector): GameTotalRow[] {
  const byGame = new Map<string, { projected: number[]; actual: number; season: number; week: number }>();
  for (const row of rows) {
    const p = project(row);
    if (p === null) continue;
    if (!byGame.has(row.gameId)) byGame.set(row.gameId, { projected: [], actual: row.actualGameTotal, season: row.season, week: row.week });
    byGame.get(row.gameId)!.projected.push(p);
  }
  const out: GameTotalRow[] = [];
  for (const [gameId, { projected, actual, season, week }] of byGame) {
    if (projected.length !== 2) continue;
    out.push({ gameId, season, week, projectedTotal: projected[0] + projected[1], actualTotal: actual });
  }
  return out;
}

function gameTotalMetrics(games: readonly GameTotalRow[]) {
  const errors = games.map((g) => g.projectedTotal - g.actualTotal);
  return { n: games.length, mae: mae(errors), rmse: rmse(errors), correlation: pearsonCorrelation(games.map((g) => g.projectedTotal), games.map((g) => g.actualTotal)), meanBias: meanBias(errors) };
}

// ---------------------------------------------------------------------------
// Baseline 0 / Baseline 1 -- fixed reference computed on datasetA (unchanged from Phase A-I), used for deltas.
// ---------------------------------------------------------------------------
const baselineResultsByFold: Record<string, { baseline0: unknown; baseline1: unknown }> = {};
for (const fold of FOLDS) {
  const trainA = rowsForSeasons(datasetA, fold.trainSeasons);
  const valA = rowsForSeasons(datasetA, fold.evalSeasons);
  const b0 = fitBaseline0();
  const b1 = fitBaseline1(trainA);
  const project0: Projector = (r) => scoreBaseline0(b0, r);
  const project1: Projector = (r) => scoreBaseline1(b1, r);
  baselineResultsByFold[fold.name] = {
    baseline0: { teamPoint: teamPointMetrics(valA, project0), gameTotal: gameTotalMetrics(gameTotals(valA, project0)) },
    baseline1: { teamPoint: teamPointMetrics(valA, project1), gameTotal: gameTotalMetrics(gameTotals(valA, project1)) },
  };
}
console.log("[baselines] computed on datasetA (unchanged from Phase A-I).");

// ---------------------------------------------------------------------------
// Models A-D per fold.
// ---------------------------------------------------------------------------
type ModelFoldResult = {
  teamPoint: ReturnType<typeof teamPointMetrics>;
  gameTotal: ReturnType<typeof gameTotalMetrics>;
  standardizedCoefficients?: Record<string, number>;
  rawCoefficients?: Record<string, number>;
  intercept?: number;
  biasCorrection?: number;
  crossFitSampleSize?: number;
};

const modelResults: Record<string, Record<string, ModelFoldResult>> = { modelA: {}, modelB: {}, modelC: {}, modelD: {} };
/** rows for week-bucket pooling: one entry per validated row, model x fold. */
const pooledGameRows: Record<string, GameTotalRow[]> = { modelA: [], modelB: [], modelC: [], modelD: [] };

function standardizedAndRaw(coefficients: readonly number[], featureStds: readonly number[], names: readonly string[]) {
  const standardized = Object.fromEntries(names.map((n, i) => [n, coefficients[i]]));
  const raw = Object.fromEntries(names.map((n, i) => [n, coefficients[i] / featureStds[i]]));
  return { standardized, raw };
}

for (const fold of FOLDS) {
  const trainA = rowsForSeasons(datasetA, fold.trainSeasons);
  const valA = rowsForSeasons(datasetA, fold.evalSeasons);
  const trainBCD = rowsForSeasons(datasetBCD, fold.trainSeasons);
  const valBCD = rowsForSeasons(datasetBCD, fold.evalSeasons);

  // Model A
  const ridgeA = fitTotalRidge(trainA, RIDGE_LAMBDA);
  const projectA: Projector = (r) => scoreTotalRidge(ridgeA, r);
  const { standardized: stdA, raw: rawA } = standardizedAndRaw(ridgeA.coefficients, ridgeA.featureStds, ["scoringEnvironment", "offenseEpaPerPlay", "offenseSuccessRate", "offenseExplosiveRate", "opponentDefenseEpaAllowed", "opponentDefenseSuccessAllowed", "opponentDefenseExplosiveAllowed", "homeIndicator"]);
  modelResults.modelA[fold.name] = { teamPoint: teamPointMetrics(valA, projectA), gameTotal: gameTotalMetrics(gameTotals(valA, projectA)), standardizedCoefficients: stdA, rawCoefficients: rawA, intercept: ridgeA.intercept };
  pooledGameRows.modelA.push(...gameTotals(valA, projectA));

  // Model B
  const ridgeB = fitTotalRidge(trainBCD, RIDGE_LAMBDA);
  const projectB: Projector = (r) => scoreTotalRidge(ridgeB, r);
  const { standardized: stdB, raw: rawB } = standardizedAndRaw(ridgeB.coefficients, ridgeB.featureStds, ["scoringEnvironment", "offenseEpaPerPlay", "offenseSuccessRate", "offenseExplosiveRate", "opponentDefenseEpaAllowed", "opponentDefenseSuccessAllowed", "opponentDefenseExplosiveAllowed", "homeIndicator"]);
  modelResults.modelB[fold.name] = { teamPoint: teamPointMetrics(valBCD, projectB), gameTotal: gameTotalMetrics(gameTotals(valBCD, projectB)), standardizedCoefficients: stdB, rawCoefficients: rawB, intercept: ridgeB.intercept };
  pooledGameRows.modelB.push(...gameTotals(valBCD, projectB));

  // Model C
  const calibratedC = fitCalibratedTotalRidge(trainBCD, RIDGE_LAMBDA);
  const projectC: Projector = (r) => scoreCalibratedTotalRidge(calibratedC, r);
  const { standardized: stdC, raw: rawC } = standardizedAndRaw(calibratedC.ridge.coefficients, calibratedC.ridge.featureStds, ["scoringEnvironment", "offenseEpaPerPlay", "offenseSuccessRate", "offenseExplosiveRate", "opponentDefenseEpaAllowed", "opponentDefenseSuccessAllowed", "opponentDefenseExplosiveAllowed", "homeIndicator"]);
  modelResults.modelC[fold.name] = { teamPoint: teamPointMetrics(valBCD, projectC), gameTotal: gameTotalMetrics(gameTotals(valBCD, projectC)), standardizedCoefficients: stdC, rawCoefficients: rawC, intercept: calibratedC.ridge.intercept, biasCorrection: calibratedC.biasCorrection, crossFitSampleSize: calibratedC.crossFitSampleSize };
  pooledGameRows.modelC.push(...gameTotals(valBCD, projectC));

  // Model D
  const ridgeD = fitReducedTotalRidge(trainBCD, RIDGE_LAMBDA);
  const projectD: Projector = (r) => scoreReducedTotalRidge(ridgeD, r);
  const { standardized: stdD, raw: rawD } = standardizedAndRaw(ridgeD.coefficients, ridgeD.featureStds, [...REDUCED_RIDGE_FEATURE_NAMES]);
  modelResults.modelD[fold.name] = { teamPoint: teamPointMetrics(valBCD, projectD), gameTotal: gameTotalMetrics(gameTotals(valBCD, projectD)), standardizedCoefficients: stdD, rawCoefficients: rawD, intercept: ridgeD.intercept };
  pooledGameRows.modelD.push(...gameTotals(valBCD, projectD));

  console.log(`[models A-D] ${fold.name} done. C biasCorrection=${calibratedC.biasCorrection.toFixed(4)} (n=${calibratedC.crossFitSampleSize})`);
}

// ---------------------------------------------------------------------------
// Week-bucket bias analysis (pooled across all 3 validation folds, per model).
// ---------------------------------------------------------------------------
const WEEK_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "weeks-1-4", min: 1, max: 4 },
  { label: "weeks-5-9", min: 5, max: 9 },
  { label: "weeks-10-14", min: 10, max: 14 },
  { label: "weeks-15+", min: 15, max: 99 },
];

function bucketAnalysis(games: readonly GameTotalRow[]) {
  return WEEK_BUCKETS.map((bucket) => {
    const slice = games.filter((g) => g.week >= bucket.min && g.week <= bucket.max);
    const errors = slice.map((g) => g.projectedTotal - g.actualTotal);
    return {
      label: bucket.label,
      n: slice.length,
      mae: mae(errors),
      meanSignedError: meanBias(errors),
      meanActualTotal: slice.length > 0 ? slice.reduce((s, g) => s + g.actualTotal, 0) / slice.length : null,
      meanProjectedTotal: slice.length > 0 ? slice.reduce((s, g) => s + g.projectedTotal, 0) / slice.length : null,
    };
  });
}

function bucketAnalysisBySeason(games: readonly GameTotalRow[]) {
  const seasons = [...new Set(games.map((g) => g.season))].sort();
  return Object.fromEntries(seasons.map((s) => [s, bucketAnalysis(games.filter((g) => g.season === s))]));
}

const weekBucketAnalysis = Object.fromEntries(
  Object.entries(pooledGameRows).map(([model, games]) => [model, { pooled: bucketAnalysis(games), bySeason: bucketAnalysisBySeason(games) }]),
);
console.log("[week-bucket] computed for all 4 models.");

// ---------------------------------------------------------------------------
// Scoring-environment diagnostics: concrete values, priorSeasonOnly vs seasonToDateWithPriorFallback.
// ---------------------------------------------------------------------------
const environmentCorpus: ScoringEnvironmentObservation[] = buildScoringEnvironmentCorpus(envCorpusGames);
const ENV_DIAGNOSTIC_WEEKS = [1, 2, 5, 10, 18];
const ENV_DIAGNOSTIC_SEASONS = [2023, 2025];
const environmentDiagnostics = Object.fromEntries(
  ENV_DIAGNOSTIC_SEASONS.map((season) => [
    season,
    ENV_DIAGNOSTIC_WEEKS.map((week) => ({
      week,
      priorSeasonOnly: computeScoringEnvironment(environmentCorpus, { season, week }, "priorSeasonOnly"),
      seasonToDateWithPriorFallback: computeScoringEnvironment(environmentCorpus, { season, week }, "seasonToDateWithPriorFallback"),
    })),
  ]),
);
console.log("[env diagnostics] computed for 2023 and 2025.");

// ---------------------------------------------------------------------------
// Feature collinearity (offense + opponent-defense-allowed), on the retrospective train set (2022-2024, datasetBCD).
// ---------------------------------------------------------------------------
const collinearityRows = rowsForSeasons(datasetBCD, [2022, 2023, 2024]).filter(isRowUsableForRidge);
function corr(a: (r: NflTotalResearchDatasetRow) => number, b: (r: NflTotalResearchDatasetRow) => number) {
  return pearsonCorrelation(collinearityRows.map(a), collinearityRows.map(b));
}
const collinearity = {
  n: collinearityRows.length,
  offenseEpaVsOffenseSuccess: corr((r) => r.offense.epaPerPlay!, (r) => r.offense.successRate!),
  offenseExplosiveVsOffenseEpa: corr((r) => r.offense.explosiveRate!, (r) => r.offense.epaPerPlay!),
  defenseEpaAllowedVsDefenseSuccessAllowed: corr((r) => r.opponentDefenseAllowed.epaPerPlay!, (r) => r.opponentDefenseAllowed.successRate!),
  defenseExplosiveAllowedVsDefenseEpaAllowed: corr((r) => r.opponentDefenseAllowed.explosiveRate!, (r) => r.opponentDefenseAllowed.epaPerPlay!),
};
console.log("[collinearity]", collinearity);

// ---------------------------------------------------------------------------
// Lambda sensitivity -- fold1 and fold2 train/val ONLY, never retrospective/2025. Models A-D, lambda in [1,10,50,100].
// ---------------------------------------------------------------------------
const LAMBDA_GRID = [1, 10, 50, 100];
const lambdaSensitivity: Record<string, unknown> = {};
for (const fold of FOLDS.filter((f) => f.name !== "retrospective")) {
  const trainA = rowsForSeasons(datasetA, fold.trainSeasons);
  const valA = rowsForSeasons(datasetA, fold.evalSeasons);
  const trainBCD = rowsForSeasons(datasetBCD, fold.trainSeasons);
  const valBCD = rowsForSeasons(datasetBCD, fold.evalSeasons);

  const perLambda = LAMBDA_GRID.map((lambda) => {
    const ridgeA = fitTotalRidge(trainA, lambda);
    const ridgeB = fitTotalRidge(trainBCD, lambda);
    const ridgeD = fitReducedTotalRidge(trainBCD, lambda);
    const calibratedC = fitCalibratedTotalRidge(trainBCD, lambda);
    return {
      lambda,
      modelA: { coefficients: [...ridgeA.coefficients], valGameTotalMae: gameTotalMetrics(gameTotals(valA, (r) => scoreTotalRidge(ridgeA, r))).mae },
      modelB: { coefficients: [...ridgeB.coefficients], valGameTotalMae: gameTotalMetrics(gameTotals(valBCD, (r) => scoreTotalRidge(ridgeB, r))).mae },
      modelC: { coefficients: [...calibratedC.ridge.coefficients], biasCorrection: calibratedC.biasCorrection, valGameTotalMae: gameTotalMetrics(gameTotals(valBCD, (r) => scoreCalibratedTotalRidge(calibratedC, r))).mae },
      modelD: { coefficients: [...ridgeD.coefficients], valGameTotalMae: gameTotalMetrics(gameTotals(valBCD, (r) => scoreReducedTotalRidge(ridgeD, r))).mae },
    };
  });
  lambdaSensitivity[fold.name] = perLambda;
  console.log(`[lambda sensitivity] ${fold.name} done.`);
}

// ---------------------------------------------------------------------------
// Write full report.
// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  ridgeLambda: RIDGE_LAMBDA,
  baselineResultsByFold,
  modelResults,
  weekBucketAnalysis,
  environmentDiagnostics,
  collinearity,
  lambdaSensitivity,
};
writeFileSync(join(OUT_DIR, "report-phase-j.json"), JSON.stringify(report, null, 2), "utf-8");
console.log(`[done] wrote ${join(OUT_DIR, "report-phase-j.json")}`);
