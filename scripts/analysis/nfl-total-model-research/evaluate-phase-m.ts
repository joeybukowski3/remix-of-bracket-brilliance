/**
 * Phase M -- diagnosis of the residual late-season bias after Phase L's
 * EWMA fix. Items 1-6 are pure diagnostics; items 7-9 are the one
 * authorized architecture test (residual-around-environment ridge, raw vs
 * contemporaneous-relative features). No new feature families, no Vegas
 * input, no production wiring. Research-only.
 *
 * Usage: npx tsx scripts/analysis/nfl-total-model-research/evaluate-phase-m.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildResearchDataset, buildScoringEnvironmentCorpus } from "@/lib/nfl/research/total/dataset";
import { buildEwmaResearchDataset } from "@/lib/nfl/research/total/datasetEwma";
import { buildScoringSupportIndex } from "@/lib/nfl/research/total/teamScoringFeatures";
import { computeEwmaWindow } from "@/lib/nfl/research/total/ewmaWindow";
import { computeScoringEnvironment } from "@/lib/nfl/research/total/scoringEnvironment";
import { buildLeagueEpaCorpus, buildLeagueSuccessRateCorpus, computeContemporaneousLeagueAverage } from "@/lib/nfl/research/total/leagueAverage";
import { fitBaseline1, scoreBaseline1 } from "@/lib/nfl/research/total/baselines";
import { fitTotalRidge, scoreTotalRidge } from "@/lib/nfl/research/total/ridgeModel";
import { fitReducedTotalRidge, scoreReducedTotalRidge, REDUCED_RIDGE_FEATURE_NAMES } from "@/lib/nfl/research/total/ridgeModelReduced";
import { fitResidualRidge, scoreResidualRidge, rawResidualFeatures, RESIDUAL_RIDGE_FEATURE_NAMES, type ResidualFeatureFn } from "@/lib/nfl/research/total/residualRidge";
import { mae, rmse, meanBias, pearsonCorrelation } from "@/lib/nfl/research/total/metrics";
import type { NflTotalResearchDatasetRow } from "@/lib/nfl/research/total/types";
import { loadOutcomesForSeasons, loadScoringSupportForSeasons, ROOT } from "./lib/loadData";

const OUT_DIR = join(ROOT, "scripts", "analysis", "nfl-total-model-research", "out");
const RIDGE_LAMBDA = 1;
const OFF_HALF_LIFE = 6;
const DEF_HALF_LIFE = 4;

const ENV_CORPUS_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];
const SCORING_SUPPORT_SEASONS = [2021, 2022, 2023, 2024, 2025];
const TARGET_SEASONS = [2022, 2023, 2024, 2025];

console.log("[load] outcomes + scoring support...");
const envCorpusGames = loadOutcomesForSeasons(ENV_CORPUS_SEASONS);
const targetGames = loadOutcomesForSeasons(TARGET_SEASONS);
const scoringSupportRows = loadScoringSupportForSeasons(SCORING_SUPPORT_SEASONS);
const scoringSupportIndex = buildScoringSupportIndex(scoringSupportRows);

// Primary EWMA dataset (Model E's window config), environment = priorSeasonOnly (Phase J/L control).
const datasetEwma = buildEwmaResearchDataset({
  targetGames, environmentCorpusGames: envCorpusGames, scoringSupportIndex,
  environmentMode: "priorSeasonOnly", offenseHalfLife: OFF_HALF_LIFE, defenseHalfLife: DEF_HALF_LIFE,
});
// Same EWMA windows, seasonToDateWithPriorFallback environment -- for item 5/7's reconciliation.
const datasetEwmaSeasonToDate = buildEwmaResearchDataset({
  targetGames, environmentCorpusGames: envCorpusGames, scoringSupportIndex,
  environmentMode: "seasonToDateWithPriorFallback", offenseHalfLife: OFF_HALF_LIFE, defenseHalfLife: DEF_HALF_LIFE,
});
console.log(`[load] datasetEwma rows=${datasetEwma.length}`);

type Fold = { name: string; trainSeasons: number[]; evalSeasons: number[] };
const FOLDS: Fold[] = [
  { name: "fold1", trainSeasons: [2022], evalSeasons: [2023] },
  { name: "fold2", trainSeasons: [2022, 2023], evalSeasons: [2024] },
  { name: "retrospective", trainSeasons: [2022, 2023, 2024], evalSeasons: [2025] },
];
function rowsFor(dataset: readonly NflTotalResearchDatasetRow[], seasons: readonly number[]) {
  return dataset.filter((r) => seasons.includes(r.season));
}
const WEEK_BUCKETS = [
  { label: "weeks-1-4", min: 1, max: 4 },
  { label: "weeks-5-9", min: 5, max: 9 },
  { label: "weeks-10-14", min: 10, max: 14 },
  { label: "weeks-15+", min: 15, max: 99 },
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
function stats(values: readonly number[]) {
  if (values.length === 0) return { n: 0, mean: null, median: null, stddev: null, p10: null, p25: null, p75: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const pct = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))];
  return { n, mean, median: pct(0.5), stddev: Math.sqrt(variance), p10: pct(0.1), p25: pct(0.25), p75: pct(0.75), p90: pct(0.9) };
}

// ===========================================================================
// Item 1: raw feature distribution shift by season (EWMA offense EPA / success, defense-allowed EPA / success).
// ===========================================================================
function extractOffEpa(r: NflTotalResearchDatasetRow) { return r.offense.epaPerPlay; }
function extractOffSuccess(r: NflTotalResearchDatasetRow) { return r.offense.successRate; }
function extractDefEpa(r: NflTotalResearchDatasetRow) { return r.opponentDefenseAllowed.epaPerPlay; }
function extractDefSuccess(r: NflTotalResearchDatasetRow) { return r.opponentDefenseAllowed.successRate; }
const FEATURES: { key: string; extract: (r: NflTotalResearchDatasetRow) => number | null }[] = [
  { key: "offenseEpa", extract: extractOffEpa }, { key: "offenseSuccess", extract: extractOffSuccess },
  { key: "defEpaAllowed", extract: extractDefEpa }, { key: "defSuccessAllowed", extract: extractDefSuccess },
];
const rawDistributionBySeason = Object.fromEntries(
  TARGET_SEASONS.map((season) => [
    season,
    Object.fromEntries(FEATURES.map(({ key, extract }) => [key, stats(datasetEwma.filter((r) => r.season === season).map(extract).filter((v): v is number => v !== null))])),
  ]),
);
const trainValidationShift = FOLDS.map((fold) => {
  const trainRows = rowsFor(datasetEwma, fold.trainSeasons);
  const valRows = rowsFor(datasetEwma, fold.evalSeasons);
  return {
    fold: fold.name,
    perFeature: Object.fromEntries(
      FEATURES.map(({ key, extract }) => {
        const trainStats = stats(trainRows.map(extract).filter((v): v is number => v !== null));
        const valStats = stats(valRows.map(extract).filter((v): v is number => v !== null));
        const meanDiff = valStats.mean !== null && trainStats.mean !== null ? valStats.mean - trainStats.mean : null;
        const stddevDiff = valStats.stddev !== null && trainStats.stddev !== null ? valStats.stddev - trainStats.stddev : null;
        const valMeanInTrainSigmas = meanDiff !== null && trainStats.stddev ? meanDiff / trainStats.stddev : null;
        return [key, { trainMean: trainStats.mean, trainStddev: trainStats.stddev, valMean: valStats.mean, valStddev: valStats.stddev, meanDiff, stddevDiff, valMeanInTrainSigmas }];
      }),
    ),
  };
});
console.log("[item1] raw distribution shift computed.");

// ===========================================================================
// Item 2: normalized-feature diagnostics using the ridge's actual train-fold normalization, by season and week bucket.
// ===========================================================================
function meanStdOf(values: readonly number[]) {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(variance) > 1e-9 ? Math.sqrt(variance) : 1 };
}
const normalizedDiagnosticsByFold = FOLDS.map((fold) => {
  const trainRows = rowsFor(datasetEwma, fold.trainSeasons);
  const trainNorm = Object.fromEntries(FEATURES.map(({ key, extract }) => [key, meanStdOf(trainRows.map(extract).filter((v): v is number => v !== null))]));
  const byWeekBucket = WEEK_BUCKETS.map((bucket) => {
    const valRows = rowsFor(datasetEwma, fold.evalSeasons).filter((r) => r.week >= bucket.min && r.week <= bucket.max);
    return {
      bucket: bucket.label,
      n: valRows.length,
      perFeature: Object.fromEntries(
        FEATURES.map(({ key, extract }) => {
          const values = valRows.map(extract).filter((v): v is number => v !== null);
          if (values.length === 0) return [key, { n: 0, normalizedMean: null, normalizedStddev: null }];
          const normalized = values.map((v) => (v - trainNorm[key].mean) / trainNorm[key].std);
          const normalizedMean = normalized.reduce((s, v) => s + v, 0) / normalized.length;
          const normalizedStddev = Math.sqrt(normalized.reduce((s, v) => s + (v - normalizedMean) ** 2, 0) / normalized.length);
          return [key, { n: values.length, normalizedMean, normalizedStddev }];
        }),
      ),
    };
  });
  return { fold: fold.name, trainNorm, byWeekBucket };
});
console.log("[item2] normalized diagnostics computed.");

// ===========================================================================
// Item 3: leave-one-season-out normalization comparison (distributional check, not a full refit).
// (B) season-relative = seasonToDateOnly point-in-time league reference. (C) week-relative/contemporaneous = seasonToDateWithPriorFallback.
// ===========================================================================
const leagueEpaCorpus = buildLeagueEpaCorpus(scoringSupportRows);
const leagueSuccessCorpus = buildLeagueSuccessRateCorpus(scoringSupportRows);

/**
 * Diagnostic-only "season-relative, no prior-season fallback" mode for item 3's (B) comparison --
 * intentionally NOT added to the core scoringEnvironment.ts (which only ever needed a WITH-fallback
 * variant for anything production-adjacent); this is strictly-prior, current-season-only, and returns
 * null (never a fabricated value) when no current-season games exist yet, e.g. every team's Week 1.
 */
