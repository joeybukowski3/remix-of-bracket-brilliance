/**
 * Phase L -- EWMA window vs expanding "current" window, controlled test.
 * Model A control (unchanged Phase J architecture) vs Models B-E (EWMA
 * offense/defense half-life combinations). No new features, no lambda
 * sweep, no environment change -- isolates the window-recency variable
 * only. Research-only.
 *
 * Usage: npx tsx scripts/analysis/nfl-total-model-research/evaluate-phase-l.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildResearchDataset } from "@/lib/nfl/research/total/dataset";
import { buildEwmaResearchDataset } from "@/lib/nfl/research/total/datasetEwma";
import { buildScoringSupportIndex } from "@/lib/nfl/research/total/teamScoringFeatures";
import { computeEwmaWindow } from "@/lib/nfl/research/total/ewmaWindow";
import { fitBaseline0, fitBaseline1, scoreBaseline0, scoreBaseline1 } from "@/lib/nfl/research/total/baselines";
import { fitTotalRidge, scoreTotalRidge, isRowUsableForRidge } from "@/lib/nfl/research/total/ridgeModel";
import { fitReducedTotalRidge, scoreReducedTotalRidge } from "@/lib/nfl/research/total/ridgeModelReduced";
import { mae, rmse, meanBias, pearsonCorrelation } from "@/lib/nfl/research/total/metrics";
import type { NflTotalResearchDatasetRow } from "@/lib/nfl/research/total/types";
import { loadOutcomesForSeasons, loadScoringSupportForSeasons, ROOT } from "./lib/loadData";

const OUT_DIR = join(ROOT, "scripts", "analysis", "nfl-total-model-research", "out");
const RIDGE_LAMBDA = 1;

const ENV_CORPUS_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];
const SCORING_SUPPORT_SEASONS = [2021, 2022, 2023, 2024, 2025];
const TARGET_SEASONS = [2022, 2023, 2024, 2025];

console.log("[load] outcomes + scoring support...");
const envCorpusGames = loadOutcomesForSeasons(ENV_CORPUS_SEASONS);
const targetGames = loadOutcomesForSeasons(TARGET_SEASONS);
const scoringSupportRows = loadScoringSupportForSeasons(SCORING_SUPPORT_SEASONS);
const scoringSupportIndex = buildScoringSupportIndex(scoringSupportRows);

// Model A control: EXACT Phase J dataset (priorSeasonOnly environment, "current" expanding window).
const datasetA = buildResearchDataset({ targetGames, environmentCorpusGames: envCorpusGames, scoringSupportIndex, environmentMode: "priorSeasonOnly" });

type ModelSpec = { label: string; offHalfLife: number; defHalfLife: number };
const EWMA_MODELS: ModelSpec[] = [
  { label: "modelB", offHalfLife: 4, defHalfLife: 2 },
  { label: "modelC", offHalfLife: 4, defHalfLife: 4 },
  { label: "modelD", offHalfLife: 6, defHalfLife: 2 },
  { label: "modelE", offHalfLife: 6, defHalfLife: 4 },
];
const ewmaDatasets: Record<string, NflTotalResearchDatasetRow[]> = {};
for (const spec of EWMA_MODELS) {
  ewmaDatasets[spec.label] = buildEwmaResearchDataset({
    targetGames, environmentCorpusGames: envCorpusGames, scoringSupportIndex,
    environmentMode: "priorSeasonOnly", offenseHalfLife: spec.offHalfLife, defenseHalfLife: spec.defHalfLife,
  });
}
console.log(`[load] datasetA rows=${datasetA.length}; EWMA datasets built for ${EWMA_MODELS.map((m) => m.label).join(", ")}`);

type Fold = { name: string; trainSeasons: number[]; evalSeasons: number[] };
const FOLDS: Fold[] = [
  { name: "fold1", trainSeasons: [2022], evalSeasons: [2023] },
  { name: "fold2", trainSeasons: [2022, 2023], evalSeasons: [2024] },
  { name: "retrospective", trainSeasons: [2022, 2023, 2024], evalSeasons: [2025] },
];
function rowsFor(dataset: readonly NflTotalResearchDatasetRow[], seasons: readonly number[]) {
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
// Baselines (fixed reference, computed on datasetA -- unchanged from Phase A-J).
// ---------------------------------------------------------------------------
const baselineResultsByFold: Record<string, unknown> = {};
for (const fold of FOLDS) {
  const trainA = rowsFor(datasetA, fold.trainSeasons);
  const valA = rowsFor(datasetA, fold.evalSeasons);
  const b0 = fitBaseline0();
  const b1 = fitBaseline1(trainA);
  const project0: Projector = (r) => scoreBaseline0(b0, r);
  const project1: Projector = (r) => scoreBaseline1(b1, r);
  baselineResultsByFold[fold.name] = {
    baseline0: { teamPoint: teamPointMetrics(valA, project0), gameTotal: gameTotalMetrics(gameTotals(valA, project0)) },
    baseline1: { teamPoint: teamPointMetrics(valA, project1), gameTotal: gameTotalMetrics(gameTotals(valA, project1)) },
  };
}

// ---------------------------------------------------------------------------
// Models A-E per fold.
// ---------------------------------------------------------------------------
const FEATURE_NAMES = ["scoringEnvironment", "offenseEpaPerPlay", "offenseSuccessRate", "offenseExplosiveRate", "opponentDefenseEpaAllowed", "opponentDefenseSuccessAllowed", "opponentDefenseExplosiveAllowed", "homeIndicator"];
function stdAndRaw(coefficients: readonly number[], featureStds: readonly number[]) {
  return {
    standardized: Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, coefficients[i]])),
    raw: Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, coefficients[i] / featureStds[i]])),
  };
}

const modelResults: Record<string, Record<string, unknown>> = { modelA: {}, modelB: {}, modelC: {}, modelD: {}, modelE: {} };
const pooledGameRows: Record<string, GameTotalRow[]> = { modelA: [], modelB: [], modelC: [], modelD: [], modelE: [] };

for (const fold of FOLDS) {
  // Model A
  const trainA = rowsFor(datasetA, fold.trainSeasons);
  const valA = rowsFor(datasetA, fold.evalSeasons);
  const ridgeA = fitTotalRidge(trainA, RIDGE_LAMBDA);
  const projectA: Projector = (r) => scoreTotalRidge(ridgeA, r);
  const gamesA = gameTotals(valA, projectA);
  modelResults.modelA[fold.name] = { teamPoint: teamPointMetrics(valA, projectA), gameTotal: gameTotalMetrics(gamesA), ...stdAndRaw(ridgeA.coefficients, ridgeA.featureStds), intercept: ridgeA.intercept };
  pooledGameRows.modelA.push(...gamesA);

  for (const spec of EWMA_MODELS) {
    const ds = ewmaDatasets[spec.label];
    const train = rowsFor(ds, fold.trainSeasons);
    const val = rowsFor(ds, fold.evalSeasons);
    const ridge = fitTotalRidge(train, RIDGE_LAMBDA);
    const project: Projector = (r) => scoreTotalRidge(ridge, r);
    const games = gameTotals(val, project);
    modelResults[spec.label][fold.name] = { teamPoint: teamPointMetrics(val, project), gameTotal: gameTotalMetrics(games), ...stdAndRaw(ridge.coefficients, ridge.featureStds), intercept: ridge.intercept };
    pooledGameRows[spec.label].push(...games);
  }
  console.log(`[models A-E] ${fold.name} done.`);
}

// ---------------------------------------------------------------------------
// Week-bucket bias analysis, pooled across all 3 validation folds, per model.
// ---------------------------------------------------------------------------
const WEEK_BUCKETS = [
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
      label: bucket.label, n: slice.length, mae: mae(errors), meanSignedError: meanBias(errors),
      meanActualTotal: slice.length > 0 ? slice.reduce((s, g) => s + g.actualTotal, 0) / slice.length : null,
      meanProjectedTotal: slice.length > 0 ? slice.reduce((s, g) => s + g.projectedTotal, 0) / slice.length : null,
    };
  });
}
const weekBucketAnalysis = Object.fromEntries(Object.entries(pooledGameRows).map(([model, games]) => [model, bucketAnalysis(games)]));

// ---------------------------------------------------------------------------
// Feature-spread analysis: mean/stddev/ESS by week bucket, control vs EWMA variants (offense EPA and defense-allowed EPA).
// ---------------------------------------------------------------------------
function stats(values: readonly number[]) {
  if (values.length === 0) return { n: 0, mean: null, stddev: null };
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { n, mean, stddev: Math.sqrt(variance) };
}
const featureSpreadControl = WEEK_BUCKETS.map((bucket) => {
  const rows = datasetA.filter((r) => r.week >= bucket.min && r.week <= bucket.max);
  return {
    bucket: bucket.label,
    offense: stats(rows.map((r) => r.offense.epaPerPlay).filter((v): v is number => v !== null)),
    defenseAllowed: stats(rows.map((r) => r.opponentDefenseAllowed.epaPerPlay).filter((v): v is number => v !== null)),
    avgOffenseGamesUsed: rows.reduce((s, r) => s + r.offense.sampleGames, 0) / rows.length, // for "current", sampleGames == raw game count == ESS proxy (uniform weighting)
  };
});
const featureSpreadEwma = Object.fromEntries(
  EWMA_MODELS.map((spec) => {
    const perBucket = WEEK_BUCKETS.map((bucket) => {
      const rows = datasetA.filter((r) => r.week >= bucket.min && r.week <= bucket.max); // iterate the same rows (season/week/team identity) as datasetA for a like-for-like row set
      const offenseValues: number[] = [];
      const defenseValues: number[] = [];
      let offenseEssSum = 0;
      let defenseEssSum = 0;
      let n = 0;
      for (const row of rows) {
        const cutoff = { season: row.season, week: row.week };
        const off = computeEwmaWindow(scoringSupportIndex.byTeam.get(row.team) ?? [], cutoff, spec.offHalfLife);
        const def = computeEwmaWindow(scoringSupportIndex.byOpponent.get(row.opponent) ?? [], cutoff, spec.defHalfLife);
        if (off.epaPerPlay !== null) { offenseValues.push(off.epaPerPlay); offenseEssSum += off.effectiveSampleSize; }
        if (def.epaPerPlay !== null) { defenseValues.push(def.epaPerPlay); defenseEssSum += def.effectiveSampleSize; }
        n += 1;
      }
      return {
        bucket: bucket.label,
        offense: stats(offenseValues),
        defenseAllowed: stats(defenseValues),
        avgOffenseEss: offenseValues.length > 0 ? offenseEssSum / offenseValues.length : null,
        avgDefenseEss: defenseValues.length > 0 ? defenseEssSum / defenseValues.length : null,
      };
    });
    return [spec.label, perBucket];
  }),
);
console.log("[feature spread] computed for control + 4 EWMA variants.");

// ---------------------------------------------------------------------------
// Responsiveness case studies -- reuse Phase K's mechanically-selected movers.
// ---------------------------------------------------------------------------
const CASE_STUDIES: { season: number; team: string; role: string }[] = [
  { season: 2022, team: "det", role: "riser" }, { season: 2022, team: "bal", role: "faller" },
  { season: 2023, team: "ari", role: "riser" }, { season: 2023, team: "lac", role: "faller" },
  { season: 2024, team: "car", role: "riser" }, { season: 2024, team: "wsh", role: "faller" },
  { season: 2025, team: "no", role: "riser" }, { season: 2025, team: "kc", role: "faller" },
];
function rawGameEpa(gameId: string, team: string): number | null {
  const row = scoringSupportRows.find((r) => r.gameId === gameId && r.team === team);
  return row && row.eligiblePlays > 0 ? row.offEpaSum / row.eligiblePlays : null;
}
function volatility(values: readonly (number | null)[]): number | null {
  const diffs: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] !== null && values[i - 1] !== null) diffs.push(Math.abs(values[i]! - values[i - 1]!));
  }
  return diffs.length > 0 ? diffs.reduce((s, v) => s + v, 0) / diffs.length : null;
}
const responsivenessCaseStudies = CASE_STUDIES.map(({ season, team, role }) => {
  const games = scoringSupportRows.filter((r) => r.season === season && r.team === team).sort((a, b) => a.week - b.week);
  const weekly = games.map((g) => ({ week: g.week, rawGameEpa: rawGameEpa(g.gameId, team) }));
  // Real "current" (expanding) value per week, taken directly from datasetA.
  const currentByWeek = weekly.map(({ week }) => datasetA.find((r) => r.season === season && r.week === week && r.team === team)?.offense.epaPerPlay ?? null);
  const ewma4ByWeek = weekly.map(({ week }) => computeEwmaWindow(scoringSupportIndex.byTeam.get(team) ?? [], { season, week }, 4).epaPerPlay);
  const ewma6ByWeek = weekly.map(({ week }) => computeEwmaWindow(scoringSupportIndex.byTeam.get(team) ?? [], { season, week }, 6).epaPerPlay);
  return {
    season, team, role,
    weekly: weekly.map((w, i) => ({ week: w.week, rawGameEpa: w.rawGameEpa, current: currentByWeek[i], ewma4: ewma4ByWeek[i], ewma6: ewma6ByWeek[i] })),
    volatility: { rawGame: volatility(weekly.map((w) => w.rawGameEpa)), current: volatility(currentByWeek), ewma4: volatility(ewma4ByWeek), ewma6: volatility(ewma6ByWeek) },
  };
});
console.log("[responsiveness] case studies computed.");

// ---------------------------------------------------------------------------
// Explosive-rate ablation -- applied ONLY to the best EWMA model, decided after inspecting modelResults above.
// (Chosen: modelE, offense EWMA-6 / defense EWMA-4 -- see report for the evidence; if the report's own
// analysis picks a different model this constant should match it. Computed here for modelE and modelC as
// the two most-supported candidates so the report can cite whichever the evidence favors.)
// ---------------------------------------------------------------------------
const ABLATION_CANDIDATES = ["modelC", "modelE"];
const explosiveAblation: Record<string, Record<string, unknown>> = {};
for (const candidate of ABLATION_CANDIDATES) {
  const ds = ewmaDatasets[candidate];
  explosiveAblation[candidate] = {};
  for (const fold of FOLDS) {
    const train = rowsFor(ds, fold.trainSeasons);
    const val = rowsFor(ds, fold.evalSeasons);
    const fullRidge = fitTotalRidge(train, RIDGE_LAMBDA);
    const reducedRidge = fitReducedTotalRidge(train, RIDGE_LAMBDA);
    const projectFull: Projector = (r) => scoreTotalRidge(fullRidge, r);
    const projectReduced: Projector = (r) => scoreReducedTotalRidge(reducedRidge, r);
    explosiveAblation[candidate][fold.name] = {
      withExplosive: { teamPoint: teamPointMetrics(val, projectFull), gameTotal: gameTotalMetrics(gameTotals(val, projectFull)) },
      withoutExplosive: { teamPoint: teamPointMetrics(val, projectReduced), gameTotal: gameTotalMetrics(gameTotals(val, projectReduced)) },
    };
  }
}
console.log("[explosive ablation] computed for", ABLATION_CANDIDATES.join(", "));

// ---------------------------------------------------------------------------
// Write full report.
// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "report-phase-l.json"),
  JSON.stringify({ ridgeLambda: RIDGE_LAMBDA, baselineResultsByFold, modelResults, weekBucketAnalysis, featureSpreadControl, featureSpreadEwma, responsivenessCaseStudies, explosiveAblation }, null, 2),
  "utf-8",
);
console.log(`[done] wrote ${join(OUT_DIR, "report-phase-l.json")}`);
