/**
 * WU6 -- generate public/data/nfl/performance/sides.json, the canonical
 * derived NFL sides (spread) performance artifact for the /nfl/performance
 * dashboard.
 *
 * This script writes NO model output and grades NOTHING itself: it composes
 * three already-canonical sources --
 *  - the live spread prediction archive
 *    (data/nfl/predictions/**\/jkb-power-number.jsonl), read via the same
 *    loadArchivedPredictions() the outcome resolver and matchup views use;
 *  - resolvePredictionOutcome() from nfl-prediction-outcome-resolver.ts,
 *    the SAME function the production outcome-resolution CLI calls, so
 *    "actual" values here are never independently re-derived;
 *  - one canonical pregame comparison spread selected from the prediction's
 *    own embedded market_snapshot_refs, plus the prior-season-full
 *    EPA/YPP/trenches context artifacts already served to the matchup UI.
 * Grading/error math lives in scripts/lib/nfl-sides-performance.ts (pure,
 * unit-tested); this file is I/O wiring only. It does NOT touch the
 * side-model math.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import { loadArchivedPredictions } from "./resolve-nfl-prediction-outcomes";
import { loadResolverSeasonSources, resolvePredictionOutcome } from "./lib/nfl-prediction-outcome-resolver";
import type { PredictionSnapshotV1 } from "./lib/nfl-production-prediction-archive";
import {
  buildPregameGameContext,
  type EpaPriorSeasonWindow,
  type MetricsPriorSeasonWindow,
  type TrenchSeasonData,
} from "./lib/nfl-game-context";
import {
  buildSidesPerformanceRow,
  computeSidesBucketRollups,
  computeSidesSummaryMetrics,
  selectCanonicalMarketSpread,
  selectPregameSpreadSnapshot,
  SIDES_LIVE_MODEL_VERSION,
  type RawSpreadMarketRef,
  type ResolvedSpreadActual,
  type SidesPerformanceRow,
  type SpreadSnapshot,
} from "./lib/nfl-sides-performance";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_ROOT = join(ROOT, "data", "nfl", "predictions");
const OUT_FILE = join(ROOT, "public", "data", "nfl", "performance", "sides.json");
export const SIDES_PERFORMANCE_SCHEMA_VERSION = "nfl-sides-performance-v1";

type SpreadPrediction = PredictionSnapshotV1 & {
  projection: {
    type: "spread";
    projected_home_margin: number;
    projected_spread_line: number;
    projected_spread_team: string | null;
    market_spread: number | null;
    home_power_number?: number;
    away_power_number?: number;
    home_field_adjustment?: number;
  };
};

function toSpreadSnapshot(record: SpreadPrediction): SpreadSnapshot {
  return {
    gameId: record.game_id,
    season: record.season,
    week: record.week,
    kickoffUtc: record.kickoff_utc,
    homeTeam: record.team,
    awayTeam: record.opponent,
    projectedHomeMargin: record.projection.projected_home_margin,
    projectedSpreadLine: record.projection.projected_spread_line,
    projectedSpreadTeam: record.projection.projected_spread_team,
    homePowerNumber: record.projection.home_power_number ?? null,
    awayPowerNumber: record.projection.away_power_number ?? null,
    homeFieldAdjustment: record.projection.home_field_adjustment ?? null,
    modelVersion: record.model_version,
    fittedModelHash: record.feature_snapshot.fitted_model_hash,
    predictionTimestamp: record.prediction_timestamp,
    predictionId: record.prediction_id,
  };
}

function toRawMarketRefs(record: SpreadPrediction): RawSpreadMarketRef[] {
  return record.market_snapshot_refs.map((ref) => ({
    market_type: ref.market_type,
    purpose: ref.purpose,
    line: ref.line,
    observed_at: ref.observed_at,
    provider: ref.provider,
    sportsbook: ref.sportsbook,
    content_hash: ref.content_hash ?? null,
    market_observation_id: ref.market_observation_id ?? null,
  }));
}

function loadJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

type EpaArtifact = { currentSeason: number; windows: { "prior-season-full"?: EpaPriorSeasonWindow } };
type MetricsArtifact = { windows: { "prior-season-full"?: MetricsPriorSeasonWindow } };
type TrenchArtifact = { seasons: Record<string, TrenchSeasonData> };

/**
 * Same leakage-safety rule as the totals artifact: the context artifacts
 * are a single static snapshot, so their prior-season-full window is only
 * guaranteed pregame-safe for games in the artifact's OWN currentSeason.
 * Context is only attached when the row's season matches; every other row
 * gets the explicit null/"unavailable" contract from nfl-game-context.ts.
 */
