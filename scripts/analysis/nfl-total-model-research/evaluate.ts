/**
 * NFL total-model research harness (Phases A, D, E, F, G, H).
 *
 * Research-only. Builds the Phase C dataset from real historical caches,
 * evaluates Baseline 0 / Baseline 1 / the core ridge across the walk-
 * forward folds the user specified, runs Phase G diagnostics, and runs the
 * Phase H residual-feature research pass. Writes a full JSON report to
 * scripts/analysis/nfl-total-model-research/out/report.json and prints a
 * condensed summary to stdout.
 *
 * Usage: npx tsx scripts/analysis/nfl-total-model-research/evaluate.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeScoringEnvironment, type ScoringEnvironmentObservation } from "@/lib/nfl/research/total/scoringEnvironment";
import { buildResearchDataset, buildScoringEnvironmentCorpus } from "@/lib/nfl/research/total/dataset";
import { buildScoringSupportIndex } from "@/lib/nfl/research/total/teamScoringFeatures";
import { fitBaseline0, fitBaseline1, scoreBaseline0, scoreBaseline1 } from "@/lib/nfl/research/total/baselines";
import { fitTotalRidge, scoreTotalRidge, isRowUsableForRidge, rowToFeatureVector, RIDGE_FEATURE_NAMES } from "@/lib/nfl/research/total/ridgeModel";
import { fitRidgeModel, scoreRidgeModel } from "@/lib/nfl/props/ridge";
import { mae, rmse, meanBias, pearsonCorrelation, errorDistribution, calibrationByProjectedBucket } from "@/lib/nfl/research/total/metrics";
import type { NflTotalResearchDatasetRow } from "@/lib/nfl/research/total/types";
import { loadOutcomesForSeasons, loadScoringSupportForSeasons, ROOT } from "./lib/loadData";
import { buildResidualFeatureIndexes, computeResidualCandidate, type ResidualCandidateName } from "./lib/residualFeatures";

const OUT_DIR = join(ROOT, "scripts", "analysis", "nfl-total-model-research", "out");
const RIDGE_LAMBDA = 1; // preregistered default from RIDGE_ALPHA_GRID (src/lib/nfl/props/ridge.ts) -- not tuned against any validation/holdout fold in this build.

// ---------------------------------------------------------------------------
// Environment corpus (2020-2025) and scoring-support cache (2021-2025).
// ---------------------------------------------------------------------------
const ENV_CORPUS_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];
const SCORING_SUPPORT_SEASONS = [2021, 2022, 2023, 2024, 2025];
const TARGET_SEASONS = [2022, 2023, 2024, 2025];

console.log("[load] outcomes + scoring support...");
const envCorpusGames = loadOutcomesForSeasons(ENV_CORPUS_SEASONS);
const targetGames = loadOutcomesForSeasons(TARGET_SEASONS);
const scoringSupportRows = loadScoringSupportForSeasons(SCORING_SUPPORT_SEASONS);
const scoringSupportIndex = buildScoringSupportIndex(scoringSupportRows);
console.log(`[load] env corpus games=${envCorpusGames.length}, target games=${targetGames.length}, scoring support rows=${scoringSupportRows.length}`);

// ---------------------------------------------------------------------------
// Phase A -- compare scoring-environment variants on Fold 1 (train 2022 -> val 2023).
// ---------------------------------------------------------------------------
function evaluateEnvironmentModeOnFold(
  mode: "priorSeasonOnly" | "seasonToDateWithPriorFallback" | "rollingWindow",
): { mode: string; mae: number | null; sampleSize: number } {
  const environmentCorpus = buildScoringEnvironmentCorpus(envCorpusGames);
  const valGames = targetGames.filter((g) => g.season === 2023);
  const errors: number[] = [];
  for (const g of valGames) {
    const cutoff = { season: g.season, week: g.week };
    const env = computeScoringEnvironment(environmentCorpus, cutoff, mode);
    if (env.value === null) continue;
    errors.push(env.value - g.homeScore);
    errors.push(env.value - g.awayScore);
  }
  return { mode, mae: mae(errors), sampleSize: errors.length };
}

const environmentModeComparison = (["priorSeasonOnly", "seasonToDateWithPriorFallback", "rollingWindow"] as const).map(
  evaluateEnvironmentModeOnFold,
);
const chosenEnvironmentMode = [...environmentModeComparison].sort((a, b) => (a.mae ?? Infinity) - (b.mae ?? Infinity))[0].mode as
  | "priorSeasonOnly"
  | "seasonToDateWithPriorFallback"
  | "rollingWindow";
console.log("[phase A] environment mode comparison (Fold 1 team-point MAE):", environmentModeComparison);
console.log(`[phase A] chosen mode: ${chosenEnvironmentMode}`);

// ---------------------------------------------------------------------------
// Phase C -- materialize the full research dataset for 2022-2025.
// ---------------------------------------------------------------------------
const dataset = buildResearchDataset({
  targetGames,
  environmentCorpusGames: envCorpusGames,
  scoringSupportIndex,
  environmentMode: chosenEnvironmentMode,
});

const rowCountsBySeason = Object.fromEntries(
  TARGET_SEASONS.map((s) => [s, dataset.filter((r) => r.season === s).length]),
);
const pregameSafeCountsBySeason = Object.fromEntries(
  TARGET_SEASONS.map((s) => [s, dataset.filter((r) => r.season === s && r.pregameSafe).length]),
);
console.log("[phase C] dataset row counts by season:", rowCountsBySeason);
console.log("[phase C] pregame-safe row counts by season:", pregameSafeCountsBySeason);

// ---------------------------------------------------------------------------
// Metrics helpers: game-total aggregation from two team rows.
// ---------------------------------------------------------------------------
type Projector = (row: NflTotalResearchDatasetRow) => number | null;

function teamPointMetrics(rows: readonly NflTotalResearchDatasetRow[], project: Projector) {
  const pairs = rows.map((r) => ({ projected: project(r), actual: r.actualTeamPoints })).filter((p) => p.projected !== null) as { projected: number; actual: number }[];
  const errors = pairs.map((p) => p.projected - p.actual);
  return {
    n: pairs.length,
    mae: mae(errors),
    rmse: rmse(errors),
    correlation: pearsonCorrelation(pairs.map((p) => p.projected), pairs.map((p) => p.actual)),
  };
}

type GameTotalRow = { gameId: string; projectedTotal: number; actualTotal: number };

function gameTotals(rows: readonly NflTotalResearchDatasetRow[], project: Projector): GameTotalRow[] {
  const byGame = new Map<string, { projected: number[]; actual: number }>();
  for (const row of rows) {
    const p = project(row);
    if (p === null) continue;
    if (!byGame.has(row.gameId)) byGame.set(row.gameId, { projected: [], actual: row.actualGameTotal });
    byGame.get(row.gameId)!.projected.push(p);
  }
  const out: GameTotalRow[] = [];
  for (const [gameId, { projected, actual }] of byGame) {
    if (projected.length !== 2) continue; // both sides must have a valid projection
    out.push({ gameId, projectedTotal: projected[0] + projected[1], actualTotal: actual });
  }
  return out;
}

function gameTotalMetrics(games: readonly GameTotalRow[]) {
  const errors = games.map((g) => g.projectedTotal - g.actualTotal);
  return {
    n: games.length,
    mae: mae(errors),
    rmse: rmse(errors),
    correlation: pearsonCorrelation(games.map((g) => g.projectedTotal), games.map((g) => g.actualTotal)),
    meanBias: meanBias(errors),
    errorDistribution: errorDistribution(errors),
    calibrationByProjectedBucket: calibrationByProjectedBucket(
      games.map((g) => g.projectedTotal),
      games.map((g) => g.actualTotal),
    ),
  };
}

// ---------------------------------------------------------------------------
// Phase F -- walk-forward folds.
// ---------------------------------------------------------------------------
type Fold = { name: string; trainSeasons: number[]; evalSeasons: number[]; isRetrospective: boolean };
const FOLDS: Fold[] = [
  { name: "fold1", trainSeasons: [2022], evalSeasons: [2023], isRetrospective: false },
  { name: "fold2", trainSeasons: [2022, 2023], evalSeasons: [2024], isRetrospective: false },
  { name: "retrospective", trainSeasons: [2022, 2023, 2024], evalSeasons: [2025], isRetrospective: true },
];

function rowsForSeasons(seasons: readonly number[]): NflTotalResearchDatasetRow[] {
  return dataset.filter((r) => seasons.includes(r.season));
}

const foldResults: Record<string, unknown> = {};
const ridgeCoefficientsByFold: Record<string, { intercept: number; coefficients: number[] }> = {};

for (const fold of FOLDS) {
  const trainRows = rowsForSeasons(fold.trainSeasons);
  const valRows = rowsForSeasons(fold.evalSeasons);

  const b0 = fitBaseline0();
  const b1 = fitBaseline1(trainRows);
  const ridge = fitTotalRidge(trainRows, RIDGE_LAMBDA);
  ridgeCoefficientsByFold[fold.name] = { intercept: ridge.intercept, coefficients: [...ridge.coefficients] };

  const project0: Projector = (r) => scoreBaseline0(b0, r);
  const project1: Projector = (r) => scoreBaseline1(b1, r);
  const projectRidge: Projector = (r) => scoreTotalRidge(ridge, r);

  foldResults[fold.name] = {
    trainSeasons: fold.trainSeasons,
    evalSeasons: fold.evalSeasons,
    isRetrospective: fold.isRetrospective,
    trainRowCount: trainRows.length,
    evalRowCount: valRows.length,
    baseline0: { teamPoint: teamPointMetrics(valRows, project0), gameTotal: gameTotalMetrics(gameTotals(valRows, project0)) },
    baseline1: { teamPoint: teamPointMetrics(valRows, project1), gameTotal: gameTotalMetrics(gameTotals(valRows, project1)), slope: b1.slope },
    ridge: {
      teamPoint: teamPointMetrics(valRows, projectRidge),
      gameTotal: gameTotalMetrics(gameTotals(valRows, projectRidge)),
      intercept: ridge.intercept,
      coefficients: Object.fromEntries(RIDGE_FEATURE_NAMES.map((name, i) => [name, ridge.coefficients[i]])),
    },
  };
  console.log(`[phase F] ${fold.name} done (train=${fold.trainSeasons.join(",")} eval=${fold.evalSeasons.join(",")})`);
}

// ---------------------------------------------------------------------------
// Phase G -- diagnostics (using the retrospective ridge model as the representative candidate).
// ---------------------------------------------------------------------------
const retroTrainRows = rowsForSeasons([2022, 2023, 2024]);
const retroValRows = rowsForSeasons([2025]);
const retroRidge = fitTotalRidge(retroTrainRows, RIDGE_LAMBDA);
const projectRetroRidge: Projector = (r) => scoreTotalRidge(retroRidge, r);

/**
 * `gameTotal` is only a complete/unbiased slice when the split preserves BOTH
 * sides of every game (season, week-based splits). For row-level splits that
 * can separate a game's two sides into different buckets (home/away,
 * offense/defense-strength halves, sparse-sample), `gameTotal` reflects only
 * the subset of games where both sides happened to land in this same bucket
 * (a real but smaller/biased sample) -- `teamPoint` is the reliable metric
 * for those splits and is always reported alongside it for exactly this reason.
 */
