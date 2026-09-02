/**
 * Generate public/data/nfl/matchup-projections.json — the canonical public
 * JKB Projected Spread (jkb-power-number-v1.0.0).
 *
 * REPLACES the nfl-spread-v0.1.0 shadow composite as the authoritative
 * public spread generator. That model's own code (scripts/lib/nfl-spread-
 * model.mjs, nfl-spread-dataset.mjs) is left untouched for historical/model
 * comparison and backtesting (see scripts/analysis/nfl-current-ovr-spread-
 * calibration/) — it just no longer feeds this artifact.
 *
 * Uses ONLY the canonical universal Current OVR board as its team-strength
 * input. Reads the exact three artifacts src/hooks/useNflCurrentRating2026.ts
 * composes client-side (preseason v0.3.1, preseason v0.4-beta, live Team
 * Performance Analytics) and calls the SAME framework-free functions
 * (buildCurrentRatingBoard, buildPowerNumberBoard) — this file contains zero
 * rating or Power Number math of its own, only artifact loading and
 * per-game projection assembly. If Current OVR or Power Number math ever
 * needs to change, it changes in exactly one place (src/lib/nfl/
 * currentRating2026.ts / jkbPowerNumber2026.ts), not here.
 *
 * NO MARKET DATA ENTERS THE MODEL. Projection assembly accepts no spread,
 * line, or odds value. After each projection already exists, the WU1 archive
 * adapter may read timestamp-valid observations from the existing market
 * history solely to attach comparison references.
 *
 * Run via tsx (imports TypeScript modules directly):
 *   npx tsx scripts/generate-nfl-matchup-projections.mts
 *   npx tsx scripts/generate-nfl-matchup-projections.mts --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import { buildCurrentRatingBoard } from "../src/lib/nfl/currentRating2026.ts";
import type { CurrentRatingRow } from "../src/lib/nfl/currentRating2026.ts";
import { validateNflV03ReviewArtifact } from "../src/lib/nfl/v03Review.ts";
import { validateNflV04ProjectionArtifact } from "../src/lib/nfl/v04Projection.ts";
import { buildPublicProjectionBoard } from "../src/lib/nfl/publicProjection2026.ts";
import { validateTeamPerformanceAnalyticsArtifact } from "../src/lib/nfl/teamPerformanceAnalytics.ts";
import {
  HOME_FIELD_ADVANTAGE_POINTS,
  JKB_POWER_NUMBER_MODEL_VERSION,
  OVR_TO_POINTS_COEFFICIENT,
  buildPowerNumberBoard,
  homeFieldAdvantageFor,
  neutralMarginFor,
  toSportsbookSpread,
} from "../src/lib/nfl/jkbPowerNumber2026.ts";
import {
  archiveProductionPredictions, buildSourceManifest, finalizePredictionSnapshot,
  type JsonValue, type MarketSnapshotReference, type PredictionSnapshotDraft,
} from "./lib/nfl-production-prediction-archive.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CURRENT_SEASON = 2026;
const DATA_DIR = join(ROOT, "public", "data", "nfl", String(CURRENT_SEASON));
const OUT_FILE = join(ROOT, "public", "data", "nfl", "matchup-projections.json");
const ARCHIVE_ROOT = join(ROOT, "data", "nfl", "predictions");
const ARCHIVE_PIPELINE_VERSION = "nfl-production-prediction-archive-v1";
const consumedSources = new Map<string, string>();

export const PROJECTIONS_SCHEMA_VERSION = "nfl-matchup-projections-v2";

function readJson(path: string): unknown {
  const text = readFileSync(path, "utf-8");
  consumedSources.set(path, text);
  return JSON.parse(text);
}

type GameLineObservation = {
  id: string; contentHash: string; provider: string; sportsbook: string; capturedAt: string; providerUpdatedAt: string | null;
  spread: { homeLine: number; awayLine: number; homePrice: number | null; awayPrice: number | null };
};

function spreadMarketReferences(gameId: string, predictionTimestamp: string): MarketSnapshotReference[] {
  const path = join(ROOT, "data", "market", "betting-lines", "history", "nfl", String(CURRENT_SEASON), `${gameId}.jsonl`);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const cutoff = Date.parse(predictionTimestamp);
  const latestByBook = new Map<string, GameLineObservation>();
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const observation = JSON.parse(line) as GameLineObservation;
    const observed = Date.parse(observation.capturedAt);
    if (!Number.isFinite(observed) || observed > cutoff || observation.spread == null) continue;
    const previous = latestByBook.get(observation.sportsbook);
    if (!previous || Date.parse(previous.capturedAt) < observed) latestByBook.set(observation.sportsbook, observation);
  }
  return [...latestByBook.values()].sort((a, b) => a.sportsbook.localeCompare(b.sportsbook)).map((observation) => ({
    purpose: "comparison", market_type: "spread", market_observation_id: observation.id,
    content_hash: observation.contentHash, provider: observation.provider, sportsbook: observation.sportsbook,
    observed_at: observation.capturedAt, provider_updated_at: observation.providerUpdatedAt,
    line: observation.spread.homeLine, over_price: null, under_price: null,
    side_prices: { home: observation.spread.homePrice, away: observation.spread.awayPrice }, designation: "available_at_prediction",
  }));
}

/** Real minus sign (U+2212) so this matches the market line's typography exactly, per existing convention. */
function formatTeamSpread(
  side: "home" | "away" | "pk",
  line: number,
  homeAbbr: string,
  awayAbbr: string
): string {
  if (side === "pk") return "PK";
  const favorite = side === "home" ? homeAbbr : awayAbbr;
  return `${favorite.toUpperCase()} −${Math.abs(line).toFixed(1)}`;
}