function seasonToDateOnlyAverage(corpusRows: readonly { season: number; week: number; teamPoints: number }[], cutoff: { season: number; week: number }): number | null {
  const seasonToDate = corpusRows.filter((o) => o.season === cutoff.season && o.week < cutoff.week);
  if (seasonToDate.length === 0) return null;
  return seasonToDate.reduce((s, o) => s + o.teamPoints, 0) / seasonToDate.length;
}

const leagueRefCache = new Map<string, { epaB: number | null; epaC: number | null; successB: number | null; successC: number | null }>();
function leagueReferencesAt(season: number, week: number) {
  const key = `${season}|${week}`;
  if (leagueRefCache.has(key)) return leagueRefCache.get(key)!;
  const cutoff = { season, week };
  const epaB = seasonToDateOnlyAverage(leagueEpaCorpus, cutoff);
  const epaC = computeContemporaneousLeagueAverage(leagueEpaCorpus, cutoff, "seasonToDateWithPriorFallback").value;
  const successB = seasonToDateOnlyAverage(leagueSuccessCorpus, cutoff);
  const successC = computeContemporaneousLeagueAverage(leagueSuccessCorpus, cutoff, "seasonToDateWithPriorFallback").value;
  const result = { epaB, epaC, successB, successC };
  leagueRefCache.set(key, result);
  return result;
}
const leagueRelativeDistributionByBucket = WEEK_BUCKETS.map((bucket) => {
  const rows = datasetEwma.filter((r) => r.week >= bucket.min && r.week <= bucket.max);
  const rawOffEpa: number[] = [];
  const relBOffEpa: number[] = [];
  const relCOffEpa: number[] = [];
  for (const row of rows) {
    if (row.offense.epaPerPlay === null) continue;
    const refs = leagueReferencesAt(row.season, row.week);
    rawOffEpa.push(row.offense.epaPerPlay);
    if (refs.epaB !== null) relBOffEpa.push(row.offense.epaPerPlay - refs.epaB);
    if (refs.epaC !== null) relCOffEpa.push(row.offense.epaPerPlay - refs.epaC);
  }
  return { bucket: bucket.label, raw: stats(rawOffEpa), seasonRelativeB: stats(relBOffEpa), weekRelativeC: stats(relCOffEpa) };
});
console.log("[item3] league-relative distribution comparison computed.");

