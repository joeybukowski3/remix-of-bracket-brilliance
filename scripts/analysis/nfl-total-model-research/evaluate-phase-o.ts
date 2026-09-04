/**
 * Phase O -- diagnosis of whether Phase N's Model B (5-feature ridge: offense
 * EPA/success, opponent-defense-allowed EPA/success, home; EWMA hl=6/hl=4)
 * coefficient sign flips (offenseSuccessRate, opponentDefenseEpaAllowed:
 * negative Fold1, positive Fold2/Retrospective) reflect real evidence
 * against those features or a small-sample (542-row, single-season)
 * artifact. Diagnosis only -- no coefficient constraints applied here.
 *
 * Usage: npx tsx scripts/analysis/nfl-total-model-research/evaluate-phase-o.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildEwmaResearchDataset } from "@/lib/nfl/research/total/datasetEwma";
import { buildScoringSupportIndex } from "@/lib/nfl/research/total/teamScoringFeatures";
import { rawResidualFeatures } from "@/lib/nfl/research/total/residualRidge";
import { fitRidgeModel, scoreRidgeModel, computeStandardization, standardizeRow } from "@/lib/nfl/props/ridge";
import { mae, rmse, meanBias, pearsonCorrelation } from "@/lib/nfl/research/total/metrics";
import type { NflTotalResearchDatasetRow } from "@/lib/nfl/research/total/types";
import { loadOutcomesForSeasons, loadScoringSupportForSeasons, ROOT } from "./lib/loadData";

const OUT_DIR = join(ROOT, "scripts", "analysis", "nfl-total-model-research", "out");
const RIDGE_LAMBDA = 1;
const OFF_HALF_LIFE = 6;
const DEF_HALF_LIFE = 4;
const FEATURE_NAMES = ["offenseEpaPerPlay", "offenseSuccessRate", "opponentDefenseEpaAllowed", "opponentDefenseSuccessAllowed", "homeIndicator"];

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

function rowsFor(seasons: readonly number[]) { return dataset.filter((r) => seasons.includes(r.season)); }
function usableRows(rows: readonly NflTotalResearchDatasetRow[]) { return rows.filter((r) => rawResidualFeatures(r) !== null); }

function fitFive(rows: readonly NflTotalResearchDatasetRow[], lambda: number) {
  const usable = usableRows(rows);
  const rawRows = usable.map((r) => [...rawResidualFeatures(r)!]);
  const targets = usable.map((r) => r.actualTeamPoints);
  const model = fitRidgeModel(rawRows, targets, lambda);
  return { model, n: usable.length, rawRows, targets };
}
function coefficientTable(model: ReturnType<typeof fitRidgeModel>) {
  return {
    standardized: Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, model.coefficients[i]])),
    raw: Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, model.coefficients[i] / model.featureStds[i]])),
    intercept: model.intercept,
  };
}

// ---------------------------------------------------------------------------
// Small local linear-algebra helpers (5x5 -- trace/EDF, correlation matrix).
// ---------------------------------------------------------------------------
function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-9) augmented[pivot][column] += 1e-6;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) { if (row === column) continue; const factor = augmented[row][column]; for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index]; }
  }
  return augmented.map((row) => row[size]);
}
function computeEdf(standardizedRows: number[][], lambda: number): number {
  const width = standardizedRows[0].length;
  const xtx = Array.from({ length: width }, (_, l) => Array.from({ length: width }, (_, r) => standardizedRows.reduce((s, row) => s + row[l] * row[r], 0)));
  const penalized = xtx.map((row, i) => row.map((v, j) => v + (i === j ? lambda : 0)));
  let trace = 0;
  for (let col = 0; col < width; col += 1) {
    const unit = Array.from({ length: width }, (_, i) => xtx[i][col]);
    const solved = solveLinearSystem(penalized.map((r) => [...r]), unit);
    trace += solved[col];
  }
  return trace;
}
function correlationMatrix(rows: number[][]): number[][] {
  const width = rows[0].length;
  return Array.from({ length: width }, (_, i) => Array.from({ length: width }, (_, j) => pearsonCorrelation(rows.map((r) => r[i]), rows.map((r) => r[j])) ?? (i === j ? 1 : 0)));
}

type Projector = (row: NflTotalResearchDatasetRow) => number | null;
function teamPointMetrics(rows: readonly NflTotalResearchDatasetRow[], project: Projector) {
  const pairs = rows.map((r) => ({ projected: project(r), actual: r.actualTeamPoints })).filter((p) => p.projected !== null) as { projected: number; actual: number }[];
  const errors = pairs.map((p) => p.projected - p.actual);
  return { n: pairs.length, mae: mae(errors), correlation: pearsonCorrelation(pairs.map((p) => p.projected), pairs.map((p) => p.actual)), meanBias: meanBias(errors) };
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
  return { n: games.length, mae: mae(errors), correlation: pearsonCorrelation(games.map((g) => g.projectedTotal), games.map((g) => g.actualTotal)), meanBias: meanBias(errors) };
}

type Fold = { name: string; trainSeasons: number[]; evalSeasons: number[] };
const FOLDS: Fold[] = [
  { name: "fold1", trainSeasons: [2022], evalSeasons: [2023] },
  { name: "fold2", trainSeasons: [2022, 2023], evalSeasons: [2024] },
  { name: "retrospective", trainSeasons: [2022, 2023, 2024], evalSeasons: [2025] },
];

// ===========================================================================
// Item 1: current 5-feature ridge, all folds.
// ===========================================================================
const item1 = FOLDS.map((fold) => {
  const { model, n, rawRows } = fitFive(rowsFor(fold.trainSeasons), RIDGE_LAMBDA);
  const { means, stds } = computeStandardization(rawRows);
  const standardizedRows = rawRows.map((r) => standardizeRow(r, means, stds));
  return { fold: fold.name, ...coefficientTable(model), lambda: RIDGE_LAMBDA, trainRowCount: n, edf: computeEdf(standardizedRows, RIDGE_LAMBDA), correlationMatrix: correlationMatrix(rawRows), featureNames: FEATURE_NAMES };
});
console.log("[item1] current coefficients computed.");

// ===========================================================================
// Item 2: single-season fits.
// ===========================================================================
const item2 = TARGET_SEASONS.map((season) => {
  const { model, n } = fitFive(rowsFor([season]), RIDGE_LAMBDA);
  return { season, ...coefficientTable(model), trainRowCount: n, diagnosticOnly: season === 2025 };
});
console.log("[item2] single-season coefficients computed.");

// ===========================================================================
// Item 3: cumulative multi-season.
// ===========================================================================
const CUMULATIVE_CONFIGS = [[2022], [2022, 2023], [2022, 2023, 2024], [2022, 2023, 2024, 2025]];
const item3 = CUMULATIVE_CONFIGS.map((seasons) => {
  const { model, n } = fitFive(rowsFor(seasons), RIDGE_LAMBDA);
  return { seasons, ...coefficientTable(model), trainRowCount: n, diagnosticOnly: seasons.includes(2025) };
});
console.log("[item3] cumulative trajectory computed.");

// ===========================================================================
// Item 4: leave-one-season-out.
// ===========================================================================
const item4 = TARGET_SEASONS.map((excluded) => {
  const seasons = TARGET_SEASONS.filter((s) => s !== excluded);
  const { model, n } = fitFive(rowsFor(seasons), RIDGE_LAMBDA);
  return { excludedSeason: excluded, trainSeasons: seasons, ...coefficientTable(model), trainRowCount: n, diagnosticOnly: seasons.includes(2025) };
});
console.log("[item4] LOSO coefficients computed.");

// ===========================================================================
// Item 5: game-clustered bootstrap for Fold1 (2022-only) and retrospective (2022-2024).
// ===========================================================================
function bootstrapCoefficients(rows: readonly NflTotalResearchDatasetRow[], draws: number, lambda: number, seed: number) {
  const usable = usableRows(rows);
  const byGame = new Map<string, NflTotalResearchDatasetRow[]>();
  for (const r of usable) { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId)!.push(r); }
  const gameIds = [...byGame.keys()];
  // simple deterministic LCG for reproducibility -- research diagnostic only.
  let state = seed;
  const rand = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
  const offSuccessDraws: number[] = [];
  const defEpaAllowedDraws: number[] = [];
  for (let d = 0; d < draws; d += 1) {
    const sampledRows: NflTotalResearchDatasetRow[] = [];
    for (let i = 0; i < gameIds.length; i += 1) {
      const pick = gameIds[Math.floor(rand() * gameIds.length)];
      sampledRows.push(...byGame.get(pick)!);
    }
    const rawRows = sampledRows.map((r) => [...rawResidualFeatures(r)!]);
    const targets = sampledRows.map((r) => r.actualTeamPoints);
    const model = fitRidgeModel(rawRows, targets, lambda);
    offSuccessDraws.push(model.coefficients[FEATURE_NAMES.indexOf("offenseSuccessRate")]);
    defEpaAllowedDraws.push(model.coefficients[FEATURE_NAMES.indexOf("opponentDefenseEpaAllowed")]);
  }
  function summarize(draws: number[]) {
    const sorted = [...draws].sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return { median: pct(0.5), p5: pct(0.05), p95: pct(0.95), pctPositive: 100 * draws.filter((v) => v > 0).length / draws.length, pctNegative: 100 * draws.filter((v) => v < 0).length / draws.length };
  }
  return { drawCount: draws, gameCount: gameIds.length, offenseSuccessRate: summarize(offSuccessDraws), opponentDefenseEpaAllowed: summarize(defEpaAllowedDraws) };
}
const BOOTSTRAP_DRAWS = 1000;
const item5 = {
  drawCount: BOOTSTRAP_DRAWS,
  fold1_2022only: bootstrapCoefficients(rowsFor([2022]), BOOTSTRAP_DRAWS, RIDGE_LAMBDA, 42),
  retrospective_2022to2024: bootstrapCoefficients(rowsFor([2022, 2023, 2024]), BOOTSTRAP_DRAWS, RIDGE_LAMBDA, 1337),
};
console.log("[item5] bootstrap computed.", JSON.stringify(item5));

// ===========================================================================
// Item 6: offense-side / defense-side feature subset variants.
// ===========================================================================
type SubsetSpec = { label: string; extract: (row: NflTotalResearchDatasetRow) => readonly number[] | null; names: string[] };
const SUBSETS: SubsetSpec[] = [
  { label: "A_offenseEpaOnly", names: ["offenseEpaPerPlay", "opponentDefenseEpaAllowed", "opponentDefenseSuccessAllowed", "homeIndicator"], extract: (r) => (r.offense.epaPerPlay === null || r.opponentDefenseAllowed.epaPerPlay === null || r.opponentDefenseAllowed.successRate === null ? null : [r.offense.epaPerPlay, r.opponentDefenseAllowed.epaPerPlay, r.opponentDefenseAllowed.successRate, r.homeAway === "home" ? 1 : 0]) },
  { label: "B_offenseSuccessOnly", names: ["offenseSuccessRate", "opponentDefenseEpaAllowed", "opponentDefenseSuccessAllowed", "homeIndicator"], extract: (r) => (r.offense.successRate === null || r.opponentDefenseAllowed.epaPerPlay === null || r.opponentDefenseAllowed.successRate === null ? null : [r.offense.successRate, r.opponentDefenseAllowed.epaPerPlay, r.opponentDefenseAllowed.successRate, r.homeAway === "home" ? 1 : 0]) },
  { label: "C_offenseBoth_control", names: FEATURE_NAMES, extract: rawResidualFeatures },
  { label: "D_defenseEpaOnly", names: ["offenseEpaPerPlay", "offenseSuccessRate", "opponentDefenseEpaAllowed", "homeIndicator"], extract: (r) => (r.offense.epaPerPlay === null || r.offense.successRate === null || r.opponentDefenseAllowed.epaPerPlay === null ? null : [r.offense.epaPerPlay, r.offense.successRate, r.opponentDefenseAllowed.epaPerPlay, r.homeAway === "home" ? 1 : 0]) },
  { label: "E_defenseSuccessOnly", names: ["offenseEpaPerPlay", "offenseSuccessRate", "opponentDefenseSuccessAllowed", "homeIndicator"], extract: (r) => (r.offense.epaPerPlay === null || r.offense.successRate === null || r.opponentDefenseAllowed.successRate === null ? null : [r.offense.epaPerPlay, r.offense.successRate, r.opponentDefenseAllowed.successRate, r.homeAway === "home" ? 1 : 0]) },
  { label: "F_defenseBoth_control", names: FEATURE_NAMES, extract: rawResidualFeatures },
];
const item6 = SUBSETS.map((spec) => ({
  label: spec.label,
  names: spec.names,
  byFold: FOLDS.map((fold) => {
    const train = rowsFor(fold.trainSeasons).filter((r) => spec.extract(r) !== null);
    const val = rowsFor(fold.evalSeasons);
    const model = fitRidgeModel(train.map((r) => [...spec.extract(r)!]), train.map((r) => r.actualTeamPoints), RIDGE_LAMBDA);
    const project: Projector = (r) => { const f = spec.extract(r); return f === null ? null : scoreRidgeModel(model, f); };
    return { fold: fold.name, coefficients: Object.fromEntries(spec.names.map((n, i) => [n, model.coefficients[i]])), teamPoint: teamPointMetrics(val, project), gameTotal: gameTotalMetrics(gameTotals(val, project)) };
  }),
}));
console.log("[item6] subset variants computed.");

// ===========================================================================
// Item 7: partial correlation / residualized signal.
// ===========================================================================
function simpleOls(x: readonly number[], y: readonly number[]) {
  const n = x.length;
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varX = 0;
  for (let i = 0; i < n; i += 1) { cov += (x[i] - meanX) * (y[i] - meanY); varX += (x[i] - meanX) ** 2; }
  const slope = varX > 1e-12 ? cov / varX : 0;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}
function residualize(x: readonly number[], y: readonly number[]): number[] {
  const { slope, intercept } = simpleOls(x, y);
  return y.map((v, i) => v - (intercept + slope * x[i]));
}
const usableAll = usableRows(dataset);
const offEpaAll = usableAll.map((r) => r.offense.epaPerPlay!);
const offSuccessAll = usableAll.map((r) => r.offense.successRate!);
const defEpaAllowedAll = usableAll.map((r) => r.opponentDefenseAllowed.epaPerPlay!);
const defSuccessAllowedAll = usableAll.map((r) => r.opponentDefenseAllowed.successRate!);
const pointsAll = usableAll.map((r) => r.actualTeamPoints);

const offSuccessResidual = residualize(offEpaAll, offSuccessAll); // offSuccess ~ offEpa, residual
const defEpaAllowedResidual = residualize(defSuccessAllowedAll, defEpaAllowedAll); // defEpaAllowed ~ defSuccessAllowed, residual

function bySeasonCorr(residual: readonly number[], rows: readonly NflTotalResearchDatasetRow[]) {
  return TARGET_SEASONS.map((season) => {
    const idx = rows.map((r, i) => (r.season === season ? i : -1)).filter((i) => i >= 0);
    return { season, n: idx.length, correlation: pearsonCorrelation(idx.map((i) => residual[i]), idx.map((i) => pointsAll[i])) };
  });
}
const item7 = {
  offenseSuccessResidualizedOnEpa: { pooledCorrelation: pearsonCorrelation(offSuccessResidual, pointsAll), bySeason: bySeasonCorr(offSuccessResidual, usableAll), rawOffenseSuccessCorrelation: pearsonCorrelation(offSuccessAll, pointsAll) },
  defenseEpaAllowedResidualizedOnSuccessAllowed: { pooledCorrelation: pearsonCorrelation(defEpaAllowedResidual, pointsAll), bySeason: bySeasonCorr(defEpaAllowedResidual, usableAll), rawDefenseEpaAllowedCorrelation: pearsonCorrelation(defEpaAllowedAll, pointsAll) },
};
console.log("[item7] partial correlation computed.");

// ===========================================================================
// Item 8: raw univariate relationship by season.
// ===========================================================================
const item8 = TARGET_SEASONS.map((season) => {
  const rows = usableAll.filter((r) => r.season === season);
  const offEpa = rows.map((r) => r.offense.epaPerPlay!);
  const offSuccess = rows.map((r) => r.offense.successRate!);
  const defEpa = rows.map((r) => r.opponentDefenseAllowed.epaPerPlay!);
  const defSuccess = rows.map((r) => r.opponentDefenseAllowed.successRate!);
  const points = rows.map((r) => r.actualTeamPoints);
  return {
    season, n: rows.length,
    offenseEpa: { correlation: pearsonCorrelation(offEpa, points), slope: simpleOls(offEpa, points).slope },
    offenseSuccess: { correlation: pearsonCorrelation(offSuccess, points), slope: simpleOls(offSuccess, points).slope },
    defenseEpaAllowed: { correlation: pearsonCorrelation(defEpa, points), slope: simpleOls(defEpa, points).slope },
    defenseSuccessAllowed: { correlation: pearsonCorrelation(defSuccess, points), slope: simpleOls(defSuccess, points).slope },
    diagnosticOnly: season === 2025,
  };
});
console.log("[item8] univariate by-season relationships computed.");

// ===========================================================================
// Item 9: sample-size curve (chronological prefixes).
// ===========================================================================
const chronological = [...usableAll].sort((a, b) => a.season - b.season || a.week - b.week);
const SAMPLE_SIZES = [500, 800, 1100, 1500, 2000];
const item9 = SAMPLE_SIZES.filter((n) => n <= chronological.length).map((n) => {
  const prefix = chronological.slice(0, n);
  const model = fitRidgeModel(prefix.map((r) => [...rawResidualFeatures(r)!]), prefix.map((r) => r.actualTeamPoints), RIDGE_LAMBDA);
  const lastRow = prefix[prefix.length - 1];
  return { n, throughSeason: lastRow.season, throughWeek: lastRow.week, ...coefficientTable(model) };
});
console.log("[item9] sample-size curve computed.");

// ===========================================================================
// Item 10: lambda sensitivity.
// ===========================================================================
const LAMBDA_GRID = [1, 10, 50, 100];
const LAMBDA_CONFIGS = [{ label: "2022-only", seasons: [2022], evalSeasons: [2023] }, { label: "2022-2023", seasons: [2022, 2023], evalSeasons: [2024] }, { label: "2022-2024", seasons: [2022, 2023, 2024], evalSeasons: [2025] }];
const item10 = LAMBDA_CONFIGS.map((cfg) => ({
  config: cfg.label,
  byLambda: LAMBDA_GRID.map((lambda) => {
    const { model } = fitFive(rowsFor(cfg.seasons), lambda);
    const val = rowsFor(cfg.evalSeasons);
    const project: Projector = (r) => { const f = rawResidualFeatures(r); return f === null ? null : scoreRidgeModel(model, f); };
    return { lambda, ...coefficientTable(model), valGameTotalMae: gameTotalMetrics(gameTotals(val, project)).mae };
  }),
}));
console.log("[item10] lambda sensitivity computed.");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "report-phase-o.json"),
  JSON.stringify({ item1, item2, item3, item4, item5, item6, item7, item8, item9, item10 }, null, 2),
  "utf-8",
);
console.log(`[done] wrote ${join(OUT_DIR, "report-phase-o.json")}`);
