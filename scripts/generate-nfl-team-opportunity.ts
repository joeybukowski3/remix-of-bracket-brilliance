/**
 * WU4A: generate the current-week NFL team-opportunity artifact for one
 * (season, week). Produces the finite team opportunity pool (expected
 * plays, dropback rate, pass attempts, rush attempts) that WU4B will later
 * allocate to players. Changes no existing model, artifact, or UI.
 *
 * Usage:
 *   npx tsx scripts/generate-nfl-team-opportunity.ts --season=2026 --week=1
 *   npx tsx scripts/generate-nfl-team-opportunity.ts --season=2026 --week=1 --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, type NflTeamGameLogEntry } from "../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord } from "../src/lib/nfl/props/types/teamPregameFeatures";
import { marketKey, type NflHistoricalMarketRow } from "../src/lib/nfl/props/qbOpportunityFeatures";
import { buildTeamOpportunityFeatureRow } from "../src/lib/nfl/props/teamOpportunityFeatures";
import type { NflTeamOpportunityFeatureRow } from "../src/lib/nfl/props/types/teamOpportunity";
import { generateTeamOpportunityArtifact, type NflTeamOpportunitySources } from "../src/lib/nfl/props/teamOpportunityGenerator";
import type { NflFittedTeamOpportunityModel } from "../src/lib/nfl/props/teamOpportunityModel";
import {
  NFL_TEAM_OPPORTUNITY_FEATURE_SCHEMA_VERSION,
  NFL_TEAM_OPPORTUNITY_MODEL_NAME,
  NFL_TEAM_OPPORTUNITY_PIPELINE_VERSION,
} from "../src/lib/nfl/props/types/teamOpportunity";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";
import {
  archiveProductionPredictions, buildFittedModelManifest, buildSourceManifest, contentHash,
  finalizePredictionSnapshot, type JsonValue, type MarketSnapshotReference, type PredictionSnapshotDraft,
} from "./lib/nfl-production-prediction-archive";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const HISTORICAL_SEASONS = [2022, 2023, 2024, 2025] as const;
const TRAINING_SEASONS = [2022, 2023, 2024, 2025] as const;
const ARCHIVE_ROOT = join(ROOT, "data", "nfl", "predictions");
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
  const args = { season: 0, week: 0, dryRun: false, output: null as string | null, archiveRoot: ARCHIVE_ROOT, generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--archive-root=")) args.archiveRoot = resolve(ROOT, raw.slice(15));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || !Number.isInteger(args.week) || args.week < 1) {
    throw new Error("Usage: --season=YYYY --week=N [--dry-run] [--output=path] [--archive-root=path] [--generated-at=iso]");
  }
  return args;
}
function readManifest(dir: string): CacheManifest {
  return JSON.parse(readSource(join(ROOT, dir, "manifest.json")));
}
function verifiedCsvRows(dir: string, manifest: CacheManifest, season: number): CsvRow[] {
  const entry = manifest.files?.find((c) => c.season === season);
  if (!entry) throw new Error(`No cached ${dir} source for ${season}.`);
  const text = readSource(join(ROOT, dir, entry.filename));
  const problems = verifyCacheEntry(entry as never, text);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return parseCsv(text) as CsvRow[];
}
const intField = (row: CsvRow, f: string) => {
  const v = Number(String(row[f] ?? "").trim());
  if (!Number.isFinite(v)) throw new Error(`Invalid ${f} in play-volume cache.`);
  return v;
};
function toPlayVolumeRecord(row: CsvRow): NflTeamGamePlayVolumeRecord {
  return {
    gameId: String(row.game_id ?? "").trim(), season: intField(row, "season"), week: intField(row, "week"),
    team: String(row.team ?? "").trim(), opponent: String(row.opponent ?? "").trim(),
    eligiblePlays: intField(row, "eligible_plays"), passPlays: intField(row, "pass_plays"), rushPlays: intField(row, "rush_plays"),
    neutralEligiblePlays: intField(row, "neutral_eligible_plays"), neutralPassPlays: intField(row, "neutral_pass_plays"),
    passOeSum: intField(row, "pass_oe_sum"), passOeCount: intField(row, "pass_oe_count"),
  };
}
function readSeasonGames(season: number): (NflPropRawGameRecord & { neutralSite?: boolean })[] {
  const path = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  if (!existsSync(path)) return [];
  return (JSON.parse(readSource(path)) as { games?: (NflPropRawGameRecord & { neutralSite?: boolean })[] }).games ?? [];
}
function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try { writeFileSync(temporary, text, "utf8"); renameSync(temporary, path); }
  catch (error) { if (existsSync(temporary)) unlinkSync(temporary); throw error; }
}
const asJson = (v: unknown): JsonValue => JSON.parse(JSON.stringify(v)) as JsonValue;

function main(): void {
  const args = parseArgs(process.argv);
  const allSeasons = [...new Set([...HISTORICAL_SEASONS, args.season])];

  const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
  const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
  for (const season of HISTORICAL_SEASONS) {
    for (const row of verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season)) playVolumeRecords.push(toPlayVolumeRecord(row));
  }

  const games: (NflPropRawGameRecord & { neutralSite?: boolean })[] = [];
  for (const season of allSeasons) games.push(...readSeasonGames(season));
  if (games.filter((g) => g.season === args.season).length === 0) {
    throw new Error(`No schedule for season ${args.season} (public/data/nfl/${args.season}/games.json missing/empty). Fail-closed.`);
  }
  const gameJoinIndex = buildGameJoinIndex(games);
  const fullTeamGameLog: NflTeamGameLogEntry[] = buildTeamGameLog(playVolumeRecords, gameJoinIndex);
  const neutralByGame = new Map(games.map((g) => [g.gameId, g.neutralSite === true]));

  // Market context: historical settled lines (training/history rows) + live current-week feed (target season).
  const historicalMarket = JSON.parse(readSource(join(ROOT, "data", "nfl", "props", "historical-market-context-2022-2025.json"))) as { rows: NflHistoricalMarketRow[] };
  const marketByKey = new Map(historicalMarket.rows.map((r) => [marketKey(r.season, r.week, r.team), r]));
  let marketAvailable = false;
  let liveMarketObservedAt: string | null = null;
  let liveMarketHash: string | null = null;
  const liveMarketPath = join(ROOT, "public", "data", "nfl", "matchup-market.json");
  if (existsSync(liveMarketPath)) {
    const liveText = readSource(liveMarketPath);
    liveMarketHash = contentHash(liveText);
    const live = JSON.parse(liveText) as {
      _meta?: { generatedAt?: string }; currentSeason: number;
      currentMarket: Record<string, { gameId: string; season: number; week: number; homeAbbr: string; awayAbbr: string; spread: { home: number; away: number } | null; total: number | null }>;
    };
    liveMarketObservedAt = typeof live._meta?.generatedAt === "string" ? live._meta.generatedAt : null;
    if (live.currentSeason === args.season) {
      for (const g of Object.values(live.currentMarket ?? {})) {
        if (g.season !== args.season || g.spread == null || g.total == null) continue;
        marketByKey.set(marketKey(g.season, g.week, g.homeAbbr), { season: g.season, week: g.week, team: g.homeAbbr, homeAway: "home", spread: g.spread.home, total: g.total, impliedTeamTotal: g.total / 2 - g.spread.home / 2 });
        marketByKey.set(marketKey(g.season, g.week, g.awayAbbr), { season: g.season, week: g.week, team: g.awayAbbr, homeAway: "away", spread: g.spread.away, total: g.total, impliedTeamTotal: g.total / 2 - g.spread.away / 2 });
        marketAvailable = true;
      }
    }
  }

  const historicalRows: NflTeamOpportunityFeatureRow[] = playVolumeRecords
    .filter((r) => gameJoinIndex.has(`${r.season}|${r.week}|${r.team}`))
    .map((r) => buildTeamOpportunityFeatureRow(r, gameJoinIndex, { fullTeamGameLog, marketByKey }, neutralByGame));

  let fittedModel: NflFittedTeamOpportunityModel | null = null;
  const captures: { row: import("../src/lib/nfl/props/types/teamOpportunity").NflTeamOpportunityRow; featureRow: NflTeamOpportunityFeatureRow }[] = [];
  const sources: NflTeamOpportunitySources = {
    season: args.season, week: args.week, generatedAt: args.generatedAt,
    games, fullTeamGameLog, marketByKey, marketAvailable,
    historicalRows, trainingSeasons: [...TRAINING_SEASONS],
    archiveObserver: {
      onFittedModel: (m) => { fittedModel = m; },
      onPrediction: (c) => { captures.push(c); },
    },
  };

  const artifact = generateTeamOpportunityArtifact(sources);
  console.log(`[nfl:team-opportunity] season=${args.season} week=${args.week} games=${artifact.qa.gamesExpected} teamRows=${artifact.qa.teamRowsEmitted}`);
  console.log(`[nfl:team-opportunity] plays min/mean/max=${artifact.qa.playsRange.min.toFixed(1)}/${artifact.qa.playsRange.mean.toFixed(1)}/${artifact.qa.playsRange.max.toFixed(1)}`);
  console.log(`[nfl:team-opportunity] passAtt min/mean/max=${artifact.qa.passAttemptsRange.min.toFixed(1)}/${artifact.qa.passAttemptsRange.mean.toFixed(1)}/${artifact.qa.passAttemptsRange.max.toFixed(1)}`);
  console.log(`[nfl:team-opportunity] rushAtt min/mean/max=${artifact.qa.rushAttemptsRange.min.toFixed(1)}/${artifact.qa.rushAttemptsRange.mean.toFixed(1)}/${artifact.qa.rushAttemptsRange.max.toFixed(1)}`);
  console.log(`[nfl:team-opportunity] dropbackRate min/mean/max=${artifact.qa.dropbackRateRange.min.toFixed(3)}/${artifact.qa.dropbackRateRange.mean.toFixed(3)}/${artifact.qa.dropbackRateRange.max.toFixed(3)}`);
  console.log(`[nfl:team-opportunity] bothTeamsPerGame=${artifact.qa.bothTeamsPresentForEveryGame} coherenceViolations=${artifact.qa.coherenceViolations} insufficientHistory=${artifact.qa.eligibleInsufficientHistoryRows}`);

  if (args.dryRun) { console.log("[nfl:team-opportunity] --dry-run: not writing."); return; }
  if (fittedModel == null) throw new Error("archive integration did not capture the fitted model");
  const model: NflFittedTeamOpportunityModel = fittedModel;

  const sourceManifest = buildSourceManifest(
    "nfl-team-opportunity-production-inputs",
    [...consumedSources.entries()].map(([path, s]) => ({ logicalName: s.logicalName, path: path.slice(ROOT.length + 1), content: s.content })),
  );
  const fittedManifest = buildFittedModelManifest({
    model_name: NFL_TEAM_OPPORTUNITY_MODEL_NAME, model_version: model.modelVersion, training_seasons: [...TRAINING_SEASONS],
    feature_schema_version: NFL_TEAM_OPPORTUNITY_FEATURE_SCHEMA_VERSION, feature_order: [...model.ridgeFeatureOrder],
    parameters: { ridge_alpha: model.ridgeAlpha },
    fitted_state: asJson({ constants: model.constants, ridge: model.ridge }),
  });

  const gameById = new Map(games.map((g) => [g.gameId, g]));
  const createdAt = new Date().toISOString();
  const runId = process.env.GITHUB_RUN_ID ? `github:${process.env.GITHUB_RUN_ID}` : `local:${artifact.generatedAt}`;

  const records = captures.map(({ row, featureRow }) => {
    const game = gameById.get(row.gameId);
    const marketRefs: MarketSnapshotReference[] = [];
    if (row.flags.marketContextAvailable && featureRow.features.market.spread != null && featureRow.features.market.total != null) {
      const usingLive = marketAvailable && liveMarketObservedAt != null;
      const base = {
        purpose: "model_input" as const, market_observation_id: null,
        content_hash: usingLive ? liveMarketHash : null,
        provider: usingLive ? "the-odds-api" : "nflverse/nfldata",
        sportsbook: usingLive ? "consensus" : "undisclosed",
        observed_at: usingLive ? (liveMarketObservedAt as string) : row.generatedAt,
        provider_updated_at: null, over_price: null, under_price: null, side_prices: null,
        designation: "available_at_prediction" as const,
      };
      marketRefs.push({ ...base, market_type: "spread", line: featureRow.features.market.spread });
      marketRefs.push({ ...base, market_type: "total", line: featureRow.features.market.total });
    }
    const draft: PredictionSnapshotDraft = {
      schema_version: "jkb-football-prediction-v1", snapshot_label: null, prediction_timestamp: row.generatedAt, created_at: createdAt, mode: "production",
      sport: "football", league: "nfl", season: row.season, week: row.week, slate_date: row.kickoff.slice(0, 10), game_id: row.gameId, kickoff_utc: row.kickoff,
      player_id: null, player_name_at_prediction: null, team: row.team, opponent: row.opponent, home_away: row.homeAway,
      neutral_site: row.neutralSite, position: null, prediction_type: "team_opportunity",
      model_name: NFL_TEAM_OPPORTUNITY_MODEL_NAME, model_version: row.modelVersion, feature_schema_version: NFL_TEAM_OPPORTUNITY_FEATURE_SCHEMA_VERSION,
      pipeline_version: NFL_TEAM_OPPORTUNITY_PIPELINE_VERSION, code_revision: process.env.GITHUB_SHA ?? null, run_id: runId,
      workflow_name: process.env.GITHUB_WORKFLOW ?? null, workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
      cutoff_policy: "slate_before_first_kickoff",
      status: row.status === "eligibleInsufficientHistory" ? "eligible_insufficient_history" : "projected",
      projection: {
        type: "team_opportunity",
        projected_team_plays: row.projectedTeamPlays, projected_dropback_rate: row.projectedDropbackRate,
        projected_pass_attempts: row.projectedPassAttempts, projected_rush_attempts: row.projectedRushAttempts,
      },
      feature_snapshot: {
        values: asJson({ feature_snapshot: row.featureSnapshot, flags: row.flags, diagnostics: row.diagnostics }) as Record<string, JsonValue>,
        source_manifest_hashes: { team_opportunity_run: sourceManifest.hash }, fitted_model_hash: fittedManifest.hash,
      },
      market_reference_status: marketRefs.length > 0 ? "available" : "missing",
      market_snapshot_refs: marketRefs,
      provenance: [
        { kind: "source_manifest", logical_name: sourceManifest.manifest.logical_name, content_hash: sourceManifest.hash },
        { kind: "fitted_model_manifest", logical_name: fittedManifest.manifest.model_name, content_hash: fittedManifest.hash },
      ],
    };
    return finalizePredictionSnapshot(draft);
  });

  const preKickoff = records.filter((r) => Date.parse(r.prediction_timestamp) < Date.parse(r.kickoff_utc));
  const archiveResult = archiveProductionPredictions({
    rootDir: args.archiveRoot, records: preKickoff,
    sourceManifests: [sourceManifest], fittedModelManifests: [fittedManifest],
  });
  console.log(`[nfl:team-opportunity] archive appended=${archiveResult.appended} duplicates=${archiveResult.duplicates} skippedPostKickoff=${records.length - preKickoff.length}`);

  const outPath = args.output ?? join(ROOT, "public", "data", "nfl", String(args.season), "team-opportunity.json");
  const compact = JSON.stringify(artifact);
  writeAtomic(outPath, compact);
  console.log(`[nfl:team-opportunity] wrote ${outPath} (${compact.length} bytes)`);
}

main();
