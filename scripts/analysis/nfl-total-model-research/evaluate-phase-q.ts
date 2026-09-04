/**
 * Phase Q -- final evaluation-only consolidation. Locked candidate (Phase
 * O/P's Model A: 5-feature ridge, EWMA offense hl=6/defense hl=4, lambda=1,
 * no scoringEnvironment, no explosive rate, no coefficient constraints) vs
 * Baseline1, identical folds. No architecture changes. Research-only.
 *
 * Usage: npx tsx scripts/analysis/nfl-total-model-research/evaluate-phase-q.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildEwmaResearchDataset } from "@/lib/nfl/research/total/datasetEwma";
import { buildScoringSupportIndex } from "@/lib/nfl/research/total/teamScoringFeatures";
import { fitBaseline1, scoreBaseline1 } from "@/lib/nfl/research/total/baselines";
import { rawResidualFeatures, RESIDUAL_RIDGE_FEATURE_NAMES } from "@/lib/nfl/research/total/residualRidge";
import { fitRidgeModel, scoreRidgeModel } from "@/lib/nfl/props/ridge";
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
const dataset = buildEwmaResearchDataset({
  targetGames, environmentCorpusGames: envCorpusGames, scoringSupportIndex,
  environmentMode: "priorSeasonOnly", offenseHalfLife: OFF_HALF_LIFE, defenseHalfLife: DEF_HALF_LIFE,
});
console.log(`[load] dataset rows=${dataset.length}`);

function rowsFor(seasons: readonly number[]) { return dataset.filter((r) => seasons.includes(r.season)); }
function usableRows(rows: readonly NflTotalResearchDatasetRow[]) { return rows.filter((r) => rawResidualFeatures(r) !== null); }

type Fold = { name: string; trainSeasons: number[]; evalSeason: number };
const FOLDS: Fold[] = [
  { name: "fold1", trainSeasons: [2022], evalSeason: 2023 },
  { name: "fold2", trainSeasons: [2022, 2023], evalSeason: 2024 },
  { name: "retrospective", trainSeasons: [2022, 2023, 2024], evalSeason: 2025 },
];

// ===========================================================================
// Fit candidate + Baseline1 per fold; score every validation row for both.
// ===========================================================================
type ScoredRow = NflTotalResearchDatasetRow & { candidateProjected: number | null; baselineProjected: number | null; fold: string };
const allScoredRows: ScoredRow[] = [];
const coefficientsByFold: Record<string, { standardized: Record<string, number>; intercept: number; trainRowCount: number }> = {};

for (const fold of FOLDS) {
  const train = rowsFor(fold.trainSeasons);
  const val = rowsFor([fold.evalSeason]);
  const usableTrain = usableRows(train);
  const candidateModel = fitRidgeModel(usableTrain.map((r) => [...rawResidualFeatures(r)!]), usableTrain.map((r) => r.actualTeamPoints), RIDGE_LAMBDA);
  coefficientsByFold[fold.name] = { standardized: Object.fromEntries(RESIDUAL_RIDGE_FEATURE_NAMES.map((n, i) => [n, candidateModel.coefficients[i]])), intercept: candidateModel.intercept, trainRowCount: usableTrain.length };
  const baselineModel = fitBaseline1(train);

  for (const row of val) {
    const features = rawResidualFeatures(row);
    const candidateProjected = features === null ? null : scoreRidgeModel(candidateModel, features);
    const baselineProjected = scoreBaseline1(baselineModel, row);
    allScoredRows.push({ ...row, candidateProjected, baselineProjected, fold: fold.name });
  }
  console.log(`[fit] ${fold.name} done. train n=${usableTrain.length}`);
}

// ===========================================================================
// Metrics helpers.
// ===========================================================================
function teamPointMetrics(rows: readonly ScoredRow[], key: "candidateProjected" | "baselineProjected") {
  const pairs = rows.map((r) => ({ projected: r[key], actual: r.actualTeamPoints })).filter((p) => p.projected !== null) as { projected: number; actual: number }[];
  const errors = pairs.map((p) => p.projected - p.actual);
  return { n: pairs.length, mae: mae(errors), rmse: rmse(errors), correlation: pearsonCorrelation(pairs.map((p) => p.projected), pairs.map((p) => p.actual)), meanBias: meanBias(errors) };
}
type GamePair = {
  gameId: string; season: number; week: number; homeTeam: string; awayTeam: string;
  actualHome: number; actualAway: number; actualTotal: number;
  candidateHome: number | null; candidateAway: number | null; candidateTotal: number | null;
  baselineHome: number | null; baselineAway: number | null; baselineTotal: number | null;
};
function buildGamePairs(rows: readonly ScoredRow[]): GamePair[] {
  const byGame = new Map<string, ScoredRow[]>();
  for (const r of rows) { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId)!.push(r); }
  const out: GamePair[] = [];
  for (const [gameId, pair] of byGame) {
    if (pair.length !== 2) continue;
    const home = pair.find((r) => r.homeAway === "home")!;
    const away = pair.find((r) => r.homeAway === "away")!;
    const candidateTotal = home.candidateProjected !== null && away.candidateProjected !== null ? home.candidateProjected + away.candidateProjected : null;
    const baselineTotal = home.baselineProjected !== null && away.baselineProjected !== null ? home.baselineProjected + away.baselineProjected : null;
    out.push({
      gameId, season: home.season, week: home.week, homeTeam: home.team, awayTeam: away.team,
      actualHome: home.actualTeamPoints, actualAway: away.actualTeamPoints, actualTotal: home.actualGameTotal,
      candidateHome: home.candidateProjected, candidateAway: away.candidateProjected, candidateTotal,
      baselineHome: home.baselineProjected, baselineAway: away.baselineProjected, baselineTotal,
    });
  }
  return out;
}
function gameTotalMetrics(games: readonly GamePair[], key: "candidateTotal" | "baselineTotal") {
  const pairs = games.map((g) => ({ projected: g[key], actual: g.actualTotal })).filter((p) => p.projected !== null) as { projected: number; actual: number }[];
  const errors = pairs.map((p) => p.projected - p.actual);
  return { n: pairs.length, mae: mae(errors), rmse: rmse(errors), correlation: pearsonCorrelation(pairs.map((p) => p.projected), pairs.map((p) => p.actual)), meanBias: meanBias(errors) };
}

const allGamePairs = buildGamePairs(allScoredRows);
console.log(`[games] total paired games=${allGamePairs.length}`);

// ===========================================================================
// Item 1/3/4/5: primary metrics by fold + pooled.
// ===========================================================================
const primaryByFold = FOLDS.map((fold) => {
  const rows = allScoredRows.filter((r) => r.fold === fold.name);
  const games = allGamePairs.filter((g) => g.season === fold.evalSeason);
  const candTeam = teamPointMetrics(rows, "candidateProjected");
  const baseTeam = teamPointMetrics(rows, "baselineProjected");
  const candGame = gameTotalMetrics(games, "candidateTotal");
  const baseGame = gameTotalMetrics(games, "baselineTotal");
  return {
    fold: fold.name, evalSeason: fold.evalSeason,
    teamPoint: { candidate: candTeam, baseline1: baseTeam, maeDelta: candTeam.mae! - baseTeam.mae!, maeDeltaPct: (100 * (candTeam.mae! - baseTeam.mae!)) / baseTeam.mae! },
    gameTotal: { candidate: candGame, baseline1: baseGame, maeDelta: candGame.mae! - baseGame.mae!, maeDeltaPct: (100 * (candGame.mae! - baseGame.mae!)) / baseGame.mae!, biasDelta: candGame.meanBias! - baseGame.meanBias! },
  };
});
console.log("[item1] primary metrics computed.");

// ===========================================================================
// Item 2: consistency analysis.
// ===========================================================================
const WEEK_BUCKETS = [{ label: "weeks-1-4", min: 1, max: 4 }, { label: "weeks-5-9", min: 5, max: 9 }, { label: "weeks-10-14", min: 10, max: 14 }, { label: "weeks-15+", min: 15, max: 99 }];
function bucketGameMetrics(games: readonly GamePair[]) {
  return { candidate: gameTotalMetrics(games, "candidateTotal"), baseline1: gameTotalMetrics(games, "baselineTotal") };
}
const weekBucketComparison = WEEK_BUCKETS.map((b) => ({ label: b.label, ...bucketGameMetrics(allGamePairs.filter((g) => g.week >= b.min && g.week <= b.max)) }));

const sortedByActualTotal = [...allGamePairs].sort((a, b) => a.actualTotal - b.actualTotal);
const tercileSize = Math.floor(sortedByActualTotal.length / 3);
const terciles = [
  { label: "low-actual-total", games: sortedByActualTotal.slice(0, tercileSize) },
  { label: "mid-actual-total", games: sortedByActualTotal.slice(tercileSize, 2 * tercileSize) },
  { label: "high-actual-total", games: sortedByActualTotal.slice(2 * tercileSize) },
];
const tercileComparison = terciles.map((t) => ({ label: t.label, n: t.games.length, actualTotalRange: [t.games[0].actualTotal, t.games[t.games.length - 1].actualTotal], ...bucketGameMetrics(t.games) }));

const matureRows = allScoredRows.filter((r) => r.offense.window === "seasonPrior" || r.offense.window === "priorSeason");
const sparseRows = allScoredRows.filter((r) => !r.pregameSafe || (r.offense.sampleGames ?? 0) < 3);
const historyComparison = [
  { label: "sparse-history (pregameSafe=false or <3 games in window)", n: sparseRows.length, teamPoint: { candidate: teamPointMetrics(sparseRows, "candidateProjected"), baseline1: teamPointMetrics(sparseRows, "baselineProjected") } },
  { label: "mature-history (>=3 games, pregameSafe)", n: matureRows.filter((r) => r.pregameSafe && (r.offense.sampleGames ?? 0) >= 3).length, teamPoint: { candidate: teamPointMetrics(matureRows.filter((r) => r.pregameSafe && (r.offense.sampleGames ?? 0) >= 3), "candidateProjected"), baseline1: teamPointMetrics(matureRows.filter((r) => r.pregameSafe && (r.offense.sampleGames ?? 0) >= 3), "baselineProjected") } },
];

// Model-relative favorite categorization -- built ONLY from the candidate's own team-score projections, never Vegas.
const FAVORITE_MARGIN_THRESHOLD = 3; // points; |projected home - away| below this = "roughly even" by the candidate's own numbers.
function favoriteLabel(g: GamePair): string | null {
  if (g.candidateHome === null || g.candidateAway === null) return null;
  const margin = g.candidateHome - g.candidateAway;
  if (Math.abs(margin) < FAVORITE_MARGIN_THRESHOLD) return "roughly-even (model-relative)";
  return margin > 0 ? "home-favorite (model-relative)" : "away-favorite (model-relative)";
}
const favoriteGroups = ["home-favorite (model-relative)", "away-favorite (model-relative)", "roughly-even (model-relative)"].map((label) => {
  const games = allGamePairs.filter((g) => favoriteLabel(g) === label);
  return { label, n: games.length, ...bucketGameMetrics(games) };
});
console.log("[item2] consistency analysis computed.");

// ===========================================================================
// Item 3: distribution of improvement (game-level).
// ===========================================================================
const NEAR_TIE_THRESHOLD = 0.5; // points -- |errorDelta| below this counts as a near-tie.
const improvementRows = allGamePairs
  .filter((g) => g.candidateTotal !== null && g.baselineTotal !== null)
  .map((g) => ({ gameId: g.gameId, season: g.season, week: g.week, homeTeam: g.homeTeam, awayTeam: g.awayTeam, actualTotal: g.actualTotal, candidateTotal: g.candidateTotal!, baselineTotal: g.baselineTotal!, candidateAbsError: Math.abs(g.candidateTotal! - g.actualTotal), baselineAbsError: Math.abs(g.baselineTotal! - g.actualTotal), errorDelta: Math.abs(g.candidateTotal! - g.actualTotal) - Math.abs(g.baselineTotal! - g.actualTotal) }));
const sortedByDelta = [...improvementRows].sort((a, b) => a.errorDelta - b.errorDelta);
const candidateWins = improvementRows.filter((r) => r.errorDelta < -NEAR_TIE_THRESHOLD).length;
const baselineWins = improvementRows.filter((r) => r.errorDelta > NEAR_TIE_THRESHOLD).length;
const nearTies = improvementRows.length - candidateWins - baselineWins;
function pct(arr: readonly number[], p: number) { const sorted = [...arr].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; }
const deltas = improvementRows.map((r) => r.errorDelta);
const distributionOfImprovement = {
  n: improvementRows.length, nearTieThreshold: NEAR_TIE_THRESHOLD,
  pctCandidateWins: (100 * candidateWins) / improvementRows.length, pctBaselineWins: (100 * baselineWins) / improvementRows.length, pctNearTies: (100 * nearTies) / improvementRows.length,
  medianDelta: pct(deltas, 0.5), p10: pct(deltas, 0.1), p25: pct(deltas, 0.25), p75: pct(deltas, 0.75), p90: pct(deltas, 0.9),
  worstRegressions: sortedByDelta.slice(-5).reverse(),
  bestImprovements: sortedByDelta.slice(0, 5),
};
console.log("[item3] distribution of improvement computed.");

// ===========================================================================
// Item 4: game-clustered bootstrap, per fold, candidateMAE - baseline1MAE, and game-total bias.
// ===========================================================================
const BOOTSTRAP_DRAWS = 1000;
function bootstrapFoldDelta(games: readonly GamePair[], draws: number, seed: number) {
  let state = seed;
  const rand = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
  const maeDeltaDraws: number[] = [];
  const biasDeltaDraws: number[] = [];
  for (let d = 0; d < draws; d += 1) {
    const sample: GamePair[] = [];
    for (let i = 0; i < games.length; i += 1) sample.push(games[Math.floor(rand() * games.length)]);
    const candErrors = sample.filter((g) => g.candidateTotal !== null).map((g) => g.candidateTotal! - g.actualTotal);
    const baseErrors = sample.filter((g) => g.baselineTotal !== null).map((g) => g.baselineTotal! - g.actualTotal);
    maeDeltaDraws.push((mae(candErrors) ?? 0) - (mae(baseErrors) ?? 0));
    biasDeltaDraws.push((meanBias(candErrors) ?? 0) - (meanBias(baseErrors) ?? 0));
  }
  function summarize(vals: number[]) {
    const sorted = [...vals].sort((a, b) => a - b);
    const pctv = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return { mean: vals.reduce((s, v) => s + v, 0) / vals.length, ci90: [pctv(0.05), pctv(0.95)], ci95: [pctv(0.025), pctv(0.975)], pctCandidateBetter: (100 * vals.filter((v) => v < 0).length) / vals.length };
  }
  return { drawCount: draws, gameCount: games.length, maeDelta: summarize(maeDeltaDraws), biasDeltaMagnitude: summarize(biasDeltaDraws.map((v) => Math.abs(v))) };
}
const bootstrapByFold = FOLDS.map((fold, i) => ({ fold: fold.name, ...bootstrapFoldDelta(allGamePairs.filter((g) => g.season === fold.evalSeason), BOOTSTRAP_DRAWS, 100 + i) }));
console.log("[item4] bootstrap computed.", JSON.stringify(bootstrapByFold.map((b) => ({ fold: b.fold, maeDeltaMean: b.maeDelta.mean, pctCandidateBetter: b.maeDelta.pctCandidateBetter }))));

// ===========================================================================
// Item 5: pooled out-of-sample summary.
// ===========================================================================
const pooledGames = allGamePairs;
const pooledCandidate = gameTotalMetrics(pooledGames, "candidateTotal");
const pooledBaseline = gameTotalMetrics(pooledGames, "baselineTotal");
const pooledCandidateWinPct = (100 * improvementRows.filter((r) => r.candidateAbsError < r.baselineAbsError).length) / improvementRows.length;
const pooledSummary = { n: pooledGames.length, seasonsIncluded: ["2023 (fold1 val)", "2024 (fold2 val)", "2025 (retrospective -- NOT a pristine holdout, see note)"], candidate: pooledCandidate, baseline1: pooledBaseline, maeDelta: pooledCandidate.mae! - pooledBaseline.mae!, pctGamesCandidateWins: pooledCandidateWinPct };
console.log("[item5] pooled summary computed.");

// ===========================================================================
// Item 6: coefficient summary (already computed above per fold).
// ===========================================================================

// ===========================================================================
// Item 7: mechanically selected examples (already in improvementRows -- best/worst); near-identical selection.
// ===========================================================================
const nearIdentical = [...improvementRows].sort((a, b) => Math.abs(a.errorDelta) - Math.abs(b.errorDelta)).slice(0, 5);
function withTeamProjections(rows: typeof improvementRows) {
  return rows.map((r) => {
    const g = allGamePairs.find((gp) => gp.gameId === r.gameId)!;
    return { ...r, candidateHome: g.candidateHome, candidateAway: g.candidateAway, baselineHome: g.baselineHome, baselineAway: g.baselineAway };
  });
}
const examples = { bestImprovements: withTeamProjections(distributionOfImprovement.bestImprovements), worstRegressions: withTeamProjections(distributionOfImprovement.worstRegressions), nearIdentical: withTeamProjections(nearIdentical) };
console.log("[item7] examples selected.");

// ===========================================================================
// Item 8: calibration table (every 5 points).
// ===========================================================================
function calibrationTable(games: readonly GamePair[], key: "candidateTotal" | "baselineTotal", bandWidth = 5) {
  const withValues = games.filter((g) => g[key] !== null).map((g) => ({ projected: g[key]!, actual: g.actualTotal }));
  if (withValues.length === 0) return [];
  const minB = Math.floor(Math.min(...withValues.map((v) => v.projected)) / bandWidth) * bandWidth;
  const maxB = Math.ceil(Math.max(...withValues.map((v) => v.projected)) / bandWidth) * bandWidth;
  const buckets = [];
  for (let lo = minB; lo < maxB; lo += bandWidth) {
    const slice = withValues.filter((v) => v.projected >= lo && v.projected < lo + bandWidth);
    if (slice.length === 0) continue;
    const avgProjected = slice.reduce((s, v) => s + v.projected, 0) / slice.length;
    const avgActual = slice.reduce((s, v) => s + v.actual, 0) / slice.length;
    buckets.push({ label: `${lo}-${lo + bandWidth}`, n: slice.length, avgProjected, avgActual, signedCalibrationError: avgProjected - avgActual });
  }
  return buckets;
}
const calibration = { candidate: calibrationTable(pooledGames, "candidateTotal"), baseline1: calibrationTable(pooledGames, "baselineTotal") };
console.log("[item8] calibration table computed.");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  join(OUT_DIR, "report-phase-q.json"),
  JSON.stringify({
    ridgeLambda: RIDGE_LAMBDA, offHalfLife: OFF_HALF_LIFE, defHalfLife: DEF_HALF_LIFE,
    primaryByFold, weekBucketComparison, tercileComparison, historyComparison, favoriteGroups,
    distributionOfImprovement, bootstrapByFold, pooledSummary, coefficientsByFold, examples, calibration,
  }, null, 2),
  "utf-8",
);
console.log(`[done] wrote ${join(OUT_DIR, "report-phase-q.json")}`);