// ===========================================================================
// Item 4: absolute vs relative signal, by season and week bucket.
// ===========================================================================
const modelCForItem4Coeffs: Record<string, ReturnType<typeof fitReducedTotalRidge>> = {};
for (const fold of FOLDS) modelCForItem4Coeffs[fold.name] = fitReducedTotalRidge(rowsFor(datasetEwma, fold.trainSeasons), RIDGE_LAMBDA);

const absoluteVsRelativeBySeason = TARGET_SEASONS.map((season) => {
  const rows = datasetEwma.filter((r) => r.season === season);
  const fold = FOLDS.find((f) => f.evalSeasons.includes(season));
  const model = fold ? modelCForItem4Coeffs[fold.name] : null;
  const projected = model ? rows.map((r) => scoreReducedTotalRidge(model, r)).filter((v): v is number => v !== null) : [];
  return {
    season,
    actualAvgTeamPoints: rows.reduce((s, r) => s + r.actualTeamPoints, 0) / rows.length,
    avgOffenseEpa: stats(rows.map(extractOffEpa).filter((v): v is number => v !== null)).mean,
    avgOffenseSuccess: stats(rows.map(extractOffSuccess).filter((v): v is number => v !== null)).mean,
    avgDefEpaAllowed: stats(rows.map(extractDefEpa).filter((v): v is number => v !== null)).mean,
    avgDefSuccessAllowed: stats(rows.map(extractDefSuccess).filter((v): v is number => v !== null)).mean,
    avgScoringEnvironment: stats(rows.map((r) => r.scoringEnvironment.value).filter((v): v is number => v !== null)).mean,
    avgProjectedTeamPoints: projected.length > 0 ? projected.reduce((s, v) => s + v, 0) / projected.length : null,
    usedFold: fold?.name ?? "train-only (2022, no val model)",
  };
});
console.log("[item4] absolute vs relative signal computed.");

