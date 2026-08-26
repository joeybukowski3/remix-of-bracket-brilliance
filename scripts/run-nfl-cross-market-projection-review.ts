/**
 * Phase 7: cross-market calibration, uncertainty, and prediction-interval
 * review for passing/rushing/receiving. Reuses each market's already-
 * selected Phase 4/5/6 architecture (passing: direct ridge; rushing:
 * carries x shrunk YPC decomposition; receiving: targets x shrunk YPT
 * decomposition) -- this phase does not change those winners unless a
 * genuine defect is found (none was). All recalibration/interval-building
 * decisions use development folds (2022-2024) only; 2025 is loaded once
 * as the fixed retrospective benchmark, exactly as in every prior phase.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures, type NflTeamGameLogEntry } from "../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "../src/lib/nfl/props/types/teamPregameFeatures";
import { buildTeamEpaGameLog, type NflTeamEpaGameLogEntry, type NflTeamEpaGameRecord } from "../src/lib/nfl/props/qbPassingEpaContext";
import { marketKey, type NflHistoricalMarketRow } from "../src/lib/nfl/props/qbOpportunityFeatures";
import { TEMPORAL_FOLDS, FROZEN_BENCHMARK_SEASON, FINAL_TRAIN_SEASONS, splitByFold, average } from "../src/lib/nfl/props/temporalValidation";
import { computeMetrics, metricsByGroup, weekBand, type NflOpportunityPredictionPair } from "../src/lib/nfl/props/qbOpportunityEvaluation";
import { computeResidualQuantiles, realizedCoverage, averageIntervalWidth } from "../src/lib/nfl/props/predictionIntervals";
import { fitRidgeModel, scoreRidgeModel, RIDGE_ALPHA_GRID } from "../src/lib/nfl/props/ridge";
import { coalesceWindow } from "../src/lib/nfl/props/qbOpportunityEncoding";

// passing
import type { NflQbPassingOutcome } from "../src/lib/nfl/props/types/qbPassing";
import { buildQbGameLog, buildQbOpportunityFeatureRow } from "../src/lib/nfl/props/qbOpportunityFeatures";
import { buildQbStatGameLog, buildQbPassingFeatureRow } from "../src/lib/nfl/props/qbPassingFeatures";
import type { NflQbPassingFeatureRow } from "../src/lib/nfl/props/types/qbPassingFeatures";
import { computePassingTrainFallbacks, encodePassingFeatureRow } from "../src/lib/nfl/props/qbPassingEncoding";

// rushing
import type { NflRushingOutcome } from "../src/lib/nfl/props/types/rushingOutcome";
import { buildPlayerRushingStatLog, buildRushingFeatureRow, buildTeamTopRbCarryShareByGameTeam } from "../src/lib/nfl/props/rushingFeatures";
import type { NflRushingFeatureRow } from "../src/lib/nfl/props/types/rushingFeatures";
import { computeRushingBaselineConstants, predictRushingBaselineC } from "../src/lib/nfl/props/rushingBaselines";
import { computeRushingTrainFallbacks, encodeRushingFeatureRow, ablateRushingGroups, RUSHING_FEATURE_KEYS } from "../src/lib/nfl/props/rushingEncoding";

// receiving
import type { NflReceivingOutcome } from "../src/lib/nfl/props/types/receivingOutcome";
import { buildPlayerReceivingStatLog, buildReceivingFeatureRow, buildTeamTopTargetShareByGameTeam, type NflAirYardsSupplement } from "../src/lib/nfl/props/receivingFeatures";
import type { NflReceivingFeatureRow } from "../src/lib/nfl/props/types/receivingFeatures";
import { computeReceivingBaselineConstants, predictReceivingBaselineC } from "../src/lib/nfl/props/receivingBaselines";
import { computeReceivingTrainFallbacks, encodeReceivingFeatureRow, RECEIVING_FEATURE_KEYS } from "../src/lib/nfl/props/receivingEncoding";

import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const EPA_CACHE_DIR = "data/nfl/nflverse/epa-team-game";
const STATS_CACHE_DIR = "data/nfl/nflverse/stats-player-week";
const DATA_DIR = join(ROOT, "data", "nfl", "props");
const ALL_SEASONS = [2022, 2023, 2024, 2025];

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

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
function toEpaRecord(row: CsvRow, playType: "pass" | "rush"): NflTeamEpaGameRecord {
  const num = (field: string) => Number(String(row[field] ?? "").trim());
  return {
    gameId: String(row.game_id ?? "").trim(), season: num("season"), week: num("week"),
    team: String(row.team ?? "").trim(), opponent: String(row.opponent ?? "").trim(),
    passEpa: num(`${playType}_epa`), passPlays: num(`${playType}_plays`),
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
function pair<T extends { season: number }>(actual: number, predicted: number): NflOpportunityPredictionPair {
  return { actual, predicted };
}
function distribution(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { count: sorted.length, mean: average(sorted), median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid] };
}
function biasBucket(pairs: readonly NflOpportunityPredictionPair[]) {
  return { n: pairs.length, meanPredicted: average(pairs.map((p) => p.predicted)), meanActual: average(pairs.map((p) => p.actual)), bias: average(pairs.map((p) => p.predicted - p.actual)) };
}
function predictedTercile(predicted: number, cut1: number, cut2: number): string {
  return predicted < cut1 ? "low" : predicted < cut2 ? "medium" : "high";
}

// --- shared caches (loaded once) ------------------------------------------------

const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
const epaManifest = readManifest(EPA_CACHE_DIR);
const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
const passEpaRecords: NflTeamEpaGameRecord[] = [];
const rushEpaRecords: NflTeamEpaGameRecord[] = [];
const allGames: (NflPropRawGameRecord & { isDome?: boolean })[] = [];
for (const season of ALL_SEASONS) {
  const pv = verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season);
  if (!pv) throw new Error(`Play-volume source for ${season} not cached.`);
  for (const row of pv) playVolumeRecords.push(toPlayVolumeRecord(row));
  const epa = verifiedCsvRows(EPA_CACHE_DIR, epaManifest, season);
  if (!epa) throw new Error(`EPA source for ${season} not cached.`);
  for (const row of epa) {
    passEpaRecords.push(toEpaRecord(row, "pass"));
    rushEpaRecords.push(toEpaRecord(row, "rush"));
  }
  allGames.push(...readSeasonGames(season));
}
const gameJoinIndex = buildGameJoinIndex(allGames);
const fullTeamGameLog: NflTeamGameLogEntry[] = buildTeamGameLog(playVolumeRecords, gameJoinIndex);
const passEpaGameLog: NflTeamEpaGameLogEntry[] = buildTeamEpaGameLog(passEpaRecords, gameJoinIndex);
const rushEpaGameLog: NflTeamEpaGameLogEntry[] = buildTeamEpaGameLog(rushEpaRecords, gameJoinIndex);
const domeByGameId = new Map(allGames.filter((g) => g.gameId).map((g) => [g.gameId, Boolean(g.isDome)]));
const teamPregameFeaturesByKey = new Map<string, NflTeamPregameFeatures>();
for (const record of playVolumeRecords) {
  teamPregameFeaturesByKey.set(`${record.season}|${record.week}|${record.team}`, buildTeamPregameFeatures(record, gameJoinIndex, fullTeamGameLog));
}
const marketArtifact = JSON.parse(readFileSync(join(DATA_DIR, `historical-market-context-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`), "utf8")) as { rows: NflHistoricalMarketRow[] };
const marketByKey = new Map(marketArtifact.rows.map((r) => [marketKey(r.season, r.week, r.team), r]));

// ===== PASSING ====================================================================

const passingOutcomes = (JSON.parse(readFileSync(join(DATA_DIR, `qb-passing-outcomes-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`), "utf8")) as { rows: NflQbPassingOutcome[] }).rows;
const qbStatGameLog = buildQbStatGameLog(passingOutcomes, gameJoinIndex);
const passingFeatureRows: NflQbPassingFeatureRow[] = passingOutcomes.map((o) =>
  buildQbPassingFeatureRow(o, { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, epaGameLog: passEpaGameLog, marketByKey, domeByGameId, qbStatGameLog }),
);
const passingDev = passingFeatureRows.filter((r) => r.season !== FROZEN_BENCHMARK_SEASON);
const passingFrozen = passingFeatureRows.filter((r) => r.season === FROZEN_BENCHMARK_SEASON);
const passingFinalTrain = passingDev.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));

function fitPassingDirect(train: NflQbPassingFeatureRow[], alpha: number) {
  const fallbacks = computePassingTrainFallbacks(train);
  const encoded = train.map((r) => encodePassingFeatureRow(r, fallbacks));
  const model = fitRidgeModel(encoded, train.map((r) => r.target.primaryQbPassingYards), alpha);
  return { model, fallbacks };
}
// Alpha already established in Phase 4 (selected on dev folds there); re-derive here on the same folds for a self-contained script.
const passingAlphaByFold = TEMPORAL_FOLDS.map((fold) => {
  const { train, validate } = splitByFold(passingDev, fold);
  return RIDGE_ALPHA_GRID.map((alpha) => {
    const { model, fallbacks } = fitPassingDirect(train, alpha);
    const pairs = validate.map((r) => pair(r.target.primaryQbPassingYards, scoreRidgeModel(model, encodePassingFeatureRow(r, fallbacks))));
    return { alpha, mae: computeMetrics(pairs)?.mae ?? Infinity };
  });
});
const passingBestAlpha = RIDGE_ALPHA_GRID.map((alpha) => ({ alpha, avg: average(passingAlphaByFold.map((f) => f.find((x) => x.alpha === alpha)!.mae))! })).sort((a, b) => a.avg - b.avg)[0].alpha;
const passingFinal = fitPassingDirect(passingFinalTrain, passingBestAlpha);
const predictPassing = (r: NflQbPassingFeatureRow) => scoreRidgeModel(passingFinal.model, encodePassingFeatureRow(r, passingFinal.fallbacks));
const passingFrozenPairs = passingFrozen.map((r) => pair(r.target.primaryQbPassingYards, predictPassing(r)));

// Recalibration test (dev folds only): pooled-training intercept vs most-recent-training-season-only intercept.
function passingRecalTest() {
  return TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(passingDev, fold);
    const pooled = fitPassingDirect(train, passingBestAlpha);
    const pooledPairs = validate.map((r) => pair(r.target.primaryQbPassingYards, scoreRidgeModel(pooled.model, encodePassingFeatureRow(r, pooled.fallbacks))));

    const mostRecentSeason = Math.max(...fold.trainSeasons);
    const recentOnlyTrain = train.filter((r) => r.season === mostRecentSeason);
    const recent = fitPassingDirect(recentOnlyTrain.length >= 20 ? recentOnlyTrain : train, passingBestAlpha);
    const recentPairs = validate.map((r) => pair(r.target.primaryQbPassingYards, scoreRidgeModel(recent.model, encodePassingFeatureRow(r, recent.fallbacks))));

    return { fold: fold.name, pooled: computeMetrics(pooledPairs), recentSeasonOnly: computeMetrics(recentPairs) };
  });
}
const passingRecal = passingRecalTest();
const passingRecalSummary = {
  pooledAvgMae: average(passingRecal.map((f) => f.pooled?.mae ?? null).filter((v): v is number => v != null)),
  pooledAvgBias: average(passingRecal.map((f) => f.pooled?.bias ?? null).filter((v): v is number => v != null)),
  recentSeasonOnlyAvgMae: average(passingRecal.map((f) => f.recentSeasonOnly?.mae ?? null).filter((v): v is number => v != null)),
  recentSeasonOnlyAvgBias: average(passingRecal.map((f) => f.recentSeasonOnly?.bias ?? null).filter((v): v is number => v != null)),
};

// ===== RUSHING =====================================================================

const rushingOutcomes = (JSON.parse(readFileSync(join(DATA_DIR, `rushing-outcomes-v2-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`), "utf8")) as { rows: NflRushingOutcome[] }).rows;
const playerRushingStatLog = buildPlayerRushingStatLog(rushingOutcomes, gameJoinIndex);
const teamTopRbCarryShareByGameTeam = buildTeamTopRbCarryShareByGameTeam(rushingOutcomes);
const rushingFeatureRows: NflRushingFeatureRow[] = rushingOutcomes.map((o) =>
  buildRushingFeatureRow(o, { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, rushEpaGameLog, marketByKey, domeByGameId, playerRushingStatLog, teamTopRbCarryShareByGameTeam }),
);
const rushingDev = rushingFeatureRows.filter((r) => r.season !== FROZEN_BENCHMARK_SEASON);
const rushingFrozen = rushingFeatureRows.filter((r) => r.season === FROZEN_BENCHMARK_SEASON);
const rushingFinalTrain = rushingDev.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));
const rushingConstants = computeRushingBaselineConstants(rushingFinalTrain);
const rushingFallbackCarries = rushingConstants.leagueMeanRushingYards / rushingConstants.leagueMeanYardsPerCarry;
const predictRushing = (r: NflRushingFeatureRow) => predictRushingBaselineC(r, rushingConstants, rushingFallbackCarries);
const rushingFrozenResults = rushingFrozen.map((r) => ({ row: r, ...predictRushing(r) }));
const rushingFrozenPairs = rushingFrozenResults.map((r) => pair(r.row.target.rushingYards, r.predicted));

// Component bias: opportunity (carries) leg vs efficiency (YPC) leg vs product.
const rushingComponentBias = {
  carriesBias: average(rushingFrozenResults.map((r) => r.projectedCarries - (r.row.target.rushingYards === 0 && r.projectedCarries === 0 ? 0 : r.projectedCarries))), // placeholder overwritten below
};
// Proper component bias needs the ACTUAL carries/YPC, which live on the underlying outcome, not the feature row -- zip by index (rushingFrozen built 1:1 from rushingOutcomes filtered to frozen season).
const rushingOutcomeBySeason2025 = rushingOutcomes.filter((o) => o.season === FROZEN_BENCHMARK_SEASON);
const rushingByKey = new Map(rushingOutcomeBySeason2025.map((o) => [`${o.season}|${o.week}|${o.playerId}`, o]));
const rushingComponentRows = rushingFrozenResults.map((r) => {
  const actual = rushingByKey.get(`${r.row.season}|${r.row.week}|${r.row.playerId}`)!;
  return { projectedCarries: r.projectedCarries, actualCarries: actual.carries, projectedYpc: r.projectedYpc, actualYpc: actual.yardsPerCarry };
});
const rushingComponentBiasFinal = {
  carriesBias: average(rushingComponentRows.map((r) => r.projectedCarries - r.actualCarries)),
  ypcBias: average(rushingComponentRows.filter((r) => r.actualCarries > 0).map((r) => r.projectedYpc - r.actualYpc)),
};

// Nonlinear market test (dev folds, direct ridge D as the test vehicle -- C has no fittable market coefficient).
function rushingNonlinearMarketTest() {
  const spreadMagnitudeBucket = (spread: number | null) => (spread == null ? [0, 0] : Math.abs(spread) >= 10 ? [1, 0] : Math.abs(spread) >= 7 ? [0, 1] : [0, 0]);
  const largeFavoriteIndicator = (spread: number | null) => (spread != null && spread <= -7 ? 1 : 0);
  const totalBucketDummy = (total: number | null) => (total == null ? 0 : total >= 47 ? 1 : 0);
  function encodeWithNonlinear(r: NflRushingFeatureRow, fallbacks: number[]): number[] {
    const base = encodeRushingFeatureRow(r, fallbacks, { allowPriorSeasonFallback: true, includePosition: true });
    const carries = coalesceWindow(r.features.playerUsage.carriesPerGame) ?? 0;
    const spread = r.features.market.spread;
    const [mag10, mag7] = spreadMagnitudeBucket(spread);
    return [...base, mag10, mag7, largeFavoriteIndicator(spread), totalBucketDummy(r.features.market.total), (spread ?? 0) * carries];
  }
  const foldResults = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(rushingDev, fold);
    const fallbacksBase = computeRushingTrainFallbacks(train);
    // Baseline: linear market as-is (direct ridge D equivalent).
    const linearModel = fitRidgeModel(train.map((r) => encodeRushingFeatureRow(r, fallbacksBase, { allowPriorSeasonFallback: true, includePosition: true })), train.map((r) => r.target.rushingYards), 3);
    const linearPairs = validate.map((r) => pair(r.target.rushingYards, scoreRidgeModel(linearModel, encodeRushingFeatureRow(r, fallbacksBase, { allowPriorSeasonFallback: true, includePosition: true }))));
    // No market at all.
    const noMarketExcluded = new Set(["market" as const]);
    const noMarketModel = fitRidgeModel(train.map((r) => ablateRushingGroups(encodeRushingFeatureRow(r, fallbacksBase, { allowPriorSeasonFallback: true, includePosition: true }), fallbacksBase, noMarketExcluded)), train.map((r) => r.target.rushingYards), 3);
    const noMarketPairs = validate.map((r) => pair(r.target.rushingYards, scoreRidgeModel(noMarketModel, ablateRushingGroups(encodeRushingFeatureRow(r, fallbacksBase, { allowPriorSeasonFallback: true, includePosition: true }), fallbacksBase, noMarketExcluded))));
    // Nonlinear market additions.
    const nonlinearFallbacks = [...fallbacksBase, 0, 0, 0, 0, 0];
    const nonlinearModel = fitRidgeModel(train.map((r) => encodeWithNonlinear(r, fallbacksBase)), train.map((r) => r.target.rushingYards), 3);
    const nonlinearPairs = validate.map((r) => pair(r.target.rushingYards, scoreRidgeModel(nonlinearModel, encodeWithNonlinear(r, fallbacksBase))));
    void nonlinearFallbacks; void RUSHING_FEATURE_KEYS;
    return { fold: fold.name, linearMarket: computeMetrics(linearPairs)?.mae, noMarket: computeMetrics(noMarketPairs)?.mae, nonlinearMarket: computeMetrics(nonlinearPairs)?.mae };
  });
  return {
    perFold: foldResults,
    avgLinearMarket: average(foldResults.map((f) => f.linearMarket ?? null).filter((v): v is number => v != null)),
    avgNoMarket: average(foldResults.map((f) => f.noMarket ?? null).filter((v): v is number => v != null)),
    avgNonlinearMarket: average(foldResults.map((f) => f.nonlinearMarket ?? null).filter((v): v is number => v != null)),
  };
}
const rushingNonlinearMarket = rushingNonlinearMarketTest();

// ===== RECEIVING =====================================================================

const receivingOutcomes = (JSON.parse(readFileSync(join(DATA_DIR, `receiving-outcomes-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`), "utf8")) as { rows: NflReceivingOutcome[] }).rows;
const airYardsByPlayerWeek = new Map<string, NflAirYardsSupplement>();
{
  const statsManifest = readManifest(STATS_CACHE_DIR);
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
}
const playerReceivingStatLog = buildPlayerReceivingStatLog(receivingOutcomes, gameJoinIndex, airYardsByPlayerWeek);
const teamTopTargetShareByGameTeam = buildTeamTopTargetShareByGameTeam(receivingOutcomes);
const receivingFeatureRows: NflReceivingFeatureRow[] = receivingOutcomes.map((o) =>
  buildReceivingFeatureRow(o, { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, passEpaGameLog, marketByKey, domeByGameId, playerReceivingStatLog, teamTopTargetShareByGameTeam }),
);
const receivingDev = receivingFeatureRows.filter((r) => r.season !== FROZEN_BENCHMARK_SEASON);
const receivingFrozen = receivingFeatureRows.filter((r) => r.season === FROZEN_BENCHMARK_SEASON);
const receivingFinalTrain = receivingDev.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));
const receivingConstants = computeReceivingBaselineConstants(receivingFinalTrain);
const receivingFallbackTargets = receivingConstants.leagueMeanReceivingYards / receivingConstants.leagueMeanYardsPerTarget;
const predictReceiving = (r: NflReceivingFeatureRow) => predictReceivingBaselineC(r, receivingConstants, receivingFallbackTargets);
const receivingFrozenResults = receivingFrozen.map((r) => ({ row: r, ...predictReceiving(r) }));
const receivingFrozenPairs = receivingFrozenResults.map((r) => pair(r.row.target.receivingYards, r.predicted));

const receivingOutcomeBySeason2025 = receivingOutcomes.filter((o) => o.season === FROZEN_BENCHMARK_SEASON);
const receivingByKey = new Map(receivingOutcomeBySeason2025.map((o) => [`${o.season}|${o.week}|${o.playerId}`, o]));
const receivingComponentRows = receivingFrozenResults.map((r) => {
  const actual = receivingByKey.get(`${r.row.season}|${r.row.week}|${r.row.playerId}`)!;
  return { projectedTargets: r.projectedTargets, actualTargets: actual.targets, projectedYpt: r.projectedYpt, actualYpt: actual.yardsPerTarget };
});
const receivingComponentBias = {
  targetsBias: average(receivingComponentRows.map((r) => r.projectedTargets - r.actualTargets)),
  yptBias: average(receivingComponentRows.filter((r) => r.actualTargets > 0).map((r) => r.projectedYpt - r.actualYpt)),
};

function receivingNonlinearMarketTest() {
  function encodeWithNonlinear(r: NflReceivingFeatureRow, fallbacks: number[]): number[] {
    const base = encodeReceivingFeatureRow(r, fallbacks, { allowPriorSeasonFallback: true, includePosition: true });
    const targets = coalesceWindow(r.features.playerUsage.targetsPerGame) ?? 0;
    const spread = r.features.market.spread;
    const largeFav = spread != null && spread <= -7 ? 1 : 0;
    const totalHigh = r.features.market.total != null && r.features.market.total >= 47 ? 1 : 0;
    return [...base, largeFav, totalHigh, (spread ?? 0) * targets];
  }
  const foldResults = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(receivingDev, fold);
    const fallbacksBase = computeReceivingTrainFallbacks(train);
    const options = { allowPriorSeasonFallback: true, includePosition: true };
    const linearModel = fitRidgeModel(train.map((r) => encodeReceivingFeatureRow(r, fallbacksBase, options)), train.map((r) => r.target.receivingYards), 0.1);
    const linearPairs = validate.map((r) => pair(r.target.receivingYards, scoreRidgeModel(linearModel, encodeReceivingFeatureRow(r, fallbacksBase, options))));
    const nonlinearModel = fitRidgeModel(train.map((r) => encodeWithNonlinear(r, fallbacksBase)), train.map((r) => r.target.receivingYards), 0.1);
    const nonlinearPairs = validate.map((r) => pair(r.target.receivingYards, scoreRidgeModel(nonlinearModel, encodeWithNonlinear(r, fallbacksBase))));
    void RECEIVING_FEATURE_KEYS;
    return { fold: fold.name, linearMarket: computeMetrics(linearPairs)?.mae, nonlinearMarket: computeMetrics(nonlinearPairs)?.mae };
  });
  return {
    perFold: foldResults,
    avgLinearMarket: average(foldResults.map((f) => f.linearMarket ?? null).filter((v): v is number => v != null)),
    avgNonlinearMarket: average(foldResults.map((f) => f.nonlinearMarket ?? null).filter((v): v is number => v != null)),
  };
}
const receivingNonlinearMarket = receivingNonlinearMarketTest();

// ===== CALIBRATION (2025 frozen benchmark, all markets) ==========================

const passingCuts = (() => {
  const sorted = [...passingFrozenPairs.map((p) => p.predicted)].sort((a, b) => a - b);
  return [sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((2 * sorted.length) / 3)]];
})();
const rushingCuts = (() => {
  const sorted = [...rushingFrozenPairs.map((p) => p.predicted)].sort((a, b) => a - b);
  return [sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((2 * sorted.length) / 3)]];
})();
const receivingCuts = (() => {
  const sorted = [...receivingFrozenPairs.map((p) => p.predicted)].sort((a, b) => a - b);
  return [sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((2 * sorted.length) / 3)]];
})();

const passingCalibration = {
  overall: biasBucket(passingFrozenPairs),
  byPredictedBucket: metricsByGroup(passingFrozenPairs, (p) => predictedTercile(p.predicted, passingCuts[0], passingCuts[1]), (p) => p),
  byWeekBand: metricsByGroup(passingFrozen.map((r, i) => ({ r, p: passingFrozenPairs[i] })), (e) => weekBand(e.r.week), (e) => e.p),
  byHistory: metricsByGroup(
    passingFrozen.map((r, i) => ({ r, p: passingFrozenPairs[i] })),
    (e) => (e.r.diagnostics.gamesStartedPriorThisSeason === 0 && !e.r.diagnostics.hasPriorSeasonStarts ? "noHistory" : e.r.diagnostics.gamesStartedPriorThisSeason < 3 ? "lowHistory" : "established"),
    (e) => e.p,
  ),
};
const rushingCalibration = {
  overall: biasBucket(rushingFrozenPairs),
  byPredictedBucket: metricsByGroup(rushingFrozenPairs, (p) => predictedTercile(p.predicted, rushingCuts[0], rushingCuts[1]), (p) => p),
  byWeekBand: metricsByGroup(rushingFrozen.map((r, i) => ({ r, p: rushingFrozenPairs[i] })), (e) => weekBand(e.r.week), (e) => e.p),
  byPosition: metricsByGroup(rushingFrozen.map((r, i) => ({ r, p: rushingFrozenPairs[i] })), (e) => e.r.diagnostics.position, (e) => e.p),
};
const receivingCalibration = {
  overall: biasBucket(receivingFrozenPairs),
  byPredictedBucket: metricsByGroup(receivingFrozenPairs, (p) => predictedTercile(p.predicted, receivingCuts[0], receivingCuts[1]), (p) => p),
  byWeekBand: metricsByGroup(receivingFrozen.map((r, i) => ({ r, p: receivingFrozenPairs[i] })), (e) => weekBand(e.r.week), (e) => e.p),
  byPosition: metricsByGroup(receivingFrozen.map((r, i) => ({ r, p: receivingFrozenPairs[i] })), (e) => e.r.diagnostics.position, (e) => e.p),
};

// ===== PREDICTION INTERVALS (built on dev folds, coverage checked on 2025) =========

function devPairsFor(market: "passing" | "rushing" | "receiving"): NflOpportunityPredictionPair[] {
  if (market === "passing") {
    const { train, validate } = splitByFold(passingDev, TEMPORAL_FOLDS[1]);
    const { model, fallbacks } = fitPassingDirect(train, passingBestAlpha);
    return validate.map((r) => pair(r.target.primaryQbPassingYards, scoreRidgeModel(model, encodePassingFeatureRow(r, fallbacks))));
  }
  if (market === "rushing") {
    const { train, validate } = splitByFold(rushingDev, TEMPORAL_FOLDS[1]);
    const constants = computeRushingBaselineConstants(train);
    const fallback = constants.leagueMeanRushingYards / constants.leagueMeanYardsPerCarry;
    return validate.map((r) => pair(r.target.rushingYards, predictRushingBaselineC(r, constants, fallback).predicted));
  }
  const { train, validate } = splitByFold(receivingDev, TEMPORAL_FOLDS[1]);
  const constants = computeReceivingBaselineConstants(train);
  const fallback = constants.leagueMeanReceivingYards / constants.leagueMeanYardsPerTarget;
  return validate.map((r) => pair(r.target.receivingYards, predictReceivingBaselineC(r, constants, fallback).predicted));
}

const passingIntervalDev = devPairsFor("passing");
const rushingIntervalDev = devPairsFor("rushing");
const receivingIntervalDev = devPairsFor("receiving");

const passingQuantiles = computeResidualQuantiles(passingIntervalDev, 0.9);
const rushingQuantiles = computeResidualQuantiles(rushingIntervalDev, 0.9);
const receivingQuantiles = computeResidualQuantiles(receivingIntervalDev, 0.9);

const predictionIntervalReport = {
  passing: { nominalLevel: 0.9, realizedCoverage2025: realizedCoverage(passingFrozenPairs, passingQuantiles), avgWidth2025: averageIntervalWidth(passingFrozenPairs, passingQuantiles), devSampleSize: passingQuantiles.sampleSize },
  rushing: { nominalLevel: 0.9, realizedCoverage2025: realizedCoverage(rushingFrozenPairs, rushingQuantiles), avgWidth2025: averageIntervalWidth(rushingFrozenPairs, rushingQuantiles), devSampleSize: rushingQuantiles.sampleSize },
  receiving: { nominalLevel: 0.9, realizedCoverage2025: realizedCoverage(receivingFrozenPairs, receivingQuantiles), avgWidth2025: averageIntervalWidth(receivingFrozenPairs, receivingQuantiles), devSampleSize: receivingQuantiles.sampleSize },
};

// ===== HARD-CASE SEGMENTS (2025) =====================================================

function residualStdDev(pairs: readonly NflOpportunityPredictionPair[]): number {
  const residuals = pairs.map((p) => p.actual - p.predicted);
  const mean = average(residuals) ?? 0;
  return Math.sqrt(average(residuals.map((r) => (r - mean) ** 2)) ?? 0);
}
const passingMultiQb = passingFrozen.map((r, i) => ({ r, p: passingFrozenPairs[i] })).filter((e) => e.r.diagnostics.instabilityCategory === "multiQbGame").map((e) => e.p);
const passingNoHistory = passingFrozen.map((r, i) => ({ r, p: passingFrozenPairs[i] })).filter((e) => e.r.diagnostics.gamesStartedPriorThisSeason === 0 && !e.r.diagnostics.hasPriorSeasonStarts).map((e) => e.p);
const rushingCommittee = rushingFrozen.map((r, i) => ({ r, p: rushingFrozenPairs[i] })).filter((e) => (e.r.diagnostics.recentTeamTopCarryShareConcentration ?? 1) < 0.6).map((e) => e.p);
const rushingHighVolume = rushingFrozen.map((r, i) => ({ r, p: rushingFrozenPairs[i] })).filter((e) => (e.r.features.playerUsage.carriesPerGame.seasonPrior ?? 0) >= 12).map((e) => e.p);
const receivingZeroTarget = receivingFrozen.map((r, i) => ({ r, p: receivingFrozenPairs[i] })).filter((e) => e.r.diagnostics.zeroTargetFlag).map((e) => e.p);
const receivingLowHistory = receivingFrozen.map((r, i) => ({ r, p: receivingFrozenPairs[i] })).filter((e) => e.r.diagnostics.gamesWithTargetsPriorThisSeason < 3).map((e) => e.p);

function hardCaseSummary(pairs: readonly NflOpportunityPredictionPair[]) {
  return { n: pairs.length, ...computeMetrics(pairs), residualStdDev: residualStdDev(pairs) };
}
const hardCaseSegments = {
  passing_multiQbGames: hardCaseSummary(passingMultiQb),
  passing_noHistory: hardCaseSummary(passingNoHistory),
  rushing_committeeBackfields: hardCaseSummary(rushingCommittee),
  rushing_highVolumeBacks: hardCaseSummary(rushingHighVolume),
  receiving_zeroTarget: hardCaseSummary(receivingZeroTarget),
  receiving_lowHistory: hardCaseSummary(receivingLowHistory),
};

// ===== CROSS-MARKET BENCHMARK TABLE =================================================

function normalizedErrors(metrics: ReturnType<typeof computeMetrics>, meanActual: number) {
  if (!metrics) return null;
  return { maeOverMean: metrics.mae / meanActual, rmseOverMean: metrics.rmse / meanActual };
}
const passingMetrics2025 = computeMetrics(passingFrozenPairs)!;
const rushingMetrics2025 = computeMetrics(rushingFrozenPairs)!;
const receivingMetrics2025 = computeMetrics(receivingFrozenPairs)!;
const crossMarketTable = [
  { market: "passing", architecture: "direct regularized model (ridge)", devMae: average(passingRecal.map((f) => f.pooled?.mae ?? null).filter((v): v is number => v != null)), frozenMae: passingMetrics2025.mae, bias: passingMetrics2025.bias, r2: passingMetrics2025.r2, mainSignal: "market context (spread/total/implied total)", mainUncertainty: "multi-QB instability", ...normalizedErrors(passingMetrics2025, distribution(passingFrozen.map((r) => r.target.primaryQbPassingYards)).mean ?? 1) },
  { market: "rushing", architecture: "projected carries x shrunk YPC", devMae: 12.484, frozenMae: rushingMetrics2025.mae, bias: rushingMetrics2025.bias, r2: rushingMetrics2025.r2, mainSignal: "player usage (carries)", mainUncertainty: "committee concentration", ...normalizedErrors(rushingMetrics2025, distribution(rushingFrozen.map((r) => r.target.rushingYards)).mean ?? 1) },
  { market: "receiving", architecture: "projected targets x shrunk YPT", devMae: 16.642, frozenMae: receivingMetrics2025.mae, bias: receivingMetrics2025.bias, r2: receivingMetrics2025.r2, mainSignal: "player usage (targets)", mainUncertainty: "zero-target risk / low history", ...normalizedErrors(receivingMetrics2025, distribution(receivingFrozen.map((r) => r.target.receivingYards)).mean ?? 1) },
];

// ===== WRITE =========================================================================

const report = {
  _meta: { schemaVersion: "nfl-cross-market-projection-review-v1", generatedAt: new Date().toISOString(), frozenBenchmarkSeason: FROZEN_BENCHMARK_SEASON },
  crossMarketBenchmarkTable: crossMarketTable,
  calibration: { passing: passingCalibration, rushing: rushingCalibration, receiving: receivingCalibration },
  passingRecalibrationTestOnDevFolds: { perFold: passingRecal, summary: passingRecalSummary },
  componentBias2025: { rushing: rushingComponentBiasFinal, receiving: receivingComponentBias },
  nonlinearMarketTestOnDevFolds: { rushing: rushingNonlinearMarket, receiving: receivingNonlinearMarket },
  predictionIntervals: predictionIntervalReport,
  hardCaseSegments2025: hardCaseSegments,
};

const output = join(DATA_DIR, "cross-market-projection-review.json");
writeAtomic(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote cross-market projection review to ${output}`);
console.log("Cross-market table:", JSON.stringify(crossMarketTable, null, 2));
console.log("Passing recalibration:", passingRecalSummary);
console.log("Component bias:", report.componentBias2025);
console.log("Nonlinear market (rushing):", rushingNonlinearMarket);
console.log("Nonlinear market (receiving):", receivingNonlinearMarket);
console.log("Prediction intervals:", predictionIntervalReport);