function parseArgs(argv: string[]) {
  const args = { dryRun: false, output: OUT_FILE, archiveRoot: ARCHIVE_ROOT, generatedAt: new Date().toISOString() };
  for (const raw of argv) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--archive-root=")) args.archiveRoot = resolve(ROOT, raw.slice(15));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const gamesPath = join(DATA_DIR, "games.json");
  if (!existsSync(gamesPath)) throw new Error(`Missing schedule for ${CURRENT_SEASON}: ${gamesPath}`);
  const games = (readJson(gamesPath) as { games: any[] }).games ?? [];

  const preseasonPath = join(DATA_DIR, "preseason-power-ratings.json");
  const preseasonV03 = validateNflV03ReviewArtifact(
    "preseason",
    CURRENT_SEASON as 2026,
    readJson(preseasonPath),
    preseasonPath
  );

  const v04Path = join(DATA_DIR, "projected-power-ratings-v04.json");
  const v04Artifact = validateNflV04ProjectionArtifact(readJson(v04Path), v04Path);
  const v04Board = buildPublicProjectionBoard(v04Artifact);

  const performancePath = join(DATA_DIR, "team-performance-analytics.json");
  const performanceAnalytics = validateTeamPerformanceAnalyticsArtifact(readJson(performancePath));

  const currentRatingBoard = buildCurrentRatingBoard({
    season: CURRENT_SEASON,
    v04Board,
    preseasonV03,
    performanceAnalytics,
  });

  const powerBoard = buildPowerNumberBoard(currentRatingBoard);
  const powerByAbbr = new Map(powerBoard.teams.map((t) => [t.abbr, t]));
  const currentByAbbr = new Map(currentRatingBoard.teams.map((team) => [team.abbr, team]));

  const projections: Record<string, unknown> = {};
  const archiveRows: { game: any; projection: any; homeState: CurrentRatingRow; awayState: CurrentRatingRow; marketRefs: MarketSnapshotReference[] }[] = [];
  let projected = 0;
  const generatedAt = args.generatedAt;
  if (!Number.isFinite(Date.parse(generatedAt)) || !generatedAt.endsWith("Z")) throw new Error("--generated-at must be a valid UTC ISO-8601 timestamp");
  for (const g of games) {
    if (g.seasonType !== "REG") continue;
    const home = powerByAbbr.get(g.homeAbbr);
    const away = powerByAbbr.get(g.awayAbbr);
    if (!home || !away) continue;

    const neutralSite = g.neutralSite === true;
    const neutralProjectedMargin = neutralMarginFor(home.powerNumber, away.powerNumber);
    const homeFieldAdvantage = homeFieldAdvantageFor(neutralSite);
    const projectedHomeMargin = neutralProjectedMargin + homeFieldAdvantage;
    const spread = toSportsbookSpread(projectedHomeMargin);

    projections[g.gameId] = {
      gameId: g.gameId,
      week: g.week,
      kickoff: g.dateUtc,
      homeTeam: g.homeAbbr,
      awayTeam: g.awayAbbr,
      homeCurrentOVR: home.currentOVR,
      awayCurrentOVR: away.currentOVR,
      leagueAverageOVR: powerBoard.leagueAverageOVR,
      homePowerNumber: home.powerNumber,
      awayPowerNumber: away.powerNumber,
      neutralSite,
      homeFieldAdvantage,
      neutralProjectedMargin,
      projectedHomeMargin,
      formattedJkbSpread: formatTeamSpread(spread.side, spread.line, g.homeAbbr, g.awayAbbr),
    };
    const homeState = currentByAbbr.get(g.homeAbbr);
    const awayState = currentByAbbr.get(g.awayAbbr);
    if (!homeState || !awayState) throw new Error(`Missing Current OVR state for ${g.gameId}`);
    if (Date.parse(g.dateUtc) > Date.parse(generatedAt)) {
      archiveRows.push({ game: g, projection: projections[g.gameId], homeState, awayState, marketRefs: spreadMarketReferences(g.gameId, generatedAt) });
    }
    projected += 1;
  }

  if (projected === 0) throw new Error("no games projected; refusing to overwrite a known-good artifact");

  const artifact = {
    _meta: buildNflMeta({
      source: "src/lib/nfl/currentRating2026.ts + jkbPowerNumber2026.ts (canonical Current OVR board)",
      season: CURRENT_SEASON,
      week: null,
      modelVersion: JKB_POWER_NUMBER_MODEL_VERSION,
      notes: [
        "The ONLY team-strength input is the canonical universal Current OVR board (the same rating shown everywhere else on the site) — never OFF/DEF independently, never a separately-maintained composite.",
        `Power Number = (Current OVR - league-average Current OVR) x ${OVR_TO_POINTS_COEFFICIENT}, the empirically calibrated NFL-points-per-OVR-point coefficient (Current-OVR Spread Calibration, walk-forward, no-leakage, 2023-2025).`,
        `Home-field advantage is a fixed ${HOME_FIELD_ADVANTAGE_POINTS} points, 0.0 at neutral sites, and is never fitted. No intercept.`,
        "neutralSite comes from nflverse's own `location` column (\"Home\"/\"Neutral\") at the schedule layer — never inferred from stadium name.",
        "Positive projectedHomeMargin means the home team is favoured by that many points.",
        "NO MARKET DATA ENTERS THE MODEL. Consumer display and the WU1 archive attach market comparison only after this projection already exists.",
        "REPLACES nfl-spread-v0.1.0 as the authoritative public JKB spread. That model's code and backtest remain available for historical/model comparison but no longer generate this artifact.",
      ],
    }),
    schemaVersion: PROJECTIONS_SCHEMA_VERSION,
    modelVersion: JKB_POWER_NUMBER_MODEL_VERSION,
    currentSeason: CURRENT_SEASON,
    model: {
      ovrToPointsCoefficient: OVR_TO_POINTS_COEFFICIENT,
      homeFieldAdvantage: HOME_FIELD_ADVANTAGE_POINTS,
      neutralSiteHomeFieldAdvantage: 0,
      leagueAverageOVR: powerBoard.leagueAverageOVR,
      strengthInput: "canonical universal Current OVR (src/lib/nfl/currentRating2026.ts)",
      fittedParameters: [] as string[],
      marketInputUsed: false,
    },
    projections,
    provenance: {
      generatedAt,
      gamesProjected: projected,
      inputs: {
        preseasonV03: "public/data/nfl/2026/preseason-power-ratings.json",
        preseasonV04: "public/data/nfl/2026/projected-power-ratings-v04.json",
        performanceAnalytics: "public/data/nfl/2026/team-performance-analytics.json",
        schedule: "public/data/nfl/2026/games.json",
      },
    },
  };

  console.log(
    `[nfl:projections] ${JKB_POWER_NUMBER_MODEL_VERSION} leagueAverageOVR=${powerBoard.leagueAverageOVR.toFixed(3)} ` +
      `projected ${projected} ${CURRENT_SEASON} games`
  );

  if (args.dryRun) {
    console.log("[nfl:projections] dry run; nothing written");
    return;
  }


  const sourceManifest = buildSourceManifest("nfl-spread-production-inputs", [...consumedSources.entries()].map(([path, content]) => ({ logicalName: path.slice(ROOT.length + 1), path: path.slice(ROOT.length + 1), content })));
  const createdAt = new Date().toISOString();
  const runId = process.env.GITHUB_RUN_ID ? `github:${process.env.GITHUB_RUN_ID}` : `local:${generatedAt}`;
  const records = archiveRows.map(({ game, projection, homeState, awayState, marketRefs }) => {
    const spread = toSportsbookSpread(projection.projectedHomeMargin);
    const draft: PredictionSnapshotDraft = {
      schema_version: "jkb-football-prediction-v1", snapshot_label: null, prediction_timestamp: generatedAt, created_at: createdAt, mode: "production",
      sport: "football", league: "nfl", season: CURRENT_SEASON, week: game.week, slate_date: String(game.dateUtc).slice(0, 10), game_id: game.gameId, kickoff_utc: game.dateUtc,
      player_id: null, player_name_at_prediction: null, team: game.homeAbbr, opponent: game.awayAbbr, home_away: "home", neutral_site: game.neutralSite === true, position: null,
      prediction_type: "spread", model_name: "jkb-power-number", model_version: JKB_POWER_NUMBER_MODEL_VERSION,
      feature_schema_version: "nfl-current-rating-power-number-feature-v1", pipeline_version: ARCHIVE_PIPELINE_VERSION,
      code_revision: process.env.GITHUB_SHA ?? null, run_id: runId, workflow_name: process.env.GITHUB_WORKFLOW ?? null, workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
      cutoff_policy: "game_before_kickoff", status: "projected",
      projection: {
        type: "spread", projected_home_margin: projection.projectedHomeMargin,
        projected_spread_team: spread.side === "pk" ? null : spread.side === "home" ? game.homeAbbr : game.awayAbbr,
        projected_spread_line: spread.line, market_spread: null, edge: null,
        formatted_jkb_spread: projection.formattedJkbSpread,
        home_power_number: projection.homePowerNumber, away_power_number: projection.awayPowerNumber, home_field_adjustment: projection.homeFieldAdvantage,
      },
      feature_snapshot: {
        values: { home_current_rating: homeState as unknown as JsonValue, away_current_rating: awayState as unknown as JsonValue, league_average_ovr: powerBoard.leagueAverageOVR, ovr_to_points_coefficient: OVR_TO_POINTS_COEFFICIENT, home_field_adjustment: projection.homeFieldAdvantage },
        source_manifest_hashes: { spread_run: sourceManifest.hash }, fitted_model_hash: null,
      },
      market_reference_status: marketRefs.length > 0 ? "available" : "missing", market_snapshot_refs: marketRefs,
      provenance: [{ kind: "source_manifest", logical_name: sourceManifest.manifest.logical_name, content_hash: sourceManifest.hash }],
    };
    return finalizePredictionSnapshot(draft);
  });
  const archiveResult = archiveProductionPredictions({ rootDir: args.archiveRoot, records, sourceManifests: [sourceManifest] });
  console.log(`[nfl:projections] archive appended=${archiveResult.appended} duplicates=${archiveResult.duplicates}`);

  mkdirSync(dirname(args.output), { recursive: true });
  const tmp = `${args.output}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, args.output);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort — the known-good artifact is what matters */
      }
    }
    throw err;
  }
  console.log(`[nfl:projections] wrote ${args.output}`);
}

try {
  main();
} catch (err) {
  console.error(`[nfl:projections] FAILED: ${err instanceof Error ? err.message : err}`);
  console.error("[nfl:projections] existing artifact left untouched");
  process.exit(1);
}