// ===========================================================================
// Item 5/7: scoring-environment reconciliation -- priorSeasonOnly vs seasonToDateWithPriorFallback, 2024 focus (Phase J's Fold2 anomaly).
// ===========================================================================
const corpus = buildScoringEnvironmentCorpus(envCorpusGames);
const environmentReconciliation2024 = [1, 2, 5, 10, 15, 18].map((week) => {
  const cutoff = { season: 2024, week };
  const priorOnly = computeScoringEnvironment(corpus, cutoff, "priorSeasonOnly");
  const seasonToDate = computeScoringEnvironment(corpus, cutoff, "seasonToDateWithPriorFallback");
  const actualRows = envCorpusGames.filter((g) => g.season === 2024 && g.week === week);
  const actualAvg = actualRows.length > 0 ? actualRows.reduce((s, g) => s + g.homeScore + g.awayScore, 0) / (actualRows.length * 2) : null;
  return { week, priorSeasonOnly: priorOnly.value, seasonToDateWithPriorFallback: seasonToDate.value, actualLeagueAvgPointsThisWeek: actualAvg };
});

// Fit both environment-mode ridges on the EWMA(6,4)-windowed dataset (full 6-feature Model C architecture) for Fold 2 specifically.
const fold2 = FOLDS[1];
const datasetPriorOnlyEwma = datasetEwma; // already priorSeasonOnly
const trainPriorOnly = rowsFor(datasetPriorOnlyEwma, fold2.trainSeasons);
const valPriorOnly = rowsFor(datasetPriorOnlyEwma, fold2.evalSeasons);
const trainSeasonToDate = rowsFor(datasetEwmaSeasonToDate, fold2.trainSeasons);
const valSeasonToDate = rowsFor(datasetEwmaSeasonToDate, fold2.evalSeasons);
const ridgePriorOnlyFold2 = fitReducedTotalRidge(trainPriorOnly, RIDGE_LAMBDA);
const ridgeSeasonToDateFold2 = fitReducedTotalRidge(trainSeasonToDate, RIDGE_LAMBDA);
const envReconciliationFold2 = {
  priorSeasonOnly: {
    coefficients: Object.fromEntries(REDUCED_RIDGE_FEATURE_NAMES.map((n, i) => [n, ridgePriorOnlyFold2.coefficients[i]])),
    intercept: ridgePriorOnlyFold2.intercept,
    gameTotal: gameTotalMetrics(gameTotals(valPriorOnly, (r) => scoreReducedTotalRidge(ridgePriorOnlyFold2, r))),
  },
  seasonToDateWithPriorFallback: {
    coefficients: Object.fromEntries(REDUCED_RIDGE_FEATURE_NAMES.map((n, i) => [n, ridgeSeasonToDateFold2.coefficients[i]])),
    intercept: ridgeSeasonToDateFold2.intercept,
    gameTotal: gameTotalMetrics(gameTotals(valSeasonToDate, (r) => scoreReducedTotalRidge(ridgeSeasonToDateFold2, r))),
  },
};
console.log("[item5/7] environment reconciliation computed.");