function loadContextSources() {
  const epa = loadJsonIfExists<EpaArtifact>(join(ROOT, "public", "data", "nfl", "matchup-epa.json"));
  const metrics = loadJsonIfExists<MetricsArtifact>(join(ROOT, "public", "data", "nfl", "matchup-metrics.json"));
  const trench = loadJsonIfExists<TrenchArtifact>(join(ROOT, "public", "data", "nfl", "matchup-trench-metrics.json"));
  return { epa, metrics, trench };
}

/**
 * Pure(-ish) artifact build: reads the same on-disk sources `main()` does,
 * but performs no writes. Exported so tests can call it twice and assert
 * determinism, without touching public/data/nfl/performance/sides.json.
 */
export function buildSidesPerformanceArtifact(generatedAt: string) {
  const recordedAt = generatedAt;

  const predictions = loadArchivedPredictions(ARCHIVE_ROOT, null, null).filter(
    (p): p is SpreadPrediction =>
      p.prediction_type === "spread" && p.status === "projected" && p.projection.type === "spread"
  );

  const byGame = new Map<string, SpreadPrediction[]>();
  for (const record of predictions) {
    const bucket = byGame.get(record.game_id) ?? [];
    bucket.push(record);
    byGame.set(record.game_id, bucket);
  }

  const { epa, metrics, trench } = loadContextSources();
  const sourcesBySeason = new Map<number, ReturnType<typeof loadResolverSeasonSources>>();
  const rows: SidesPerformanceRow[] = [];
  const exclusions: Record<string, number> = {
    missing: 0,
    model_version_mismatch: 0,
    not_resolved: 0,
  };

  for (const [, group] of byGame) {
    const selection = selectPregameSpreadSnapshot(group.map(toSpreadSnapshot));
    if (selection.status === "rejected") {
      exclusions[selection.reason] += 1;
      continue;
    }
    const record = group.find((r) => r.prediction_timestamp === selection.snapshot.predictionTimestamp)!;

    let sources = sourcesBySeason.get(record.season);
    if (!sources) {
      sources = loadResolverSeasonSources(ROOT, record.season);
      sourcesBySeason.set(record.season, sources);
    }
    const draft = resolvePredictionOutcome(record, sources, recordedAt);
    if (draft.resolution_status !== "resolved" || draft.actual?.type !== "spread") {
      exclusions.not_resolved += 1;
      continue;
    }

    const actual: ResolvedSpreadActual = {
      homePoints: draft.actual.home_score,
      awayPoints: draft.actual.away_score,
      homeMargin: draft.actual.margin,
      gameCompletionStatus: draft.game_completion_status,
      resolutionStatus: draft.resolution_status,
    };

    const market = selectCanonicalMarketSpread(toRawMarketRefs(record), selection.snapshot.kickoffUtc);

    const seasonMatchesEpaArtifact = epa != null && selection.snapshot.season === epa.currentSeason;
    const context = buildPregameGameContext({
      epaWindow: seasonMatchesEpaArtifact ? (epa!.windows["prior-season-full"] ?? null) : null,
      yppWindow: seasonMatchesEpaArtifact ? (metrics?.windows["prior-season-full"] ?? null) : null,
      trenchSeasonData: seasonMatchesEpaArtifact ? (trench?.seasons[String(selection.snapshot.season - 1)] ?? null) : null,
      trenchSeasonKey: selection.snapshot.season - 1,
      homeTeam: selection.snapshot.homeTeam,
      awayTeam: selection.snapshot.awayTeam,
    });

    rows.push(
      buildSidesPerformanceRow({
        snapshot: selection.snapshot,
        actual,
        market,
        context,
        outcomeSourceStateHash: draft.source_state_hash ?? null,
      })
    );
  }

  rows.sort((a, b) => a.season - b.season || a.week - b.week || a.game_id.localeCompare(b.game_id));

  const summary = computeSidesSummaryMetrics(rows);
  const buckets = computeSidesBucketRollups(rows);

  const seasons = [...new Set(predictions.map((p) => p.season))].sort();
  const modelVersions = [...new Set(predictions.map((p) => p.model_version))].sort();
  const predictionTimestamps = predictions.map((p) => p.prediction_timestamp).sort();
  const contextCoverage = {
    trenches: rows.filter((r) => r.context.trenches.provenance_status === "available").length,
    ypp: rows.filter((r) => r.context.ypp.provenance_status === "available").length,
    epa: rows.filter((r) => r.context.epa.provenance_status === "available").length,
    coaching: 0,
  };

  const artifact = {
    _meta: buildNflMeta({
      source:
        "generated (data/nfl/predictions/**/jkb-power-number.jsonl + prediction-outcome resolver + embedded market_snapshot_refs)",
      modelVersion: modelVersions.length === 1 ? modelVersions[0] : null,
      notes: [
        "Canonical derived sides (spread) performance artifact for /nfl/performance. Not a raw archive -- do not parse JSONL for this view.",
        "Live side model: jkb-power-number-v1.0.0. Side-model math is untouched by this artifact.",
        "Actual outcomes are computed exclusively via resolvePredictionOutcome() from nfl-prediction-outcome-resolver.ts -- no independent grading logic exists here.",
        "Sign contract: every margin (projected, market-implied, actual) and every signed error is a HOME margin (home points - away points). market_spread is the posted home line (negative = home favored); market_implied_home_margin = -market_spread. Positive jkb_minus_market = JKB more bullish on the home team than the market.",
        "Market spread = latest valid pregame comparison line (spread/comparison ref, observed strictly before kickoff, highest-priority book then latest observed_at). Never chosen after seeing the result.",
        "Analysis context (trenches/ypp/epa) is attached only for games in the current season, using the prior-season-full window, null/unavailable everywhere else -- see nfl-game-context.ts for the leakage guarantee.",
        "coaching_context_status is always SOURCE_UNAVAILABLE in this artifact revision -- point-in-time coaching snapshots exist (data/nfl/coaching/rating-snapshots) but are not yet joined into these rows (Phase B follow-up). Coaching is ANALYSIS CONTEXT ONLY and never a model input; ATS is never weighted.",
      ],
      generatedAt,
    }),
    schemaVersion: SIDES_PERFORMANCE_SCHEMA_VERSION,
    performanceMeta: {
      schemaVersion: SIDES_PERFORMANCE_SCHEMA_VERSION,
      generatedAt,
      seasons,
      modelVersions,
      liveModelVersion: SIDES_LIVE_MODEL_VERSION,
      gradedGames: rows.length,
      latestPredictionTimestamp: predictionTimestamps.length ? predictionTimestamps[predictionTimestamps.length - 1] : null,
      latestOutcomeTimestamp: rows.length ? rows.map((r) => r.prediction_timestamp).sort().slice(-1)[0] : null,
      marketCoverageCount: rows.filter((r) => r.market_spread != null).length,
      contextCoverage,
    },
    summary,
    buckets,
    rows,
    exclusions,
  };

  return { artifact, predictionsCount: predictions.length };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const generatedAt = args.find((a) => a.startsWith("--generated-at="))?.slice(15) ?? new Date().toISOString();

  const { artifact, predictionsCount } = buildSidesPerformanceArtifact(generatedAt);

  console.log(
    `[nfl:sides-performance] graded=${artifact.rows.length} excluded=${JSON.stringify(artifact.exclusions)} predictions=${predictionsCount}`
  );

  if (dryRun) {
    console.log(`[nfl:sides-performance] dry-run -- not writing ${OUT_FILE}`);
    return;
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  try {
    writeFileSync(tmp, toNflJsonFileString(artifact), "utf-8");
    renameSync(tmp, OUT_FILE);
  } catch (err) {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* best effort */
      }
    }
    throw err;
  }
  console.log(`[nfl:sides-performance] wrote ${OUT_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`[nfl:sides-performance] FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
