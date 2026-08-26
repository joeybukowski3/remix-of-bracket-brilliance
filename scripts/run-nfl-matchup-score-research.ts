/**
 * Phase 8 research runner: interpretable 0-100 passing/rushing/receiving
 * Matchup Scores. Candidate and weight selection is confined to rolling
 * 2022-2024 development folds. 2025 is scored only after the design is
 * frozen and is reported as a retrospective benchmark.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures, type NflTeamGameLogEntry } from "../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "../src/lib/nfl/props/types/teamPregameFeatures";
import { buildTeamEpaGameLog, type NflTeamEpaGameLogEntry, type NflTeamEpaGameRecord } from "../src/lib/nfl/props/qbPassingEpaContext";
import { marketKey, type NflHistoricalMarketRow } from "../src/lib/nfl/props/qbOpportunityFeatures";
import { FROZEN_BENCHMARK_SEASON, FINAL_TRAIN_SEASONS, TEMPORAL_FOLDS, average, splitByFold } from "../src/lib/nfl/props/temporalValidation";
import { fitRidgeModel, scoreRidgeModel } from "../src/lib/nfl/props/ridge";
import { computePassingTrainFallbacks, encodePassingFeatureRow } from "../src/lib/nfl/props/qbPassingEncoding";
import { buildQbPassingFeatureRow, buildQbStatGameLog } from "../src/lib/nfl/props/qbPassingFeatures";
import type { NflQbPassingFeatureRow, NflWindowedRate as PassingWindow } from "../src/lib/nfl/props/types/qbPassingFeatures";
import type { NflQbPassingOutcome } from "../src/lib/nfl/props/types/qbPassing";
import { buildPlayerRushingStatLog, buildRushingFeatureRow, buildTeamTopRbCarryShareByGameTeam } from "../src/lib/nfl/props/rushingFeatures";
import type { NflRushingFeatureRow, NflWindowedRate as RushingWindow } from "../src/lib/nfl/props/types/rushingFeatures";
import type { NflRushingOutcome } from "../src/lib/nfl/props/types/rushingOutcome";
import { computeRushingBaselineConstants, predictRushingBaselineC } from "../src/lib/nfl/props/rushingBaselines";
import { buildPlayerReceivingStatLog, buildReceivingFeatureRow, buildTeamTopTargetShareByGameTeam, type NflAirYardsSupplement } from "../src/lib/nfl/props/receivingFeatures";
import type { NflReceivingFeatureRow, NflWindowedRate as ReceivingWindow } from "../src/lib/nfl/props/types/receivingFeatures";
import type { NflReceivingOutcome } from "../src/lib/nfl/props/types/receivingOutcome";
import { computeReceivingBaselineConstants, predictReceivingBaselineC } from "../src/lib/nfl/props/receivingBaselines";
import {
  buildDimensionReference,
  buildGroupedDimensionReferences,
  assertSelectionExcludesSeason,
  combineDimensionScores,
  enumerateSimpleWeights,
  pearsonCorrelation,
  scoreDimension,
  type MatchupDimensionReference,
  type MatchupIndicatorDefinition,
} from "../src/lib/nfl/props/matchupScore";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data", "nfl", "props");
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const EPA_CACHE_DIR = "data/nfl/nflverse/epa-team-game";
const STATS_CACHE_DIR = "data/nfl/nflverse/stats-player-week";
const ALL_SEASONS = [2022, 2023, 2024, 2025] as const;
const GENERATED_AT = process.argv.find((arg) => arg.startsWith("--generated-at="))?.split("=")[1] ?? new Date().toISOString();
const OUTPUT = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length)
  ?? join(DATA_DIR, "matchup-score-research.json");

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };
type Window = PassingWindow | RushingWindow | ReceivingWindow;
type DimensionDefinitions<Row> = Readonly<Record<string, readonly MatchupIndicatorDefinition<Row>[]>>;
type Candidate = { id: string; dimensions: readonly string[]; normalization: "pooled" | "position" };
type DimensionScores = Record<string, number>;
type FoldScored = {
  fold: string;
  dimensions: DimensionScores;
  actualYards: number;
  actualOpportunity: number;
  actualEfficiency: number;
  projection: number;
};
type FinalScored<Row> = FoldScored & { row: Row; matchupScore: number; opportunityScore: number; environmentScore: number };

function readManifest(dir: string): CacheManifest {
  return JSON.parse(readFileSync(join(ROOT, dir, "manifest.json"), "utf8"));
}
function verifiedCsvRows(dir: string, manifest: CacheManifest, season: number): CsvRow[] {
  const entry = manifest.files?.find((candidate) => candidate.season === season);
  if (!entry) throw new Error(`No cached ${dir} source for ${season}.`);
  const text = readFileSync(join(ROOT, dir, entry.filename), "utf8");
  const problems = verifyCacheEntry(entry as never, text);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return parseCsv(text) as CsvRow[];
}
function finiteField(row: CsvRow, field: string, integer = false): number {
  const value = Number(String(row[field] ?? "").trim());
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) throw new Error(`Invalid ${field}.`);
  return value;
}
function toPlayVolumeRecord(row: CsvRow): NflTeamGamePlayVolumeRecord {
  return {
    gameId: String(row.game_id ?? "").trim(), season: finiteField(row, "season", true), week: finiteField(row, "week", true),
    team: String(row.team ?? "").trim(), opponent: String(row.opponent ?? "").trim(),
    eligiblePlays: finiteField(row, "eligible_plays", true), passPlays: finiteField(row, "pass_plays", true), rushPlays: finiteField(row, "rush_plays", true),
    neutralEligiblePlays: finiteField(row, "neutral_eligible_plays", true), neutralPassPlays: finiteField(row, "neutral_pass_plays", true),
    passOeSum: finiteField(row, "pass_oe_sum"), passOeCount: finiteField(row, "pass_oe_count", true),
  };
}
function toEpaRecord(row: CsvRow, playType: "pass" | "rush"): NflTeamEpaGameRecord {
  return {
    gameId: String(row.game_id ?? "").trim(), season: finiteField(row, "season", true), week: finiteField(row, "week", true),
    team: String(row.team ?? "").trim(), opponent: String(row.opponent ?? "").trim(),
    passEpa: finiteField(row, `${playType}_epa`), passPlays: finiteField(row, `${playType}_plays`, true),
  };
}
function readSeasonGames(season: number): (NflPropRawGameRecord & { isDome?: boolean })[] {
  const path = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  if (!existsSync(path)) return [];
  const artifact = JSON.parse(readFileSync(path, "utf8")) as { games?: (NflPropRawGameRecord & { isDome?: boolean })[] };
  return artifact.games ?? [];
}
function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try { writeFileSync(temporary, text, "utf8"); renameSync(temporary, path); }
  catch (error) { if (existsSync(temporary)) unlinkSync(temporary); throw error; }
}
function current(window: Window): number | null {
  return window.seasonPrior ?? window.priorSeason;
}
function stability(window: Window): number | null {
  if (window.seasonPrior == null || window.last3 == null) return null;
  return -Math.abs(window.last3 - window.seasonPrior);
}
function indicator<Row>(key: string, value: (row: Row) => number | null, direction: "higherIsBetter" | "lowerIsBetter" = "higherIsBetter"): MatchupIndicatorDefinition<Row> {
  return { key, value, direction };
}
function mean(values: readonly number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function quantile(values: readonly number[], probability: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower + 1] == null ? sorted[lower] : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}
function distribution(values: readonly number[]) {
  const valueMean = mean(values);
  return {
    n: values.length, mean: valueMean, median: quantile(values, 0.5),
    standardDeviation: valueMean == null ? null : Math.sqrt(values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / values.length),
    percentiles: { p05: quantile(values, 0.05), p10: quantile(values, 0.1), p25: quantile(values, 0.25), p50: quantile(values, 0.5), p75: quantile(values, 0.75), p90: quantile(values, 0.9), p95: quantile(values, 0.95) },
  };
}

// Shared sources and leakage-safe feature rows.
const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
const epaManifest = readManifest(EPA_CACHE_DIR);
const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
const passEpaRecords: NflTeamEpaGameRecord[] = [];
const rushEpaRecords: NflTeamEpaGameRecord[] = [];
const games: (NflPropRawGameRecord & { isDome?: boolean })[] = [];
for (const season of ALL_SEASONS) {
  for (const row of verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season)) playVolumeRecords.push(toPlayVolumeRecord(row));
  for (const row of verifiedCsvRows(EPA_CACHE_DIR, epaManifest, season)) {
    passEpaRecords.push(toEpaRecord(row, "pass"));
    rushEpaRecords.push(toEpaRecord(row, "rush"));
  }
  games.push(...readSeasonGames(season));
}
const gameJoinIndex = buildGameJoinIndex(games);
const fullTeamGameLog: NflTeamGameLogEntry[] = buildTeamGameLog(playVolumeRecords, gameJoinIndex);
const passEpaGameLog: NflTeamEpaGameLogEntry[] = buildTeamEpaGameLog(passEpaRecords, gameJoinIndex);
const rushEpaGameLog: NflTeamEpaGameLogEntry[] = buildTeamEpaGameLog(rushEpaRecords, gameJoinIndex);
const domeByGameId = new Map(games.filter((game) => game.gameId).map((game) => [game.gameId, Boolean(game.isDome)]));
const teamPregameFeaturesByKey = new Map<string, NflTeamPregameFeatures>();
for (const record of playVolumeRecords) {
  teamPregameFeaturesByKey.set(`${record.season}|${record.week}|${record.team}`, buildTeamPregameFeatures(record, gameJoinIndex, fullTeamGameLog));
}
const marketArtifact = JSON.parse(readFileSync(join(DATA_DIR, "historical-market-context-2022-2025.json"), "utf8")) as { rows: NflHistoricalMarketRow[] };
const marketByKey = new Map(marketArtifact.rows.map((row) => [marketKey(row.season, row.week, row.team), row]));

const passingOutcomes = (JSON.parse(readFileSync(join(DATA_DIR, "qb-passing-outcomes-2022-2025.json"), "utf8")) as { rows: NflQbPassingOutcome[] }).rows;
const qbStatGameLog = buildQbStatGameLog(passingOutcomes, gameJoinIndex);
const passingRows = passingOutcomes.map((outcome) => buildQbPassingFeatureRow(outcome, {
  gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, epaGameLog: passEpaGameLog, marketByKey, domeByGameId, qbStatGameLog,
}));

const rushingOutcomes = (JSON.parse(readFileSync(join(DATA_DIR, "rushing-outcomes-v2-2022-2025.json"), "utf8")) as { rows: NflRushingOutcome[] }).rows;
const playerRushingStatLog = buildPlayerRushingStatLog(rushingOutcomes, gameJoinIndex);
const teamTopRbCarryShareByGameTeam = buildTeamTopRbCarryShareByGameTeam(rushingOutcomes);
const rushingRows = rushingOutcomes.map((outcome) => buildRushingFeatureRow(outcome, {
  gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, rushEpaGameLog, marketByKey, domeByGameId, playerRushingStatLog, teamTopRbCarryShareByGameTeam,
}));

const receivingOutcomes = (JSON.parse(readFileSync(join(DATA_DIR, "receiving-outcomes-2022-2025.json"), "utf8")) as { rows: NflReceivingOutcome[] }).rows;
const airYardsByPlayerWeek = new Map<string, NflAirYardsSupplement>();
const statsManifest = readManifest(STATS_CACHE_DIR);
for (const season of ALL_SEASONS) {
  for (const row of verifiedCsvRows(STATS_CACHE_DIR, statsManifest, season)) {
    if (String(row.season_type ?? "").toUpperCase() !== "REG" || !row.player_id) continue;
    const airYards = Number(row.receiving_air_yards);
    if (Number.isFinite(airYards)) airYardsByPlayerWeek.set(`gsis:${String(row.player_id).trim()}|${season}|${Number(row.week)}`, { airYards });
  }
}
const playerReceivingStatLog = buildPlayerReceivingStatLog(receivingOutcomes, gameJoinIndex, airYardsByPlayerWeek);
const teamTopTargetShareByGameTeam = buildTeamTopTargetShareByGameTeam(receivingOutcomes);
const receivingRows = receivingOutcomes.map((outcome) => buildReceivingFeatureRow(outcome, {
  gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, passEpaGameLog, marketByKey, domeByGameId, playerReceivingStatLog, teamTopTargetShareByGameTeam,
}));

// Market-specific, interpretable dimensions. All values are pregame features.
const passingDimensions: DimensionDefinitions<NflQbPassingFeatureRow> = {
  opportunity: [
    indicator("teamOffensivePlays", (row) => current(row.features.opportunity.offensivePlaysPerGame)),
    indicator("teamPassAttempts", (row) => current(row.features.opportunity.passAttemptsPerGame)),
    indicator("qbAttemptRole", (row) => current(row.features.opportunity.qbAttemptsPerGame)),
    indicator("dropbackRate", (row) => current(row.features.proePassTendency.overallDropbackRate)),
    indicator("neutralPassRate", (row) => current(row.features.proePassTendency.earlyDownNeutralPassRate)),
    indicator("passRateOverExpected", (row) => current(row.features.proePassTendency.passRateOverExpected)),
  ],
  opponent: [
    indicator("passAttemptsAllowed", (row) => current(row.features.opponentPassDefense.passAttemptsPerGameAllowed)),
    indicator("dropbackRateAllowed", (row) => current(row.features.opponentPassDefense.overallDropbackRateAllowed)),
    indicator("passEpaAllowed", (row) => current(row.features.opponentPassDefense.passEpaPerPlayAllowed)),
  ],
  gameEnvironment: [
    indicator("gameTotal", (row) => row.features.market.total),
    indicator("impliedTeamTotal", (row) => row.features.market.impliedTeamTotal),
    indicator("trailingScriptSpread", (row) => row.features.market.spread),
    indicator("dome", (row) => row.features.market.isDome == null ? null : row.features.market.isDome ? 1 : 0),
  ],
  passingQuality: [
    indicator("qbYardsPerAttempt", (row) => current(row.features.qbEfficiency.yardsPerAttempt)),
    indicator("qbCompletionRate", (row) => current(row.features.qbEfficiency.completionPct)),
  ],
};
const rushingDimensions: DimensionDefinitions<NflRushingFeatureRow> = {
  workload: [
    indicator("carriesPerGame", (row) => current(row.features.playerUsage.carriesPerGame)),
    indicator("carryShare", (row) => current(row.features.playerUsage.carryShare)),
  ],
  roleQuality: [indicator("teamTopRbCarryShare", (row) => row.diagnostics.recentTeamTopCarryShareConcentration)],
  teamRushingEnvironment: [
    indicator("teamRushAttempts", (row) => current(row.features.teamEnvironment.rushAttemptsPerGame)),
    indicator("teamDropbackRate", (row) => current(row.features.teamEnvironment.overallDropbackRate), "lowerIsBetter"),
    indicator("teamPassRateOverExpected", (row) => current(row.features.teamEnvironment.passRateOverExpected), "lowerIsBetter"),
  ],
  opponent: [
    indicator("rushAttemptsAllowed", (row) => current(row.features.opponentRushDefense.rushAttemptsPerGameAllowed)),
    indicator("rushEpaAllowed", (row) => current(row.features.opponentRushDefense.rushEpaPerPlayAllowed)),
  ],
};
const receivingDimensions: DimensionDefinitions<NflReceivingFeatureRow> = {
  opportunity: [
    indicator("targetsPerGame", (row) => current(row.features.playerUsage.targetsPerGame)),
    indicator("targetShare", (row) => current(row.features.playerUsage.targetShare)),
    indicator("teamPassAttempts", (row) => current(row.features.teamEnvironment.passAttemptsPerGame)),
    indicator("teamDropbackRate", (row) => current(row.features.teamEnvironment.overallDropbackRate)),
    indicator("teamPassRateOverExpected", (row) => current(row.features.teamEnvironment.passRateOverExpected)),
  ],
  roleStability: [
    indicator("targetVolumeStability", (row) => stability(row.features.playerUsage.targetsPerGame)),
    indicator("targetShareStability", (row) => stability(row.features.playerUsage.targetShare)),
  ],
  opponent: [
    indicator("targetsAllowed", (row) => current(row.features.opponentPassDefense.targetsPerGameAllowed)),
    indicator("passEpaAllowed", (row) => current(row.features.opponentPassDefense.passEpaPerPlayAllowed)),
  ],
  efficiencyProfile: [
    indicator("yardsPerTarget", (row) => current(row.features.playerEfficiency.yardsPerTarget)),
    indicator("averageDepthOfTarget", (row) => current(row.features.airYards.adot)),
  ],
};

const passingCandidates: Candidate[] = [
  { id: "P1_opportunity_opponent", dimensions: ["opportunity", "opponent"], normalization: "pooled" },
  { id: "P2_add_game_environment", dimensions: ["opportunity", "opponent", "gameEnvironment"], normalization: "pooled" },
  { id: "P3_add_passing_quality", dimensions: ["opportunity", "opponent", "passingQuality", "gameEnvironment"], normalization: "pooled" },
];
const rushingCandidates: Candidate[] = [
  { id: "R1_workload_opponent", dimensions: ["workload", "opponent"], normalization: "pooled" },
  { id: "R2_add_team_environment", dimensions: ["workload", "teamRushingEnvironment", "opponent"], normalization: "pooled" },
  { id: "R3_add_role_quality", dimensions: ["workload", "roleQuality", "teamRushingEnvironment", "opponent"], normalization: "pooled" },
];
const receivingCandidates: Candidate[] = [
  { id: "C1_opportunity_opponent_pooled", dimensions: ["opportunity", "opponent"], normalization: "pooled" },
  { id: "C2_add_role_stability_pooled", dimensions: ["opportunity", "roleStability", "opponent"], normalization: "pooled" },
  { id: "C3_add_efficiency_pooled", dimensions: ["opportunity", "roleStability", "opponent", "efficiencyProfile"], normalization: "pooled" },
  { id: "C3_position_normalized", dimensions: ["opportunity", "roleStability", "opponent", "efficiencyProfile"], normalization: "position" },
];

function buildReferences<Row>(rows: readonly Row[], dimensions: DimensionDefinitions<Row>): Record<string, MatchupDimensionReference> {
  return Object.fromEntries(Object.entries(dimensions).map(([key, definitions]) => [key, buildDimensionReference(key, rows, definitions)]));
}
function buildGroupedReferences<Row>(rows: readonly Row[], dimensions: DimensionDefinitions<Row>, group: (row: Row) => string): Record<string, Record<string, MatchupDimensionReference>> {
  const groups = [...new Set(rows.map(group))];
  const result: Record<string, Record<string, MatchupDimensionReference>> = Object.fromEntries(groups.map((key) => [key, {}]));
  for (const [dimensionKey, definitions] of Object.entries(dimensions)) {
    const grouped = buildGroupedDimensionReferences(dimensionKey, rows, definitions, group);
    for (const key of groups) result[key][dimensionKey] = grouped[key];
  }
  return result;
}
function dimensionScores<Row>(row: Row, dimensions: DimensionDefinitions<Row>, references: Record<string, MatchupDimensionReference>): DimensionScores {
  return Object.fromEntries(Object.entries(dimensions).map(([key, definitions]) => [key, scoreDimension(row, definitions, references[key]).score]));
}
function correlations(rows: readonly FoldScored[], weights: Readonly<Record<string, number>>, opportunityKey: string) {
  const scores = rows.map((row) => combineDimensionScores(row.dimensions, weights).score);
  const environment = rows.map((row) => mean(Object.keys(weights).filter((key) => key !== opportunityKey).map((key) => row.dimensions[key])) ?? 50);
  return {
    scoreWithActualYards: pearsonCorrelation(scores, rows.map((row) => row.actualYards)),
    scoreWithProjection: pearsonCorrelation(scores, rows.map((row) => row.projection)),
    scoreWithOpportunityComponent: pearsonCorrelation(scores, rows.map((row) => row.dimensions[opportunityKey])),
    scoreWithEnvironmentComponent: pearsonCorrelation(scores, environment),
    scoreWithActualOpportunity: pearsonCorrelation(scores, rows.map((row) => row.actualOpportunity)),
    scoreWithActualEfficiency: pearsonCorrelation(scores, rows.map((row) => row.actualEfficiency)),
  };
}
function averageCorrelation(rows: readonly ReturnType<typeof correlations>[], key: keyof ReturnType<typeof correlations>): number | null {
  return average(rows.map((row) => row[key]).filter((value): value is number => value != null));
}

function evaluateCandidates<Row>(args: {
  rows: readonly Row[];
  dimensions: DimensionDefinitions<Row>;
  candidates: readonly Candidate[];
  season: (row: Row) => number;
  group?: (row: Row) => string;
  opportunityKey: string;
  actualYards: (row: Row) => number;
  actualOpportunity: (row: Row) => number;
  actualEfficiency: (row: Row) => number;
  projections: (train: Row[], validate: Row[]) => number[];
}) {
  assertSelectionExcludesSeason(args.rows.map((row) => ({ season: args.season(row) })), FROZEN_BENCHMARK_SEASON);
  const reports = args.candidates.map((candidate) => {
    const foldRows = TEMPORAL_FOLDS.map((fold) => {
      const split = splitByFold(args.rows.map((row) => Object.assign({ season: args.season(row) }, { source: row })), fold);
      const train = split.train.map((wrapped) => wrapped.source);
      const validate = split.validate.map((wrapped) => wrapped.source);
      const pooled = buildReferences(train, args.dimensions);
      const grouped = candidate.normalization === "position" && args.group ? buildGroupedReferences(train, args.dimensions, args.group) : null;
      const predictions = args.projections(train, validate);
      return validate.map((row, index): FoldScored => ({
        fold: fold.name,
        dimensions: dimensionScores(row, args.dimensions, grouped?.[args.group!(row)] ?? pooled),
        actualYards: args.actualYards(row), actualOpportunity: args.actualOpportunity(row), actualEfficiency: args.actualEfficiency(row), projection: predictions[index],
      }));
    });
    const equalWeights = Object.fromEntries(candidate.dimensions.map((key) => [key, 1 / candidate.dimensions.length]));
    const equalByFold = foldRows.map((rows) => correlations(rows, equalWeights, args.opportunityKey));
    const weightGrid = enumerateSimpleWeights(candidate.dimensions, 0.1, { maxByKey: { [args.opportunityKey]: 0.5 }, minWeight: 0.1 });
    const weighted = weightGrid.map((weights) => {
      const byFold = foldRows.map((rows) => correlations(rows, weights, args.opportunityKey));
      return {
        weights,
        actualCorrelation: averageCorrelation(byFold, "scoreWithActualYards") ?? -1,
        projectionCorrelation: averageCorrelation(byFold, "scoreWithProjection") ?? 1,
        byFold,
      };
    }).filter((result) => result.projectionCorrelation < 0.95)
      .sort((left, right) => right.actualCorrelation - left.actualCorrelation || left.projectionCorrelation - right.projectionCorrelation);
    const selected = weighted[0];
    if (!selected) throw new Error(`${candidate.id} produced no independent weight candidate.`);
    return {
      ...candidate,
      equalWeightBenchmark: {
        weights: equalWeights, byFold: equalByFold,
        avgActualYardsCorrelation: averageCorrelation(equalByFold, "scoreWithActualYards"),
        avgProjectionCorrelation: averageCorrelation(equalByFold, "scoreWithProjection"),
      },
      predictiveWeighting: {
        method: "non-negative 0.1-step grid; every dimension >=0.1; opportunity <=0.5; maximize average development-fold correlation with actual yards; reject projection correlation >=0.95",
        weights: selected.weights, byFold: selected.byFold,
        avgActualYardsCorrelation: selected.actualCorrelation,
        avgProjectionCorrelation: selected.projectionCorrelation,
        avgActualOpportunityCorrelation: averageCorrelation(selected.byFold, "scoreWithActualOpportunity"),
        avgActualEfficiencyCorrelation: averageCorrelation(selected.byFold, "scoreWithActualEfficiency"),
      },
      selectionScore: selected.actualCorrelation - 0.005 * (candidate.dimensions.length - 2),
    };
  });
  const winner = [...reports].sort((left, right) => right.selectionScore - left.selectionScore || left.dimensions.length - right.dimensions.length)[0];
  return { candidates: reports, winner };
}

const passingByKey = new Map(passingOutcomes.map((row) => [`${row.season}|${row.week}|${row.primaryQbPlayerId}`, row]));
const rushingByKey = new Map(rushingOutcomes.map((row) => [`${row.season}|${row.week}|${row.playerId}`, row]));
const receivingByKey = new Map(receivingOutcomes.map((row) => [`${row.season}|${row.week}|${row.playerId}`, row]));

const passingResearch = evaluateCandidates({
  rows: passingRows.filter((row) => row.season !== FROZEN_BENCHMARK_SEASON), dimensions: passingDimensions, candidates: passingCandidates,
  season: (row) => row.season, opportunityKey: "opportunity",
  actualYards: (row) => row.target.primaryQbPassingYards,
  actualOpportunity: (row) => passingByKey.get(`${row.season}|${row.week}|${row.primaryQbPlayerId}`)!.primaryQbAttempts,
  actualEfficiency: (row) => passingByKey.get(`${row.season}|${row.week}|${row.primaryQbPlayerId}`)!.primaryQbYardsPerAttempt,
  projections: (train, validate) => {
    const fallbacks = computePassingTrainFallbacks(train);
    const model = fitRidgeModel(train.map((row) => encodePassingFeatureRow(row, fallbacks)), train.map((row) => row.target.primaryQbPassingYards), 10);
    return validate.map((row) => scoreRidgeModel(model, encodePassingFeatureRow(row, fallbacks)));
  },
});
const rushingResearch = evaluateCandidates({
  rows: rushingRows.filter((row) => row.season !== FROZEN_BENCHMARK_SEASON), dimensions: rushingDimensions, candidates: rushingCandidates,
  season: (row) => row.season, opportunityKey: "workload",
  actualYards: (row) => row.target.rushingYards,
  actualOpportunity: (row) => rushingByKey.get(`${row.season}|${row.week}|${row.playerId}`)!.carries,
  actualEfficiency: (row) => rushingByKey.get(`${row.season}|${row.week}|${row.playerId}`)!.yardsPerCarry,
  projections: (train, validate) => {
    const constants = computeRushingBaselineConstants(train);
    const fallback = constants.leagueMeanRushingYards / constants.leagueMeanYardsPerCarry;
    return validate.map((row) => predictRushingBaselineC(row, constants, fallback).predicted);
  },
});
const receivingResearchInitial = evaluateCandidates({
  rows: receivingRows.filter((row) => row.season !== FROZEN_BENCHMARK_SEASON), dimensions: receivingDimensions, candidates: receivingCandidates,
  season: (row) => row.season, group: (row) => row.diagnostics.position, opportunityKey: "opportunity",
  actualYards: (row) => row.target.receivingYards,
  actualOpportunity: (row) => receivingByKey.get(`${row.season}|${row.week}|${row.playerId}`)!.targets,
  actualEfficiency: (row) => receivingByKey.get(`${row.season}|${row.week}|${row.playerId}`)!.yardsPerTarget,
  projections: (train, validate) => {
    const constants = computeReceivingBaselineConstants(train);
    const fallback = constants.leagueMeanReceivingYards / constants.leagueMeanYardsPerTarget;
    return validate.map((row) => predictReceivingBaselineC(row, constants, fallback).predicted);
  },
});
const receivingPositionWinner = receivingResearchInitial.candidates.find((candidate) => candidate.id === "C3_position_normalized");
if (!receivingPositionWinner) throw new Error("Position-normalized receiving candidate is missing.");
const receivingResearch = {
  ...receivingResearchInitial,
  unconstrainedCorrelationWinner: receivingResearchInitial.winner.id,
  winner: receivingPositionWinner,
  selectionRationale: "C3 position-normalized is selected despite lower raw outcome correlation because pooled normalization shifts the score's meaning by position; the position-relative empirical CDF makes the same score represent comparable within-role favorability for RB/WR/TE.",
};

function scoreFinal<Row>(args: {
  rows: readonly Row[]; developmentRows: readonly Row[]; dimensions: DimensionDefinitions<Row>;
  winner: (typeof passingResearch)["winner"]; opportunityKey: string; group?: (row: Row) => string;
  actualYards: (row: Row) => number; actualOpportunity: (row: Row) => number; actualEfficiency: (row: Row) => number; projections: (rows: readonly Row[]) => number[];
}): FinalScored<Row>[] {
  const pooled = buildReferences(args.developmentRows, args.dimensions);
  const grouped = args.winner.normalization === "position" && args.group ? buildGroupedReferences(args.developmentRows, args.dimensions, args.group) : null;
  const projections = args.projections(args.rows);
  return args.rows.map((row, index) => {
    const dimensions = dimensionScores(row, args.dimensions, grouped?.[args.group!(row)] ?? pooled);
    const matchupScore = combineDimensionScores(dimensions, args.winner.predictiveWeighting.weights).score;
    const environmentKeys = args.winner.dimensions.filter((key) => key !== args.opportunityKey);
    return {
      row, fold: "fixed_2022_2024_reference", dimensions,
      actualYards: args.actualYards(row), actualOpportunity: args.actualOpportunity(row), actualEfficiency: args.actualEfficiency(row), projection: projections[index],
      matchupScore, opportunityScore: dimensions[args.opportunityKey], environmentScore: mean(environmentKeys.map((key) => dimensions[key])) ?? 50,
    };
  });
}

const passingDevRows = passingRows.filter((row) => FINAL_TRAIN_SEASONS.includes(row.season));
const passingFinalFallbacks = computePassingTrainFallbacks(passingDevRows);
const passingFinalModel = fitRidgeModel(passingDevRows.map((row) => encodePassingFeatureRow(row, passingFinalFallbacks)), passingDevRows.map((row) => row.target.primaryQbPassingYards), 10);
const passingScored = scoreFinal({
  rows: passingRows, developmentRows: passingDevRows, dimensions: passingDimensions, winner: passingResearch.winner, opportunityKey: "opportunity",
  actualYards: (row) => row.target.primaryQbPassingYards,
  actualOpportunity: (row) => passingByKey.get(`${row.season}|${row.week}|${row.primaryQbPlayerId}`)!.primaryQbAttempts,
  actualEfficiency: (row) => passingByKey.get(`${row.season}|${row.week}|${row.primaryQbPlayerId}`)!.primaryQbYardsPerAttempt,
  projections: (rows) => rows.map((row) => scoreRidgeModel(passingFinalModel, encodePassingFeatureRow(row, passingFinalFallbacks))),
} as Parameters<typeof scoreFinal<NflQbPassingFeatureRow>>[0]);
const rushingDevRows = rushingRows.filter((row) => FINAL_TRAIN_SEASONS.includes(row.season));
const rushingFinalConstants = computeRushingBaselineConstants(rushingDevRows);
const rushingFallback = rushingFinalConstants.leagueMeanRushingYards / rushingFinalConstants.leagueMeanYardsPerCarry;
const rushingScored = scoreFinal({
  rows: rushingRows, developmentRows: rushingDevRows, dimensions: rushingDimensions, winner: rushingResearch.winner, opportunityKey: "workload",
  actualYards: (row) => row.target.rushingYards,
  actualOpportunity: (row) => rushingByKey.get(`${row.season}|${row.week}|${row.playerId}`)!.carries,
  actualEfficiency: (row) => rushingByKey.get(`${row.season}|${row.week}|${row.playerId}`)!.yardsPerCarry,
  projections: (rows) => rows.map((row) => predictRushingBaselineC(row, rushingFinalConstants, rushingFallback).predicted),
} as Parameters<typeof scoreFinal<NflRushingFeatureRow>>[0]);
const receivingDevRows = receivingRows.filter((row) => FINAL_TRAIN_SEASONS.includes(row.season));
const receivingFinalConstants = computeReceivingBaselineConstants(receivingDevRows);
const receivingFallback = receivingFinalConstants.leagueMeanReceivingYards / receivingFinalConstants.leagueMeanYardsPerTarget;
const receivingScored = scoreFinal({
  rows: receivingRows, developmentRows: receivingDevRows, dimensions: receivingDimensions, winner: receivingResearch.winner, opportunityKey: "opportunity", group: (row) => row.diagnostics.position,
  actualYards: (row) => row.target.receivingYards,
  actualOpportunity: (row) => receivingByKey.get(`${row.season}|${row.week}|${row.playerId}`)!.targets,
  actualEfficiency: (row) => receivingByKey.get(`${row.season}|${row.week}|${row.playerId}`)!.yardsPerTarget,
  projections: (rows) => rows.map((row) => predictReceivingBaselineC(row, receivingFinalConstants, receivingFallback).predicted),
} as Parameters<typeof scoreFinal<NflReceivingFeatureRow>>[0]);

// Interpretation bands are derived once from pooled development distributions,
// then held fixed for every market and for 2025.
const pooledDevScores = [...passingScored, ...rushingScored, ...receivingScored]
  .filter((scored) => (scored.row as { season: number }).season !== FROZEN_BENCHMARK_SEASON)
  .map((scored) => scored.matchupScore);
const roundFive = (value: number | null) => Math.round((value ?? 50) / 5) * 5;
const bandCuts = {
  difficultMax: roundFive(quantile(pooledDevScores, 0.1)),
  challengingMax: roundFive(quantile(pooledDevScores, 0.3)),
  neutralMax: roundFive(quantile(pooledDevScores, 0.7)),
  positiveMax: roundFive(quantile(pooledDevScores, 0.9)),
};
function band(score: number): "difficult" | "challenging" | "neutral" | "positive" | "elite" {
  if (score < bandCuts.difficultMax) return "difficult";
  if (score < bandCuts.challengingMax) return "challenging";
  if (score < bandCuts.neutralMax) return "neutral";
  if (score < bandCuts.positiveMax) return "positive";
  return "elite";
}
function seasonReports<Row extends { season: number }>(rows: readonly FinalScored<Row>[]) {
  return Object.fromEntries(ALL_SEASONS.map((season) => {
    const selected = rows.filter((row) => row.row.season === season);
    const bands = ["difficult", "challenging", "neutral", "positive", "elite"] as const;
    return [season, {
      ...distribution(selected.map((row) => row.matchupScore)),
      bandDistribution: Object.fromEntries(bands.map((key) => {
        const count = selected.filter((row) => band(row.matchupScore) === key).length;
        return [key, { n: count, pct: selected.length > 0 ? count / selected.length : null }];
      })),
    }];
  }));
}
function bandOutcomes<Row>(rows: readonly FinalScored<Row>[]) {
  const bands = ["difficult", "challenging", "neutral", "positive", "elite"] as const;
  return Object.fromEntries(bands.map((key) => {
    const selected = rows.filter((row) => band(row.matchupScore) === key);
    return [key, {
      n: selected.length, meanScore: mean(selected.map((row) => row.matchupScore)), meanActualYards: mean(selected.map((row) => row.actualYards)),
      meanActualOpportunity: mean(selected.map((row) => row.actualOpportunity)), meanActualEfficiency: mean(selected.map((row) => row.actualEfficiency)),
    }];
  }));
}
function percentileRanks(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((value) => {
    let below = 0;
    while (below < sorted.length && sorted[below] < value) below += 1;
    return below / sorted.length * 100;
  });
}
function examples<Row extends { season: number; week: number }>(rows: readonly FinalScored<Row>[], describe: (row: Row) => object) {
  const selected = rows.filter((row) => row.row.season === FROZEN_BENCHMARK_SEASON);
  const scoreRanks = percentileRanks(selected.map((row) => row.matchupScore));
  const projectionRanks = percentileRanks(selected.map((row) => row.projection));
  const targets = [
    { key: "A_highScore_highProjection", score: 90, projection: 90 },
    { key: "B_highScore_modestProjection", score: 90, projection: 35 },
    { key: "C_lowScore_highProjection", score: 20, projection: 90 },
    { key: "D_lowScore_lowProjection", score: 20, projection: 20 },
  ];
  return Object.fromEntries(targets.map((target) => {
    const index = selected.map((_, rowIndex) => (scoreRanks[rowIndex] - target.score) ** 2 + (projectionRanks[rowIndex] - target.projection) ** 2)
      .reduce((best, distance, rowIndex, all) => distance < all[best] ? rowIndex : best, 0);
    const row = selected[index];
    return [target.key, { ...describe(row.row), matchupScore: row.matchupScore, opportunityScore: row.opportunityScore, environmentScore: row.environmentScore, projectedYards: row.projection, actualYards: row.actualYards, scorePercentile: scoreRanks[index], projectionPercentile: projectionRanks[index] }];
  }));
}
function hardCase<Row>(rows: readonly FinalScored<Row>[], predicate: (row: FinalScored<Row>) => boolean) {
  const selected = rows.filter((row) => (row.row as { season: number }).season === FROZEN_BENCHMARK_SEASON && predicate(row));
  return { n: selected.length, matchupScore: distribution(selected.map((row) => row.matchupScore)), opportunityScore: distribution(selected.map((row) => row.opportunityScore)), environmentScore: distribution(selected.map((row) => row.environmentScore)) };
}
function finalCorrelations<Row>(rows: readonly FinalScored<Row>[]) {
  return {
    matchupScoreWithProjectedYards: pearsonCorrelation(rows.map((row) => row.matchupScore), rows.map((row) => row.projection)),
    matchupScoreWithActualYards: pearsonCorrelation(rows.map((row) => row.matchupScore), rows.map((row) => row.actualYards)),
    matchupScoreWithOpportunityScore: pearsonCorrelation(rows.map((row) => row.matchupScore), rows.map((row) => row.opportunityScore)),
    matchupScoreWithEnvironmentScore: pearsonCorrelation(rows.map((row) => row.matchupScore), rows.map((row) => row.environmentScore)),
    opportunityScoreWithEnvironmentScore: pearsonCorrelation(rows.map((row) => row.opportunityScore), rows.map((row) => row.environmentScore)),
  };
}

function marketReport<Row extends { season: number; week: number }>(rows: readonly FinalScored<Row>[], describe: (row: Row) => object) {
  const development = rows.filter((row) => row.row.season !== FROZEN_BENCHMARK_SEASON);
  const frozen = rows.filter((row) => row.row.season === FROZEN_BENCHMARK_SEASON);
  return {
    correlations: { development: finalCorrelations(development), retrospective2025: finalCorrelations(frozen) },
    scoreDistributionBySeason: seasonReports(rows),
    outcomeByBand: { development: bandOutcomes(development), retrospective2025: bandOutcomes(frozen) },
    representative2025Examples: examples(rows, describe),
  };
}

const report = {
  _meta: {
    schemaVersion: "nfl-yardage-matchup-score-research-v1", generatedAt: GENERATED_AT,
    developmentSeasons: FINAL_TRAIN_SEASONS, temporalFolds: TEMPORAL_FOLDS,
    frozenRetrospectiveSeason: FROZEN_BENCHMARK_SEASON,
    referenceDistributionVersion: "nfl-yardage-matchup-reference-2022-2024-v1",
    scoreVersion: "nfl-yardage-matchup-score-phase8-v1",
    projectionArchitecturesPreserved: {
      passing: "direct ridge alpha=10", rushing: "projected carries x shrunk YPC", receiving: "projected targets x shrunk YPT",
    },
  },
  methodology: {
    normalization: "indicator-level empirical mid-rank percentiles; fold-train reference during selection; fixed 2022-2024 reference for final/2025; missing pregame indicator is neutral 50",
    scaleMeaning: "50 approximates a development-era league-typical environment; scores are market-specific composites on a common percentile-derived 0-100 presentation scale",
    week1Handling: "prior-season value when available, otherwise neutral 50; never a current-week distribution",
    driftControl: "fixed reference version; no annual min/max recalibration",
    uncertaintySeparation: "prediction intervals, residual risk, and target-game outcomes are not score inputs",
    unsupportedDimensions: { rushingTrench: "excluded: no validated historical weekly trench source", rushingMarket: "excluded: development ablations found no incremental value", receivingMarket: "excluded: development ablations found no incremental value" },
  },
  interpretationBands: {
    derivation: "common thresholds rounded to 5 points from pooled 2022-2024 selected-score p10/p30/p70/p90; held fixed for every market and 2025",
    cuts: bandCuts,
  },
  passing: {
    candidateResearch: passingResearch,
    selectedDefinition: { opportunityComponent: "opportunity", environmentComponents: passingResearch.winner.dimensions.filter((key) => key !== "opportunity"), weights: passingResearch.winner.predictiveWeighting.weights },
    ...marketReport(passingScored, (row) => ({ season: row.season, week: row.week, playerId: row.primaryQbPlayerId, playerName: row.primaryQbPlayerName, team: row.team, opponent: row.opponent })),
    hardCases2025: {
      multiQbGames: hardCase(passingScored, (entry) => entry.row.diagnostics.instabilityCategory === "multiQbGame"),
      noHistoryQbs: hardCase(passingScored, (entry) => entry.row.diagnostics.gamesStartedPriorThisSeason === 0 && !entry.row.diagnostics.hasPriorSeasonStarts),
    },
  },
  rushing: {
    candidateResearch: rushingResearch,
    selectedDefinition: { opportunityComponent: "workload", environmentComponents: rushingResearch.winner.dimensions.filter((key) => key !== "workload"), weights: rushingResearch.winner.predictiveWeighting.weights },
    ...marketReport(rushingScored, (row) => ({ season: row.season, week: row.week, playerId: row.playerId, playerName: row.playerName, team: row.team, opponent: row.opponent, position: row.diagnostics.position })),
    hardCases2025: {
      committee: hardCase(rushingScored, (entry) => (entry.row.diagnostics.recentTeamTopCarryShareConcentration ?? 1) < 0.6),
      lowHistory: hardCase(rushingScored, (entry) => entry.row.diagnostics.gamesWithCarriesPriorThisSeason < 3 && !entry.row.diagnostics.hasPriorSeasonCarries),
      highVolume: hardCase(rushingScored, (entry) => (current(entry.row.features.playerUsage.carriesPerGame) ?? 0) >= 12),
    },
  },
  receiving: {
    candidateResearch: receivingResearch,
    selectedDefinition: { opportunityComponent: "opportunity", environmentComponents: receivingResearch.winner.dimensions.filter((key) => key !== "opportunity"), weights: receivingResearch.winner.predictiveWeighting.weights },
    ...marketReport(receivingScored, (row) => ({ season: row.season, week: row.week, playerId: row.playerId, playerName: row.playerName, team: row.team, opponent: row.opponent, position: row.diagnostics.position })),
    crossPosition2025: Object.fromEntries((["RB", "WR", "TE"] as const).map((position) => {
      const selected = receivingScored.filter((entry) => entry.row.season === FROZEN_BENCHMARK_SEASON && entry.row.diagnostics.position === position);
      return [position, { scoreDistribution: distribution(selected.map((entry) => entry.matchupScore)), correlations: finalCorrelations(selected), bandOutcomes: bandOutcomes(selected) }];
    })),
    hardCases2025: {
      lowHistory: hardCase(receivingScored, (entry) => entry.row.diagnostics.gamesWithTargetsPriorThisSeason < 3 && !entry.row.diagnostics.hasPriorSeasonTargets),
      zeroTargetActualDiagnosticOnly: hardCase(receivingScored, (entry) => entry.row.diagnostics.zeroTargetFlag),
      volatileTargetShare: hardCase(receivingScored, (entry) => (stability(entry.row.features.playerUsage.targetShare) ?? 0) < -0.08),
    },
  },
  companionScoreDecision: "Expose opportunityScore and environmentScore beside matchupScore. They remain inspectable components, not confidence or uncertainty scores.",
  productionReadiness: {
    passing: "research baseline; unchanged; calibration and operational status/low-history gates remain open",
    rushing: "research baseline; unchanged; history/status and role-conditioned interval gates remain open",
    receiving: "research baseline; unchanged; history/status, zero-target handling, and role-conditioned interval gates remain open",
  },
};

writeAtomic(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${OUTPUT}`);
console.log(JSON.stringify({
  passingWinner: passingResearch.winner.id, rushingWinner: rushingResearch.winner.id, receivingWinner: receivingResearch.winner.id,
  bandCuts,
  correlations2025: {
    passing: report.passing.correlations.retrospective2025,
    rushing: report.rushing.correlations.retrospective2025,
    receiving: report.receiving.correlations.retrospective2025,
  },
}, null, 2));