// ===========================================================================
// Item 6: intercept + environment identifiability.
// ===========================================================================
const identifiability = FOLDS.map((fold) => {
  const trainRows = rowsFor(datasetEwma, fold.trainSeasons);
  const envValues = trainRows.map((r) => r.scoringEnvironment.value).filter((v): v is number => v !== null);
  const envStats = meanStdOf(envValues);
  const model = fitReducedTotalRidge(trainRows, RIDGE_LAMBDA);
  const envCoeffIndex = REDUCED_RIDGE_FEATURE_NAMES.indexOf("scoringEnvironment");
  const envCorrelationsWithOtherFeatures = REDUCED_RIDGE_FEATURE_NAMES.filter((n) => n !== "scoringEnvironment").map((name) => {
    const idx = REDUCED_RIDGE_FEATURE_NAMES.indexOf(name);
    const extract = (r: NflTotalResearchDatasetRow) => (idx === 1 ? r.offense.epaPerPlay : idx === 2 ? r.offense.successRate : idx === 3 ? r.opponentDefenseAllowed.epaPerPlay : idx === 4 ? r.opponentDefenseAllowed.successRate : r.homeAway === "home" ? 1 : 0);
    const pairs = trainRows.map((r) => ({ env: r.scoringEnvironment.value, other: extract(r) })).filter((p): p is { env: number; other: number } => p.env !== null && p.other !== null);
    return { feature: name, correlation: pearsonCorrelation(pairs.map((p) => p.env), pairs.map((p) => p.other)) };
  });
  const valRows = rowsFor(datasetEwma, fold.evalSeasons);
  const avgActual = valRows.reduce((s, r) => s + r.actualTeamPoints, 0) / valRows.length;
  const avgEnvContribution = valRows.reduce((s, r) => s + (r.scoringEnvironment.value ?? 0), 0) / valRows.length;
  const avgPredicted = teamPointMetrics(valRows, (r) => scoreReducedTotalRidge(model, r)).meanProjected;
  return {
    fold: fold.name,
    trainEnvVariance: envStats.std ** 2,
    trainEnvStddev: envStats.std,
    envCoefficient: model.coefficients[envCoeffIndex],
    intercept: model.intercept,
    envCorrelationsWithOtherFeatures,
    avgActualTeamPoints: avgActual,
    avgEnvironmentValueAlone: avgEnvContribution,
    avgPredictedTeamPoints: avgPredicted,
  };
});
console.log("[item6] identifiability diagnostics computed.");

