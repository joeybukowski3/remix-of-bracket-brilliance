/**
 * RESEARCH ONLY -- controlled historical model-enhancement study for rushing
 * and receiving yardage (2022-2025). Tests whether opponent/team/game/role
 * context improves the frozen production baselines
 * (carries x shrunk YPC / targets x shrunk YPT) out of sample.
 *
 * Does NOT modify, import from as a target, or write to any production
 * model file. Reuses the existing leakage-safe feature-row infrastructure
 * under src/lib/nfl/props/** (rushingFeatures.ts, receivingFeatures.ts,
 * rushingEncoding.ts, receivingEncoding.ts, temporalValidation.ts, ridge.ts)
 * read-only, plus one new research-only reconstruction:
 * src/lib/nfl/research/opponentProductionAllowedHistorical.ts (pregame
 * opponent yards-allowed by position, which the existing feature rows do
 * not carry).
 *
 * Every RN/CN model is: [baseline decomposition legs (train-fold-fit
 * carries/targets x shrunk YPC/YPT)] + [exactly the named family's raw
 * feature(s), leakage-safe] -> ridge regression, standardized on TRAIN
 * rows only. This is an incremental-family test (R0 + one family), not the
 * leave-one-out ablation the existing baseline-competition reports already
 * contain (data/nfl/props/rushing-baseline-competition-v2-*.json,
 * receiving-baseline-competition-*.json) -- both are reported in the final
 * study output for cross-validation.
 *
 * Rolling-origin dev folds are confined to 2022-2024 (TEMPORAL_FOLDS); 2025
 * is loaded once and evaluated once as a fixed retrospective benchmark,
 * exactly as the existing baseline-competition scripts do. No feature,
 * model, or alpha is ever selected using 2025.
 *
 * QB passing is out of scope: this script only builds rushing (RB-focused,
 * QB retained per the existing feature-row population but not the point of
 * the study) and receiving (RB/WR/TE) models.
 *
 * Usage: tsx scripts/research/nfl-yardage-context-family-study.ts
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, gameJoinKey, type NflPropRawGameRecord } from "../../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures, type NflTeamGameLogEntry } from "../../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "../../src/lib/nfl/props/types/teamPregameFeatures";
import type { NflRushingOutcome } from "../../src/lib/nfl/props/types/rushingOutcome";
import type { NflReceivingOutcome } from "../../src/lib/nfl/props/types/receivingOutcome";
import { buildTeamEpaGameLog, type NflTeamEpaGameLogEntry, type NflTeamEpaGameRecord } from "../../src/lib/nfl/props/qbPassingEpaContext";
import { buildPlayerRushingStatLog, buildRushingFeatureRow, buildTeamTopRbCarryShareByGameTeam } from "../../src/lib/nfl/props/rushingFeatures";
import type { NflRushingFeatureRow } from "../../src/lib/nfl/props/types/rushingFeatures";
import { buildPlayerReceivingStatLog, buildReceivingFeatureRow, buildTeamTopTargetShareByGameTeam, type NflAirYardsSupplement } from "../../src/lib/nfl/props/receivingFeatures";
import type { NflReceivingFeatureRow } from "../../src/lib/nfl/props/types/receivingFeatures";
import { marketKey, type NflHistoricalMarketRow } from "../../src/lib/nfl/props/qbOpportunityFeatures";
import {
  ablateRushingGroups, computeRushingTrainFallbacks, encodeRushingFeatureRow,
  RUSHING_FEATURE_GROUPS, type NflRushingFeatureGroup,
} from "../../src/lib/nfl/props/rushingEncoding";
import {
  ablateReceivingGroups, computeReceivingTrainFallbacks, encodeReceivingFeatureRow,
  RECEIVING_FEATURE_GROUPS, type NflReceivingFeatureGroup,
} from "../../src/lib/nfl/props/receivingEncoding";
import { computeRushingBaselineConstants, predictRushingBaselineC } from "../../src/lib/nfl/props/rushingBaselines";
import { computeReceivingBaselineConstants, predictReceivingBaselineC } from "../../src/lib/nfl/props/receivingBaselines";
import { fitRidgeModel, scoreRidgeModel, RIDGE_ALPHA_GRID } from "../../src/lib/nfl/props/ridge";
import { computeMetrics, metricsByGroup, weekBand, type NflOpportunityMetrics, type NflOpportunityPredictionPair } from "../../src/lib/nfl/props/qbOpportunityEvaluation";
import { TEMPORAL_FOLDS, FROZEN_BENCHMARK_SEASON, FINAL_TRAIN_SEASONS, splitByFold, average } from "../../src/lib/nfl/props/temporalValidation";
import {
  buildHistoricalProductionAllowedGameLog, resolveHistoricalProductionAllowedWindow,
  type NflHistoricalProductionAllowedGameEntry,
} from "../../src/lib/nfl/research/opponentProductionAllowedHistorical";
import { parseCsv } from "../lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "../lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const EPA_CACHE_DIR = "data/nfl/nflverse/epa-team-game";
const STATS_CACHE_DIR = "data/nfl/nflverse/stats-player-week";
const PROPS_DIR = join(ROOT, "data", "nfl", "props");
const RESEARCH_DIR = join(ROOT, "data", "nfl", "research");
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
function toEpaRecord(row: CsvRow, field: "rush_epa" | "pass_epa"): NflTeamEpaGameRecord {
  const num = (f: string) => Number(String(row[f] ?? "").trim());
  return {
    gameId: String(row.game_id ?? "").trim(), season: num("season"), week: num("week"),
    team: String(row.team ?? "").trim(), opponent: String(row.opponent ?? "").trim(),
    passEpa: num(field), passPlays: num(field === "rush_epa" ? "rush_plays" : "pass_plays"),
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

// === load shared inputs (identical sources/caches to the existing baseline-competition scripts) ===

const rushingOutcomesPath = join(PROPS_DIR, `rushing-outcomes-v2-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
if (!existsSync(rushingOutcomesPath)) throw new Error(`Missing ${rushingOutcomesPath}. Run npm run nfl:rushing-outcomes-v2 first.`);
const rushingOutcomes = (JSON.parse(readFileSync(rushingOutcomesPath, "utf8")) as { rows: NflRushingOutcome[] }).rows;

const receivingOutcomesPath = join(PROPS_DIR, `receiving-outcomes-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
if (!existsSync(receivingOutcomesPath)) throw new Error(`Missing ${receivingOutcomesPath}. Run npm run nfl:receiving-outcomes first.`);
const receivingOutcomes = (JSON.parse(readFileSync(receivingOutcomesPath, "utf8")) as { rows: NflReceivingOutcome[] }).rows;

const marketPath = join(PROPS_DIR, `historical-market-context-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
const marketByKey = new Map(
  (JSON.parse(readFileSync(marketPath, "utf8")) as { rows: NflHistoricalMarketRow[] }).rows.map((r) => [marketKey(r.season, r.week, r.team), r]),
);

const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
const epaManifest = readManifest(EPA_CACHE_DIR);
const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
const rushEpaRecords: NflTeamEpaGameRecord[] = [];
const passEpaRecords: NflTeamEpaGameRecord[] = [];
const allGames: (NflPropRawGameRecord & { isDome?: boolean })[] = [];
for (const season of ALL_SEASONS) {
  const pv = verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season);
  if (!pv) throw new Error(`Play-volume source for ${season} not cached.`);
  for (const row of pv) playVolumeRecords.push(toPlayVolumeRecord(row));
  const epa = verifiedCsvRows(EPA_CACHE_DIR, epaManifest, season);
  if (!epa) throw new Error(`EPA source for ${season} not cached.`);
  for (const row of epa) { rushEpaRecords.push(toEpaRecord(row, "rush_epa")); passEpaRecords.push(toEpaRecord(row, "pass_epa")); }
  allGames.push(...readSeasonGames(season));
}
const gameJoinIndex = buildGameJoinIndex(allGames);
const fullTeamGameLog: NflTeamGameLogEntry[] = buildTeamGameLog(playVolumeRecords, gameJoinIndex);
const rushEpaGameLog: NflTeamEpaGameLogEntry[] = buildTeamEpaGameLog(rushEpaRecords, gameJoinIndex);
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

const playerRushingStatLog = buildPlayerRushingStatLog(rushingOutcomes, gameJoinIndex);
const teamTopRbCarryShareByGameTeam = buildTeamTopRbCarryShareByGameTeam(rushingOutcomes);
const playerReceivingStatLog = buildPlayerReceivingStatLog(receivingOutcomes, gameJoinIndex, airYardsByPlayerWeek);
const teamTopTargetShareByGameTeam = buildTeamTopTargetShareByGameTeam(receivingOutcomes);

const rushingFeatureRows: NflRushingFeatureRow[] = rushingOutcomes.map((o) =>
  buildRushingFeatureRow(o, {
    gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, rushEpaGameLog, marketByKey, domeByGameId,
    playerRushingStatLog, teamTopRbCarryShareByGameTeam,
  }),
);
const receivingFeatureRows: NflReceivingFeatureRow[] = receivingOutcomes.map((o) =>
  buildReceivingFeatureRow(o, {
    gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, passEpaGameLog, marketByKey, domeByGameId,
    playerReceivingStatLog, teamTopTargetShareByGameTeam,
  }),
);

// === NEW research-only feature: leakage-safe historical opponent production-allowed ===

function resolveGameDateUtc(season: number, week: number, team: string): string | null {
  return gameJoinIndex.get(gameJoinKey(season, week, team))?.gameDateUtc ?? null;
}
const productionAllowedLog: NflHistoricalProductionAllowedGameEntry[] = buildHistoricalProductionAllowedGameLog(
  rushingOutcomes, receivingOutcomes, resolveGameDateUtc,
);

function rushOpponentAllowedFeature(row: NflRushingFeatureRow): number | null {
  const dateUtc = resolveGameDateUtc(row.season, row.week, row.team);
  if (!dateUtc) return null;
  const field = row.diagnostics.position === "RB" ? "rushingYardsRB" : "rushingYardsAll";
  const window = resolveHistoricalProductionAllowedWindow(productionAllowedLog, row.opponent, row.season, dateUtc, field);
  return window.seasonPrior ?? window.priorSeason; // leakage-safe fallback to the entirely-prior season only, never a current-season future value
}
function receivingOpponentAllowedFeature(row: NflReceivingFeatureRow): number | null {
  const dateUtc = resolveGameDateUtc(row.season, row.week, row.team);
  if (!dateUtc) return null;
  const field = row.diagnostics.position === "WR" ? "receivingYardsWR" : row.diagnostics.position === "TE" ? "receivingYardsTE" : "receivingYardsRB";
  const window = resolveHistoricalProductionAllowedWindow(productionAllowedLog, row.opponent, row.season, dateUtc, field);
  return window.seasonPrior ?? window.priorSeason;
}

// === generic incremental-family ridge harness ===
// Every RN/CN model = baseline decomposition legs (train-fit) + exactly the
// named family's raw feature(s). All other groups are ablated to the
// train-fold mean (never used, never leaked).

function trainMeanOf(values: readonly (number | null)[]): number {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  return finite.length > 0 ? finite.reduce((s, v) => s + v, 0) / finite.length : 0;
}

function fitRushingFamilyModel(
  train: readonly NflRushingFeatureRow[],
  validate: readonly NflRushingFeatureRow[],
  keepGroups: ReadonlySet<NflRushingFeatureGroup>,
  extraFeature: ((row: NflRushingFeatureRow) => number | null) | null,
  alpha: number,
): { metrics: NflOpportunityMetrics | null } {
  const options = { allowPriorSeasonFallback: true, includePosition: true };
  const fallbacks = computeRushingTrainFallbacks(train, { allowPriorSeasonFallback: true });
  const excluded = new Set(RUSHING_FEATURE_GROUPS.filter((g) => !keepGroups.has(g)));
  const constants = computeRushingBaselineConstants(train);
  const fallbackCarries = constants.leagueMeanRushingYards / constants.leagueMeanYardsPerCarry;
  const extraTrainMean = extraFeature ? trainMeanOf(train.map(extraFeature)) : 0;

  const encodeRow = (row: NflRushingFeatureRow) => {
    const legs = predictRushingBaselineC(row, constants, fallbackCarries);
    const base = ablateRushingGroups(encodeRushingFeatureRow(row, fallbacks, options), fallbacks, excluded);
    const withLegs = [...base, legs.projectedCarries, legs.projectedYpc];
    return extraFeature ? [...withLegs, extraFeature(row) ?? extraTrainMean] : withLegs;
  };

  const model = fitRidgeModel(train.map(encodeRow), train.map((r) => r.target.rushingYards), alpha);
  const pairs = validate.map((r) => ({ actual: r.target.rushingYards, predicted: scoreRidgeModel(model, encodeRow(r)) }));
  return { metrics: computeMetrics(pairs) };
}

function fitReceivingFamilyModel(
  train: readonly NflReceivingFeatureRow[],
  validate: readonly NflReceivingFeatureRow[],
  keepGroups: ReadonlySet<NflReceivingFeatureGroup>,
  extraFeature: ((row: NflReceivingFeatureRow) => number | null) | null,
  alpha: number,
): { metrics: NflOpportunityMetrics | null } {
  const options = { allowPriorSeasonFallback: true, includePosition: true };
  const fallbacks = computeReceivingTrainFallbacks(train, { allowPriorSeasonFallback: true });
  const excluded = new Set(RECEIVING_FEATURE_GROUPS.filter((g) => !keepGroups.has(g)));
  const constants = computeReceivingBaselineConstants(train);
  const fallbackTargets = constants.leagueMeanReceivingYards / constants.leagueMeanYardsPerTarget;
  const extraTrainMean = extraFeature ? trainMeanOf(train.map(extraFeature)) : 0;

  const encodeRow = (row: NflReceivingFeatureRow) => {
    const legs = predictReceivingBaselineC(row, constants, fallbackTargets);
    const base = ablateReceivingGroups(encodeReceivingFeatureRow(row, fallbacks, options), fallbacks, excluded);
    const withLegs = [...base, legs.projectedTargets, legs.projectedYpt];
    return extraFeature ? [...withLegs, extraFeature(row) ?? extraTrainMean] : withLegs;
  };

  const model = fitRidgeModel(train.map(encodeRow), train.map((r) => r.target.receivingYards), alpha);
  const pairs = validate.map((r) => ({ actual: r.target.receivingYards, predicted: scoreRidgeModel(model, encodeRow(r)) }));
  return { metrics: computeMetrics(pairs) };
}

const SELECTED_ALPHA = 10; // fixed, matches the already-selected D-model alpha in rushing-baseline-competition-v2 (preregistered choice, not tuned here)

// === Rushing R0-R5 ===

const rushDev = rushingFeatureRows.filter((r) => r.season !== FROZEN_BENCHMARK_SEASON);
const rushFrozen = rushingFeatureRows.filter((r) => r.season === FROZEN_BENCHMARK_SEASON);

type RushFamilyDef = { name: string; keepGroups: NflRushingFeatureGroup[]; extra: ((r: NflRushingFeatureRow) => number | null) | null };
const RUSH_FAMILIES: RushFamilyDef[] = [
  { name: "R0_baseline", keepGroups: [], extra: null }, // legs only -- pure decomposition baseline, no ridge context
  { name: "R1_opponentRushEfficiency", keepGroups: ["opponentRushDefense"], extra: null },
  { name: "R2_opponentProductionAllowed", keepGroups: [], extra: rushOpponentAllowedFeature },
  { name: "R3_teamGameEnvironment", keepGroups: ["teamEnvironment", "market"], extra: null },
  { name: "R4_roleCommitteeContext", keepGroups: [], extra: (r) => r.diagnostics.recentTeamTopCarryShareConcentration },
  { name: "R5_bestCombination_opponentEfficiencyAndProductionAllowed", keepGroups: ["opponentRushDefense"], extra: rushOpponentAllowedFeature },
];

function pairRush(row: NflRushingFeatureRow, predicted: number): NflOpportunityPredictionPair {
  return { actual: row.target.rushingYards, predicted };
}
function rushBaselineC0Pairs(rows: readonly NflRushingFeatureRow[], constants: ReturnType<typeof computeRushingBaselineConstants>, fallbackCarries: number) {
  return rows.map((r) => pairRush(r, predictRushingBaselineC(r, constants, fallbackCarries).predicted));
}

const rushDevResults = RUSH_FAMILIES.map((family) => {
  const foldMetrics = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(rushDev, fold);
    if (family.name === "R0_baseline") {
      const constants = computeRushingBaselineConstants(train);
      const fallbackCarries = constants.leagueMeanRushingYards / constants.leagueMeanYardsPerCarry;
      return computeMetrics(rushBaselineC0Pairs(validate, constants, fallbackCarries));
    }
    return fitRushingFamilyModel(train, validate, new Set(family.keepGroups), family.extra, SELECTED_ALPHA).metrics;
  });
  return {
    family: family.name,
    perFold: TEMPORAL_FOLDS.map((f, i) => ({ fold: f.name, metrics: foldMetrics[i] })),
    avgMae: average(foldMetrics.map((m) => m?.mae ?? null).filter((v): v is number => v != null)),
    avgBias: average(foldMetrics.map((m) => m?.bias ?? null).filter((v): v is number => v != null)),
  };
});

const finalRushTrain = rushDev.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));
const rushFrozenResults = RUSH_FAMILIES.map((family) => {
  let metrics: NflOpportunityMetrics | null;
  let predictFn: (row: NflRushingFeatureRow) => number;
  if (family.name === "R0_baseline") {
    const constants = computeRushingBaselineConstants(finalRushTrain);
    const fallbackCarries = constants.leagueMeanRushingYards / constants.leagueMeanYardsPerCarry;
    predictFn = (r) => predictRushingBaselineC(r, constants, fallbackCarries).predicted;
    metrics = computeMetrics(rushFrozen.map((r) => pairRush(r, predictFn(r))));
  } else {
    const options = { allowPriorSeasonFallback: true, includePosition: true };
    const fallbacks = computeRushingTrainFallbacks(finalRushTrain, { allowPriorSeasonFallback: true });
    const excluded = new Set(RUSHING_FEATURE_GROUPS.filter((g) => !family.keepGroups.includes(g)));
    const constants = computeRushingBaselineConstants(finalRushTrain);
    const fallbackCarries = constants.leagueMeanRushingYards / constants.leagueMeanYardsPerCarry;
    const extraTrainMean = family.extra ? trainMeanOf(finalRushTrain.map(family.extra)) : 0;
    const encodeRow = (row: NflRushingFeatureRow) => {
      const legs = predictRushingBaselineC(row, constants, fallbackCarries);
      const base = ablateRushingGroups(encodeRushingFeatureRow(row, fallbacks, options), fallbacks, excluded);
      const withLegs = [...base, legs.projectedCarries, legs.projectedYpc];
      return family.extra ? [...withLegs, family.extra(row) ?? extraTrainMean] : withLegs;
    };
    const model = fitRidgeModel(finalRushTrain.map(encodeRow), finalRushTrain.map((r) => r.target.rushingYards), SELECTED_ALPHA);
    predictFn = (r) => scoreRidgeModel(model, encodeRow(r));
    metrics = computeMetrics(rushFrozen.map((r) => pairRush(r, predictFn(r))));
  }
  const byPosition = metricsByGroup(rushFrozen, (r) => r.diagnostics.position, (r) => pairRush(r, predictFn(r)));
  const byWeekBand = metricsByGroup(rushFrozen, (r) => weekBand(r.week), (r) => pairRush(r, predictFn(r)));
  return { family: family.name, overall: metrics, byPosition, byWeekBand };
});

// === Receiving C0-C5 ===

const recDev = receivingFeatureRows.filter((r) => r.season !== FROZEN_BENCHMARK_SEASON);
const recFrozen = receivingFeatureRows.filter((r) => r.season === FROZEN_BENCHMARK_SEASON);

type RecFamilyDef = { name: string; keepGroups: NflReceivingFeatureGroup[]; extra: ((r: NflReceivingFeatureRow) => number | null) | null };
const REC_FAMILIES: RecFamilyDef[] = [
  { name: "C0_baseline", keepGroups: [], extra: null },
  { name: "C1_opponentPassEfficiency", keepGroups: ["opponentPassDefense"], extra: null },
  { name: "C2_positionSpecificProductionAllowed", keepGroups: [], extra: receivingOpponentAllowedFeature },
  { name: "C3_teamGameEnvironment", keepGroups: ["teamEnvironment", "market"], extra: null },
  { name: "C4_targetTreeRoleContext", keepGroups: ["targetConcentration"], extra: null },
  { name: "C5_bestCombination_opponentEfficiencyAndProductionAllowed", keepGroups: ["opponentPassDefense"], extra: receivingOpponentAllowedFeature },
];

function pairRec(row: NflReceivingFeatureRow, predicted: number): NflOpportunityPredictionPair {
  return { actual: row.target.receivingYards, predicted };
}
function recBaselineC0Pairs(rows: readonly NflReceivingFeatureRow[], constants: ReturnType<typeof computeReceivingBaselineConstants>, fallbackTargets: number) {
  return rows.map((r) => pairRec(r, predictReceivingBaselineC(r, constants, fallbackTargets).predicted));
}

const recDevResults = REC_FAMILIES.map((family) => {
  const foldMetrics = TEMPORAL_FOLDS.map((fold) => {
    const { train, validate } = splitByFold(recDev, fold);
    if (family.name === "C0_baseline") {
      const constants = computeReceivingBaselineConstants(train);
      const fallbackTargets = constants.leagueMeanReceivingYards / constants.leagueMeanYardsPerTarget;
      return computeMetrics(recBaselineC0Pairs(validate, constants, fallbackTargets));
    }
    return fitReceivingFamilyModel(train, validate, new Set(family.keepGroups), family.extra, SELECTED_ALPHA).metrics;
  });
  return {
    family: family.name,
    perFold: TEMPORAL_FOLDS.map((f, i) => ({ fold: f.name, metrics: foldMetrics[i] })),
    avgMae: average(foldMetrics.map((m) => m?.mae ?? null).filter((v): v is number => v != null)),
    avgBias: average(foldMetrics.map((m) => m?.bias ?? null).filter((v): v is number => v != null)),
  };
});

const finalRecTrain = recDev.filter((r) => FINAL_TRAIN_SEASONS.includes(r.season));
const recFrozenResults = REC_FAMILIES.map((family) => {
  let metrics: NflOpportunityMetrics | null;
  let predictFn: (row: NflReceivingFeatureRow) => number;
  if (family.name === "C0_baseline") {
    const constants = computeReceivingBaselineConstants(finalRecTrain);
    const fallbackTargets = constants.leagueMeanReceivingYards / constants.leagueMeanYardsPerTarget;
    predictFn = (r) => predictReceivingBaselineC(r, constants, fallbackTargets).predicted;
    metrics = computeMetrics(recFrozen.map((r) => pairRec(r, predictFn(r))));
  } else {
    const options = { allowPriorSeasonFallback: true, includePosition: true };
    const fallbacks = computeReceivingTrainFallbacks(finalRecTrain, { allowPriorSeasonFallback: true });
    const excluded = new Set(RECEIVING_FEATURE_GROUPS.filter((g) => !family.keepGroups.includes(g)));
    const constants = computeReceivingBaselineConstants(finalRecTrain);
    const fallbackTargets = constants.leagueMeanReceivingYards / constants.leagueMeanYardsPerTarget;
    const extraTrainMean = family.extra ? trainMeanOf(finalRecTrain.map(family.extra)) : 0;
    const encodeRow = (row: NflReceivingFeatureRow) => {
      const legs = predictReceivingBaselineC(row, constants, fallbackTargets);
      const base = ablateReceivingGroups(encodeReceivingFeatureRow(row, fallbacks, options), fallbacks, excluded);
      const withLegs = [...base, legs.projectedTargets, legs.projectedYpt];
      return family.extra ? [...withLegs, family.extra(row) ?? extraTrainMean] : withLegs;
    };
    const model = fitRidgeModel(finalRecTrain.map(encodeRow), finalRecTrain.map((r) => r.target.receivingYards), SELECTED_ALPHA);
    predictFn = (r) => scoreRidgeModel(model, encodeRow(r));
    metrics = computeMetrics(recFrozen.map((r) => pairRec(r, predictFn(r))));
  }
  const byPosition = metricsByGroup(recFrozen, (r) => r.diagnostics.position, (r) => pairRec(r, predictFn(r)));
  const byWeekBand = metricsByGroup(recFrozen, (r) => weekBand(r.week), (r) => pairRec(r, predictFn(r)));
  return { family: family.name, overall: metrics, byPosition, byWeekBand };
});

// === coverage of the new production-allowed feature ===

function coverageOf(rows: readonly (number | null)[]): { covered: number; total: number; pct: number } {
  const covered = rows.filter((v) => v != null).length;
  return { covered, total: rows.length, pct: rows.length > 0 ? Math.round((covered / rows.length) * 1000) / 10 : 0 };
}
const rushProductionAllowedCoverage = {
  overall: coverageOf(rushingFeatureRows.map(rushOpponentAllowedFeature)),
  week1: coverageOf(rushingFeatureRows.filter((r) => r.week === 1).map(rushOpponentAllowedFeature)),
  weeks1to4: coverageOf(rushingFeatureRows.filter((r) => r.week <= 4).map(rushOpponentAllowedFeature)),
};
const recProductionAllowedCoverage = {
  overall: coverageOf(receivingFeatureRows.map(receivingOpponentAllowedFeature)),
  week1: coverageOf(receivingFeatureRows.filter((r) => r.week === 1).map(receivingOpponentAllowedFeature)),
  weeks1to4: coverageOf(receivingFeatureRows.filter((r) => r.week <= 4).map(receivingOpponentAllowedFeature)),
};

// === write ===

const report = {
  _meta: {
    schemaVersion: "nfl-yardage-context-family-study-v1",
    generatedAt,
    scope: "Rushing (R0-R5) and Receiving (C0-C5) context-family study. QB passing out of scope. Research only -- no production file read as a target or written to.",
    temporalFolds: TEMPORAL_FOLDS.map((f) => ({ name: f.name, trainSeasons: f.trainSeasons, validateSeason: f.validateSeason })),
    finalTrainSeasons: FINAL_TRAIN_SEASONS, frozenBenchmarkSeason: FROZEN_BENCHMARK_SEASON,
    ridgeAlphaFixed: SELECTED_ALPHA,
    rushDevRowCount: rushDev.length, rushFrozenRowCount: rushFrozen.length,
    recDevRowCount: recDev.length, recFrozenRowCount: recFrozen.length,
    successRateAvailability: "HISTORICALLY UNAVAILABLE (classification C) -- RBSDM (rbsdm.com/api/team-tiers) is a live-only endpoint returning only the current period's 2025-last8/2026-season/2026-last5 snapshot; it exposes no archived pregame windows for arbitrary 2022-2025 target games and no eligible-play denominator to reconstruct one from nflverse independently under the RBSDM name. Not used anywhere in this study.",
  },
  rushing: {
    developmentValidation: rushDevResults,
    frozenBenchmark2025: rushFrozenResults,
    productionAllowedCoverage: rushProductionAllowedCoverage,
    priorAblationStudyCrossReference: "data/nfl/props/rushing-baseline-competition-v2-2022-2025.json (featureGroupAblationOnDevFolds, frozenBenchmark2025)",
  },
  receiving: {
    developmentValidation: recDevResults,
    frozenBenchmark2025: recFrozenResults,
    productionAllowedCoverage: recProductionAllowedCoverage,
    priorAblationStudyCrossReference: "data/nfl/props/receiving-baseline-competition-2022-2025.json (featureGroupAblationOnDevFolds, frozenBenchmark2025)",
  },
};

const output = outputOverride ?? join(RESEARCH_DIR, "nfl-yardage-context-family-study-2022-2025.json");
writeAtomic(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote context-family study report to ${output}`);
console.log("Rushing dev avg MAE by family:", Object.fromEntries(rushDevResults.map((r) => [r.family, r.avgMae?.toFixed(3)])));
console.log("Rushing 2025 frozen MAE by family:", Object.fromEntries(rushFrozenResults.map((r) => [r.family, r.overall?.mae?.toFixed(3)])));
console.log("Receiving dev avg MAE by family:", Object.fromEntries(recDevResults.map((r) => [r.family, r.avgMae?.toFixed(3)])));
console.log("Receiving 2025 frozen MAE by family:", Object.fromEntries(recFrozenResults.map((r) => [r.family, r.overall?.mae?.toFixed(3)])));
console.log("Production-allowed coverage (rushing):", rushProductionAllowedCoverage);
console.log("Production-allowed coverage (receiving):", recProductionAllowedCoverage);
