/**
 * Phase 6: baseline competition for pregame receiving-yard projection.
 * Same temporal-fold discipline as Phase 4/5: rolling-origin folds
 * confined to 2022-2024 for every selection decision; 2025 loaded once,
 * evaluated once, as a fixed retrospective benchmark only.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures, type NflTeamGameLogEntry } from "../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "../src/lib/nfl/props/types/teamPregameFeatures";
import type { NflReceivingOutcome } from "../src/lib/nfl/props/types/receivingOutcome";
import { buildTeamEpaGameLog, type NflTeamEpaGameLogEntry, type NflTeamEpaGameRecord } from "../src/lib/nfl/props/qbPassingEpaContext";
import { buildPlayerReceivingStatLog, buildReceivingFeatureRow, buildTeamTopTargetShareByGameTeam, type NflAirYardsSupplement } from "../src/lib/nfl/props/receivingFeatures";
import type { NflReceivingFeatureRow } from "../src/lib/nfl/props/types/receivingFeatures";
import { marketKey, type NflHistoricalMarketRow } from "../src/lib/nfl/props/qbOpportunityFeatures";
import {
  ablateReceivingGroups, appendReceivingDecompositionLegs, computeReceivingTrainFallbacks, encodeReceivingFeatureRow,
  RECEIVING_FEATURE_GROUPS, RECEIVING_FEATURE_KEYS, type NflReceivingFeatureGroup,
} from "../src/lib/nfl/props/receivingEncoding";
import {
  computeReceivingBaselineConstants, predictReceivingBaselineA, predictReceivingBaselineB,
  predictReceivingBaselineC, predictReceivingBaselineD,
} from "../src/lib/nfl/props/receivingBaselines";
import { fitRidgeModel, scoreRidgeModel, RIDGE_ALPHA_GRID } from "../src/lib/nfl/props/ridge";
import { computeMetrics, metricsByGroup, weekBand, type NflOpportunityPredictionPair } from "../src/lib/nfl/props/qbOpportunityEvaluation";
import { TEMPORAL_FOLDS, FROZEN_BENCHMARK_SEASON, FINAL_TRAIN_SEASONS, splitByFold, average } from "../src/lib/nfl/props/temporalValidation";
import { coalesceWindow } from "../src/lib/nfl/props/qbOpportunityEncoding";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const EPA_CACHE_DIR = "data/nfl/nflverse/epa-team-game";
const STATS_CACHE_DIR = "data/nfl/nflverse/stats-player-week";
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
function readManifest(dir: string): CacheManifest {
  return JSON.parse(readFileSync(join(ROOT, dir, "manifest.json"), "utf8"));
}
function verifiedCsvRows(dir: string, manifest: CacheManifest, season: number) {
  const entry = manifest.files?.find((c) => c.season === season);
  if (!entry) return null;
  const text = readFileSync(join(ROOT, dir, entry.filename), "utf8");
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
function toPassEpaRecord(row: CsvRow): NflTeamEpaGameRecord {
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
  try { writeFileSync(tmp, text, "utf8"); renameSync(tmp, path); } catch (error) { if (existsSync(tmp)) unlinkSync(tmp); throw error; }
}

const { output: outputOverride, generatedAt } = parseArgs(process.argv);

// --- load inputs -------------------------------------------------------------

const outcomesPath = join(DEFAULT_OUTPUT_DIR, `receiving-outcomes-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
if (!existsSync(outcomesPath)) throw new Error(`Missing ${outcomesPath}. Run npm run nfl:receiving-outcomes first.`);
const outcomesArtifact = JSON.parse(readFileSync(outcomesPath, "utf8")) as { rows: NflReceivingOutcome[] };

const marketPath = join(DEFAULT_OUTPUT_DIR, `historical-market-context-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
const marketArtifact = JSON.parse(readFileSync(marketPath, "utf8")) as { rows: NflHistoricalMarketRow[] };
const marketByKey = new Map(marketArtifact.rows.map((r) => [marketKey(r.season, r.week, r.team), r]));

const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
const epaManifest = readManifest(EPA_CACHE_DIR);
const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
const passEpaRecords: NflTeamEpaGameRecord[] = [];
const allGames: (NflPropRawGameRecord & { isDome?: boolean })[] = [];
for (const season of ALL_SEASONS) {
  const pv = verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season);
  if (!pv) throw new Error(`Play-volume source for ${season} not cached.`);
  for (const row of pv) playVolumeRecords.push(toPlayVolumeRecord(row));
  const epa = verifiedCsvRows(EPA_CACHE_DIR, epaManifest, season);
  if (!epa) throw new Error(`EPA source for ${season} not cached.`);
  for (const row of epa) passEpaRecords.push(toPassEpaRecord(row));
  allGames.push(...readSeasonGames(season));
}
const gameJoinIndex = buildGameJoinIndex(allGames);
const fullTeamGameLog: NflTeamGameLogEntry[] = buildTeamGameLog(playVolumeRecords, gameJoinIndex);
const passEpaGameLog: NflTeamEpaGameLogEntry[] = buildTeamEpaGameLog(passEpaRecords, gameJoinIndex);
const domeByGameId = new Map(allGames.filter((g) => g.gameId).map((g) => [g.gameId, Boolean(g.isDome)]));

const teamPregameFeaturesByKey = new Map<string, NflTeamPregameFeatures>();
for (const record of playVolumeRecords) {
  teamPregameFeaturesByKey.set(`${record.season}|${record.week}|${record.team}`, buildTeamPregameFeatures(record, gameJoinIndex, fullTeamGameLog));
}

const statsManifest = readManifest(STATS_CACHE_DIR);
const airYardsByPlayerWeek = new Map<string, NflAirYardsSupplement>();
for (const season of ALL_SEASONS) {
  const cache = verifiedCsvRows(STATS_CACHE_DIR, statsManifest, season);
  if (!cache) continue;
  for (const row of cache) {
    if (String(row.season_type ?? "").toUpperCase() !== "REG" || !row.player_id) continue;
    const airYards = Number(row.receiving_air_yards);
    if (!Number.isFinite(airYards)) continue;
    airYardsByPlayerWeek.set(`gsis:${String(row.player_id).trim()}|${season}|${Number(row.week)}`, { airYards });
  }
}

const allOutcomes = outcomesArtifact.rows; // every row already receivingEligiblePregame by construction
const playerReceivingStatLog = buildPlayerReceivingStatLog(allOutcomes, gameJoinIndex, airYardsByPlayerWeek);
const teamTopTargetShareByGameTeam = buildTeamTopTargetShareByGameTeam(allOutcomes);

const featureRows: NflReceivingFeatureRow[] = allOutcomes.map((o) =>
  buildReceivingFeatureRow(o, {
    gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, passEpaGameLog, marketByKey, domeByGameId,
    playerReceivingStatLog, teamTopTargetShareByGameTeam,
  }),
);
// Index-aligned with `allOutcomes` (built via 1:1 .map) -- used only by the targets sub-competition below to attach the raw `targets` outcome without adding a new feature-row schema field.
const actualTargetsByIndex = allOutcomes.map((o) => o.targets);

const devRows = featureRows.filter((r) => r.season !== FROZEN_BENCHMARK_SEASON);
const frozenRows = featureRows.filter((r) => r.season === FROZEN_BENCHMARK_SEASON);
const devIndices = featureRows.map((_, i) => i).filter((i) => featureRows[i].season !== FROZEN_BENCHMARK_SEASON);

// --- helpers -------------------------------------------------------------------

function pair(row: NflReceivingFeatureRow, predicted: number): NflOpportunityPredictionPair {
  return { actual: row.target.receivingYards, predicted };
}
function fitAndScoreDirect(train: NflReceivingFeatureRow[], validate: NflReceivingFeatureRow[], alpha: number, includePosition: boolean) {
  const options = { allowPriorSeasonFallback: true, includePosition };
  const fallbacks = computeReceivingTrainFallbacks(train);
  const encoded = train.map((r) => encodeReceivingFeatureRow(r, fallbacks, options));
  const targets = train.map((r) => r.target.receivingYards);
  const model = fitRidgeModel(encoded, targets, alpha);
  const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodeReceivingFeatureRow(r, fallbacks, options))));
  return { model, fallbacks, metrics: computeMetrics(pairs) };
}
function fitAndScoreHybrid(train: NflReceivingFeatureRow[], validate: NflReceivingFeatureRow[], alpha: number, constants: ReturnType<typeof computeReceivingBaselineConstants>) {
  const options = { allowPriorSeasonFallback: true, includePosition: true };
  const fallbacks = computeReceivingTrainFallbacks(train);
  const encodeRow = (r: NflReceivingFeatureRow) => {
    const c = predictReceivingBaselineC(r, constants, constants.leagueMeanReceivingYards / constants.leagueMeanYardsPerTarget);
    const d = predictReceivingBaselineD(r, constants, constants.leagueMeanReceivingYards / constants.leagueMeanYardsPerTarget);
    return appendReceivingDecompositionLegs(encodeReceivingFeatureRow(r, fallbacks, options), [c.projectedTargets, c.projectedYpt, d.projectedCatchRate, d.projectedYpr]);
  };
  const model = fitRidgeModel(train.map(encodeRow), train.map((r) => r.target.receivingYards), alpha);
  const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodeRow(r))));
  return { model, fallbacks, metrics: computeMetrics(pairs) };
}

// --- temporal fold development validation (pooled model, A-F) -----------------

const foldReports = TEMPORAL_FOLDS.map((fold) => {
  const { train, validate } = splitByFold(devRows, fold);
  const constants = computeReceivingBaselineConstants(train);
  const fallbackTargets = constants.leagueMeanReceivingYards / constants.leagueMeanYardsPerTarget;

  const aPairs = validate.map((r) => pair(r, predictReceivingBaselineA(r, constants)));
  const bPairs = validate.map((r) => pair(r, predictReceivingBaselineB(r, constants)));
  const cPairs = validate.map((r) => pair(r, predictReceivingBaselineC(r, constants, fallbackTargets).predicted));
  const dPairs = validate.map((r) => pair(r, predictReceivingBaselineD(r, constants, fallbackTargets).predicted));

  const eByAlpha = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, ...fitAndScoreDirect(train, validate, alpha, true) }));
  const fByAlpha = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, ...fitAndScoreHybrid(train, validate, alpha, constants) }));

  return {
    fold: fold.name, trainRows: train.length, validateRows: validate.length,
    A: computeMetrics(aPairs), B: computeMetrics(bPairs), C: computeMetrics(cPairs), D: computeMetrics(dPairs),
    E_byAlpha: eByAlpha.map((r) => ({ alpha: r.alpha, mae: r.metrics?.mae ?? Infinity })),
    F_byAlpha: fByAlpha.map((r) => ({ alpha: r.alpha, mae: r.metrics?.mae ?? Infinity })),
  };
});

const eAlphaAverages = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, avgMae: average(foldReports.map((f) => f.E_byAlpha.find((x) => x.alpha === alpha)!.mae))! })).sort((a, b) => a.avgMae - b.avgMae);
const fAlphaAverages = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, avgMae: average(foldReports.map((f) => f.F_byAlpha.find((x) => x.alpha === alpha)!.mae))! })).sort((a, b) => a.avgMae - b.avgMae);
const bestEAlpha = eAlphaAverages[0].alpha;
const bestFAlpha = fAlphaAverages[0].alpha;

const devValidationSummary = {
  A_leagueMean: average(foldReports.map((f) => f.A?.mae ?? null).filter((v): v is number => v != null)),
  B_rollingMean: average(foldReports.map((f) => f.B?.mae ?? null).filter((v): v is number => v != null)),
  C_targetsTimesYpt: average(foldReports.map((f) => f.C?.mae ?? null).filter((v): v is number => v != null)),
  D_targetsTimesCatchTimesYpr: average(foldReports.map((f) => f.D?.mae ?? null).filter((v): v is number => v != null)),
  E_directRidge_pooled: eAlphaAverages[0].avgMae,
  F_hybridRidge_pooled: fAlphaAverages[0].avgMae,
};

// --- pooled vs position-specific (WR/TE/RB) (dev folds, direct ridge only) ----

function segmentedByPositionFoldMae(): number {
  const foldMaes = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(devRows, fold);
    const positions = ["RB", "WR", "TE"] as const;
    const allPairs: NflOpportunityPredictionPair[] = [];
    for (const position of positions) {
      const trainPos = train.filter((r) => r.diagnostics.position === position);
      const validatePos = validate.filter((r) => r.diagnostics.position === position);
      if (trainPos.length === 0 || validatePos.length === 0) continue;
      const result = fitAndScoreDirect(trainPos, validatePos, bestEAlpha, false);
      allPairs.push(...validatePos.map((r) => pair(r, scoreRidgeModel(result.model, encodeReceivingFeatureRow(r, result.fallbacks, { allowPriorSeasonFallback: true, includePosition: false })))));
    }
    return computeMetrics(allPairs)?.mae ?? Infinity;
  });
  return average(foldMaes)!;
}
const pooledVsSegmented = { pooledWithPositionIndicator: devValidationSummary.E_directRidge_pooled, segmentedByPosition: segmentedByPositionFoldMae() };

// --- opportunity-model competition: targets, evaluated separately from receiving yards ---
// (dev folds only; reuses the same feature encoding, refit against `targets` as the outcome)

const devRowsWithIndex = devIndices.map((i) => ({ row: featureRows[i], actualTargets: actualTargetsByIndex[i] }));

const targetProjectionFoldReports = TEMPORAL_FOLDS.map((fold) => {
  const trainEntries = devRowsWithIndex.filter((e) => fold.trainSeasons.includes(e.row.season));
  const validateEntries = devRowsWithIndex.filter((e) => e.row.season === fold.validateSeason);
  const train = trainEntries.map((e) => e.row);
  const validate = validateEntries.map((e) => e.row);

  const trainTargetsValues = trainEntries.map((e) => e.actualTargets);
  const leagueMeanTargets = trainTargetsValues.length > 0 ? trainTargetsValues.reduce((s, v) => s + v, 0) / trainTargetsValues.length : 0;

  const targetPair = (entry: { row: NflReceivingFeatureRow; actualTargets: number }, predicted: number): NflOpportunityPredictionPair => ({ actual: entry.actualTargets, predicted });

  const aPairs = validateEntries.map((e) => targetPair(e, leagueMeanTargets));
  const bPairs = validateEntries.map((e) => targetPair(e, coalesceWindow(e.row.features.playerUsage.targetsPerGame) ?? leagueMeanTargets));
  const cPairs = validateEntries.map((e) => {
    const share = coalesceWindow(e.row.features.playerUsage.targetShare);
    const teamAttempts = coalesceWindow(e.row.features.teamEnvironment.passAttemptsPerGame);
    const predicted = share != null && teamAttempts != null ? share * teamAttempts : coalesceWindow(e.row.features.playerUsage.targetsPerGame) ?? leagueMeanTargets;
    return targetPair(e, predicted);
  });

  const fallbacks = computeReceivingTrainFallbacks(train);
  const options = { allowPriorSeasonFallback: true, includePosition: true };
  const encoded = train.map((r) => encodeReceivingFeatureRow(r, fallbacks, options));
  const directModel = fitRidgeModel(encoded, trainTargetsValues, 3); // fixed, modest alpha -- this sub-competition is diagnostic, not the primary yards model
  const dPairs = validateEntries.map((e) => targetPair(e, scoreRidgeModel(directModel, encodeReceivingFeatureRow(e.row, fallbacks, options))));

  return {
    fold: fold.name,
    leagueMean: computeMetrics(aPairs), rollingTargets: computeMetrics(bPairs),
    targetShareTimesTeamAttempts: computeMetrics(cPairs), directRidge: computeMetrics(dPairs),
  };
});
const targetProjectionSummary = {
  leagueMean: average(targetProjectionFoldReports.map((f) => f.leagueMean?.mae ?? null).filter((v): v is number => v != null)),
  rollingTargets: average(targetProjectionFoldReports.map((f) => f.rollingTargets?.mae ?? null).filter((v): v is number => v != null)),
  targetShareTimesTeamAttempts: average(targetProjectionFoldReports.map((f) => f.targetShareTimesTeamAttempts?.mae ?? null).filter((v): v is number => v != null)),
  directRidge: average(targetProjectionFoldReports.map((f) => f.directRidge?.mae ?? null).filter((v): v is number => v != null)),
};

// --- final fit on 2022-2024, evaluated ONCE on the 2025 frozen benchmark -------

const finalTrainRows = devRows.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));
const finalConstants = computeReceivingBaselineConstants(finalTrainRows);
const finalFallbackTargets = finalConstants.leagueMeanReceivingYards / finalConstants.leagueMeanYardsPerTarget;
const finalE = fitAndScoreDirect(finalTrainRows, frozenRows, bestEAlpha, true);
const finalF = fitAndScoreHybrid(finalTrainRows, frozenRows, bestFAlpha, finalConstants);

const frozenBenchmark = {
  A_leagueMean: computeMetrics(frozenRows.map((r) => pair(r, predictReceivingBaselineA(r, finalConstants)))),
  B_rollingMean: computeMetrics(frozenRows.map((r) => pair(r, predictReceivingBaselineB(r, finalConstants)))),
  C_targetsTimesYpt: computeMetrics(frozenRows.map((r) => pair(r, predictReceivingBaselineC(r, finalConstants, finalFallbackTargets).predicted))),
  D_targetsTimesCatchTimesYpr: computeMetrics(frozenRows.map((r) => pair(r, predictReceivingBaselineD(r, finalConstants, finalFallbackTargets).predicted))),
  E_directRidge: finalE.metrics,
  F_hybridRidge: finalF.metrics,
};
const predictFinalE = (r: NflReceivingFeatureRow) => scoreRidgeModel(finalE.model, encodeReceivingFeatureRow(r, finalE.fallbacks, { allowPriorSeasonFallback: true, includePosition: true }));

// --- zero-target subset + provenance comparison (2025) -------------------------

const zeroTargetOverall = metricsByGroup(frozenRows, (r) => (r.diagnostics.zeroTargetFlag ? "zeroTarget" : "nonZero"), (r) => pair(r, predictFinalE(r)));
const zeroTargetByProvenance = metricsByGroup(
  frozenRows.filter((r) => r.diagnostics.zeroTargetFlag),
  (r) => r.diagnostics.membershipSource,
  (r) => pair(r, predictFinalE(r)),
);
function volumeBand(row: NflReceivingFeatureRow): string {
  if (row.diagnostics.zeroTargetFlag) return "zeroTarget";
  const targets = row.features.playerUsage.targetsPerGame.seasonPrior ?? row.features.playerUsage.targetsPerGame.priorSeason;
  if (targets == null) return "unknown";
  if (targets < 2) return "oneTwoTargets";
  if (targets < 6) return "mediumVolume";
  return "highVolume";
}
const byVolumeBand = metricsByGroup(frozenRows, volumeBand, (r) => pair(r, predictFinalE(r)));

// --- feature-group ablation + market subgroup audit (dev folds only) ----------

function ablatedFoldMae(excluded: Set<NflReceivingFeatureGroup>): number {
  const foldMaes = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(devRows, fold);
    const fallbacks = computeReceivingTrainFallbacks(train);
    const options = { allowPriorSeasonFallback: true, includePosition: true };
    const encodeRow = (r: NflReceivingFeatureRow) => ablateReceivingGroups(encodeReceivingFeatureRow(r, fallbacks, options), fallbacks, excluded);
    const model = fitRidgeModel(train.map(encodeRow), train.map((r) => r.target.receivingYards), bestEAlpha);
    const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodeRow(r))));
    return computeMetrics(pairs)?.mae ?? Infinity;
  });
  return average(foldMaes)!;
}
const ablationResults: Record<string, number> = { none: devValidationSummary.E_directRidge_pooled };
for (const group of RECEIVING_FEATURE_GROUPS) ablationResults[group] = ablatedFoldMae(new Set([group]));

function marketSubgroupAblatedFoldMae(zeroKeys: readonly string[]): number {
  const foldMaes = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(devRows, fold);
    const fallbacks = computeReceivingTrainFallbacks(train);
    const options = { allowPriorSeasonFallback: true, includePosition: true };
    const zeroIndices = zeroKeys.map((k) => RECEIVING_FEATURE_KEYS.findIndex((f) => f.key === k));
    const encodeRow = (r: NflReceivingFeatureRow) => {
      const base = encodeReceivingFeatureRow(r, fallbacks, options);
      return base.map((v, i) => (zeroIndices.includes(i) ? fallbacks[i] : v));
    };
    const model = fitRidgeModel(train.map(encodeRow), train.map((r) => r.target.receivingYards), bestEAlpha);
    const pairs = validate.map((r) => pair(r, scoreRidgeModel(model, encodeRow(r))));
    return computeMetrics(pairs)?.mae ?? Infinity;
  });
  return average(foldMaes)!;
}
const marketFeatureAudit = {
  allMarketFeatures: devValidationSummary.E_directRidge_pooled,
  withoutSpread: marketSubgroupAblatedFoldMae(["market.spread"]),
  withoutTotal: marketSubgroupAblatedFoldMae(["market.total"]),
  withoutImpliedTeamTotal: marketSubgroupAblatedFoldMae(["market.impliedTeamTotal"]),
};

// --- concentration / breakdowns (2025) ------------------------------------------

function concentrationBucket(row: NflReceivingFeatureRow): string {
  const c = row.features.targetConcentration.recentTeamTopTargetShareConcentration.seasonPrior;
  if (c == null) return "unknown";
  return c >= 0.3 ? "concentratedTree" : "distributedTree";
}
const concentrationAnalysis = metricsByGroup(frozenRows, concentrationBucket, (r) => pair(r, predictFinalE(r)));
const byPosition = metricsByGroup(frozenRows, (r) => r.diagnostics.position, (r) => pair(r, predictFinalE(r)));
const byWeekBand = metricsByGroup(frozenRows, (r) => weekBand(r.week), (r) => pair(r, predictFinalE(r)));
const byHistory = metricsByGroup(
  frozenRows,
  (r) => (r.diagnostics.gamesWithTargetsPriorThisSeason === 0 && !r.diagnostics.hasPriorSeasonTargets ? "noHistory" : r.diagnostics.gamesWithTargetsPriorThisSeason < 3 ? "lowHistory" : "establishedHistory"),
  (r) => pair(r, predictFinalE(r)),
);

// --- distributions + write -------------------------------------------------------

function distribution(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { count: sorted.length, min: sorted[0], max: sorted.at(-1), mean: average(sorted), median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid] };
}

const report = {
  _meta: {
    schemaVersion: "nfl-receiving-baseline-competition-v1", generatedAt, target: "receivingYards",
    temporalFolds: TEMPORAL_FOLDS.map((f) => ({ name: f.name, trainSeasons: f.trainSeasons, validateSeason: f.validateSeason })),
    finalTrainSeasons: FINAL_TRAIN_SEASONS, frozenBenchmarkSeason: FROZEN_BENCHMARK_SEASON,
    devRowCount: devRows.length, frozenRowCount: frozenRows.length,
    ridgeAlphaGrid: RIDGE_ALPHA_GRID, bestEAlphaSelectedOnDevFoldsOnly: bestEAlpha, bestFAlphaSelectedOnDevFoldsOnly: bestFAlpha,
  },
  actualDistribution: { dev: distribution(devRows.map((r) => r.target.receivingYards)), frozen2025: distribution(frozenRows.map((r) => r.target.receivingYards)) },
  developmentValidation: { perFold: foldReports, averagedAcrossFolds: devValidationSummary },
  pooledVsSegmentedByPosition: pooledVsSegmented,
  targetProjectionCompetitionOnDevFolds: { perFold: targetProjectionFoldReports, averagedAcrossFolds: targetProjectionSummary },
  frozenBenchmark2025: frozenBenchmark,
  directVsDecomposition: {
    devAverageMae: { C: devValidationSummary.C_targetsTimesYpt, D: devValidationSummary.D_targetsTimesCatchTimesYpr, E: devValidationSummary.E_directRidge_pooled, F: devValidationSummary.F_hybridRidge_pooled },
    frozen2025Mae: { C: frozenBenchmark.C_targetsTimesYpt?.mae, D: frozenBenchmark.D_targetsTimesCatchTimesYpr?.mae, E: frozenBenchmark.E_directRidge?.mae, F: frozenBenchmark.F_hybridRidge?.mae },
  },
  featureGroupAblationOnDevFolds: { alpha: bestEAlpha, results: ablationResults },
  marketFeatureAuditOnDevFolds: marketFeatureAudit,
  zeroTargetOnFrozen2025: zeroTargetOverall,
  zeroTargetByProvenanceOnFrozen2025: zeroTargetByProvenance,
  breakdownsOnFrozen2025: { byPosition, byWeekBand, byVolumeBand, byHistory, byConcentration: concentrationAnalysis },
};

const output = outputOverride ?? join(DEFAULT_OUTPUT_DIR, `receiving-baseline-competition-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
writeAtomic(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote receiving baseline competition report to ${output}`);
console.log("Dev-average MAE:", devValidationSummary);
console.log("Pooled vs segmented by position:", pooledVsSegmented);
console.log("2025 frozen benchmark MAE:", Object.fromEntries(Object.entries(frozenBenchmark).map(([k, v]) => [k, v?.mae?.toFixed(3)])));
console.log("Zero-target subset:", Object.fromEntries(Object.entries(zeroTargetOverall).map(([k, v]) => [k, { n: v.n, mae: v.mae.toFixed(3) }])));
console.log("Zero-target by provenance:", Object.fromEntries(Object.entries(zeroTargetByProvenance).map(([k, v]) => [k, { n: v.n, mae: v.mae.toFixed(3) }])));
