/**
 * Phase N -- can scoringEnvironment's contribution be constrained or
 * separately calibrated to behave sensibly (non-negative, interpretable)
 * without losing Model C's (Phase M) useful predictive signal? Models A-E,
 * same 3 folds. No new football features. Research-only.
 *
 * Usage: npx tsx scripts/analysis/nfl-total-model-research/evaluate-phase-n.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildEwmaResearchDataset } from "@/lib/nfl/research/total/datasetEwma";
import { buildScoringSupportIndex } from "@/lib/nfl/research/total/teamScoringFeatures";
import { fitBaseline1, scoreBaseline1 } from "@/lib/nfl/research/total/baselines";
import { fitReducedTotalRidge, scoreReducedTotalRidge, REDUCED_RIDGE_FEATURE_NAMES } from "@/lib/nfl/research/total/ridgeModelReduced";
import { rawResidualFeatures } from "@/lib/nfl/research/total/residualRidge";
import { fitRidgeModel, scoreRidgeModel } from "@/lib/nfl/props/ridge";
import { fitRelativeRidgeNoEnvironment, computeEnvReferenceMean, scoreWithEnvironmentScalar, selectEnvironmentAlpha } from "@/lib/nfl/research/total/environmentScalarRidge";
import { fitBoundedEnvironmentRidge, scoreBoundedEnvironmentRidge } from "@/lib/nfl/research/total/boundedEnvironmentRidge";
import { fitEnvironmentPenaltyRidge, scoreEnvironmentPenaltyRidge } from "@/lib/nfl/research/total/environmentPenaltyRidge";
import { mae, rmse, meanBias, pearsonCorrelation } from "@/lib/nfl/research/total/metrics";
import type { NflTotalResearchDatasetRow } from "@/lib/nfl/research/total/types";
import { loadOutcomesForSeasons, loadScoringSupportForSeasons, ROOT } from "./lib/loadData";

const OUT_DIR = join(ROOT, "scripts", "analysis", "nfl-total-model-research", "out");
const RIDGE_LAMBDA = 1;
const OFF_HALF_LIFE = 6;
const DEF_HALF_LIFE = 4;
const ALPHA_CANDIDATES = [0, 0.25, 0.5, 0.75, 1.0];
const LAMBDA_ENV_CANDIDATES = { weak: 1, medium: 10, strong: 100 };

const ENV_CORPUS_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];
const SCORING_SUPPORT_SEASONS = [2021, 2022, 2023, 2024, 2025];
const TARGET_SEASONS = [2022, 2023, 2024, 2025];

console.log("[load] outcomes + scoring support...");
const envCorpusGames = loadOutcomesForSeasons(ENV_CORPUS_SEASONS);
const targetGames = loadOutcomesForSeasons(TARGET_SEASONS);
const scoringSupportRows = loadScoringSupportForSeasons(SCORING_SUPPORT_SEASONS);
const scoringSupportIndex = buildScoringSupportIndex(scoringSupportRows);

const dataset = buildEwmaResearchDataset({
  targetGames, environmentCorpusGames: envCorpusGames, scoringSupportIndex,
  environmentMode: "priorSeasonOnly", offenseHalfLife: OFF_HALF_LIFE, defenseHalfLife: DEF_HALF_LIFE,
});
console.log(`[load] dataset rows=${dataset.length}`);

type Fold = { name: string; trainSeasons: number[]; evalSeasons: number[]; internalTrainSeasons: number[] | null; internalValSeasons: number[] | null };
const FOLDS: Fold[] = [
  { name: "fold1", trainSeasons: [2022], evalSeasons: [2023], internalTrainSeasons: null, internalValSeasons: null },
  { name: "fold2", trainSeasons: [2022, 2023], evalSeasons: [2024], internalTrainSeasons: [2022], internalValSeasons: [2023] },
  { name: "retrospective", trainSeasons: [2022, 2023, 2024], evalSeasons: [2025], internalTrainSeasons: [2022, 2023], internalValSeasons: [2024] },
];
function rowsFor(seasons: readonly number[]) { return dataset.filter((r) => seasons.includes(r.season)); }
const WEEK_BUCKETS = [
  { label: "weeks-1-4", min: 1, max: 4 }, { label: "weeks-5-9", min: 5, max: 9 },
  { label: "weeks-10-14", min: 10, max: 14 }, { label: "weeks-15+", min: 15, max: 99 },
];

type Projector = (row: NflTotalResearchDatasetRow) => number | null;
function teamPointMetrics(rows: readonly NflTotalResearchDatasetRow[], project: Projector) {
  const pairs = rows.map((r) => ({ projected: project(r), actual: r.actualTeamPoints })).filter((p) => p.projected !== null) as { projected: number; actual: number }[];
  const errors = pairs.map((p) => p.projected - p.actual);
  return { n: pairs.length, mae: mae(errors), rmse: rmse(errors), correlation: pearsonCorrelation(pairs.map((p) => p.projected), pairs.map((p) => p.actual)), meanBias: meanBias(errors), meanProjected: pairs.length ? pairs.reduce((s, p) => s + p.projected, 0) / pairs.length : null, meanActual: pairs.length ? pairs.reduce((s, p) => s + p.actual, 0) / pairs.length : null };
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
  return { n: games.length, mae: mae(errors), rmse: rmse(errors), correlation: pearsonCorrelation(games.map((g) => g.projectedTotal), games.map((g) => g.actualTotal)), meanBias: meanBias(errors), meanProjected: games.length ? games.reduce((s, g) => s + g.projectedTotal, 0) / games.length : null, meanActual: games.length ? games.reduce((s, g) => s + g.actualTotal, 0) / games.length : null };
}
function bucketAnalysis(games: readonly GameTotalRow[]) {
  return WEEK_BUCKETS.map((bucket) => {
    const slice = games.filter((g) => g.week >= bucket.min && g.week <= bucket.max);
    const errors = slice.map((g) => g.projectedTotal - g.actualTotal);
    return { label: bucket.label, n: slice.length, mae: mae(errors), meanSignedError: meanBias(errors), meanActualTotal: slice.length ? slice.reduce((s, g) => s + g.actualTotal, 0) / slice.length : null, meanProjectedTotal: slice.length ? slice.reduce((s, g) => s + g.projectedTotal, 0) / slice.length : null };
  });
}

// ---------------------------------------------------------------------------
// Baseline1 (fixed reference).
// ---------------------------------------------------------------------------
const baselineByFold: Record<string, unknown> = {};
for (const fold of FOLDS) {
  const train = rowsFor(fold.trainSeasons);
  const val = rowsFor(fold.evalSeasons);
  const b1 = fitBaseline1(train);
  const project: Projector = (r) => scoreBaseline1(b1, r);
  baselineByFold[fold.name] = { teamPoint: teamPointMetrics(val, project), gameTotal: gameTotalMetrics(gameTotals(val, project)) };
}

// ---------------------------------------------------------------------------
// Models A-E.
// ---------------------------------------------------------------------------
const modelResults: Record<string, Record<string, unknown>> = { A: {}, B: {}, C: {}, D: {}, E: {} };
const pooledGames: Record<string, GameTotalRow[]> = { A: [], B: [], C: [], D: [], E: [] };
const environmentDecomposition: Record<string, Record<string, unknown>> = { A: {}, B: {}, C: {}, D: {}, E: {} };
const coefficientsByModelFold: Record<string, Record<string, unknown>> = { A: {}, C: {}, D: {}, E: {} };
const selectionDetails: Record<string, unknown> = { C: {}, E: {} };

for (const fold of FOLDS) {
  const train = rowsFor(fold.trainSeasons);
  const val = rowsFor(fold.evalSeasons);
  const avgActual = val.reduce((s, r) => s + r.actualTeamPoints, 0) / val.length;
  const avgEnvAlone = val.reduce((s, r) => s + (r.scoringEnvironment.value ?? 0), 0) / val.length;

  // Model A: exact Phase M Model C reproduction.
  const ridgeA = fitReducedTotalRidge(train, RIDGE_LAMBDA);
  const projectA: Projector = (r) => scoreReducedTotalRidge(ridgeA, r);
  modelResults.A[fold.name] = { teamPoint: teamPointMetrics(val, projectA), gameTotal: gameTotalMetrics(gameTotals(val, projectA)) };
  pooledGames.A.push(...gameTotals(val, projectA));
  coefficientsByModelFold.A[fold.name] = Object.fromEntries(REDUCED_RIDGE_FEATURE_NAMES.map((n, i) => [n, ridgeA.coefficients[i]]));
  environmentDecomposition.A[fold.name] = {
    envCoefficientOrScalar: ridgeA.coefficients[REDUCED_RIDGE_FEATURE_NAMES.indexOf("scoringEnvironment")],
    intercept: ridgeA.intercept,
    avgActualTeamPoints: avgActual, avgEnvironmentValueAlone: avgEnvAlone,
    avgPredictedTeamPoints: teamPointMetrics(val, projectA).meanProjected,
  };

  // Model B: drop environment entirely.
  const usableB = train.filter((r) => rawResidualFeatures(r) !== null);
  const ridgeB = fitRidgeModel(usableB.map((r) => [...rawResidualFeatures(r)!]), usableB.map((r) => r.actualTeamPoints), RIDGE_LAMBDA);
  const projectB: Projector = (r) => { const f = rawResidualFeatures(r); return f === null ? null : scoreRidgeModel(ridgeB, f); };
  modelResults.B[fold.name] = { teamPoint: teamPointMetrics(val, projectB), gameTotal: gameTotalMetrics(gameTotals(val, projectB)) };
  pooledGames.B.push(...gameTotals(val, projectB));
  environmentDecomposition.B[fold.name] = { envCoefficientOrScalar: null, intercept: ridgeB.intercept, avgActualTeamPoints: avgActual, avgEnvironmentValueAlone: avgEnvAlone, avgPredictedTeamPoints: teamPointMetrics(val, projectB).meanProjected };

  // Model C: separately-calibrated scalar.
  let alphaResult: { selectedAlpha: number; method: string; scores?: unknown };
  if (fold.internalTrainSeasons && fold.internalValSeasons) {
    const internalTrain = rowsFor(fold.internalTrainSeasons);
    const internalVal = rowsFor(fold.internalValSeasons);
    const selection = selectEnvironmentAlpha(internalTrain, internalVal, RIDGE_LAMBDA, ALPHA_CANDIDATES);
    alphaResult = { selectedAlpha: selection.selectedAlpha, method: "internal-split", scores: selection.scores };
  } else {
    alphaResult = { selectedAlpha: 0, method: "fold1-zero-variance-fallback" };
  }
  const relativeRidgeC = fitRelativeRidgeNoEnvironment(train, RIDGE_LAMBDA);
  const envRefC = computeEnvReferenceMean(train)!;
  const projectC: Projector = (r) => scoreWithEnvironmentScalar(relativeRidgeC, envRefC, alphaResult.selectedAlpha, r);
  modelResults.C[fold.name] = { teamPoint: teamPointMetrics(val, projectC), gameTotal: gameTotalMetrics(gameTotals(val, projectC)) };
  pooledGames.C.push(...gameTotals(val, projectC));
  coefficientsByModelFold.C[fold.name] = { ...Object.fromEntries(["offenseEpaPerPlay", "offenseSuccessRate", "opponentDefenseEpaAllowed", "opponentDefenseSuccessAllowed", "homeIndicator"].map((n, i) => [n, relativeRidgeC.coefficients[i]])), environmentScalarAlpha: alphaResult.selectedAlpha };
  selectionDetails.C = { ...(selectionDetails.C as object), [fold.name]: alphaResult };
  environmentDecomposition.C[fold.name] = {
    envCoefficientOrScalar: alphaResult.selectedAlpha, selectionMethod: alphaResult.method, envReferenceMean: envRefC, intercept: relativeRidgeC.intercept,
    avgActualTeamPoints: avgActual, avgEnvironmentValueAlone: avgEnvAlone, avgEnvironmentAdjustmentContribution: val.reduce((s, r) => s + (r.scoringEnvironment.value !== null ? alphaResult.selectedAlpha * (r.scoringEnvironment.value - envRefC) : 0), 0) / val.length,
    avgPredictedTeamPoints: teamPointMetrics(val, projectC).meanProjected,
  };

  // Model D: bounded coefficient [0, 1.5].
  const boundedD = fitBoundedEnvironmentRidge(train, RIDGE_LAMBDA, 0, 1.5);
  const projectD: Projector = (r) => scoreBoundedEnvironmentRidge(boundedD, r);
  modelResults.D[fold.name] = { teamPoint: teamPointMetrics(val, projectD), gameTotal: gameTotalMetrics(gameTotals(val, projectD)) };
  pooledGames.D.push(...gameTotals(val, projectD));
  coefficientsByModelFold.D[fold.name] = { ...Object.fromEntries(REDUCED_RIDGE_FEATURE_NAMES.map((n, i) => [n, boundedD.model.coefficients[i]])), boundHit: boundedD.boundHit, unconstrainedEnvCoefficient: boundedD.unconstrainedEnvCoefficient };
  environmentDecomposition.D[fold.name] = { envCoefficientOrScalar: boundedD.model.coefficients[0], boundHit: boundedD.boundHit, unconstrainedEnvCoefficient: boundedD.unconstrainedEnvCoefficient, intercept: boundedD.model.intercept, avgActualTeamPoints: avgActual, avgEnvironmentValueAlone: avgEnvAlone, avgPredictedTeamPoints: teamPointMetrics(val, projectD).meanProjected };

  // Model E: positive-prior penalty.
  let lambdaEnvResult: { selectedLambdaEnv: number; label: string; method: string };
  if (fold.internalTrainSeasons && fold.internalValSeasons) {
    const internalTrain = rowsFor(fold.internalTrainSeasons);
    const internalVal = rowsFor(fold.internalValSeasons);
    const scores = Object.entries(LAMBDA_ENV_CANDIDATES).map(([label, lambdaEnv]) => {
      const model = fitEnvironmentPenaltyRidge(internalTrain, RIDGE_LAMBDA, lambdaEnv);
      const errors = internalVal.map((r) => { const p = scoreEnvironmentPenaltyRidge(model, r); return p === null ? null : p - r.actualTeamPoints; }).filter((e): e is number => e !== null);
      return { label, lambdaEnv, internalValTeamPointMae: mae(errors) };
    });
    let best = scores[0];
    for (const s of scores) if (s.internalValTeamPointMae !== null && (best.internalValTeamPointMae === null || s.internalValTeamPointMae < best.internalValTeamPointMae - 1e-9)) best = s;
    lambdaEnvResult = { selectedLambdaEnv: best.lambdaEnv, label: best.label, method: "internal-split" };
    selectionDetails.E = { ...(selectionDetails.E as object), [fold.name]: { ...lambdaEnvResult, scores } };
  } else {
    lambdaEnvResult = { selectedLambdaEnv: LAMBDA_ENV_CANDIDATES.weak, label: "weak", method: "fold1-zero-variance-fallback" };
    selectionDetails.E = { ...(selectionDetails.E as object), [fold.name]: lambdaEnvResult };
  }
  const penaltyE = fitEnvironmentPenaltyRidge(train, RIDGE_LAMBDA, lambdaEnvResult.selectedLambdaEnv);
  const projectE: Projector = (r) => scoreEnvironmentPenaltyRidge(penaltyE, r);
  modelResults.E[fold.name] = { teamPoint: teamPointMetrics(val, projectE), gameTotal: gameTotalMetrics(gameTotals(val, projectE)) };
  pooledGames.E.push(...gameTotals(val, projectE));
  coefficientsByModelFold.E[fold.name] = { ...Object.fromEntries(REDUCED_RIDGE_FEATURE_NAMES.map((n, i) => [n, penaltyE.coefficients[i]])), selectedLambdaEnv: lambdaEnvResult.selectedLambdaEnv, selectedLabel: lambdaEnvResult.label };
  environmentDecomposition.E[fold.name] = { envCoefficientOrScalar: penaltyE.coefficients[0], selectedLambdaEnv: lambdaEnvResult.selectedLambdaEnv, selectionMethod: lambdaEnvResult.method, intercept: penaltyE.intercept, avgActualTeamPoints: avgActual, avgEnvironmentValueAlone: avgEnvAlone, avgPredictedTeamPoints: teamPointMetrics(val, projectE).meanProjected };

  console.log(`[models A-E] ${fold.name} done. C alpha=${alphaResult.selectedAlpha} (${alphaResult.method}); E lambdaEnv=${lambdaEnvResult.selectedLambdaEnv} (${lambdaEnvResult.method})`);
}

const weekBucketByModel = Object.fromEntries(Object.entries(pooledGames).map(([m, games]) => [m, bucketAnalysis(games)]));

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "report-phase-n.json"),
  JSON.stringify({ ridgeLambda: RIDGE_LAMBDA, alphaCandidates: ALPHA_CANDIDATES, lambdaEnvCandidates: LAMBDA_ENV_CANDIDATES, baselineByFold, modelResults, weekBucketByModel, environmentDecomposition, coefficientsByModelFold, selectionDetails }, null, 2),
  "utf-8",
);
console.log(`[done] wrote ${join(OUT_DIR, "report-phase-n.json")}`);