// ===========================================================================
// Items 9-13: 5-model comparison (A Baseline1, B Model E ref w/explosive, C Model E simplified, D residual raw, E residual contemporaneous-relative).
// ===========================================================================
const datasetEwmaWithExplosive = datasetEwma; // full dataset already carries explosive fields regardless of which ridge consumes them.

function contemporaneousRelativeFeatures(): ResidualFeatureFn {
  return (row) => {
    if (row.offense.epaPerPlay === null || row.offense.successRate === null || row.opponentDefenseAllowed.epaPerPlay === null || row.opponentDefenseAllowed.successRate === null) return null;
    const refs = leagueReferencesAt(row.season, row.week);
    if (refs.epaC === null || refs.successC === null || refs.successC === 0) return null;
    const relOffEpa = row.offense.epaPerPlay - refs.epaC; // difference: EPA/play crosses zero and has ~0 population mean, so a literal ratio is numerically degenerate near the league average -- the well-posed "relative" analog for a signed near-zero-mean quantity is an additive difference, not a ratio. Documented deliberately, see report item 13.
    const relDefEpa = row.opponentDefenseAllowed.epaPerPlay - refs.epaC;
    const relOffSuccess = row.offense.successRate / refs.successC; // ratio: success rate is a bounded positive quantity, ratio is well-defined.
    const relDefSuccess = row.opponentDefenseAllowed.successRate / refs.successC;
    return [relOffEpa, relOffSuccess, relDefEpa, relDefSuccess, row.homeAway === "home" ? 1 : 0];
  };
}
const relativeFeatureFn = contemporaneousRelativeFeatures();

const modelComparisonResults: Record<string, Record<string, unknown>> = { A: {}, B: {}, C: {}, D: {}, E: {} };
const pooledGames: Record<string, GameTotalRow[]> = { A: [], B: [], C: [], D: [], E: [] };
const coefficientsByFold: Record<string, Record<string, unknown>> = { C: {}, D: {}, E: {} };

