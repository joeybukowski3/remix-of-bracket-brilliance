/**
 * Generate + archive the current-week NFL projected game totals for one
 * (season, week). Produces two immutable `team_total` prediction rows per
 * game (home + away expected points; their unrounded sum is the projected
 * game total) using the frozen `jkb-nfl-total-ridge-v1.0.0` model
 * (src/lib/nfl/props/totals/**).
 *
 * Changes NO model math, NO UI, NO spread model. It only wires the
 * already-merged, research/production-parity-verified model to:
 *   - the MAINTAINED production scoring-support cache
 *     (data/nfl/nflverse/scoring-support-team-game/, refreshed by
 *     scripts/refresh-nfl-scoring-support-cache.mjs) -- NOT the research-only
 *     cache, and NOT any research script at runtime, and
 *   - the WU1 immutable prediction archive
 *     (scripts/lib/nfl-production-prediction-archive.ts), mirroring WU4A's
 *     generate-nfl-team-opportunity.ts exactly (two team-keyed rows/game, no
 *     player_id, requires fitted_model_hash).
 *
 * Vegas is never read here. `market_reference_status` is always
 * "not_applicable" -- the total model has no market input by design and must
 * never gain one (JKB_MODELING_MASTER_SPEC).
 *
 * Fail-closed: any unresolved feature side skips that whole game's archiving
 * (both rows) with a logged reason -- a partial/degraded total is never
 * archived.
 *
 * Usage:
 *   npx tsx scripts/generate-nfl-totals.ts --season=2026 --week=1
 *   npx tsx scripts/generate-nfl-totals.ts --season=2025 --week=12 --dry-run
 *   npx tsx scripts/generate-nfl-totals.ts --season=2025 --week=12 \
 *     --archive-root=/tmp/totals-dryrun --generated-at=2025-11-20T12:00:00.000Z
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeNflTeamAbbr } from "../src/lib/nfl/identity/identity";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";
import {
  buildNflTotalFeatures,
  buildScoringSupportIndex,
  toOrderedFeatureVector,
  featureValuesRecord,
  type NflTotalSideFeatures,
} from "../src/lib/nfl/props/totals/totalsFeatures";
import { fitNflTotalModel, type NflTotalTrainingRow } from "../src/lib/nfl/props/totals/totalsModel";
import { generateNflTotalPrediction } from "../src/lib/nfl/props/totals/totalsGenerator";
import {
  NFL_TOTAL_FEATURE_SCHEMA_VERSION,
  NFL_TOTAL_MODEL_NAME,
  NFL_TOTAL_MODEL_VERSION,
  NFL_TOTAL_TRAINING_SEASONS,
} from "../src/lib/nfl/props/totals/totalsModelContract";
import type { NflTotalResearchScoringSupportRow } from "../src/lib/nfl/research/total/types";
import {
  archiveProductionPredictions,
  buildFittedModelManifest,
  buildSourceManifest,
  finalizePredictionSnapshot,
  type JsonValue,
  type PredictionSnapshotDraft,
} from "./lib/nfl-production-prediction-archive";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCORING_SUPPORT_DIR = join(ROOT, "data", "nfl", "nflverse", "scoring-support-team-game");
const PIPELINE_VERSION = "nfl-total-ridge-production-v1";
const ARCHIVE_ROOT = join(ROOT, "data", "nfl", "predictions");
const consumedSources = new Map<string, string>();

type Args = {
  season: number;
  week: number;
  dryRun: boolean;
  archiveRoot: string;
  generatedAt: string;
  output: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    season: 0, week: 0, dryRun: false, archiveRoot: ARCHIVE_ROOT,
    generatedAt: new Date().toISOString(), output: null,
  };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--archive-root=")) args.archiveRoot = resolve(ROOT, raw.slice(15));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || !Number.isInteger(args.week) || args.week < 1) {
    throw new Error("Usage: --season=YYYY --week=N [--dry-run] [--archive-root=path] [--generated-at=iso] [--output=path]");
  }
  if (!Number.isFinite(Date.parse(args.generatedAt)) || !args.generatedAt.endsWith("Z")) {
    throw new Error("--generated-at must be a UTC ISO-8601 timestamp");
  }
  return args;
}

function readSource(path: string): string {
  const content = readFileSync(path, "utf8");
  consumedSources.set(path.slice(ROOT.length + 1).replaceAll("\\", "/"), content);
  return content;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

function loadScoringSupport(seasons: readonly number[]): NflTotalResearchScoringSupportRow[] {
  const manifestPath = join(SCORING_SUPPORT_DIR, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Production scoring-support cache manifest missing: ${manifestPath}. Run: npm run nfl:scoring-support-cache`);
  const manifest = JSON.parse(readSource(manifestPath)) as { files?: { season: number; filename: string; headerColumns?: string[] }[] };
  const rows: NflTotalResearchScoringSupportRow[] = [];
  for (const season of seasons) {
    const entry = manifest.files?.find((f) => f.season === season);
    if (!entry) {
      // Older seasons before the corpus window are simply absent; the EWMA
      // prior-season fallback handles that. Only the training + current
      // seasons are mandatory (checked by the caller).
      continue;
    }
    const text = readSource(join(SCORING_SUPPORT_DIR, entry.filename));
    const problems = verifyCacheEntry(entry as never, text, {
      requiredHeaders: ["game_id", "season", "week", "team", "opponent", "eligible_plays", "off_epa_sum", "success_num", "success_den", "explosive_count"],
    });
    if (problems.length > 0) throw new Error(`Scoring-support cache verification failed:\n  - ${problems.join("\n  - ")}`);
    for (const r of parseCsv(text)) {
      const team = normalizeNflTeamAbbr(r.team);
      const opponent = normalizeNflTeamAbbr(r.opponent);
      if (!team || !opponent) throw new Error(`Unresolved team code in scoring-support cache row: ${JSON.stringify(r)}`);
      rows.push({
        gameId: r.game_id, season: Number(r.season), week: Number(r.week), team, opponent,
        eligiblePlays: Number(r.eligible_plays), offEpaSum: Number(r.off_epa_sum),
        successNum: Number(r.success_num), successDen: Number(r.success_den), explosiveCount: Number(r.explosive_count),
      });
    }
  }
  return rows;
}

type TrainingOutcome = { gameId: string; season: number; week: number; homeAbbr: string; awayAbbr: string; homeScore: number; awayScore: number };

function loadTrainingOutcomes(seasons: readonly number[]): TrainingOutcome[] {
  const out: TrainingOutcome[] = [];
  for (const season of seasons) {
    const path = join(ROOT, "public", "data", "nfl", String(season), "results.json");
    if (!existsSync(path)) throw new Error(`Training season results missing: ${path}`);
    const raw = JSON.parse(readSource(path)) as { results: { gameId: string; season: number; week: number; seasonType: string; homeAbbr: string; awayAbbr: string; homeScore: number | null; awayScore: number | null; final: boolean }[] };
    for (const r of raw.results) {
      if (r.seasonType !== "REG" || !r.final || r.homeScore == null || r.awayScore == null) continue;
      out.push({
        gameId: r.gameId, season: r.season, week: r.week,
        homeAbbr: normalizeNflTeamAbbr(r.homeAbbr)!, awayAbbr: normalizeNflTeamAbbr(r.awayAbbr)!,
        homeScore: r.homeScore, awayScore: r.awayScore,
      });
    }
  }
  return out;
}

type SlateGame = { gameId: string; season: number; week: number; homeAbbr: string; awayAbbr: string; kickoffUtc: string; neutralSite: boolean };

function loadSlate(season: number, week: number): SlateGame[] {
  const path = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  if (!existsSync(path)) throw new Error(`No schedule for season ${season}: ${path}. Fail-closed.`);
  const raw = JSON.parse(readSource(path)) as { games: { gameId: string; season: number; week: number; seasonType: string; dateUtc: string; homeAbbr: string; awayAbbr: string; neutralSite?: boolean }[] };
  const slate = raw.games
    .filter((g) => g.season === season && g.week === week && g.seasonType === "REG")
    .map((g) => ({
      gameId: g.gameId, season: g.season, week: g.week,
      homeAbbr: normalizeNflTeamAbbr(g.homeAbbr)!, awayAbbr: normalizeNflTeamAbbr(g.awayAbbr)!,
      kickoffUtc: g.dateUtc, neutralSite: g.neutralSite === true,
    }));
  if (slate.length === 0) throw new Error(`No REG games for ${season} week ${week}. Fail-closed.`);
  return slate;
}

const asJson = (v: unknown): JsonValue => JSON.parse(JSON.stringify(v)) as JsonValue;

function sideDraft(options: {
  args: Args;
  game: SlateGame;
  side: "home" | "away";
  team: string;
  opponent: string;
  features: NflTotalSideFeatures;
  expectedPoints: number;
  prediction: ReturnType<typeof generateNflTotalPrediction>;
  createdAt: string;
  runId: string;
  sourceHash: string;
  fittedHash: string;
}): PredictionSnapshotDraft {
  const { args, game, side, team, opponent, features, expectedPoints, prediction } = options;
  const orderedVector = toOrderedFeatureVector(features);
  return {
    schema_version: "jkb-football-prediction-v1", snapshot_label: null,
    prediction_timestamp: args.generatedAt, created_at: options.createdAt, mode: "production",
    sport: "football", league: "nfl", season: game.season, week: game.week,
    slate_date: game.kickoffUtc.slice(0, 10), game_id: game.gameId, kickoff_utc: game.kickoffUtc,
    player_id: null, player_name_at_prediction: null, team, opponent, home_away: side,
    neutral_site: game.neutralSite, position: null, prediction_type: "team_total",
    model_name: NFL_TOTAL_MODEL_NAME, model_version: NFL_TOTAL_MODEL_VERSION,
    feature_schema_version: NFL_TOTAL_FEATURE_SCHEMA_VERSION, pipeline_version: PIPELINE_VERSION,
    code_revision: process.env.GITHUB_SHA ?? null, run_id: options.runId,
    workflow_name: process.env.GITHUB_WORKFLOW ?? null, workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
    cutoff_policy: "slate_before_first_kickoff",
    status: prediction.status === "projected" ? "projected" : "eligible_insufficient_history",
    projection: { type: "team_total", projected_team_points: expectedPoints },
    feature_snapshot: {
      values: asJson({
        features: featureValuesRecord(features),
        history: {
          offense_games_used: features.offenseGamesUsed,
          defense_games_used: features.defenseGamesUsed,
          offense_effective_sample_size: features.offenseEffectiveSampleSize,
          defense_effective_sample_size: features.defenseEffectiveSampleSize,
          history_status: features.historyStatus,
        },
        prediction: {
          home_expected_points: prediction.homeExpectedPoints,
          away_expected_points: prediction.awayExpectedPoints,
          projected_game_total: prediction.projectedGameTotal,
        },
      }) as Record<string, JsonValue>,
      ordered_vector: orderedVector ? [...orderedVector] : undefined,
      source_manifest_hashes: { nfl_total_scoring_support: options.sourceHash },
      fitted_model_hash: options.fittedHash,
    },
    market_reference_status: "not_applicable",
    market_snapshot_refs: [],
    provenance: [
      { kind: "source_manifest", logical_name: "nfl-total-production-inputs", content_hash: options.sourceHash },
      { kind: "fitted_model_manifest", logical_name: NFL_TOTAL_MODEL_NAME, content_hash: options.fittedHash },
    ],
  };
}

function main(): void {
  const args = parseArgs(process.argv);
  const trainingSeasons = [...NFL_TOTAL_TRAINING_SEASONS];
  const cacheSeasons = [...new Set([2021, ...trainingSeasons, args.season])].sort((a, b) => a - b);

  const scoringRows = loadScoringSupport(cacheSeasons);
  for (const season of [...trainingSeasons, args.season]) {
    if (!scoringRows.some((r) => r.season === season)) {
      throw new Error(`Scoring-support cache has no rows for required season ${season}. Run: npm run nfl:scoring-support-cache -- --seasons=${season}`);
    }
  }
  const index = buildScoringSupportIndex(scoringRows);

  // Fit the frozen model deterministically on the frozen training window.
  const trainingOutcomes = loadTrainingOutcomes(trainingSeasons);
  const trainingRows: NflTotalTrainingRow[] = [];
  for (const g of trainingOutcomes) {
    trainingRows.push({ features: buildNflTotalFeatures(index, g.homeAbbr, g.awayAbbr, { season: g.season, week: g.week }, "home"), actualTeamPoints: g.homeScore });
    trainingRows.push({ features: buildNflTotalFeatures(index, g.awayAbbr, g.homeAbbr, { season: g.season, week: g.week }, "away"), actualTeamPoints: g.awayScore });
  }
  const model = fitNflTotalModel(trainingRows);
  console.log(`[nfl:totals] model=${model.modelVersion} trainRows=${model.trainRowCount} fittedHash=${model.fittedModelHash}`);

  const slate = loadSlate(args.season, args.week);
  const createdAt = new Date().toISOString();
  const runId = process.env.GITHUB_RUN_ID ? `github:${process.env.GITHUB_RUN_ID}` : `local:${args.generatedAt}`;

  const sourceManifest = buildSourceManifest(
    "nfl-total-production-inputs",
    [...consumedSources.entries()].map(([path, content]) => ({ logicalName: path, path, content })),
  );
  const fittedManifest = buildFittedModelManifest({
    model_name: NFL_TOTAL_MODEL_NAME, model_version: model.modelVersion, training_seasons: trainingSeasons,
    feature_schema_version: NFL_TOTAL_FEATURE_SCHEMA_VERSION, feature_order: [...model.featureNames],
    parameters: { ridge_lambda: model.lambda },
    fitted_state: asJson({ ridge: model.ridge, model_fitted_hash: model.fittedModelHash, train_row_count: model.trainRowCount }),
  });

  const drafts: PredictionSnapshotDraft[] = [];
  const inspect: Record<string, unknown>[] = [];
  let skippedGames = 0;
  for (const game of slate) {
    const homeFeatures = buildNflTotalFeatures(index, game.homeAbbr, game.awayAbbr, { season: game.season, week: game.week }, "home");
    const awayFeatures = buildNflTotalFeatures(index, game.awayAbbr, game.homeAbbr, { season: game.season, week: game.week }, "away");
    const prediction = generateNflTotalPrediction(model, {
      season: game.season, week: game.week, gameId: game.gameId,
      homeTeam: game.homeAbbr, awayTeam: game.awayAbbr, homeFeatures, awayFeatures,
    }, args.generatedAt);

    if (prediction.homeExpectedPoints == null || prediction.awayExpectedPoints == null) {
      skippedGames += 1;
      console.log(`[nfl:totals] SKIP ${game.gameId}: unresolved feature side (home=${prediction.homeExpectedPoints}, away=${prediction.awayExpectedPoints}) -- not archiving a partial total`);
      continue;
    }
    inspect.push({
      gameId: game.gameId, homeTeam: game.homeAbbr, awayTeam: game.awayAbbr,
      homeExpectedPoints: prediction.homeExpectedPoints, awayExpectedPoints: prediction.awayExpectedPoints,
      projectedGameTotal: prediction.projectedGameTotal, status: prediction.status,
    });
    for (const [side, team, opponent, features, expectedPoints] of [
      ["home", game.homeAbbr, game.awayAbbr, homeFeatures, prediction.homeExpectedPoints] as const,
      ["away", game.awayAbbr, game.homeAbbr, awayFeatures, prediction.awayExpectedPoints] as const,
    ]) {
      drafts.push(sideDraft({
        args, game, side, team, opponent, features, expectedPoints, prediction, createdAt, runId,
        sourceHash: sourceManifest.hash, fittedHash: fittedManifest.hash,
      }));
    }
  }

  const records = drafts.map(finalizePredictionSnapshot);
  const preKickoff = records.filter((r) => Date.parse(r.prediction_timestamp) < Date.parse(r.kickoff_utc));
  console.log(`[nfl:totals] season=${args.season} week=${args.week} games=${slate.length} archivable=${inspect.length} skippedUnresolved=${skippedGames} rows=${records.length} preKickoffRows=${preKickoff.length}`);
  for (const row of inspect) console.log(`[nfl:totals]   ${JSON.stringify(row)}`);

  if (args.output) {
    mkdirSync(dirname(args.output), { recursive: true });
    writeFileSync(args.output, `${JSON.stringify({ season: args.season, week: args.week, model_version: model.modelVersion, fitted_model_hash: model.fittedModelHash, generated_at: args.generatedAt, games: inspect }, null, 2)}\n`);
    console.log(`[nfl:totals] wrote inspection artifact -> ${args.output}`);
  }

  if (args.dryRun) {
    console.log("[nfl:totals] --dry-run: not archiving.");
    return;
  }
  if (preKickoff.length === 0) {
    console.log("[nfl:totals] nothing to archive (no pre-kickoff rows).");
    return;
  }
  const result = archiveProductionPredictions({
    rootDir: args.archiveRoot, records: preKickoff,
    sourceManifests: [sourceManifest], fittedModelManifests: [fittedManifest],
  });
  console.log(`[nfl:totals] archive appended=${result.appended} duplicates=${result.duplicates} skippedPostKickoff=${records.length - preKickoff.length} files=${result.files.length}`);
}

main();
