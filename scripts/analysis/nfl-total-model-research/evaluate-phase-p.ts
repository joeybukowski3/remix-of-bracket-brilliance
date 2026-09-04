/**
 * Phase P -- can targeted, leakage-safe, data-informed coefficient
 * shrinkage stabilize the Fold-1 fit while preserving Fold-2/retrospective
 * performance? Models A-D, same 3 folds. No new features. Research-only.
 *
 * Usage: npx tsx scripts/analysis/nfl-total-model-research/evaluate-phase-p.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildEwmaResearchDataset } from "@/lib/nfl/research/total/datasetEwma";
import { buildScoringSupportIndex } from "@/lib/nfl/research/total/teamScoringFeatures";
import { fitBaseline1, scoreBaseline1 } from "@/lib/nfl/research/total/baselines";
import { rawResidualFeatures, RESIDUAL_RIDGE_FEATURE_NAMES } from "@/lib/nfl/research/total/residualRidge";
import { fitRidgeModel, scoreRidgeModel } from "@/lib/nfl/props/ridge";
import {
  fitTargetedShrinkageRidge, scoreTargetedShrinkageRidge, fitHistoricalPriorCoefficient,
  OFFENSE_SUCCESS_INDEX, OPPONENT_DEFENSE_EPA_INDEX, type TargetedPrior,
} from "@/lib/nfl/research/total/targetedShrinkageRidge";
import { mae, rmse, meanBias, pearsonCorrelation } from "@/lib/nfl/research/total/metrics";
import type { NflTotalResearchDatasetRow } from "@/lib/nfl/research/total/types";
import { loadOutcomesForSeasons, loadScoringSupportForSeasons, ROOT } from "./lib/loadData";

const OUT_DIR = join(ROOT, "scripts", "analysis", "nfl-total-model-research", "out");
const RIDGE_LAMBDA = 1;
const OFF_HALF_LIFE = 6;
const DEF_HALF_LIFE = 4;
const SHRINKAGE_LAMBDA = 10; // "medium" strength, consistent with Phase N's established weak/medium/strong = 1/10/100 convention.
const STRONGER_LAMBDA = 100; // Model C: the strongest value Phase O actually tested, chosen because Phase O found it gave the BEST (not worse) Fold1 validation MAE of its own grid.

const ENV_CORPUS_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];
const SCORING_SUPPORT_SEASONS = [2021, 2022, 2023, 2024, 2025];
const TARGET_SEASONS = [2022, 2023, 2024, 2025];

console.log("[load] outcomes + scoring support...");
const envCorpusGames = loadOutcomesForSeasons(ENV_CORPUS_SEASONS);
const targetGames = loadOutcomesForSeasons(TARGET_SEASONS);
const historicalGames2021 = loadOutcomesForSeasons([2021]);
const scoringSupportRows = loadScoringSupportForSeasons(SCORING_SUPPORT_SEASONS);
const scoringSupportIndex = buildScoringSupportIndex(scoringSupportRows);

const dataset = buildEwmaResearchDataset({
  targetGames, environmentCorpusGames: envCorpusGames, scoringSupportIndex,
  environmentMode: "priorSeasonOnly", offenseHalfLife: OFF_HALF_LIFE, defenseHalfLife: DEF_HALF_LIFE,
});
// Strictly-prior-to-2022 historical dataset (2021), used ONLY to derive Fold-1's targeted-shrinkage priors.
const historicalDataset2021 = buildEwmaResearchDataset({
  targetGames: historicalGames2021, environmentCorpusGames: envCorpusGames, scoringSupportIndex,
  environmentMode: "priorSeasonOnly", offenseHalfLife: OFF_HALF_LIFE, defenseHalfLife: DEF_HALF_LIFE,
});
console.log(`[load] dataset rows=${dataset.length}, historical 2021 rows=${historicalDataset2021.length}`);

function rowsFor(seasons: readonly number[]) { return dataset.filter((r) => seasons.includes(r.season)); }
function usableRows(rows: readonly NflTotalResearchDatasetRow[]) { return rows.filter((r) => rawResidualFeatures(r) !== null); }

type Fold = { name: string; trainSeasons: number[]; evalSeasons: number[] };
const FOLDS: Fold[] = [
  { name: "fold1", trainSeasons: [2022], evalSeasons: [2023] },
  { name: "fold2", trainSeasons: [2022, 2023], evalSeasons: [2024] },
  { name: "retrospective", trainSeasons: [2022, 2023, 2024], evalSeasons: [2025] },
];

type Projector = (row: NflTotalResearchDatasetRow) => number | null;
function teamPointMetrics(rows: readonly NflTotalResearchDatasetRow[], project: Projector) {
  const pairs = rows.map((r) => ({ projected: project(r), actual: r.actualTeamPoints })).filter((p) => p.projected !== null) as { projected: number; actual: number }[];
  const errors = pairs.map((p) => p.projected - p.actual);
  return { n: pairs.length, mae: mae(errors), rmse: rmse(errors), correlation: pearsonCorrelation(pairs.map((p) => p.projected), pairs.map((p) => p.actual)), meanBias: meanBias(errors) };
}
type GameTotalRow = { gameId: string; projectedTotal: number; actualTotal: number };
function gameTotals(rows: readonly NflTotalResearchDatasetRow[], project: Projector): GameTotalRow[] {
  const byGame = new Map<string, { projected: number[]; actual: number }>();
  for (const row of rows) { const p = project(row); if (p === null) continue; if (!byGame.has(row.gameId)) byGame.set(row.gameId, { projected: [], actual: row.actualGameTotal }); byGame.get(row.gameId)!.projected.push(p); }
  const out: GameTotalRow[] = [];
  for (const [gameId, { projected, actual }] of byGame) { if (projected.length !== 2) continue; out.push({ gameId, projectedTotal: projected[0] + projected[1], actualTotal: actual }); }
  return out;
}
function gameTotalMetrics(games: readonly GameTotalRow[]) {
  const errors = games.map((g) => g.projectedTotal - g.actualTotal);
  return { n: games.length, mae: mae(errors), rmse: rmse(errors), correlation: pearsonCorrelation(games.map((g) => g.projectedTotal), games.map((g) => g.actualTotal)), meanBias: meanBias(errors) };
}
function coefficientTable(model: { coefficients: readonly number[]; intercept: number }) {
  return { standardized: Object.fromEntries(RESIDUAL_RIDGE_FEATURE_NAMES.map((n, i) => [n, model.coefficients[i]])), intercept: model.intercept };
}

// ===========================================================================
// Prior construction (item 1/2 of the report).
// ===========================================================================
const priorProvenance: Record<string, { successPrior: number; defEpaPrior: number; source: string }> = {};

// Fold1: historical 2021-only prior (strictly before 2022's training data -- see historicalDataset2021 above).
const fold1SuccessPrior = fitHistoricalPriorCoefficient(historicalDataset2021, RIDGE_LAMBDA, OFFENSE_SUCCESS_INDEX);
const fold1DefEpaPrior = fitHistoricalPriorCoefficient(historicalDataset2021, RIDGE_LAMBDA, OPPONENT_DEFENSE_EPA_INDEX);
priorProvenance.fold1 = { successPrior: fold1SuccessPrior, defEpaPrior: fold1DefEpaPrior, source: `2021-only historical dataset (n=${usableRows(historicalDataset2021).length}), strictly prior to Fold1's 2022 training year -- independent of 2022-2025` };

// Fold2/Retrospective: self-referential prior from that fold's OWN training years only (leakage-safe, but
// mathematically close to a no-op vs Model A since the prior equals that fold's own unpenalized coefficient --
// documented explicitly, not overstated as an independent correction).
function selfReferentialPrior(trainSeasons: number[], featureIndex: number): number {
  return fitHistoricalPriorCoefficient(rowsFor(trainSeasons), RIDGE_LAMBDA, featureIndex);
}
const fold2SuccessPrior = selfReferentialPrior([2022, 2023], OFFENSE_SUCCESS_INDEX);
const fold2DefEpaPrior = selfReferentialPrior([2022, 2023], OPPONENT_DEFENSE_EPA_INDEX);
priorProvenance.fold2 = { successPrior: fold2SuccessPrior, defEpaPrior: fold2DefEpaPrior, source: "self-referential: unpenalized ridge on Fold2's own 2022-2023 training years only (equals Model A's own fold2 coefficient)" };

const retroSuccessPrior = selfReferentialPrior([2022, 2023, 2024], OFFENSE_SUCCESS_INDEX);
const retroDefEpaPrior = selfReferentialPrior([2022, 2023, 2024], OPPONENT_DEFENSE_EPA_INDEX);
priorProvenance.retrospective = { successPrior: retroSuccessPrior, defEpaPrior: retroDefEpaPrior, source: "self-referential: unpenalized ridge on Retrospective's own 2022-2024 training years only (equals Model A's own retrospective coefficient)" };

console.log("[priors]", JSON.stringify(priorProvenance));

// ===========================================================================
// Baseline1.
// ===========================================================================
const baselineByFold: Record<string, unknown> = {};
for (const fold of FOLDS) {
  const train = rowsFor(fold.trainSeasons);
  const val = rowsFor(fold.evalSeasons);
  const b1 = fitBaseline1(train);
  const project: Projector = (r) => scoreBaseline1(b1, r);
  baselineByFold[fold.name] = { teamPoint: teamPointMetrics(val, project), gameTotal: gameTotalMetrics(gameTotals(val, project)) };
}

// ===========================================================================
// Models A-D.
// ===========================================================================
const modelResults: Record<string, Record<string, unknown>> = { A: {}, B: {}, C: {}, D: {} };
const coefficientsByModelFold: Record<string, Record<string, unknown>> = { A: {}, B: {}, C: {}, D: {} };
const shrinkageDiagnostics: Record<string, unknown> = {};

for (const fold of FOLDS) {
  const train = rowsFor(fold.trainSeasons);
  const val = rowsFor(fold.evalSeasons);
  const usableTrain = usableRows(train);
  const rawTrainRows = usableTrain.map((r) => [...rawResidualFeatures(r)!]);
  const targets = usableTrain.map((r) => r.actualTeamPoints);

  // Model A: control.
  const modelA = fitRidgeModel(rawTrainRows, targets, RIDGE_LAMBDA);
  const projectA: Projector = (r) => { const f = rawResidualFeatures(r); return f === null ? null : scoreRidgeModel(modelA, f); };
  modelResults.A[fold.name] = { teamPoint: teamPointMetrics(val, projectA), gameTotal: gameTotalMetrics(gameTotals(val, projectA)) };
  coefficientsByModelFold.A[fold.name] = coefficientTable(modelA);

  // Model B: targeted shrinkage.
  const priors = priorProvenance[fold.name];
  const targetedPriors: TargetedPrior[] = [
    { featureIndex: OFFENSE_SUCCESS_INDEX, priorValue: priors.successPrior, lambda: SHRINKAGE_LAMBDA },
    { featureIndex: OPPONENT_DEFENSE_EPA_INDEX, priorValue: priors.defEpaPrior, lambda: SHRINKAGE_LAMBDA },
  ];
  const modelB = fitTargetedShrinkageRidge(train, RIDGE_LAMBDA, targetedPriors);
  const projectB: Projector = (r) => scoreTargetedShrinkageRidge(modelB, r);
  modelResults.B[fold.name] = { teamPoint: teamPointMetrics(val, projectB), gameTotal: gameTotalMetrics(gameTotals(val, projectB)) };
  coefficientsByModelFold.B[fold.name] = coefficientTable(modelB);
  shrinkageDiagnostics[fold.name] = {
    successPrior: priors.successPrior, defEpaPrior: priors.defEpaPrior, shrinkageLambda: SHRINKAGE_LAMBDA,
    unconstrainedSuccess: modelA.coefficients[OFFENSE_SUCCESS_INDEX], finalSuccess: modelB.coefficients[OFFENSE_SUCCESS_INDEX], successShrinkageAmount: modelB.coefficients[OFFENSE_SUCCESS_INDEX] - modelA.coefficients[OFFENSE_SUCCESS_INDEX],
    unconstrainedDefEpa: modelA.coefficients[OPPONENT_DEFENSE_EPA_INDEX], finalDefEpa: modelB.coefficients[OPPONENT_DEFENSE_EPA_INDEX], defEpaShrinkageAmount: modelB.coefficients[OPPONENT_DEFENSE_EPA_INDEX] - modelA.coefficients[OPPONENT_DEFENSE_EPA_INDEX],
  };

  // Model C: stronger ordinary ridge, lambda=100.
  const modelC = fitRidgeModel(rawTrainRows, targets, STRONGER_LAMBDA);
  const projectC: Projector = (r) => { const f = rawResidualFeatures(r); return f === null ? null : scoreRidgeModel(modelC, f); };
  modelResults.C[fold.name] = { teamPoint: teamPointMetrics(val, projectC), gameTotal: gameTotalMetrics(gameTotals(val, projectC)) };
  coefficientsByModelFold.C[fold.name] = coefficientTable(modelC);

  // Model D: drop offenseSuccessRate (4 features).
  const dExtract = (r: NflTotalResearchDatasetRow) => (r.offense.epaPerPlay === null || r.opponentDefenseAllowed.epaPerPlay === null || r.opponentDefenseAllowed.successRate === null ? null : [r.offense.epaPerPlay, r.opponentDefenseAllowed.epaPerPlay, r.opponentDefenseAllowed.successRate, r.homeAway === "home" ? 1 : 0]);
  const dUsable = train.filter((r) => dExtract(r) !== null);
  const modelD = fitRidgeModel(dUsable.map((r) => [...dExtract(r)!]), dUsable.map((r) => r.actualTeamPoints), RIDGE_LAMBDA);
  const projectD: Projector = (r) => { const f = dExtract(r); return f === null ? null : scoreRidgeModel(modelD, f); };
  modelResults.D[fold.name] = { teamPoint: teamPointMetrics(val, projectD), gameTotal: gameTotalMetrics(gameTotals(val, projectD)) };
  coefficientsByModelFold.D[fold.name] = { standardized: Object.fromEntries(["offenseEpaPerPlay", "opponentDefenseEpaAllowed", "opponentDefenseSuccessAllowed", "homeIndicator"].map((n, i) => [n, modelD.coefficients[i]])), intercept: modelD.intercept };

  console.log(`[models A-D] ${fold.name} done.`);
}

// ===========================================================================
// Fold-1 bootstrap, post-shrinkage (Model B), for direct comparison against Phase O's pre-shrinkage bootstrap.
// ===========================================================================
function bootstrapShrinkage(rows: readonly NflTotalResearchDatasetRow[], priors: TargetedPrior[], draws: number, seed: number) {
  const usable = usableRows(rows);
  const byGame = new Map<string, NflTotalResearchDatasetRow[]>();
  for (const r of usable) { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId)!.push(r); }
  const gameIds = [...byGame.keys()];
  let state = seed;
  const rand = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
  const successDraws: number[] = [];
  const defEpaDraws: number[] = [];
  for (let d = 0; d < draws; d += 1) {
    const sampled: NflTotalResearchDatasetRow[] = [];
    for (let i = 0; i < gameIds.length; i += 1) sampled.push(...byGame.get(gameIds[Math.floor(rand() * gameIds.length)])!);
    const model = fitTargetedShrinkageRidge(sampled, RIDGE_LAMBDA, priors);
    successDraws.push(model.coefficients[OFFENSE_SUCCESS_INDEX]);
    defEpaDraws.push(model.coefficients[OPPONENT_DEFENSE_EPA_INDEX]);
  }
  function summarize(vals: number[]) {
    const sorted = [...vals].sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return { median: pct(0.5), p5: pct(0.05), p95: pct(0.95), pctPositive: 100 * vals.filter((v) => v > 0).length / vals.length, pctNegative: 100 * vals.filter((v) => v < 0).length / vals.length };
  }
  return { drawCount: draws, gameCount: gameIds.length, offenseSuccessRate: summarize(successDraws), opponentDefenseEpaAllowed: summarize(defEpaDraws) };
}
const fold1Priors: TargetedPrior[] = [
  { featureIndex: OFFENSE_SUCCESS_INDEX, priorValue: fold1SuccessPrior, lambda: SHRINKAGE_LAMBDA },
  { featureIndex: OPPONENT_DEFENSE_EPA_INDEX, priorValue: fold1DefEpaPrior, lambda: SHRINKAGE_LAMBDA },
];
const fold1PostShrinkageBootstrap = bootstrapShrinkage(rowsFor([2022]), fold1Priors, 1000, 42);
console.log("[fold1 post-shrinkage bootstrap]", JSON.stringify(fold1PostShrinkageBootstrap));

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "report-phase-p.json"),
  JSON.stringify({ shrinkageLambda: SHRINKAGE_LAMBDA, strongerLambda: STRONGER_LAMBDA, priorProvenance, baselineByFold, modelResults, coefficientsByModelFold, shrinkageDiagnostics, fold1PostShrinkageBootstrap }, null, 2),
  "utf-8",
);
console.log(`[done] wrote ${join(OUT_DIR, "report-phase-p.json")}`);