function diagnosticSlice(label: string, rows: readonly NflTotalResearchDatasetRow[]) {
  const games = gameTotals(rows, projectRetroRidge);
  return {
    label,
    rowCount: rows.length,
    gameCount: games.length,
    teamPoint: teamPointMetrics(rows, projectRetroRidge),
    gameTotal: gameTotalMetrics(games),
  };
}

const diagnostics = {
  bySeason: TARGET_SEASONS.map((s) => diagnosticSlice(`season-${s}`, rowsForSeasons([s]))),
  earlyVsLate: [
    diagnosticSlice("weeks-1-6", retroValRows.filter((r) => r.week <= 6)),
    diagnosticSlice("weeks-7+", retroValRows.filter((r) => r.week > 6)),
  ],
  homeAway: [
    diagnosticSlice("home", retroValRows.filter((r) => r.homeAway === "home")),
    diagnosticSlice("away", retroValRows.filter((r) => r.homeAway === "away")),
  ],
  offenseStrength: (() => {
    const usable = retroValRows.filter((r) => r.offense.epaPerPlay !== null);
    const sorted = [...usable].sort((a, b) => (a.offense.epaPerPlay! - b.offense.epaPerPlay!));
    const half = Math.floor(sorted.length / 2);
    return [
      diagnosticSlice("offense-below-median-epa", sorted.slice(0, half)),
      diagnosticSlice("offense-above-median-epa", sorted.slice(half)),
    ];
  })(),
  defenseStrength: (() => {
    const usable = retroValRows.filter((r) => r.opponentDefenseAllowed.epaPerPlay !== null);
    const sorted = [...usable].sort((a, b) => (a.opponentDefenseAllowed.epaPerPlay! - b.opponentDefenseAllowed.epaPerPlay!));
    const half = Math.floor(sorted.length / 2);
    return [
      diagnosticSlice("faced-below-median-defense-allowed", sorted.slice(0, half)), // tougher defense faced
      diagnosticSlice("faced-above-median-defense-allowed", sorted.slice(half)),
    ];
  })(),
  sparseSample: [
    diagnosticSlice("pregame-safe", retroValRows.filter((r) => r.pregameSafe)),
    diagnosticSlice("not-pregame-safe", retroValRows.filter((r) => !r.pregameSafe)),
  ],
  projectedTotalBucket: (() => {
    const games = gameTotals(retroValRows, projectRetroRidge);
    return calibrationByProjectedBucket(games.map((g) => g.projectedTotal), games.map((g) => g.actualTotal), 5);
  })(),
};
console.log("[phase G] diagnostics computed.");

