/**
 * Phase 5.5 (5R): rerun of the Phase 5 rushing baseline competition against
 * the corrected outcome population (canonical universe, including true
 * zero-carry games for pregame-eligible players). Preserves Phase 5's
 * methodology as closely as possible -- same features, same baselines,
 * same temporal-fold discipline -- so the corrected-population effect can
 * be isolated. See docs/nfl-rushing-baseline-competition-v2.md.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures, type NflTeamGameLogEntry } from "../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "../src/lib/nfl/props/types/teamPregameFeatures";
import type { NflRushingOutcome } from "../src/lib/nfl/props/types/rushingOutcome";
import { buildTeamEpaGameLog, type NflTeamEpaGameLogEntry, type NflTeamEpaGameRecord } from "../src/lib/nfl/props/qbPassingEpaContext";
import { buildPlayerRushingStatLog, buildRushingFeatureRow, buildTeamTopRbCarryShareByGameTeam } from "../src/lib/nfl/props/rushingFeatures";
import type { NflRushingFeatureRow } from "../src/lib/nfl/props/types/rushingFeatures";
import { marketKey, type NflHistoricalMarketRow } from "../src/lib/nfl/props/qbOpportunityFeatures";
import {
  ablateRushingGroups, appendRushingDecompositionLegs, computeRushingTrainFallbacks, encodeRushingFeatureRow,
  RUSHING_FEATURE_GROUPS, RUSHING_FEATURE_KEYS, type NflRushingFeatureGroup,
} from "../src/lib/nfl/props/rushingEncoding";
import { computeRushingBaselineConstants, predictRushingBaselineA, predictRushingBaselineB, predictRushingBaselineC } from "../src/lib/nfl/props/rushingBaselines";
import { fitRidgeModel, scoreRidgeModel, RIDGE_ALPHA_GRID } from "../src/lib/nfl/props/ridge";
import { computeMetrics, metricsByGroup, weekBand, type NflOpportunityPredictionPair } from "../src/lib/nfl/props/qbOpportunityEvaluation";
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
function toRushEpaRecord(row: CsvRow): NflTeamEpaGameRecord {
  const num = (field: string) => Number(String(row[field] ?? "").trim());
  return {
    gameId: String(row.game_id ?? "").trim(), season: num("season"), week: num("week"),
    team: String(row.team ?? "").trim(), opponent: String(row.opponent ?? "").trim(),
    passEpa: num("rush_epa"), passPlays: num("rush_plays"),
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
  try { writeFileSync(tmp, text, "utf8"); renameSync(tmp, path); } catch (error) { if (existsSync(tmp)) unlinkSync(tmp); throw error; }
}

const { output: outputOverride, generatedAt } = parseArgs(process.argv);

// --- load inputs (CORRECTED: v2 outcomes, already pregame-eligible by construction) ---

const outcomesPath = join(DEFAULT_OUTPUT_DIR, `rushing-outcomes-v2-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
if (!existsSync(outcomesPath)) throw new Error(`Missing ${outcomesPath}. Run npm run nfl:rushing-outcomes-v2 first.`);
const outcomesArtifact = JSON.parse(readFileSync(outcomesPath, "utf8")) as { rows: NflRushingOutcome[] };

const oldOutcomesPath = join(DEFAULT_OUTPUT_DIR, `rushing-outcomes-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
const oldOutcomesArtifact = existsSync(oldOutcomesPath) ? (JSON.parse(readFileSync(oldOutcomesPath, "utf8")) as { rows: NflRushingOutcome[] }) : null;

const marketPath = join(DEFAULT_OUTPUT_DIR, `historical-market-context-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
const marketArtifact = JSON.parse(readFileSync(marketPath, "utf8")) as { rows: NflHistoricalMarketRow[] };
const marketByKey = new Map(marketArtifact.rows.map((r) => [marketKey(r.season, r.week, r.team), r]));

const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
const epaManifest = readManifest(EPA_CACHE_DIR);
const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
const rushEpaRecords: NflTeamEpaGameRecord[] = [];
const allGames: (NflPropRawGameRecord & { isDome?: boolean })[] = [];
for (const season of ALL_SEASONS) {
  const pv = verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season);
  if (!pv) throw new Error(`Play-volume source for ${season} not cached.`);
  for (const row of pv) playVolumeRecords.push(toPlayVolumeRecord(row));
  const epa = verifiedCsvRows(EPA_CACHE_DIR, epaManifest, season);
  if (!epa) throw new Error(`EPA source for ${season} not cached.`);
  for (const row of epa) rushEpaRecords.push(toRushEpaRecord(row));
  allGames.push(...readSeasonGames(season));
}
const gameJoinIndex = buildGameJoinIndex(allGames);
const fullTeamGameLog: NflTeamGameLogEntry[] = buildTeamGameLog(playVolumeRecords, gameJoinIndex);
const rushEpaGameLog: NflTeamEpaGameLogEntry[] = buildTeamEpaGameLog(rushEpaRecords, gameJoinIndex);
const domeByGameId = new Map(allGames.filter((g) => g.gameId).map((g) => [g.gameId, Boolean(g.isDome)]));

const teamPregameFeaturesByKey = new Map<string, NflTeamPregameFeatures>();
for (const record of playVolumeRecords) {
  teamPregameFeaturesByKey.set(`${record.season}|${record.week}|${record.team}`, buildTeamPregameFeatures(record, gameJoinIndex, fullTeamGameLog));
}

const allOutcomes = outcomesArtifact.rows; // every row is pregameEligible=true by construction (v2)
const playerRushingStatLog = buildPlayerRushingStatLog(allOutcomes, gameJoinIndex);
const teamTopRbCarryShareByGameTeam = buildTeamTopRbCarryShareByGameTeam(allOutcomes);

const featureRows: NflRushingFeatureRow[] = allOutcomes.map((o) =>
  buildRushingFeatureRow(o, {
    gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, rushEpaGameLog, marketByKey, domeByGameId,
    playerRushingStatLog, teamTopRbCarryShareByGameTeam,
  }),
);

const devRows = featureRows.filter((r) => r.season !== FROZEN_BENCHMARK_SEASON);
const frozenRows = featureRows.filter((r) => r.season === FROZEN_BENCHMARK_SEASON);

// --- helpers -------------------------------------------------------------------

function pair(row: NflRushingFeatureRow, predicted: number): NflOpportunityPredictionPair {
  return { actual: row.target.rushingYards, predicted };
}
function fitAndScoreDirect(train: NflRushingFeatureRow[], validate: NflRushingFeatureRow[], alpha: number, includePosition: boolean) {
  const options = { allowPriorSeasonFallback: true, includePosition };
  const fallbacks = computeRushingTrainFallbacks(train);
  const encoded = train.map((r) => encodeRushingFeatureRow(r, fallbacks, options));
  const targets = train.map((r) => r.target.rushingYards);
  const model = fitRidgeModel(encoded, targets, alpha);
  const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodeRushingFeatureRow(r, fallbacks, options))));
  return { model, fallbacks, metrics: computeMetrics(pairs) };
}
function fitAndScoreHybrid(train: NflRushingFeatureRow[], validate: NflRushingFeatureRow[], alpha: number, constants: ReturnType<typeof computeRushingBaselineConstants>) {
  const options = { allowPriorSeasonFallback: true, includePosition: true };
  const fallbacks = computeRushingTrainFallbacks(train);
  const encodeRow = (r: NflRushingFeatureRow) => {
    const c = predictRushingBaselineC(r, constants, constants.leagueMeanRushingYards / constants.leagueMeanYardsPerCarry);
    return appendRushingDecompositionLegs(encodeRushingFeatureRow(r, fallbacks, options), c.projectedCarries, c.projectedYpc);
  };
  const model = fitRidgeModel(train.map(encodeRow), train.map((r) => r.target.rushingYards), alpha);
  const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodeRow(r))));
  return { model, fallbacks, metrics: computeMetrics(pairs) };
}

// --- temporal fold development validation (pooled model, A-E) -----------------

const foldReports = TEMPORAL_FOLDS.map((fold) => {
  const { train, validate } = splitByFold(devRows, fold);
  const constants = computeRushingBaselineConstants(train);
  const fallbackCarries = constants.leagueMeanRushingYards / constants.leagueMeanYardsPerCarry;

  const aPairs = validate.map((r) => pair(r, predictRushingBaselineA(r, constants)));
  const bPairs = validate.map((r) => pair(r, predictRushingBaselineB(r, constants)));
  const cPairs = validate.map((r) => pair(r, predictRushingBaselineC(r, constants, fallbackCarries).predicted));

  const dByAlpha = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, ...fitAndScoreDirect(train, validate, alpha, true) }));
  const eByAlpha = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, ...fitAndScoreHybrid(train, validate, alpha, constants) }));

  return {
    fold: fold.name, trainRows: train.length, validateRows: validate.length,
    A: computeMetrics(aPairs), B: computeMetrics(bPairs), C: computeMetrics(cPairs),
    D_byAlpha: dByAlpha.map((r) => ({ alpha: r.alpha, mae: r.metrics?.mae ?? Infinity })),
    E_byAlpha: eByAlpha.map((r) => ({ alpha: r.alpha, mae: r.metrics?.mae ?? Infinity })),
  };
});

const dAlphaAverages = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, avgMae: average(foldReports.map((f) => f.D_byAlpha.find((x) => x.alpha === alpha)!.mae))! })).sort((a, b) => a.avgMae - b.avgMae);
const eAlphaAverages = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, avgMae: average(foldReports.map((f) => f.E_byAlpha.find((x) => x.alpha === alpha)!.mae))! })).sort((a, b) => a.avgMae - b.avgMae);
const bestDAlpha = dAlphaAverages[0].alpha;
const bestEAlpha = eAlphaAverages[0].alpha;

const devValidationSummary = {
  A_leagueMean: average(foldReports.map((f) => f.A?.mae ?? null).filter((v): v is number => v != null)),
  B_rollingMean: average(foldReports.map((f) => f.B?.mae ?? null).filter((v): v is number => v != null)),
  C_decomposition: average(foldReports.map((f) => f.C?.mae ?? null).filter((v): v is number => v != null)),
  D_directRidge_pooled: dAlphaAverages[0].avgMae,
  E_hybridRidge_pooled: eAlphaAverages[0].avgMae,
};

// --- pooled vs QB/non-QB segmented (dev folds, direct ridge only) --------------

function segmentedFoldMae(): number {
  const foldMaes = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(devRows, fold);
    const trainQb = train.filter((r) => r.diagnostics.isQb);
    const trainNonQb = train.filter((r) => !r.diagnostics.isQb);
    const validateQb = validate.filter((r) => r.diagnostics.isQb);
    const validateNonQb = validate.filter((r) => !r.diagnostics.isQb);
    const qbResult = fitAndScoreDirect(trainQb, validateQb, bestDAlpha, false);
    const nonQbResult = fitAndScoreDirect(trainNonQb, validateNonQb, bestDAlpha, false);
    const allPairs = [
      ...validateQb.map((r) => pair(r, scoreRidgeModel(qbResult.model, encodeRushingFeatureRow(r, qbResult.fallbacks, { allowPriorSeasonFallback: true, includePosition: false })))),
      ...validateNonQb.map((r) => pair(r, scoreRidgeModel(nonQbResult.model, encodeRushingFeatureRow(r, nonQbResult.fallbacks, { allowPriorSeasonFallback: true, includePosition: false })))),
    ];
    return computeMetrics(allPairs)?.mae ?? Infinity;
  });
  return average(foldMaes)!;
}
const pooledVsSegmented = { pooledWithPositionIndicator: devValidationSummary.D_directRidge_pooled, segmentedQbAndNonQb: segmentedFoldMae() };

// --- final fit on 2022-2024, evaluated ONCE on the 2025 frozen benchmark -------

const finalTrainRows = devRows.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));
const finalConstants = computeRushingBaselineConstants(finalTrainRows);
const finalFallbackCarries = finalConstants.leagueMeanRushingYards / finalConstants.leagueMeanYardsPerCarry;
const finalD = fitAndScoreDirect(finalTrainRows, frozenRows, bestDAlpha, true);
const finalE = fitAndScoreHybrid(finalTrainRows, frozenRows, bestEAlpha, finalConstants);

const frozenBenchmark = {
  A_leagueMean: computeMetrics(frozenRows.map((r) => pair(r, predictRushingBaselineA(r, finalConstants)))),
  B_rollingMean: computeMetrics(frozenRows.map((r) => pair(r, predictRushingBaselineB(r, finalConstants)))),
  C_decomposition: computeMetrics(frozenRows.map((r) => pair(r, predictRushingBaselineC(r, finalConstants, finalFallbackCarries).predicted))),
  D_directRidge: finalD.metrics,
  E_hybridRidge: finalE.metrics,
};
const predictFinalD = (r: NflRushingFeatureRow) => scoreRidgeModel(finalD.model, encodeRushingFeatureRow(r, finalD.fallbacks, { allowPriorSeasonFallback: true, includePosition: true }));

// --- zero-carry subset performance (NEW: the whole point of the rerun) --------

const zeroCarrySubset = metricsByGroup(
  frozenRows,
  (r) => (r.target.rushingYards === 0 ? "zeroCarryZeroYards" : "nonZero"),
  (r) => pair(r, predictFinalD(r)),
);

// --- feature-group ablation + market subgroup audit (dev folds only) ----------

function ablatedFoldMae(excluded: Set<NflRushingFeatureGroup>): number {
  const foldMaes = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(devRows, fold);
    const fallbacks = computeRushingTrainFallbacks(train);
    const options = { allowPriorSeasonFallback: true, includePosition: true };
    const encodeRow = (r: NflRushingFeatureRow) => ablateRushingGroups(encodeRushingFeatureRow(r, fallbacks, options), fallbacks, excluded);
    const model = fitRidgeModel(train.map(encodeRow), train.map((r) => r.target.rushingYards), bestDAlpha);
    const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodeRow(r))));
    return computeMetrics(pairs)?.mae ?? Infinity;
  });
  return average(foldMaes)!;
}
const ablationResults: Record<string, number> = { none: devValidationSummary.D_directRidge_pooled };
for (const group of RUSHING_FEATURE_GROUPS) ablationResults[group] = ablatedFoldMae(new Set([group]));

function marketSubgroupAblatedFoldMae(zeroKeys: readonly string[]): number {
  const foldMaes = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(devRows, fold);
    const fallbacks = computeRushingTrainFallbacks(train);
    const options = { allowPriorSeasonFallback: true, includePosition: true };
    const zeroIndices = zeroKeys.map((k) => RUSHING_FEATURE_KEYS.findIndex((f) => f.key === k));
    const encodeRow = (r: NflRushingFeatureRow) => {
      const base = encodeRushingFeatureRow(r, fallbacks, options);
      return base.map((v, i) => (zeroIndices.includes(i) ? fallbacks[i] : v));
    };
    const model = fitRidgeModel(train.map(encodeRow), train.map((r) => r.target.rushingYards), bestDAlpha);
    const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodeRow(r))));
    return computeMetrics(pairs)?.mae ?? Infinity;
  });
  return average(foldMaes)!;
}
const marketFeatureAudit = {
  allMarketFeatures: devValidationSummary.D_directRidge_pooled,
  withoutSpread: marketSubgroupAblatedFoldMae(["market.spread"]),
  withoutTotal: marketSubgroupAblatedFoldMae(["market.total"]),
  withoutImpliedTeamTotal: marketSubgroupAblatedFoldMae(["market.impliedTeamTotal"]),
};

// --- committee/role-volatility + breakdowns -------------------------------------

function committeeBucket(row: NflRushingFeatureRow): string {
  const c = row.diagnostics.recentTeamTopCarryShareConcentration;
  if (c == null) return "unknown";
  return c >= 0.6 ? "concentratedBackfield" : "committeeBackfield";
}
const committeeAnalysis = metricsByGroup(frozenRows, committeeBucket, (r) => pair(r, predictFinalD(r)));
const byPosition = metricsByGroup(frozenRows, (r) => r.diagnostics.position, (r) => pair(r, predictFinalD(r)));
const byWeekBand = metricsByGroup(frozenRows, (r) => weekBand(r.week), (r) => pair(r, predictFinalD(r)));
function volumeBand(row: NflRushingFeatureRow): string {
  const carries = row.features.playerUsage.carriesPerGame.seasonPrior ?? row.features.playerUsage.carriesPerGame.priorSeason;
  if (carries == null) return "unknown";
  if (carries < 5) return "lowVolume";
  if (carries < 12) return "mediumVolume";
  return "highVolume";
}
const byVolumeBand = metricsByGroup(frozenRows, volumeBand, (r) => pair(r, predictFinalD(r)));

// --- distributions + write -------------------------------------------------------

function distribution(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { count: sorted.length, min: sorted[0], max: sorted.at(-1), mean: average(sorted), median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid] };
}

const report = {
  _meta: {
    schemaVersion: "nfl-rushing-baseline-competition-v2-v1", generatedAt, target: "rushingYards",
    populationCorrection: {
      oldPhase5TotalRows: oldOutcomesArtifact?.rows.length ?? null,
      correctedTotalRows: allOutcomes.length,
      addedRows: oldOutcomesArtifact ? allOutcomes.length - oldOutcomesArtifact.rows.filter((r) => r.pregameEligible).length : null,
    },
    temporalFolds: TEMPORAL_FOLDS.map((f) => ({ name: f.name, trainSeasons: f.trainSeasons, validateSeason: f.validateSeason })),
    finalTrainSeasons: FINAL_TRAIN_SEASONS, frozenBenchmarkSeason: FROZEN_BENCHMARK_SEASON,
    devRowCount: devRows.length, frozenRowCount: frozenRows.length,
    ridgeAlphaGrid: RIDGE_ALPHA_GRID, bestDAlphaSelectedOnDevFoldsOnly: bestDAlpha, bestEAlphaSelectedOnDevFoldsOnly: bestEAlpha,
  },
  actualDistribution: { dev: distribution(devRows.map((r) => r.target.rushingYards)), frozen2025: distribution(frozenRows.map((r) => r.target.rushingYards)) },
  developmentValidation: { perFold: foldReports, averagedAcrossFolds: devValidationSummary },
  pooledVsSegmentedQbNonQb: pooledVsSegmented,
  frozenBenchmark2025: frozenBenchmark,
  zeroCarrySubsetOnFrozen2025: zeroCarrySubset,
  directVsDecomposition: {
    devAverageMae: { C_decomposition: devValidationSummary.C_decomposition, D_direct: devValidationSummary.D_directRidge_pooled, E_hybrid: devValidationSummary.E_hybridRidge_pooled },
    frozen2025Mae: { C_decomposition: frozenBenchmark.C_decomposition?.mae, D_direct: frozenBenchmark.D_directRidge?.mae, E_hybrid: frozenBenchmark.E_hybridRidge?.mae },
  },
  featureGroupAblationOnDevFolds: { alpha: bestDAlpha, results: ablationResults },
  marketFeatureAuditOnDevFolds: marketFeatureAudit,
  committeeAnalysisOnFrozen2025: committeeAnalysis,
  breakdownsOnFrozen2025: { byPosition, byWeekBand, byVolumeBand },
};

const output = outputOverride ?? join(DEFAULT_OUTPUT_DIR, `rushing-baseline-competition-v2-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
writeAtomic(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote CORRECTED rushing baseline competition report to ${output}`);
console.log("Population:", report._meta.populationCorrection);
console.log("Dev-average MAE:", devValidationSummary);
console.log("Pooled vs segmented:", pooledVsSegmented);
console.log("2025 frozen benchmark MAE:", Object.fromEntries(Object.entries(frozenBenchmark).map(([k, v]) => [k, v?.mae?.toFixed(3)])));
console.log("Zero-carry subset:", Object.fromEntries(Object.entries(zeroCarrySubset).map(([k, v]) => [k, { n: v.n, mae: v.mae.toFixed(3) }])));
