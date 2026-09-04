/**
 * Phase 9: generates the current-week (production-candidate) NFL yardage
 * projection artifact for one (season, week). Reuses every already-
 * committed Phase 1-8 historical artifact for model training / Matchup
 * Score reference construction (never regenerates them), and reads the
 * live weekly-rosters snapshot + `matchup-market.json` current-week feed
 * for the target week's own candidate pool and market context.
 *
 * Usage:
 *   npx tsx scripts/generate-nfl-current-week-yardage-projections.ts --season=2026 --week=1
 *   npx tsx scripts/generate-nfl-current-week-yardage-projections.ts --season=2026 --week=1 --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, gameJoinKey, type NflPropRawGameRecord } from "../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures, type NflTeamGameLogEntry } from "../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "../src/lib/nfl/props/types/teamPregameFeatures";
import { buildTeamEpaGameLog, type NflTeamEpaGameLogEntry, type NflTeamEpaGameRecord } from "../src/lib/nfl/props/qbPassingEpaContext";
import { marketKey, type NflHistoricalMarketRow } from "../src/lib/nfl/props/qbOpportunityFeatures";
import { buildQbPassingFeatureRow, buildQbStatGameLog } from "../src/lib/nfl/props/qbPassingFeatures";
import type { NflQbPassingOutcome } from "../src/lib/nfl/props/types/qbPassing";
import { buildPlayerRushingStatLog, buildRushingFeatureRow, buildTeamTopRbCarryShareByGameTeam } from "../src/lib/nfl/props/rushingFeatures";
import type { NflRushingOutcome } from "../src/lib/nfl/props/types/rushingOutcome";
import { buildPlayerReceivingStatLog, buildReceivingFeatureRow, buildTeamTopTargetShareByGameTeam, type NflAirYardsSupplement } from "../src/lib/nfl/props/receivingFeatures";
import type { NflReceivingOutcome } from "../src/lib/nfl/props/types/receivingOutcome";
import { buildActivityLogFromUniverse, type NflCurrentWeekRosterSourceRow } from "../src/lib/nfl/props/currentWeekRosterUniverse";
import type { NflPlayerGameUniverseRow } from "../src/lib/nfl/props/types/playerGameUniverse";
import { generateCurrentWeekYardageProjections, type NflCurrentWeekSources } from "../src/lib/nfl/props/currentWeekGenerator";
import { resolveReceivingV2ProductionModel } from "../src/lib/nfl/props/roleAllocation/resolveProductionModel";
import type { NflReceivingShareModel } from "../src/lib/nfl/props/roleAllocation/receivingProduction";
import { resolveRushingShadowModel } from "../src/lib/nfl/props/roleAllocation/resolveRushingShadowModel";
import { computeShadowRushingAllocationForTeam, type NflLiveRbRoleEvidence } from "../src/lib/nfl/props/roleAllocation/rushingShadowAllocation";
import { shadowAvailable, shadowUnavailable, type NflShadowAvailability } from "../src/lib/nfl/props/roleAllocation/shadowAvailability";
import type { NflCurrentWeekProjectionRow, NflRushingAllocationDiagnostics } from "../src/lib/nfl/props/types/currentWeekProjection";
import type { NflFrozenScoreDefinition } from "../src/lib/nfl/props/currentWeekMatchupScore";
import { buildDepthChartIndex, parseDepthChartRows, type NflDepthChartCsvRow, type NflDepthChartIndex } from "../src/lib/nfl/props/currentWeekDepthChart";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";
import { PASSING_FEATURE_KEYS } from "../src/lib/nfl/props/qbPassingEncoding";
import { PASSING_RIDGE_ALPHA, PRODUCTION_TRAIN_SEASONS, type NflFittedPassingModel, type NflFittedReceivingModel, type NflFittedRushingModel } from "../src/lib/nfl/props/currentWeekYardageModel";
import { YPC_SHRINKAGE_PRIOR_STRENGTH_GAMES } from "../src/lib/nfl/props/rushingBaselines";
import { RECEIVING_EFFICIENCY_SHRINKAGE_PRIOR_STRENGTH_GAMES } from "../src/lib/nfl/props/receivingBaselines";
import { NFL_QB_PASSING_FEATURE_ROW_SCHEMA_VERSION } from "../src/lib/nfl/props/types/qbPassingFeatures";
import { NFL_RUSHING_FEATURE_ROW_SCHEMA_VERSION } from "../src/lib/nfl/props/types/rushingFeatures";
import { NFL_RECEIVING_FEATURE_ROW_SCHEMA_VERSION } from "../src/lib/nfl/props/types/receivingFeatures";
import {
  archiveProductionPredictions, buildFittedModelManifest, buildSourceManifest, contentHash,
  finalizePredictionSnapshot, type JsonValue, type MarketSnapshotReference, type PredictionSnapshotDraft,
} from "./lib/nfl-production-prediction-archive";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data", "nfl", "props");
const RECEIVING_ROLE_ALLOCATION_ARTIFACT_PATH = join(ROOT, "data", "nfl", "models", "receiving-role-allocation-v2.json");
const RUSHING_SHADOW_ARTIFACT_PATH = join(ROOT, "data", "nfl", "models", "rushing-shadow-allocation-v1.json");
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const EPA_CACHE_DIR = "data/nfl/nflverse/epa-team-game";
const STATS_CACHE_DIR = "data/nfl/nflverse/stats-player-week";
const ROSTER_CACHE_DIR = "data/nfl/nflverse/weekly-rosters";
const DEPTH_CHART_CACHE_DIR = "data/nfl/nflverse/depth-charts";
const HISTORICAL_SEASONS = [2022, 2023, 2024, 2025] as const;
const ARCHIVE_ROOT = join(ROOT, "data", "nfl", "predictions");
const ARCHIVE_PIPELINE_VERSION = "nfl-production-prediction-archive-v1";
const consumedSources = new Map<string, { logicalName: string; content: string }>();

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

function readSource(path: string, logicalName = path.slice(ROOT.length + 1)): string {
  const content = readFileSync(path, "utf8");
  consumedSources.set(path, { logicalName, content });
  return content;
}

function parseArgs(argv: string[]) {
  const args = {
    season: 0, week: 0, dryRun: false, output: null as string | null, archiveRoot: ARCHIVE_ROOT, generatedAt: new Date().toISOString(),
    allowReceivingV1Fallback: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--archive-root=")) args.archiveRoot = resolve(ROOT, raw.slice(15));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else if (raw === "--allow-receiving-v1-fallback") args.allowReceivingV1Fallback = true;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || !Number.isInteger(args.week) || args.week < 1) {
    throw new Error(
      "Usage: --season=YYYY --week=N [--dry-run] [--output=path] [--archive-root=path] [--generated-at=iso] [--allow-receiving-v1-fallback]",
    );
  }
  return args;
}

function readManifest(dir: string): CacheManifest {
  const path = join(ROOT, dir, "manifest.json");
  return JSON.parse(readSource(path));
}
function verifiedCsvRows(dir: string, manifest: CacheManifest, season: number): CsvRow[] {
  const entry = manifest.files?.find((c) => c.season === season);
  if (!entry) throw new Error(`No cached ${dir} source for ${season}.`);
  const sourcePath = join(ROOT, dir, entry.filename);
  const text = readSource(sourcePath);
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
  const artifact = JSON.parse(readSource(path)) as { games?: (NflPropRawGameRecord & { isDome?: boolean })[] };
  return artifact.games ?? [];
}
function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try { writeFileSync(temporary, text, "utf8"); renameSync(temporary, path); }
  catch (error) { if (existsSync(temporary)) unlinkSync(temporary); throw error; }
}

type ArchiveCapture = {
  row: NflCurrentWeekProjectionRow;
  featureValues: unknown;
  orderedVector?: number[];
  imputationFlags?: Record<string, string>;
};

type YardageMarketObservation = {
  observedAt: string;
  canonicalMarket: "passingYards" | "rushingYards" | "receivingYards";
  playerId: string;
  gameId: string;
  bookmaker: string;
  point: number;
  overPrice: number | null;
  underPrice: number | null;
};

function asJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function latestPlayerMarketReferences(row: NflCurrentWeekProjectionRow, observations: readonly YardageMarketObservation[]): MarketSnapshotReference[] {
  const canonicalMarket = row.market === "passing" ? "passingYards" : row.market === "rushing" ? "rushingYards" : "receivingYards";
  const predictionTime = Date.parse(row.generatedAt);
  const latestByBook = new Map<string, YardageMarketObservation>();
  for (const observation of observations) {
    if (observation.canonicalMarket !== canonicalMarket || observation.playerId !== row.playerId || observation.gameId !== row.gameId) continue;
    const observed = Date.parse(observation.observedAt);
    if (!Number.isFinite(observed) || observed > predictionTime) continue;
    const previous = latestByBook.get(observation.bookmaker);
    if (!previous || Date.parse(previous.observedAt) < observed) latestByBook.set(observation.bookmaker, observation);
  }
  return [...latestByBook.values()].sort((a, b) => a.bookmaker.localeCompare(b.bookmaker)).map((observation) => {
    const hash = contentHash(asJson(observation));
    return {
      purpose: "comparison", market_type: row.market === "passing" ? "passing_yards" : row.market === "rushing" ? "rushing_yards" : "receiving_yards",
      market_observation_id: `yardage_${hash}`, content_hash: hash, provider: "the-odds-api", sportsbook: observation.bookmaker,
      observed_at: observation.observedAt, provider_updated_at: null, line: observation.point,
      over_price: observation.overPrice, under_price: observation.underPrice, side_prices: null, designation: "available_at_prediction",
    };
  });
}

function passingModelInputReferences(capture: ArchiveCapture, liveMarketObservedAt: string | null, liveMarketHash: string | null): MarketSnapshotReference[] {
  if (capture.row.market !== "passing" || liveMarketObservedAt == null) return [];
  const market = (capture.featureValues as { market?: { spread?: number | null; total?: number | null } }).market;
  if (market?.spread == null || market.total == null) return [];
  const base = { purpose: "model_input" as const, market_observation_id: null, content_hash: liveMarketHash, provider: "nflverse/nfldata", sportsbook: "undisclosed", observed_at: liveMarketObservedAt, provider_updated_at: null, over_price: null, under_price: null, side_prices: null, designation: "available_at_prediction" as const };
  return [
    { ...base, market_type: "spread", line: market.spread },
    { ...base, market_type: "total", line: market.total },
  ];
}

function buildYardageFittedManifests(models: { passing: NflFittedPassingModel; rushing: NflFittedRushingModel; receiving: NflFittedReceivingModel }, versions: Record<"passing" | "rushing" | "receiving", string>) {
  return {
    passing: buildFittedModelManifest({
      model_name: "nfl-passing-direct-ridge", model_version: versions.passing, training_seasons: [...PRODUCTION_TRAIN_SEASONS],
      feature_schema_version: NFL_QB_PASSING_FEATURE_ROW_SCHEMA_VERSION, feature_order: PASSING_FEATURE_KEYS.map((feature) => feature.key),
      parameters: { ridge_alpha: PASSING_RIDGE_ALPHA }, fitted_state: asJson(models.passing),
    }),
    rushing: buildFittedModelManifest({
      model_name: "nfl-rushing-carries-x-shrunk-ypc", model_version: versions.rushing, training_seasons: [...PRODUCTION_TRAIN_SEASONS],
      feature_schema_version: NFL_RUSHING_FEATURE_ROW_SCHEMA_VERSION, feature_order: ["playerUsage.carriesPerGame", "playerEfficiency.yardsPerCarry"],
      parameters: { ypc_shrinkage_prior_strength_games: YPC_SHRINKAGE_PRIOR_STRENGTH_GAMES }, fitted_state: asJson(models.rushing),
    }),
    receiving: buildFittedModelManifest({
      model_name: "nfl-receiving-targets-x-shrunk-ypt", model_version: versions.receiving, training_seasons: [...PRODUCTION_TRAIN_SEASONS],
      feature_schema_version: NFL_RECEIVING_FEATURE_ROW_SCHEMA_VERSION, feature_order: ["playerUsage.targetsPerGame", "playerEfficiency.yardsPerTarget"],
      parameters: { ypt_shrinkage_prior_strength_games: RECEIVING_EFFICIENCY_SHRINKAGE_PRIOR_STRENGTH_GAMES },
      fitted_state: asJson({
        leagueMeanReceivingYards: models.receiving.constants.leagueMeanReceivingYards,
        leagueMeanYardsPerTarget: models.receiving.constants.leagueMeanYardsPerTarget,
        fallbackTargets: models.receiving.fallbackTargets,
      }),
    }),
  };
}

function main(): void {
  const args = parseArgs(process.argv);
  const trainingSeasons = [...HISTORICAL_SEASONS];
  const allSeasons = [...new Set([...trainingSeasons, args.season])];

  const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
  const epaManifest = readManifest(EPA_CACHE_DIR);
  const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
  const passEpaRecords: NflTeamEpaGameRecord[] = [];
  const rushEpaRecords: NflTeamEpaGameRecord[] = [];
  const games: (NflPropRawGameRecord & { isDome?: boolean })[] = [];
  for (const season of trainingSeasons) {
    for (const row of verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season)) playVolumeRecords.push(toPlayVolumeRecord(row));
    for (const row of verifiedCsvRows(EPA_CACHE_DIR, epaManifest, season)) {
      passEpaRecords.push(toEpaRecord(row, "pass"));
      rushEpaRecords.push(toEpaRecord(row, "rush"));
    }
  }
  for (const season of allSeasons) games.push(...readSeasonGames(season));
  if (games.filter((g) => g.season === args.season).length === 0) {
    throw new Error(`No schedule found for season ${args.season} (public/data/nfl/${args.season}/games.json missing or empty). Fail-closed: cannot generate without a schedule.`);
  }

  const gameJoinIndex = buildGameJoinIndex(games);
  const fullTeamGameLog: NflTeamGameLogEntry[] = buildTeamGameLog(playVolumeRecords, gameJoinIndex);
  const passEpaGameLog: NflTeamEpaGameLogEntry[] = buildTeamEpaGameLog(passEpaRecords, gameJoinIndex);
  const rushEpaGameLog: NflTeamEpaGameLogEntry[] = buildTeamEpaGameLog(rushEpaRecords, gameJoinIndex);
  const domeByGameId = new Map(games.filter((g) => g.gameId).map((g) => [g.gameId, Boolean(g.isDome)]));
  const teamPregameFeaturesByKey = new Map<string, NflTeamPregameFeatures>();
  for (const record of playVolumeRecords) {
    teamPregameFeaturesByKey.set(`${record.season}|${record.week}|${record.team}`, buildTeamPregameFeatures(record, gameJoinIndex, fullTeamGameLog));
  }

  // Historical market context (2022-2025, for training/reference rows) + live current-week market (target season only).
  const historicalMarketArtifact = JSON.parse(readSource(join(DATA_DIR, "historical-market-context-2022-2025.json"))) as { rows: NflHistoricalMarketRow[] };
  const marketByKey = new Map(historicalMarketArtifact.rows.map((row) => [marketKey(row.season, row.week, row.team), row]));
  let marketAvailable = false;
  let liveMarketObservedAt: string | null = null;
  let liveMarketHash: string | null = null;
  const liveMarketPath = join(ROOT, "public", "data", "nfl", "matchup-market.json");
  if (existsSync(liveMarketPath)) {
    const liveMarketText = readSource(liveMarketPath);
    liveMarketHash = contentHash(liveMarketText);
    const liveMarket = JSON.parse(liveMarketText) as {
      _meta?: { generatedAt?: string };
      currentSeason: number;
      currentMarket: Record<string, { gameId: string; season: number; week: number; homeAbbr: string; awayAbbr: string; spread: { home: number; away: number } | null; total: number | null }>;
    };
    liveMarketObservedAt = typeof liveMarket._meta?.generatedAt === "string" ? liveMarket._meta.generatedAt : null;
    if (liveMarket.currentSeason === args.season) {
      for (const g of Object.values(liveMarket.currentMarket ?? {})) {
        if (g.season !== args.season || g.spread == null || g.total == null) continue;
        const impliedHome = g.total / 2 - g.spread.home / 2;
        const impliedAway = g.total / 2 - g.spread.away / 2;
        marketByKey.set(marketKey(g.season, g.week, g.homeAbbr), { season: g.season, week: g.week, team: g.homeAbbr, homeAway: "home", spread: g.spread.home, total: g.total, impliedTeamTotal: impliedHome });
        marketByKey.set(marketKey(g.season, g.week, g.awayAbbr), { season: g.season, week: g.week, team: g.awayAbbr, homeAway: "away", spread: g.spread.away, total: g.total, impliedTeamTotal: impliedAway });
        marketAvailable = true;
      }
    }
  }

  // Historical outcome-derived feature rows (2022-2025) -- reused verbatim for model fit, score reference, and interval construction.
  const passingOutcomes = (JSON.parse(readSource(join(DATA_DIR, "qb-passing-outcomes-2022-2025.json"))) as { rows: NflQbPassingOutcome[] }).rows;
  const qbStatGameLog = buildQbStatGameLog(passingOutcomes, gameJoinIndex);
  const historicalPassingRows = passingOutcomes.map((outcome) => buildQbPassingFeatureRow(outcome, { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, epaGameLog: passEpaGameLog, marketByKey, domeByGameId, qbStatGameLog }));

  const rushingOutcomes = (JSON.parse(readSource(join(DATA_DIR, "rushing-outcomes-v2-2022-2025.json"))) as { rows: NflRushingOutcome[] }).rows;
  const playerRushingStatLog = buildPlayerRushingStatLog(rushingOutcomes, gameJoinIndex);
  const teamTopRbCarryShareByGameTeam = buildTeamTopRbCarryShareByGameTeam(rushingOutcomes);
  const historicalRushingRows = rushingOutcomes.map((outcome) => buildRushingFeatureRow(outcome, { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, rushEpaGameLog, marketByKey, domeByGameId, playerRushingStatLog, teamTopRbCarryShareByGameTeam }));

  const receivingOutcomes = (JSON.parse(readSource(join(DATA_DIR, "receiving-outcomes-2022-2025.json"))) as { rows: NflReceivingOutcome[] }).rows;
  const airYardsByPlayerWeek = new Map<string, NflAirYardsSupplement>();
  const statsManifest = readManifest(STATS_CACHE_DIR);
  for (const season of trainingSeasons) {
    for (const row of verifiedCsvRows(STATS_CACHE_DIR, statsManifest, season)) {
      if (String(row.season_type ?? "").toUpperCase() !== "REG" || !row.player_id) continue;
      const airYards = Number(row.receiving_air_yards);
      if (Number.isFinite(airYards)) airYardsByPlayerWeek.set(`gsis:${String(row.player_id).trim()}|${season}|${Number(row.week)}`, { airYards });
    }
  }
  const playerReceivingStatLog = buildPlayerReceivingStatLog(receivingOutcomes, gameJoinIndex, airYardsByPlayerWeek);
  const teamTopTargetShareByGameTeam = buildTeamTopTargetShareByGameTeam(receivingOutcomes);
  const historicalReceivingRows = receivingOutcomes.map((outcome) => buildReceivingFeatureRow(outcome, { gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, passEpaGameLog, marketByKey, domeByGameId, playerReceivingStatLog, teamTopTargetShareByGameTeam }));

  // Eligibility activity logs (2022-2025 canonical universe -- the ONLY source, never the target week itself).
  const universe = (JSON.parse(readSource(join(DATA_DIR, "player-game-universe-2022-2025.json"))) as { rows: NflPlayerGameUniverseRow[] }).rows;
  const rushActivityLog = buildActivityLogFromUniverse(universe, "carries");
  const targetActivityLog = buildActivityLogFromUniverse(universe, "targets");
  const attemptActivityLog = buildActivityLogFromUniverse(universe, "passAttempts");

  // Live target-week roster snapshot.
  const rosterManifest = readManifest(ROSTER_CACHE_DIR);
  const rosterEntry = rosterManifest.files?.find((c) => c.season === args.season);
  if (!rosterEntry) throw new Error(`No cached weekly-rosters source for ${args.season}. Fail-closed: cannot resolve current-week roster membership.`);
  const rosterCsvRows = verifiedCsvRows(ROSTER_CACHE_DIR, rosterManifest, args.season);
  const rosterRows: NflCurrentWeekRosterSourceRow[] = rosterCsvRows
    .filter((row) => finiteField(row, "week", true) === args.week)
    .map((row) => ({
      season: finiteField(row, "season", true), week: finiteField(row, "week", true), team: String(row.team ?? "").trim(),
      gsisId: String(row.gsis_id ?? "").trim(), playerName: String(row.full_name ?? "").trim(), position: String(row.position ?? "").trim(), status: String(row.status ?? "").trim(),
    }));
  if (rosterRows.length === 0) throw new Error(`No weekly-rosters rows found for season ${args.season} week ${args.week}. Fail-closed.`);

  // Live depth-chart role evidence (Phase 9.2). NOT fail-closed: a missing
  // or malformed cache falls back to Phase 9.1 historical-volume/scarcity-
  // floor behavior (see `depthChartSource` on the returned artifact) --
  // depth-chart availability must never block the whole pipeline.
  let depthChartIndex: NflDepthChartIndex | null = null;
  try {
    const depthChartManifest = readManifest(DEPTH_CHART_CACHE_DIR);
    const depthChartEntry = depthChartManifest.files?.find((c) => c.season === args.season);
    if (depthChartEntry) {
      const depthChartCsvRows = verifiedCsvRows(DEPTH_CHART_CACHE_DIR, depthChartManifest, args.season) as unknown as NflDepthChartCsvRow[];
      depthChartIndex = buildDepthChartIndex(parseDepthChartRows(depthChartCsvRows));
      console.log(`[nfl:current-week-projections] depth chart: snapshot ${depthChartIndex.sourceSnapshotAt}, ${depthChartCsvRows.length} rows`);
    } else {
      console.log(`[nfl:current-week-projections] no depth chart cache for season ${args.season}, falling back to Phase 9.1 behavior`);
    }
  } catch (err) {
    // Any failure reading/parsing the depth-chart cache (missing directory,
    // missing manifest, malformed CSV) must never block generation -- the
    // whole pipeline falls back to Phase 9.1 historical-volume/scarcity-
    // floor behavior, disclosed via `depthChartSource` on the artifact.
    console.error(`[nfl:current-week-projections] depth chart cache unusable, falling back to Phase 9.1 behavior: ${(err as Error).message}`);
  }

  // Frozen Matchup Score weight definitions (Phase 8 research artifact).
  const scoreResearch = JSON.parse(readSource(join(DATA_DIR, "matchup-score-research.json"))) as {
    passing: { selectedDefinition: NflFrozenScoreDefinition }; rushing: { selectedDefinition: NflFrozenScoreDefinition }; receiving: { selectedDefinition: NflFrozenScoreDefinition };
  };

  // WU4B S6: receiving v2 (finite targetable-pass pool allocation). Loads
  // the compact, committed, hash-verified fitted artifact -- NOT the
  // gitignored player-level research dataset (see productionArtifact.ts for
  // why that split is safe). FAIL CLOSED by default: if receiving v2 is the
  // declared production model and either the fitted artifact or this week's
  // WU4A team-opportunity rows can't be loaded, this run ABORTS rather than
  // silently shipping v1 predictions under a v2-capable pipeline. Passing
  // --allow-receiving-v1-fallback explicitly opts into the old permissive
  // (now loudly logged) behavior. Rushing/passing/QB rushing are untouched.
  let receivingShareModel: NflReceivingShareModel | undefined;
  let teamOpportunityDropbacksByTeam: Map<string, number> | undefined;
  {
    const teamOppPath = join(ROOT, "public", "data", "nfl", String(args.season), "team-opportunity.json");
    const resolution: ReturnType<typeof resolveReceivingV2ProductionModel> = (() => {
      if (!existsSync(RECEIVING_ROLE_ALLOCATION_ARTIFACT_PATH)) {
        return { ok: false, reason: `Fitted artifact not found at ${RECEIVING_ROLE_ALLOCATION_ARTIFACT_PATH}.` };
      }
      if (!existsSync(teamOppPath)) {
        return { ok: false, reason: `WU4A team-opportunity artifact not found at ${teamOppPath}.` };
      }
      let artifactJson: unknown;
      try {
        artifactJson = JSON.parse(readSource(RECEIVING_ROLE_ALLOCATION_ARTIFACT_PATH));
      } catch (err) {
        return { ok: false, reason: `Fitted artifact at ${RECEIVING_ROLE_ALLOCATION_ARTIFACT_PATH} is not valid JSON: ${(err as Error).message}` };
      }
      const teamOpportunityRows = (JSON.parse(readSource(teamOppPath)) as { rows: { team: string; week: number; projectedPassAttempts: number }[] }).rows ?? [];
      return resolveReceivingV2ProductionModel({ artifactJson, teamOpportunityRows, week: args.week });
    })();

    if (resolution.ok) {
      receivingShareModel = resolution.model;
      teamOpportunityDropbacksByTeam = resolution.teamOpportunityDropbacksByTeam;
      console.log(
        `[nfl:current-week-projections] receiving v2 fitted artifact: trainedThroughSeason=${resolution.model.trainedThroughSeason} ` +
          `datasetSeasons=${JSON.stringify(resolution.model.datasetSeasons)} contentHash=${resolution.model.fittedArtifactHash}`,
      );
      console.log(`[nfl:current-week-projections] receiving v2: ${teamOpportunityDropbacksByTeam.size} teams from WU4A team-opportunity`);
    } else if (!args.allowReceivingV1Fallback) {
      throw new Error(
        `Receiving v2 is the declared production model but its fitted artifact / WU4A dependency could not be loaded -- FAILING CLOSED ` +
          `(scheduled production must not silently ship v1 under a v2 label). Reason: ${resolution.reason}. ` +
          `Pass --allow-receiving-v1-fallback to explicitly permit a v1 fallback for this run.`,
      );
    } else {
      console.error(
        `[nfl:current-week-projections] RECEIVING V2 UNAVAILABLE -- explicitly falling back to v1 because --allow-receiving-v1-fallback was set. Reason: ${resolution.reason}`,
      );
    }
  }

  // WU4D.3/4: rushing-v2 SHADOW role allocation. DIAGNOSTIC ONLY -- never
  // alters production rushing's projectedCarries/projectedYardsPerCarry/
  // projectedYards (those remain the simple carries x shrunk YPC model,
  // computed entirely inside generateCurrentWeekYardageProjections below,
  // untouched by anything in this block). Loads the compact, committed,
  // hash-verified artifact (rushingShadowArtifact.ts) -- NEVER the
  // gitignored 34MB player-level research dataset. FAILS OPEN by design
  // (WU4D.3 §10 recommendation B): if the artifact or this week's WU4A
  // team-opportunity rows are unavailable, production rushing generation
  // proceeds completely unaffected and every rushing row simply carries no
  // `allocationDiagnostics` -- this is instrumentation, not the model
  // itself, so it must never be able to block or alter a production run.
  let rushingShadowPending: { model: import("../src/lib/nfl/props/roleAllocation/rushingShadowArtifact").NflRushingShadowModel; teamOppRows: { team: string; week: number; gameId: string; kickoff: string; projectedRushAttempts: number }[] } | null = null;
  // WU4F.1 §4: every rushing row must end up with an EXPLICIT shadow
  // availability fact -- never a silent null. `rushingShadowGlobalUnavailable`
  // covers a failure that applies to the whole run (no artifact, no WU4A at
  // all); the per-team loop below can additionally mark individual teams
  // unavailable (missing_team_row / allocation_failure) even when the run
  // overall is healthy.
  let rushingShadowGlobalUnavailable: NflShadowAvailability | null = null;
  {
    const teamOppPath = join(ROOT, "public", "data", "nfl", String(args.season), "team-opportunity.json");
    const resolution = (() => {
      if (!existsSync(RUSHING_SHADOW_ARTIFACT_PATH)) {
        return { ok: false as const, reason: `Rushing shadow artifact not found at ${RUSHING_SHADOW_ARTIFACT_PATH}.`, unavailable: shadowUnavailable("missing_shadow_artifact") };
      }
      if (!existsSync(teamOppPath)) {
        return { ok: false as const, reason: `WU4A team-opportunity artifact not found at ${teamOppPath}.`, unavailable: shadowUnavailable("missing_team_opportunity") };
      }
      let artifactJson: unknown;
      try {
        artifactJson = JSON.parse(readSource(RUSHING_SHADOW_ARTIFACT_PATH));
      } catch (err) {
        return { ok: false as const, reason: `Rushing shadow artifact at ${RUSHING_SHADOW_ARTIFACT_PATH} is not valid JSON: ${(err as Error).message}`, unavailable: shadowUnavailable("invalid_shadow_artifact") };
      }
      const modelResolution = resolveRushingShadowModel(artifactJson);
      if (!modelResolution.ok) return { ok: false as const, reason: modelResolution.reason, unavailable: shadowUnavailable("invalid_shadow_artifact") };
      const teamOppRows = (JSON.parse(readSource(teamOppPath)) as { rows: { team: string; week: number; gameId: string; kickoff: string; projectedRushAttempts: number }[] }).rows ?? [];
      return { ok: true as const, model: modelResolution.model, teamOppRows: teamOppRows.filter((r) => r.week === args.week) };
    })();

    if (!resolution.ok) {
      console.error(`[nfl:current-week-projections] rushing shadow diagnostics: unavailable -- ${resolution.reason}`);
      rushingShadowGlobalUnavailable = resolution.unavailable;
    } else if (resolution.teamOppRows.length === 0) {
      console.error(`[nfl:current-week-projections] rushing shadow diagnostics: unavailable -- WU4A team-opportunity artifact has no week-${args.week} rows.`);
      rushingShadowGlobalUnavailable = shadowUnavailable("missing_team_opportunity");
    } else {
      console.log(
        `[nfl:current-week-projections] rushing shadow diagnostics: loaded (trainedThroughSeason=${resolution.model.trainedThroughSeason} ` +
          `datasetSeasons=${JSON.stringify(resolution.model.datasetSeasons)} contentHash=${resolution.model.fittedArtifactHash})`,
      );
      // Deferred: built from artifact.rows once generation completes (rows carry
      // the already-computed live feature snapshot this needs) -- see below.
      rushingShadowPending = { model: resolution.model, teamOppRows: resolution.teamOppRows };
    }
  }

  const archiveCaptures: ArchiveCapture[] = [];
  let fittedModels: { passing: NflFittedPassingModel; rushing: NflFittedRushingModel; receiving: NflFittedReceivingModel } | null = null;
  const sources: NflCurrentWeekSources = {
    season: args.season, week: args.week, generatedAt: args.generatedAt,
    rosterRows, games, gameJoinIndex, fullTeamGameLog, passEpaGameLog, rushEpaGameLog, marketByKey, marketAvailable, domeByGameId,
    qbStatGameLog, playerRushingStatLog, playerReceivingStatLog, teamTopRbCarryShareByGameTeam, teamTopTargetShareByGameTeam,
    rushActivityLog, targetActivityLog, attemptActivityLog,
    historicalPassingRows, historicalRushingRows, historicalReceivingRows,
    depthChartIndex,
    receivingShareModel,
    teamOpportunityDropbacksByTeam,
    scoreDefinitions: { passing: scoreResearch.passing.selectedDefinition, rushing: scoreResearch.rushing.selectedDefinition, receiving: scoreResearch.receiving.selectedDefinition },
    archiveObserver: {
      onFittedModels: (models) => { fittedModels = models; },
      onPrediction: (capture) => { archiveCaptures.push(capture); },
    },
  };

  let artifact = generateCurrentWeekYardageProjections(sources);

  // WU4D.3/4: compute rushing shadow diagnostics from the ALREADY-BUILT
  // rushing rows' own live feature snapshot (no second dataset, no
  // independent WU4A recomputation -- `projectedRushAttempts` below is
  // read verbatim off the WU4A team-opportunity rows resolved earlier).
  // POST-PROCESSING BY DESIGN: unlike receiving v2 (wired inside
  // currentWeekGenerator.ts), this stays entirely outside that function so
  // the row-construction code that computes production
  // projectedCarries/projectedYardsPerCarry/projectedYards is never
  // touched by this change -- see WU4D.4 checkpoint for the rationale.
  // `rushingShadowDiagnosticsByPlayerId` is consulted below both when
  // rewriting `artifact.rows` (so the public artifact discloses shadow
  // diagnostics too) and when building the archive `feature_snapshot`.
  const rushingShadowDiagnosticsByPlayerId = new Map<string, NflRushingAllocationDiagnostics>();
  // WU4F.1 §4: every rushing playerId this run evaluates gets an explicit
  // entry here -- available or a specific unavailable reason -- filled in
  // below as each row's fate is decided. Never left as an implicit null.
  const rushingShadowAvailabilityByPlayerId = new Map<string, NflShadowAvailability>();
  if (rushingShadowPending) {
    const { model, teamOppRows } = rushingShadowPending;
    const teamOppByTeam = new Map(teamOppRows.map((r) => [r.team, r]));
    const RUSH_POOL_OF: Record<string, "qb" | "rb" | "wrTe"> = { QB: "qb", RB: "rb", WR: "wrTe", TE: "wrTe" };
    const rushingRows = artifact.rows.filter((r): r is Extract<NflCurrentWeekProjectionRow, { market: "rushing" }> => r.market === "rushing");
    const byTeam = new Map<string, typeof rushingRows>();
    for (const r of rushingRows) (byTeam.get(r.team) ?? byTeam.set(r.team, []).get(r.team)!).push(r);

    let coherenceFailures = 0;
    for (const [team, rows] of byTeam) {
      const to = teamOppByTeam.get(team);
      if (!to) {
        // this team's game not in this week's WU4A rows -- shadow stays
        // unavailable for it, with an explicit reason; production unaffected.
        for (const r of rows) rushingShadowAvailabilityByPlayerId.set(r.playerId, shadowUnavailable("missing_team_row"));
        continue;
      }
      const liveEvidence: NflLiveRbRoleEvidence[] = rows.map((r) => ({
        playerId: r.playerId, playerName: r.playerName, team: r.team, gameId: r.gameId, gameDateUtc: to.kickoff,
        poolKey: RUSH_POOL_OF[r.position] ?? "wrTe", depthRankProxy: r.depthRank, isProjectedStarter: r.starterFlag === true,
        priorShare: r.featureSnapshot.carryShare.priorSeason ?? r.featureSnapshot.carryShare.seasonPrior ?? null,
        priorGamesPlayed: r.diagnostics.gamesWithCarriesPriorThisSeason, noHistory: r.hardCaseFlags.noHistory, limitedHistory: r.hardCaseFlags.limitedHistory,
        teamChanged: r.hardCaseFlags.teamChanged, roleSourced: r.roleConfidence === "sourced",
        concentration: r.diagnostics.recentTeamTopCarryShareConcentration, rosterCompetitionCount: null,
      }));
      try {
        const result = computeShadowRushingAllocationForTeam({
          team, season: args.season, week: args.week, gameDateUtc: to.kickoff, projectedDesignedRushes: to.projectedRushAttempts, liveEvidence, model,
        });
        for (const p of result.players) {
          rushingShadowDiagnosticsByPlayerId.set(p.playerId, p.diagnostics);
          rushingShadowAvailabilityByPlayerId.set(p.playerId, shadowAvailable());
        }
        for (const poolKey of ["qb", "rb", "wrTe"] as const) {
          const poolPlayers = result.players.filter((p) => p.poolKey === poolKey);
          if (poolPlayers.length === 0) continue;
          const sum = poolPlayers.reduce((s, p) => s + (p.diagnostics.projectedCarries ?? 0), 0);
          if (Math.abs(sum - result.poolSizes[poolKey]) > 1e-6) coherenceFailures += 1;
        }
      } catch (err) {
        // One team's shadow allocation failing must never affect production
        // rushing rows (for this team or any other) -- log, mark this
        // team's rows explicitly unavailable, and continue.
        console.error(`[nfl:current-week-projections] rushing shadow diagnostics: team ${team} allocation failed -- ${(err as Error).message}`);
        for (const r of rows) rushingShadowAvailabilityByPlayerId.set(r.playerId, shadowUnavailable("allocation_failure"));
      }
    }
    console.log(
      `[nfl:current-week-projections] rushing shadow diagnostics: attached to ${rushingShadowDiagnosticsByPlayerId.size}/${rushingRows.length} rushing rows, pool coherence failures=${coherenceFailures}`,
    );
    if (rushingShadowDiagnosticsByPlayerId.size > 0) {
      artifact = {
        ...artifact,
        rows: artifact.rows.map((r) =>
          r.market === "rushing" && rushingShadowDiagnosticsByPlayerId.has(r.playerId)
            ? { ...r, allocationDiagnostics: rushingShadowDiagnosticsByPlayerId.get(r.playerId)! }
            : r,
        ),
      };
    }
  }

  // WU4C.1 Part 13: concise production log line -- model versions in one
  // place, plus the receiving-v2-vs-v1 team count so a run's log alone
  // answers "did WU4A actually feed receiving this run" without opening the
  // artifact.
  console.log(`[nfl:current-week-projections] model versions passing=${artifact.modelVersions.passing} rushing=${artifact.modelVersions.rushing} receiving=${artifact.modelVersions.receiving}`);
  console.log(`[nfl:current-week-projections] receiving v2 teams=${teamOpportunityDropbacksByTeam?.size ?? 0} (0 means receiving stayed on v1 this run -- see the reason logged above)`);
  console.log(`[nfl:current-week-projections] season=${args.season} week=${args.week} games=${artifact.qa.gamesExpected} playersEvaluated=${artifact.qa.playersEvaluated}`);
  console.log(`[nfl:current-week-projections] emitted passing=${artifact.qa.projectionsEmittedByMarket.passing} rushing=${artifact.qa.projectionsEmittedByMarket.rushing} receiving=${artifact.qa.projectionsEmittedByMarket.receiving}`);
  console.log(`[nfl:current-week-projections] depth chart source: available=${artifact.depthChartSource.available} stale=${artifact.depthChartSource.stale} snapshotAt=${artifact.depthChartSource.snapshotAt}`);
  console.log(`[nfl:current-week-projections] sourced role candidates passing=${artifact.qa.sourcedRoleCandidates.passing} rushing=${artifact.qa.sourcedRoleCandidates.rushing} receiving=${artifact.qa.sourcedRoleCandidates.receiving}`);
  console.log(`[nfl:current-week-projections] limited/no-history passing=${artifact.qa.limitedOrNoHistoryRows.passing} rushing=${artifact.qa.limitedOrNoHistoryRows.rushing} receiving=${artifact.qa.limitedOrNoHistoryRows.receiving}`);
  console.log(`[nfl:current-week-projections] unresolved identity rows=${artifact.qa.unresolvedIdentityRows}`);

  if (args.dryRun) {
    console.log("[nfl:current-week-projections] --dry-run: not writing artifact.");
    return;
  }

  if (fittedModels == null) throw new Error("Archive integration did not capture fitted model states.");
  const propMarketPath = join(DATA_DIR, "market-archive", "nfl-yardage-market-archive.jsonl");
  const propMarketObservations: YardageMarketObservation[] = existsSync(propMarketPath)
    ? readFileSync(propMarketPath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as YardageMarketObservation)
    : [];
  const sourceManifest = buildSourceManifest("nfl-current-week-yardage-production-inputs", [...consumedSources.entries()].map(([path, source]) => ({ logicalName: source.logicalName, path: path.slice(ROOT.length + 1), content: source.content })));
  const fittedManifests = buildYardageFittedManifests(fittedModels, artifact.modelVersions);
  const fittedByMarket = { passing: fittedManifests.passing, rushing: fittedManifests.rushing, receiving: fittedManifests.receiving };
  const gameById = new Map(games.map((game) => [game.gameId, game]));
  const archiveCreatedAt = new Date().toISOString();
  const runId = process.env.GITHUB_RUN_ID ? `github:${process.env.GITHUB_RUN_ID}` : `local:${artifact.generatedAt}`;
  const records = archiveCaptures.map((capture) => {
    const row = capture.row;
    if (row.projectedYards == null) throw new Error(`Cannot archive non-numeric production row ${row.market}/${row.playerId}`);
    const model = fittedByMarket[row.market];
    const inputRefs = passingModelInputReferences(capture, liveMarketObservedAt, liveMarketHash);
    const comparisonRefs = latestPlayerMarketReferences(row, propMarketObservations);
    const marketRefs = [...inputRefs, ...comparisonRefs];
    const game = gameById.get(row.gameId);
    const projection = row.market === "passing"
      ? { type: "passing" as const, projected_attempts: null, projected_ypa: null, projected_passing_yards: row.projectedYards, direct_model_prediction: row.directModelPrediction ?? row.projectedYards }
      : row.market === "rushing"
        ? { type: "rushing" as const, projected_carries: row.projectedCarries!, projected_ypc: row.projectedYardsPerCarry!, projected_rushing_yards: row.projectedYards }
        : { type: "receiving" as const, projected_targets: row.projectedTargets!, projected_receptions: null, projected_yards_per_reception: null, projected_yards_per_target: row.projectedYardsPerTarget!, projected_receiving_yards: row.projectedYards };
    const draft: PredictionSnapshotDraft = {
      schema_version: "jkb-football-prediction-v1", snapshot_label: null, prediction_timestamp: row.generatedAt, created_at: archiveCreatedAt, mode: "production",
      sport: "football", league: "nfl", season: row.season, week: row.week, slate_date: row.kickoff.slice(0, 10), game_id: row.gameId, kickoff_utc: row.kickoff,
      player_id: row.playerId, player_name_at_prediction: row.playerName, team: row.team, opponent: row.opponent, home_away: row.homeAway,
      neutral_site: (game as { neutralSite?: boolean } | undefined)?.neutralSite === true, position: row.position, prediction_type: row.market,
      model_name: model.manifest.model_name, model_version: row.modelVersion, feature_schema_version: model.manifest.feature_schema_version,
      pipeline_version: ARCHIVE_PIPELINE_VERSION, code_revision: process.env.GITHUB_SHA ?? null, run_id: runId,
      workflow_name: process.env.GITHUB_WORKFLOW ?? null, workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
      cutoff_policy: "slate_before_first_kickoff", status: row.status === "eligibleInsufficientHistory" ? "eligible_insufficient_history" : row.status === "notEligible" ? "not_eligible" : row.status === "dataUnresolved" ? "unavailable" : "projected",
      projection, feature_snapshot: {
        values: asJson({
          model_features: capture.featureValues, production_feature_snapshot: row.featureSnapshot, estimated_range: row.estimatedRange, matchup_score: row.matchupScore,
          hard_case_flags: row.hardCaseFlags, role: { fallback_provenance: row.fallbackProvenance, role_source: row.roleSource, role_source_updated_at: row.roleSourceUpdatedAt, depth_rank: row.depthRank, starter_flag: row.starterFlag, role_confidence: row.roleConfidence, history_status: row.historyStatus }, diagnostics: row.diagnostics,
          // WU4D.4: `capture.row` was captured DURING generation (via the
          // archiveObserver callback), before rushing shadow diagnostics
          // are computed as a post-processing step below -- so rushing
          // rows look up their diagnostics from `rushingShadowDiagnosticsByPlayerId`
          // by playerId rather than reading `row.allocationDiagnostics`
          // (receiving v2's diagnostics ARE set inside the generator, so
          // `row.allocationDiagnostics` remains correct for receiving).
          allocation_diagnostics: row.market === "rushing"
            ? rushingShadowDiagnosticsByPlayerId.get(row.playerId) ?? null
            : (row as { allocationDiagnostics?: unknown }).allocationDiagnostics ?? null,
          // WU4F.1 §4: explicit shadow-availability fact for every rushing
          // row -- never an ambiguous null. A run-wide failure (no
          // artifact, no WU4A at all) takes precedence; otherwise each
          // row's own per-team outcome from the loop above is used. Null
          // only for non-rushing rows, where shadow does not apply.
          shadow_availability: row.market === "rushing"
            ? asJson(rushingShadowGlobalUnavailable ?? rushingShadowAvailabilityByPlayerId.get(row.playerId) ?? shadowUnavailable("other"))
            : null,
          // WU4D.2: flat top-level mirrors of the nested values above, so
          // nfl-evaluation-cohorts.ts's CANDIDATE_COHORT_FEATURE_KEYS
          // allowlist (a flat top-level lookup) can actually surface them
          // as queryable `candidate__*` cohorts in evaluation rows -- the
          // nested forms above are kept unchanged for existing consumers.
          team_changed: row.hardCaseFlags.teamChanged, no_history: row.hardCaseFlags.noHistory, limited_history: row.hardCaseFlags.limitedHistory,
          role_sourced: row.roleConfidence === "sourced", depth_chart_rank: row.depthRank, starter_flag: row.starterFlag,
          // WU4D.4: flat mirror of the rushing shadow allocator's role-conflict
          // flag (null for every non-rushing row, and for rushing rows the
          // shadow allocator couldn't cover this run).
          role_conflict: row.market === "rushing" ? rushingShadowDiagnosticsByPlayerId.get(row.playerId)?.roleConflictFlag ?? null : null,
        }) as Record<string, JsonValue>,
        ...(capture.orderedVector ? { ordered_vector: capture.orderedVector } : {}), ...(capture.imputationFlags ? { imputation_flags: capture.imputationFlags } : {}),
        source_manifest_hashes: { yardage_run: sourceManifest.hash }, fitted_model_hash: model.hash,
      },
      market_reference_status: marketRefs.length > 0 ? "available" : "missing", market_snapshot_refs: marketRefs,
      provenance: [
        { kind: "source_manifest", logical_name: sourceManifest.manifest.logical_name, content_hash: sourceManifest.hash },
        { kind: "fitted_model_manifest", logical_name: model.manifest.model_name, content_hash: model.hash },
      ],
    };
    return finalizePredictionSnapshot(draft);
  });

  // Fail closed: validation and durable archive publication complete before the browser-facing artifact is replaced.
  const archiveResult = archiveProductionPredictions({
    rootDir: args.archiveRoot, records,
    sourceManifests: [sourceManifest], fittedModelManifests: Object.values(fittedManifests),
  });
  console.log(`[nfl:current-week-projections] archive appended=${archiveResult.appended} duplicates=${archiveResult.duplicates}`);

  const outPath = args.output ?? join(ROOT, "public", "data", "nfl", String(args.season), "yardage-projections.json");
  // Compact (no pretty-print indentation) -- this is the browser-facing
  // production artifact; schema/field content is unchanged, only
  // whitespace is removed. Use `node -e "console.log(JSON.stringify(require(path),null,2))"`
  // or a formatter locally to inspect it readably.
  const compact = JSON.stringify(artifact);
  writeAtomic(outPath, compact);
  console.log(`[nfl:current-week-projections] wrote ${outPath} (${compact.length} bytes)`);
}

main();