// EPA vs success-rate vs explosive-rate collinearity check (2022-2024 pregame-safe rows).
function correlationMatrix() {
  const usable = retroTrainRows.filter((r) => r.offense.epaPerPlay !== null && r.offense.successRate !== null && r.offense.explosiveRate !== null);
  const epa = usable.map((r) => r.offense.epaPerPlay!);
  const success = usable.map((r) => r.offense.successRate!);
  const explosive = usable.map((r) => r.offense.explosiveRate!);
  return {
    n: usable.length,
    epaVsSuccess: pearsonCorrelation(epa, success),
    epaVsExplosive: pearsonCorrelation(epa, explosive),
    successVsExplosive: pearsonCorrelation(success, explosive),
  };
}
const offenseMetricCollinearity = correlationMatrix();
console.log("[phase G] offense EPA/success/explosive collinearity:", offenseMetricCollinearity);

// ---------------------------------------------------------------------------
// Phase H -- residual feature research.
// ---------------------------------------------------------------------------
console.log("[phase H] loading residual-feature indexes...");
const residualIndexes = buildResidualFeatureIndexes(TARGET_SEASONS);

const RESIDUAL_CANDIDATES: ResidualCandidateName[] = [
  "passMatchupDiff",
  "rushMatchupDiff",
  "dropbackRate",
  "paceProxy",
  "turnoverGiveawayRate",
  "sacksAllowedRate",
];

