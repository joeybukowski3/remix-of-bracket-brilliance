/**
 * Phase 4: baseline competition for pregame QB passing-yard projection.
 * Model/hyperparameter selection uses ONLY rolling-origin temporal folds
 * within 2022-2024 (see src/lib/nfl/props/temporalValidation.ts). 2025 is
 * loaded and evaluated exactly once, at the end, as a fixed retrospective
 * benchmark -- it never influences a feature, model, hyperparameter, or
 * threshold choice anywhere in this script.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures, type NflTeamGameLogEntry } from "../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "../src/lib/nfl/props/types/teamPregameFeatures";
import type { NflQbPassingOutcome } from "../src/lib/nfl/props/types/qbPassing";
import { buildTeamEpaGameLog, type NflTeamEpaGameLogEntry, type NflTeamEpaGameRecord } from "../src/lib/nfl/props/qbPassingEpaContext";
import { buildQbStatGameLog, buildQbPassingFeatureRow } from "../src/lib/nfl/props/qbPassingFeatures";
import type { NflQbPassingFeatureRow } from "../src/lib/nfl/props/types/qbPassingFeatures";
import { marketKey, type NflHistoricalMarketRow } from "../src/lib/nfl/props/qbOpportunityFeatures";
import {
  ablatePassingGroups, computePassingTrainFallbacks, encodePassingFeatureRow, appendDecompositionLegs,
  PASSING_FEATURE_GROUPS, type NflPassingFeatureGroup,
} from "../src/lib/nfl/props/qbPassingEncoding";
import {
  computePassingBaselineConstants, predictPassingBaselineA, predictPassingBaselineB, predictPassingBaselineC,
} from "../src/lib/nfl/props/qbPassingBaselines";
import { fitRidgeModel, scoreRidgeModel, RIDGE_ALPHA_GRID } from "../src/lib/nfl/props/ridge";
import { computeMetrics, metricsByGroup, totalBand, weekBand, type NflOpportunityPredictionPair } from "../src/lib/nfl/props/qbOpportunityEvaluation";
import { TEMPORAL_FOLDS, FROZEN_BENCHMARK_SEASON, FINAL_TRAIN_SEASONS, splitByFold, average } from "../src/lib/nfl/props/temporalValidation";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const EPA_CACHE_DIR = "data/nfl/nflverse/epa-team-game";
const DEFAULT_OUTPUT_DIR = join(ROOT, "data", "nfl", "props");
const ALL_SEASONS = [2022, 2023, 2024, 2025];

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

function parseArgs(argv: string[]) {
  const args = { output: null as string | null, generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function readManifest(relativeDir: string): CacheManifest {
  return JSON.parse(readFileSync(join(ROOT, relativeDir, "manifest.json"), "utf8"));
}

function verifiedCsvRows(relativeDir: string, manifest: CacheManifest, season: number) {
  const entry = manifest.files?.find((c) => c.season === season);
  if (!entry) return null;
  const path = join(ROOT, relativeDir, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry as never, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return parseCsv(text) as CsvRow[];
}

function toPlayVolumeRecord(row: CsvRow): NflTeamGamePlayVolumeRecord {
  const num = (field: string, integer: boolean) => {
    const value = Number(String(row[field] ?? "").trim());
    if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) throw new Error(`play-volume field ${field} invalid`);
    return value;
  };
  return {
    gameId: String(row.game_id ?? "").trim(), season: num("season", true), week: num("week", true),
    team: String(row.team ?? "").trim(), opponent: String(row.opponent ?? "").trim(),
    eligiblePlays: num("eligible_plays", true), passPlays: num("pass_plays", true), rushPlays: num("rush_plays", true),
    neutralEligiblePlays: num("neutral_eligible_plays", true), neutralPassPlays: num("neutral_pass_plays", true),
    passOeSum: num("pass_oe_sum", false), passOeCount: num("pass_oe_count", true),
  };
}

function toEpaRecord(row: CsvRow): NflTeamEpaGameRecord {
  const num = (field: string) => Number(String(row[field] ?? "").trim());
  return {
    gameId: String(row.game_id ?? "").trim(), season: num("season"), week: num("week"),
    team: String(row.team ?? "").trim(), opponent: String(row.opponent ?? "").trim(),
    passEpa: num("pass_epa"), passPlays: num("pass_plays"),
  };
}

function readSeasonGames(season: number): (NflPropRawGameRecord & { isDome?: boolean })[] {
  const path = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { games?: (NflPropRawGameRecord & { isDome?: boolean })[] };
  return Array.isArray(parsed.games) ? parsed.games : [];
}

function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  } catch (error) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw error;
  }
}

const { output: outputOverride, generatedAt } = parseArgs(process.argv);

// --- load inputs -------------------------------------------------------------

const outcomesPath = join(DEFAULT_OUTPUT_DIR, `qb-passing-outcomes-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
if (!existsSync(outcomesPath)) throw new Error(`Missing ${outcomesPath}. Run npm run nfl:qb-passing-outcomes first.`);
const outcomesArtifact = JSON.parse(readFileSync(outcomesPath, "utf8")) as { rows: NflQbPassingOutcome[] };

const marketPath = join(DEFAULT_OUTPUT_DIR, `historical-market-context-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
if (!existsSync(marketPath)) throw new Error(`Missing ${marketPath}. Run npm run nfl:historical-market-context first.`);
const marketArtifact = JSON.parse(readFileSync(marketPath, "utf8")) as { rows: NflHistoricalMarketRow[] };
const marketByKey = new Map(marketArtifact.rows.map((r) => [marketKey(r.season, r.week, r.team), r]));

const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
const epaManifest = readManifest(EPA_CACHE_DIR);
const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
const epaRecords: NflTeamEpaGameRecord[] = [];
const allGames: (NflPropRawGameRecord & { isDome?: boolean })[] = [];
for (const season of ALL_SEASONS) {
  const pv = verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season);
  if (!pv) throw new Error(`Play-volume source for ${season} not cached.`);
  for (const row of pv) playVolumeRecords.push(toPlayVolumeRecord(row));
  const epa = verifiedCsvRows(EPA_CACHE_DIR, epaManifest, season);
  if (!epa) throw new Error(`EPA source for ${season} not cached.`);
  for (const row of epa) epaRecords.push(toEpaRecord(row));
  allGames.push(...readSeasonGames(season));
}
const gameJoinIndex = buildGameJoinIndex(allGames);
const fullTeamGameLog: NflTeamGameLogEntry[] = buildTeamGameLog(playVolumeRecords, gameJoinIndex);
const epaGameLog: NflTeamEpaGameLogEntry[] = buildTeamEpaGameLog(epaRecords, gameJoinIndex);
const domeByGameId = new Map(allGames.filter((g) => g.gameId).map((g) => [g.gameId, Boolean(g.isDome)]));

const teamPregameFeaturesByKey = new Map<string, NflTeamPregameFeatures>();
for (const record of playVolumeRecords) {
  teamPregameFeaturesByKey.set(`${record.season}|${record.week}|${record.team}`, buildTeamPregameFeatures(record, gameJoinIndex, fullTeamGameLog));
}

const outcomes = outcomesArtifact.rows;
const qbStatGameLog = buildQbStatGameLog(outcomes, gameJoinIndex);

const featureRows: NflQbPassingFeatureRow[] = outcomes.map((o) =>
  buildQbPassingFeatureRow(o, {
    gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, epaGameLog, marketByKey, domeByGameId, qbStatGameLog,
  }),
);

const devRows = featureRows.filter((r) => r.season !== FROZEN_BENCHMARK_SEASON);
const frozenRows = featureRows.filter((r) => r.season === FROZEN_BENCHMARK_SEASON);

// --- helpers -------------------------------------------------------------------

function pair(row: NflQbPassingFeatureRow, predicted: number): NflOpportunityPredictionPair {
  return { actual: row.target.primaryQbPassingYards, predicted };
}

function fitAndScoreDirect(train: NflQbPassingFeatureRow[], validate: NflQbPassingFeatureRow[], alpha: number) {
  const fallbacks = computePassingTrainFallbacks(train);
  const encoded = train.map((r) => encodePassingFeatureRow(r, fallbacks));
  const targets = train.map((r) => r.target.primaryQbPassingYards);
  const model = fitRidgeModel(encoded, targets, alpha);
  const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodePassingFeatureRow(r, fallbacks))));
  return { model, fallbacks, metrics: computeMetrics(pairs) };
}

function fitAndScoreHybrid(train: NflQbPassingFeatureRow[], validate: NflQbPassingFeatureRow[], alpha: number, constants: ReturnType<typeof computePassingBaselineConstants>) {
  const fallbacks = computePassingTrainFallbacks(train);
  const encoded = train.map((r) => {
    const c = predictPassingBaselineC(r, constants, constants.leagueMeanPassingYards / constants.leagueMeanYardsPerAttempt);
    return appendDecompositionLegs(encodePassingFeatureRow(r, fallbacks), c.projectedAttempts, c.projectedYpa);
  });
  const targets = train.map((r) => r.target.primaryQbPassingYards);
  const model = fitRidgeModel(encoded, targets, alpha);
  const pairs = validate.map((r) => {
    const c = predictPassingBaselineC(r, constants, constants.leagueMeanPassingYards / constants.leagueMeanYardsPerAttempt);
    return pair(r, scoreRidgeModel(model, appendDecompositionLegs(encodePassingFeatureRow(r, fallbacks), c.projectedAttempts, c.projectedYpa)));
  });
  return { model, fallbacks, metrics: computeMetrics(pairs) };
}

// --- temporal fold development validation --------------------------------------

const foldReports = TEMPORAL_FOLDS.map((fold) => {
  const { train, validate } = splitByFold(devRows, fold);
  const constants = computePassingBaselineConstants(train);
  const fallbackAttempts = constants.leagueMeanPassingYards / constants.leagueMeanYardsPerAttempt;

  const aPairs = validate.map((r) => pair(r, predictPassingBaselineA(r, constants)));
  const bPairs = validate.map((r) => pair(r, predictPassingBaselineB(r, constants)));
  const cResults = validate.map((r) => predictPassingBaselineC(r, constants, fallbackAttempts));
  const cPairs = validate.map((r, i) => pair(r, cResults[i].predicted));

  const dByAlpha = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, ...fitAndScoreDirect(train, validate, alpha) }));
  const eByAlpha = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, ...fitAndScoreHybrid(train, validate, alpha, constants) }));

  return {
    fold: fold.name, trainRows: train.length, validateRows: validate.length,
    A: computeMetrics(aPairs), B: computeMetrics(bPairs), C: computeMetrics(cPairs),
    D_byAlpha: dByAlpha.map((r) => ({ alpha: r.alpha, mae: r.metrics?.mae ?? Infinity })),
    E_byAlpha: eByAlpha.map((r) => ({ alpha: r.alpha, mae: r.metrics?.mae ?? Infinity })),
  };
});

// Select alpha for D and E by AVERAGE fold validation MAE -- never touching 2025.
const dAlphaAverages = RIDGE_ALPHA_GRID.map((alpha) => ({
  alpha, avgMae: average(foldReports.map((f) => f.D_byAlpha.find((x) => x.alpha === alpha)!.mae))!,
})).sort((a, b) => a.avgMae - b.avgMae);
const eAlphaAverages = RIDGE_ALPHA_GRID.map((alpha) => ({
  alpha, avgMae: average(foldReports.map((f) => f.E_byAlpha.find((x) => x.alpha === alpha)!.mae))!,
})).sort((a, b) => a.avgMae - b.avgMae);
const bestDAlpha = dAlphaAverages[0].alpha;
const bestEAlpha = eAlphaAverages[0].alpha;

const devValidationSummary = {
  A_leagueMean: average(foldReports.map((f) => f.A?.mae ?? null).filter((v): v is number => v != null)),
  B_rollingQbYards: average(foldReports.map((f) => f.B?.mae ?? null).filter((v): v is number => v != null)),
  C_decomposition: average(foldReports.map((f) => f.C?.mae ?? null).filter((v): v is number => v != null)),
  D_directRidge: dAlphaAverages[0].avgMae,
  E_hybridRidge: eAlphaAverages[0].avgMae,
};

// --- final fit on 2022-2024, evaluated ONCE on the 2025 frozen benchmark -------

const finalTrainRows = devRows.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));
const finalConstants = computePassingBaselineConstants(finalTrainRows);
const finalFallbackAttempts = finalConstants.leagueMeanPassingYards / finalConstants.leagueMeanYardsPerAttempt;
const finalD = fitAndScoreDirect(finalTrainRows, frozenRows, bestDAlpha);
const finalE = fitAndScoreHybrid(finalTrainRows, frozenRows, bestEAlpha, finalConstants);

const frozenBenchmark = {
  A_leagueMean: computeMetrics(frozenRows.map((r) => pair(r, predictPassingBaselineA(r, finalConstants)))),
  B_rollingQbYards: computeMetrics(frozenRows.map((r) => pair(r, predictPassingBaselineB(r, finalConstants)))),
  C_decomposition: computeMetrics(frozenRows.map((r) => pair(r, predictPassingBaselineC(r, finalConstants, finalFallbackAttempts).predicted))),
  D_directRidge: finalD.metrics,
  E_hybridRidge: finalE.metrics,
};

// --- feature-group ablation (dev folds only, on the better of D/E) ------------

const ablationTarget: "D" | "E" = devValidationSummary.D_directRidge <= devValidationSummary.E_hybridRidge ? "D" : "E";
const ablationAlpha = ablationTarget === "D" ? bestDAlpha : bestEAlpha;

function ablatedFoldMae(excluded: Set<NflPassingFeatureGroup>): number {
  const foldMaes = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(devRows, fold);
    const fallbacks = computePassingTrainFallbacks(train);
    const constants = computePassingBaselineConstants(train);
    const fallbackAttempts = constants.leagueMeanPassingYards / constants.leagueMeanYardsPerAttempt;
    const encodeRow = (r: NflQbPassingFeatureRow) => {
      const base = ablatePassingGroups(encodePassingFeatureRow(r, fallbacks), fallbacks, excluded);
      if (ablationTarget === "E") {
        const c = predictPassingBaselineC(r, constants, fallbackAttempts);
        return appendDecompositionLegs(base, c.projectedAttempts, c.projectedYpa);
      }
      return base;
    };
    const model = fitRidgeModel(train.map(encodeRow), train.map((r) => r.target.primaryQbPassingYards), ablationAlpha);
    const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodeRow(r))));
    return computeMetrics(pairs)?.mae ?? Infinity;
  });
  return average(foldMaes)!;
}

const ablationResults: Record<string, number> = { none: ablationTarget === "D" ? devValidationSummary.D_directRidge : devValidationSummary.E_hybridRidge };
for (const group of PASSING_FEATURE_GROUPS) ablationResults[group] = ablatedFoldMae(new Set([group]));

// --- prior-season-information ablation -----------------------------------------

function priorSeasonAblationFoldMae(allowPriorSeasonFallback: boolean): number {
  const foldMaes = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(devRows, fold);
    const options = { allowPriorSeasonFallback };
    const fallbacks = computePassingTrainFallbacks(train, options);
    const model = fitRidgeModel(
      train.map((r) => encodePassingFeatureRow(r, fallbacks, options)),
      train.map((r) => r.target.primaryQbPassingYards),
      bestDAlpha,
    );
    const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodePassingFeatureRow(r, fallbacks, options))));
    return computeMetrics(pairs)?.mae ?? Infinity;
  });
  return average(foldMaes)!;
}
const priorSeasonInfoAblation = {
  withPriorSeasonFallback: priorSeasonAblationFoldMae(true),
  withoutPriorSeasonFallback: priorSeasonAblationFoldMae(false),
};

// --- multi-QB analysis + pregame instability signal ----------------------------

function stableVsFull(rows: readonly NflQbPassingFeatureRow[], predict: (r: NflQbPassingFeatureRow) => number) {
  return {
    fullSample: computeMetrics(rows.map((r) => pair(r, predict(r)))),
    stableSingleQbOnly: computeMetrics(rows.filter((r) => r.diagnostics.instabilityCategory === "singleQbGame").map((r) => pair(r, predict(r)))),
    multiQbOnly: computeMetrics(rows.filter((r) => r.diagnostics.instabilityCategory === "multiQbGame").map((r) => pair(r, predict(r)))),
  };
}
const predictFinalD = (r: NflQbPassingFeatureRow) => scoreRidgeModel(finalD.model, encodePassingFeatureRow(r, finalD.fallbacks));
const multiQbOnFrozen = stableVsFull(frozenRows, predictFinalD);

// Pregame instability-risk signal: does this team's recent history of
// multi-QB games predict THIS week's multiQbGame occurrence? Built from
// team-level history strictly before the target game (pregame-safe).
const teamInstabilityLog = outcomes
  .map((o) => {
    const join = gameJoinIndex.get(`${o.season}|${o.week}|${o.team}`);
    return { team: o.team, season: o.season, gameDateUtc: join?.gameDateUtc ?? null, wasMultiQb: o.instabilityCategory === "multiQbGame" };
  })
  .filter((e): e is { team: string; season: number; gameDateUtc: string; wasMultiQb: boolean } => e.gameDateUtc != null);

function recentInstabilityRate(team: string, season: number, beforeDateUtc: string): number | null {
  const prior = teamInstabilityLog.filter((e) => e.team === team && e.season === season && e.gameDateUtc < beforeDateUtc);
  if (prior.length === 0) return null;
  return prior.filter((e) => e.wasMultiQb).length / prior.length;
}

const instabilitySignalRows = outcomes
  .map((o) => {
    const join = gameJoinIndex.get(`${o.season}|${o.week}|${o.team}`);
    if (!join) return null;
    const rate = recentInstabilityRate(o.team, o.season, join.gameDateUtc);
    return rate == null ? null : { recentInstabilityRate: rate, actualMultiQb: o.instabilityCategory === "multiQbGame" ? 1 : 0 };
  })
  .filter((v): v is { recentInstabilityRate: number; actualMultiQb: number } => v != null);

function pointBiserialCorrelation(rows: readonly { recentInstabilityRate: number; actualMultiQb: number }[]): number | null {
  if (rows.length < 2) return null;
  const x = rows.map((r) => r.recentInstabilityRate);
  const y = rows.map((r) => r.actualMultiQb);
  const mx = average(x)!, my = average(y)!;
  const cov = average(rows.map((r) => (r.recentInstabilityRate - mx) * (r.actualMultiQb - my)))!;
  const sx = Math.sqrt(average(x.map((v) => (v - mx) ** 2))!);
  const sy = Math.sqrt(average(y.map((v) => (v - my) ** 2))!);
  return sx > 1e-9 && sy > 1e-9 ? cov / (sx * sy) : null;
}
const instabilitySignalCorrelation = pointBiserialCorrelation(instabilitySignalRows);

// --- uncertainty / residual groundwork ------------------------------------------

function residualBreakdown(rows: readonly NflQbPassingFeatureRow[], predict: (r: NflQbPassingFeatureRow) => number) {
  const withAbsError = rows.map((r) => ({ row: r, absError: Math.abs(predict(r) - r.target.primaryQbPassingYards) }));
  const byHistoryBucket = metricsByGroup(
    withAbsError,
    (e) => (e.row.diagnostics.gamesStartedPriorThisSeason === 0 && !e.row.diagnostics.hasPriorSeasonStarts ? "noHistory" : e.row.diagnostics.gamesStartedPriorThisSeason < 3 ? "lowHistory" : "establishedHistory"),
    (e) => ({ actual: 0, predicted: e.absError }), // repurposing computeMetrics as a plain distribution-of-absError summary
  );
  const byWeekBand = metricsByGroup(withAbsError, (e) => weekBand(e.row.week), (e) => ({ actual: 0, predicted: e.absError }));
  const byTotalBand = metricsByGroup(withAbsError, (e) => totalBand(e.row.features.market.total), (e) => ({ actual: 0, predicted: e.absError }));
  const bySpreadMagnitude = metricsByGroup(
    withAbsError.filter((e) => e.row.features.market.spread != null),
    (e) => (Math.abs(e.row.features.market.spread!) <= 3 ? "closeSpread" : Math.abs(e.row.features.market.spread!) <= 7 ? "moderateSpread" : "largeSpread"),
    (e) => ({ actual: 0, predicted: e.absError }),
  );
  const byInstability = metricsByGroup(withAbsError, (e) => e.row.diagnostics.instabilityCategory, (e) => ({ actual: 0, predicted: e.absError }));
  return { byHistoryBucket, byWeekBand, byTotalBand, bySpreadMagnitude, byInstability };
}
const uncertaintyOnFrozen = residualBreakdown(frozenRows, predictFinalD);

// --- distribution + write -------------------------------------------------------

function distribution(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { count: sorted.length, min: sorted[0], max: sorted.at(-1), mean: average(sorted), median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid] };
}

const report = {
  _meta: {
    schemaVersion: "nfl-qb-passing-baseline-competition-v1",
    generatedAt,
    target: "primaryQbPassingYards",
    temporalFolds: TEMPORAL_FOLDS.map((f) => ({ name: f.name, trainSeasons: f.trainSeasons, validateSeason: f.validateSeason })),
    finalTrainSeasons: FINAL_TRAIN_SEASONS,
    frozenBenchmarkSeason: FROZEN_BENCHMARK_SEASON,
    devRowCount: devRows.length,
    frozenRowCount: frozenRows.length,
    ridgeAlphaGrid: RIDGE_ALPHA_GRID,
    bestDAlphaSelectedOnDevFoldsOnly: bestDAlpha,
    bestEAlphaSelectedOnDevFoldsOnly: bestEAlpha,
    ablationTarget,
  },
  actualDistribution: { dev: distribution(devRows.map((r) => r.target.primaryQbPassingYards)), frozen2025: distribution(frozenRows.map((r) => r.target.primaryQbPassingYards)) },
  developmentValidation: { perFold: foldReports, averagedAcrossFolds: devValidationSummary },
  frozenBenchmark2025: frozenBenchmark,
  directVsDecomposition: {
    devAverageMae: { C_decomposition: devValidationSummary.C_decomposition, D_direct: devValidationSummary.D_directRidge, E_hybrid: devValidationSummary.E_hybridRidge },
    frozen2025Mae: { C_decomposition: frozenBenchmark.C_decomposition?.mae, D_direct: frozenBenchmark.D_directRidge?.mae, E_hybrid: frozenBenchmark.E_hybridRidge?.mae },
  },
  featureGroupAblationOnDevFolds: { alpha: ablationAlpha, target: ablationTarget, results: ablationResults },
  priorSeasonInformationAblationOnDevFolds: priorSeasonInfoAblation,
  multiQbAnalysisOnFrozen2025: multiQbOnFrozen,
  pregameInstabilitySignal: {
    description: "Correlation between a team's recent-history multi-QB rate (strictly pregame) and whether THIS week is also a multi-QB game.",
    sampleSize: instabilitySignalRows.length,
    pointBiserialCorrelation: instabilitySignalCorrelation,
  },
  uncertaintyResidualGroundworkOnFrozen2025: uncertaintyOnFrozen,
};

const output = outputOverride ?? join(DEFAULT_OUTPUT_DIR, `qb-passing-baseline-competition-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
writeAtomic(output, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Wrote passing baseline competition report to ${output}`);
console.log("Dev-average MAE:", devValidationSummary);
console.log("2025 frozen benchmark MAE:", Object.fromEntries(Object.entries(frozenBenchmark).map(([k, v]) => [k, v?.mae?.toFixed(3)])));