for (const fold of FOLDS) {
  const train = rowsFor(datasetEwmaWithExplosive, fold.trainSeasons);
  const val = rowsFor(datasetEwmaWithExplosive, fold.evalSeasons);

  // A: Baseline1
  const b1 = fitBaseline1(train);
  const projectA: Projector = (r) => scoreBaseline1(b1, r);
  modelComparisonResults.A[fold.name] = { teamPoint: teamPointMetrics(val, projectA), gameTotal: gameTotalMetrics(gameTotals(val, projectA)) };
  pooledGames.A.push(...gameTotals(val, projectA));

  // B: Model E reference (with explosive) -- full 8-feature ridge.
  const ridgeB = fitTotalRidge(train, RIDGE_LAMBDA);
  const projectB: Projector = (r) => scoreTotalRidge(ridgeB, r);
  modelComparisonResults.B[fold.name] = { teamPoint: teamPointMetrics(val, projectB), gameTotal: gameTotalMetrics(gameTotals(val, projectB)) };
  pooledGames.B.push(...gameTotals(val, projectB));

  // C: Model E simplified (explosive removed) -- 6-feature ridge.
  const ridgeC = fitReducedTotalRidge(train, RIDGE_LAMBDA);
  const projectC: Projector = (r) => scoreReducedTotalRidge(ridgeC, r);
  modelComparisonResults.C[fold.name] = { teamPoint: teamPointMetrics(val, projectC), gameTotal: gameTotalMetrics(gameTotals(val, projectC)) };
  pooledGames.C.push(...gameTotals(val, projectC));
  coefficientsByFold.C[fold.name] = Object.fromEntries(REDUCED_RIDGE_FEATURE_NAMES.map((n, i) => [n, ridgeC.coefficients[i]]));

  // D: residual-around-environment, raw EWMA inputs.
  const ridgeD = fitResidualRidge(train, RIDGE_LAMBDA, rawResidualFeatures);
  const projectD: Projector = (r) => scoreResidualRidge(ridgeD, r, rawResidualFeatures);
  modelComparisonResults.D[fold.name] = { teamPoint: teamPointMetrics(val, projectD), gameTotal: gameTotalMetrics(gameTotals(val, projectD)) };
  pooledGames.D.push(...gameTotals(val, projectD));
  coefficientsByFold.D[fold.name] = Object.fromEntries(RESIDUAL_RIDGE_FEATURE_NAMES.map((n, i) => [n, ridgeD.coefficients[i]]));

  // E: residual-around-environment, contemporaneous-relative inputs.
  const ridgeE = fitResidualRidge(train, RIDGE_LAMBDA, relativeFeatureFn);
  const projectE: Projector = (r) => scoreResidualRidge(ridgeE, r, relativeFeatureFn);
  modelComparisonResults.E[fold.name] = { teamPoint: teamPointMetrics(val, projectE), gameTotal: gameTotalMetrics(gameTotals(val, projectE)) };
  pooledGames.E.push(...gameTotals(val, projectE));
  coefficientsByFold.E[fold.name] = Object.fromEntries(RESIDUAL_RIDGE_FEATURE_NAMES.map((n, i) => [n, ridgeE.coefficients[i]]));

  console.log(`[models A-E] ${fold.name} done.`);
}

function bucketAnalysis(games: readonly GameTotalRow[]) {
  return WEEK_BUCKETS.map((bucket) => {
    const slice = games.filter((g) => g.week >= bucket.min && g.week <= bucket.max);
    const errors = slice.map((g) => g.projectedTotal - g.actualTotal);
    return { label: bucket.label, n: slice.length, mae: mae(errors), meanSignedError: meanBias(errors), meanActualTotal: slice.length ? slice.reduce((s, g) => s + g.actualTotal, 0) / slice.length : null, meanProjectedTotal: slice.length ? slice.reduce((s, g) => s + g.projectedTotal, 0) / slice.length : null };
  });
}
const weekBucketByModel = Object.fromEntries(Object.entries(pooledGames).map(([m, games]) => [m, bucketAnalysis(games)]));

// Absolute calibration table (item 11).
const absoluteCalibration = Object.fromEntries(
  Object.keys(modelComparisonResults).map((model) => [
    model,
    FOLDS.map((fold) => {
      const tp = (modelComparisonResults[model][fold.name] as any).teamPoint;
      const gt = (modelComparisonResults[model][fold.name] as any).gameTotal;
      return { fold: fold.name, actualAvgTeamPoints: tp.meanActual, projectedAvgTeamPoints: tp.meanProjected, teamPointDiff: tp.meanProjected - tp.meanActual, actualAvgGameTotal: gt.meanActual, projectedAvgGameTotal: gt.meanProjected, gameTotalDiff: gt.meanProjected - gt.meanActual };
    }),
  ]),
);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "report-phase-m.json"),
  JSON.stringify(
    {
      rawDistributionBySeason, trainValidationShift, normalizedDiagnosticsByFold, leagueRelativeDistributionByBucket,
      absoluteVsRelativeBySeason, environmentReconciliation2024, envReconciliationFold2, identifiability,
      modelComparisonResults, weekBucketByModel, absoluteCalibration, coefficientsByFold,
    },
    null,
    2,
  ),
  "utf-8",
);
console.log(`[done] wrote ${join(OUT_DIR, "report-phase-m.json")}`);