function withResidualFeature(rows: readonly NflTotalResearchDatasetRow[], candidate: ResidualCandidateName): { row: NflTotalResearchDatasetRow; value: number }[] {
  return rows
    .map((row) => ({ row, value: computeResidualCandidate(candidate, residualIndexes, row.team, row.opponent, { season: row.season, week: row.week }) }))
    .filter((r): r is { row: NflTotalResearchDatasetRow; value: number } => r.value !== null);
}

function simpleLinearFit(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } {
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (xs[i] - meanX) * (ys[i] - meanY);
    varX += (xs[i] - meanX) ** 2;
  }
  const slope = varX > 1e-9 ? cov / varX : 0;
  return { slope, intercept: meanY - slope * meanX };
}

const residualFindings: Record<string, unknown> = {};
for (const candidate of RESIDUAL_CANDIDATES) {
  const perFold: Record<string, unknown> = {};
  const coefficientsAcrossFolds: number[] = [];

  for (const fold of FOLDS) {
    const trainRows = rowsForSeasons(fold.trainSeasons);
    const valRows = rowsForSeasons(fold.evalSeasons);

    const trainWithFeature = withResidualFeature(trainRows.filter(isRowUsableForRidge), candidate);
    const valWithFeature = withResidualFeature(valRows.filter(isRowUsableForRidge), candidate);
    if (trainWithFeature.length < 10 || valWithFeature.length < 10) {
      perFold[fold.name] = { skipped: true, reason: "insufficient rows with this candidate resolvable" };
      continue;
    }

    // (a) independent single-feature fit: candidateValue -> actualTeamPoints, train fold only.
    const fit = simpleLinearFit(trainWithFeature.map((r) => r.value), trainWithFeature.map((r) => r.row.actualTeamPoints));
    const independentErrors = valWithFeature.map((r) => fit.intercept + fit.slope * r.value - r.row.actualTeamPoints);
    const independentGameTotalErrors = (() => {
      const byGame = new Map<string, number[]>();
      for (const r of valWithFeature) {
        const proj = fit.intercept + fit.slope * r.value;
        if (!byGame.has(r.row.gameId)) byGame.set(r.row.gameId, []);
        byGame.get(r.row.gameId)!.push(proj);
      }
      const errs: number[] = [];
      for (const r of valWithFeature) {
        const projs = byGame.get(r.row.gameId)!;
        if (projs.length === 2) errs.push(projs[0] + projs[1] - r.row.actualGameTotal);
      }
      return errs;
    })();

    // (b) core ridge + candidate feature appended, refit on train fold with the same rows used for the core ridge comparison.
    const coreTrainRows = trainRows.filter(isRowUsableForRidge);
    const augmentedTrain = withResidualFeature(coreTrainRows, candidate);
    const augmentedVal = withResidualFeature(valRows.filter(isRowUsableForRidge), candidate);
    const augmentedRidge = fitRidgeModel(
      augmentedTrain.map((r) => [...rowToFeatureVector(r.row), r.value]),
      augmentedTrain.map((r) => r.row.actualTeamPoints),
      RIDGE_LAMBDA,
    );
    const augmentedProjections = augmentedVal.map((r) => ({ gameId: r.row.gameId, projected: scoreRidgeModel(augmentedRidge, [...rowToFeatureVector(r.row), r.value]), actual: r.row.actualGameTotal }));
    const augByGame = new Map<string, { projected: number[]; actual: number }>();
    for (const p of augmentedProjections) {
      if (!augByGame.has(p.gameId)) augByGame.set(p.gameId, { projected: [], actual: p.actual });
      augByGame.get(p.gameId)!.projected.push(p.projected);
    }
    const augGameErrors: number[] = [];
    for (const { projected, actual } of augByGame.values()) {
      if (projected.length === 2) augGameErrors.push(projected[0] + projected[1] - actual);
    }

    // core (non-augmented) ridge, same fold, same row subset, for a like-for-like comparison.
    const coreRidgeSameRows = fitRidgeModel(augmentedTrain.map((r) => [...rowToFeatureVector(r.row)]), augmentedTrain.map((r) => r.row.actualTeamPoints), RIDGE_LAMBDA);
    const coreProjections = augmentedVal.map((r) => ({ gameId: r.row.gameId, projected: scoreRidgeModel(coreRidgeSameRows, rowToFeatureVector(r.row)), actual: r.row.actualGameTotal }));
    const coreByGame = new Map<string, { projected: number[]; actual: number }>();
    for (const p of coreProjections) {
      if (!coreByGame.has(p.gameId)) coreByGame.set(p.gameId, { projected: [], actual: p.actual });
      coreByGame.get(p.gameId)!.projected.push(p.projected);
    }
    const coreGameErrors: number[] = [];
    for (const { projected, actual } of coreByGame.values()) {
      if (projected.length === 2) coreGameErrors.push(projected[0] + projected[1] - actual);
    }

    const candidateCoefficient = augmentedRidge.coefficients[augmentedRidge.coefficients.length - 1];
    coefficientsAcrossFolds.push(candidateCoefficient);

    perFold[fold.name] = {
      independentGameTotalMae: mae(independentGameTotalErrors),
      coreRidgeGameTotalMae: mae(coreGameErrors),
      augmentedRidgeGameTotalMae: mae(augGameErrors),
      maeDelta_augmentedMinusCore: (mae(augGameErrors) ?? 0) - (mae(coreGameErrors) ?? 0),
      candidateCoefficient,
      n: augmentedVal.length,
    };
  }

  residualFindings[candidate] = {
    perFold,
    coefficientsAcrossFolds,
    coefficientSignStable: coefficientsAcrossFolds.length > 1 && coefficientsAcrossFolds.every((c) => Math.sign(c) === Math.sign(coefficientsAcrossFolds[0])),
  };
  console.log(`[phase H] ${candidate}:`, JSON.stringify(perFold));
}

// ---------------------------------------------------------------------------
// Write full report.
// ---------------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  ridgeLambda: RIDGE_LAMBDA,
  ridgeFeatureNames: RIDGE_FEATURE_NAMES,
  rowCountsBySeason,
  pregameSafeCountsBySeason,
  environmentModeComparison,
  chosenEnvironmentMode,
  folds: foldResults,
  ridgeCoefficientsByFold,
  diagnostics,
  offenseMetricCollinearity,
  residualFindings,
};
writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2), "utf-8");
console.log(`[done] wrote ${join(OUT_DIR, "report.json")}`);
