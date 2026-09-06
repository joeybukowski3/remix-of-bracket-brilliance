/**
 * WU3 -- generate public/data/nfl/performance/totals.json, the canonical
 * derived NFL totals performance artifact for the future /nfl/performance
 * dashboard.
 *
 * This script writes NO model output and grades NOTHING itself: it composes
 * three already-canonical sources --
 *  - the live team_total prediction archive (data/nfl/predictions/**\/nfl-total-ridge.jsonl),
 *    read via the same loadArchivedPredictions() the outcome resolver and
 *    team-totals view use;
 *  - resolvePredictionOutcome() from nfl-prediction-outcome-resolver.ts,
 *    the SAME function the production outcome-resolution CLI
 *    (resolve-nfl-prediction-outcomes.ts) calls, so "actual" values here are
 *    never independently re-derived from schedules/results;
 *  - the betting-lines market-total archive (data/market/betting-lines/history)
 *    and the prior-season-full EPA/YPP/trenches artifacts already served to
 *    the matchup UI.
 * Grading/error math itself lives in scripts/lib/nfl-totals-performance.ts
 * (pure, unit-tested); this file is I/O wiring only.
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
import { createCoachingSnapshotSelector } from "./lib/nfl-coaching-snapshot-source";
import {
  buildTotalsPerformanceRow,
  computeBucketRollups,
  computeSummaryMetrics,
  selectPregameSnapshotPair,
  type MarketTotalObservation,
  type ResolvedTeamTotalActual,
  type TeamTotalSnapshotSide,
  type TotalsPerformanceRow,
} from "./lib/nfl-totals-performance";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_ROOT = join(ROOT, "data", "nfl", "predictions");
const BETTING_LINES_HISTORY_ROOT = join(ROOT, "data", "market", "betting-lines", "history", "nfl");
const OUT_FILE = join(ROOT, "public", "data", "nfl", "performance", "totals.json");
export const TOTALS_PERFORMANCE_SCHEMA_VERSION = "nfl-totals-performance-v1";

const SPORTSBOOK_PRIORITY = ["draftkings", "fanduel", "betmgm", "caesars"] as const;

function toSnapshotSide(record: PredictionSnapshotV1 & { projection: { type: "team_total"; projected_team_points: number } }): TeamTotalSnapshotSide {
  return {
    gameId: record.game_id,
    season: record.season,
    week: record.week,
    kickoffUtc: record.kickoff_utc,
    team: record.team,
    opponent: record.opponent,
    homeAway: record.home_away,
    projectedTeamPoints: record.projection.projected_team_points,
    modelVersion: record.model_version,
    fittedModelHash: record.feature_snapshot.fitted_model_hash,
    predictionTimestamp: record.prediction_timestamp,
  };
}

type RawBettingLineRow = {
  jkbGameId: string;
  sportsbook: string;
  capturedAt: string;
  total: { line: number | null } | null;
  contentHash: string | null;
};

/** Deterministic, path-safe token matching bettingLinesView.ts's toBettingLinesGameToken(). */
function bettingLineGameToken(jkbGameId: string): string {
  return jkbGameId.replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * Reads the raw history file for one game and selects the canonical market
 * total: among rows captured strictly before kickoff (pregame only -- a
 * post-kickoff line is never eligible), pick the highest-priority
 * sportsbook present, then that book's latest-by-capturedAt row. Never
 * mixes books, never chooses a line after seeing the result.
 */
function loadMarketTotal(season: number, gameId: string, kickoffUtc: string): MarketTotalObservation | null {
  const filePath = join(BETTING_LINES_HISTORY_ROOT, String(season), `${bettingLineGameToken(gameId)}.jsonl`);
  if (!existsSync(filePath)) return null;
  const rows: RawBettingLineRow[] = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RawBettingLineRow);
  const pregame = rows.filter((row) => row.total?.line != null && row.capturedAt < kickoffUtc);
  if (pregame.length === 0) return null;

  const bySportsbook = new Map<string, RawBettingLineRow>();
  for (const row of pregame) {
    const current = bySportsbook.get(row.sportsbook);
    if (!current || row.capturedAt > current.capturedAt) bySportsbook.set(row.sportsbook, row);
  }

  let selected: RawBettingLineRow | null = null;
  for (const book of SPORTSBOOK_PRIORITY) {
    const candidate = bySportsbook.get(book);
    if (candidate) {
      selected = candidate;
      break;
    }
  }
  if (!selected) {
    selected = [...bySportsbook.values()].sort((a, b) => a.sportsbook.localeCompare(b.sportsbook))[0] ?? null;
  }
  if (!selected || selected.total?.line == null) return null;

  return {
    marketTotal: selected.total.line,
    marketTimestamp: selected.capturedAt,
    provider: "the-odds-api",
    sportsbook: selected.sportsbook,
    snapshotRef: selected.contentHash ?? `${gameId}:${selected.sportsbook}:${selected.capturedAt}`,
    selectionRule: "latest_valid_pregame_snapshot",
  };
}

function loadJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

type EpaArtifact = { currentSeason: number; windows: { "prior-season-full"?: EpaPriorSeasonWindow } };
type MetricsArtifact = { windows: { "prior-season-full"?: MetricsPriorSeasonWindow } };
type TrenchArtifact = { seasons: Record<string, TrenchSeasonData> };

/**
 * Every context artifact here is a single static snapshot (not one archived
 * copy per historical season), and its "prior-season-full" window is only
 * guaranteed pregame-safe for games in the artifact's OWN currentSeason --
 * for any other season the window would either be the wrong prior season or
 * (for a season after currentSeason's prior year) could leak information
 * from games after the graded game. So context is only ever attached when
 * the row's season matches the artifact's currentSeason; every other row
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
 * determinism (idempotency), and can inspect intermediate shape, without
 * touching public/data/nfl/performance/totals.json.
 */
export function buildTotalsPerformanceArtifact(generatedAt: string) {
  const recordedAt = generatedAt;

  const predictions = loadArchivedPredictions(ARCHIVE_ROOT, null, null).filter(
    (p): p is PredictionSnapshotV1 & { projection: { type: "team_total"; projected_team_points: number } } =>
      p.prediction_type === "team_total" && p.status === "projected" && p.projection.type === "team_total"
  );

  const byGame = new Map<string, { home: (typeof predictions)[number][]; away: (typeof predictions)[number][] }>();
  for (const record of predictions) {
    const bucket = byGame.get(record.game_id) ?? { home: [], away: [] };
    bucket[record.home_away].push(record);
    byGame.set(record.game_id, bucket);
  }

  const { epa, metrics, trench } = loadContextSources();
  const selectCoachingSnapshot = createCoachingSnapshotSelector(ROOT);
  const sourcesBySeason = new Map<number, ReturnType<typeof loadResolverSeasonSources>>();
  const rows: TotalsPerformanceRow[] = [];
  const exclusions: Record<string, number> = {
    missing_home: 0,
    missing_away: 0,
    model_version_mismatch: 0,
    fitted_hash_mismatch: 0,
    not_resolved: 0,
  };

  for (const [, group] of byGame) {
    const selection = selectPregameSnapshotPair(group.home.map(toSnapshotSide), group.away.map(toSnapshotSide));
    if (selection.status === "rejected") {
      exclusions[selection.reason] += 1;
      continue;
    }

    const homeRecord = group.home.find((r) => r.prediction_timestamp === selection.home.predictionTimestamp)!;
    const awayRecord = group.away.find((r) => r.prediction_timestamp === selection.away.predictionTimestamp)!;

    let sources = sourcesBySeason.get(homeRecord.season);
    if (!sources) {
      sources = loadResolverSeasonSources(ROOT, homeRecord.season);
      sourcesBySeason.set(homeRecord.season, sources);
    }
    const homeDraft = resolvePredictionOutcome(homeRecord, sources, recordedAt);
    const awayDraft = resolvePredictionOutcome(awayRecord, sources, recordedAt);

    if (
      homeDraft.resolution_status !== "resolved" ||
      awayDraft.resolution_status !== "resolved" ||
      homeDraft.actual?.type !== "team_total" ||
      awayDraft.actual?.type !== "team_total"
    ) {
      exclusions.not_resolved += 1;
      continue;
    }

    const homeActual: ResolvedTeamTotalActual = {
      teamPoints: homeDraft.actual.team_points,
      opponentPoints: homeDraft.actual.opponent_points,
      gameCompletionStatus: homeDraft.game_completion_status,
      resolutionStatus: homeDraft.resolution_status,
    };
    const awayActual: ResolvedTeamTotalActual = {
      teamPoints: awayDraft.actual.team_points,
      opponentPoints: awayDraft.actual.opponent_points,
      gameCompletionStatus: awayDraft.game_completion_status,
      resolutionStatus: awayDraft.resolution_status,
    };

    const market = loadMarketTotal(selection.home.season, selection.home.gameId, selection.home.kickoffUtc);

    const seasonMatchesEpaArtifact = epa != null && selection.home.season === epa.currentSeason;
    const coachingSnapshot = selectCoachingSnapshot({
      season: selection.home.season,
      week: selection.home.week,
      kickoffUtc: selection.home.kickoffUtc,
    });
    const context = buildPregameGameContext({
      epaWindow: seasonMatchesEpaArtifact ? (epa!.windows["prior-season-full"] ?? null) : null,
      yppWindow: seasonMatchesEpaArtifact ? (metrics?.windows["prior-season-full"] ?? null) : null,
      trenchSeasonData: seasonMatchesEpaArtifact ? (trench?.seasons[String(selection.home.season - 1)] ?? null) : null,
      trenchSeasonKey: selection.home.season - 1,
      homeTeam: selection.home.team,
      awayTeam: selection.away.team,
      coachingSnapshot,
      gameKickoffUtc: selection.home.kickoffUtc,
    });

    rows.push(
      buildTotalsPerformanceRow({
        snapshots: selection,
        homeActual,
        awayActual,
        market,
        context,
        homePredictionIdRef: homeRecord.prediction_id,
        awayPredictionIdRef: awayRecord.prediction_id,
      })
    );
  }

  rows.sort((a, b) => a.season - b.season || a.week - b.week || a.game_id.localeCompare(b.game_id));

  const summary = computeSummaryMetrics(rows);
  const buckets = computeBucketRollups(rows);

  const seasons = [...new Set(predictions.map((p) => p.season))].sort();
  const modelVersions = [...new Set(predictions.map((p) => p.model_version))].sort();
  const predictionTimestamps = predictions.map((p) => p.prediction_timestamp).sort();
  const contextCoverage = {
    trenches: rows.filter((r) => r.context.trenches.provenance_status === "available").length,
    ypp: rows.filter((r) => r.context.ypp.provenance_status === "available").length,
    epa: rows.filter((r) => r.context.epa.provenance_status === "available").length,
    coaching: rows.filter((r) => r.context.coaching.coaching_context_status === "OK").length,
  };

  const artifact = {
    _meta: buildNflMeta({
      source:
        "generated (data/nfl/predictions/**/nfl-total-ridge.jsonl + prediction-outcome resolver + data/market/betting-lines/history)",
      modelVersion: modelVersions.length === 1 ? modelVersions[0] : null,
      notes: [
        "Canonical derived totals performance artifact for the future /nfl/performance dashboard. Not a raw archive -- do not parse JSONL for this view.",
        "Actual outcomes are computed exclusively via resolvePredictionOutcome() from nfl-prediction-outcome-resolver.ts -- no independent grading logic exists here.",
        "Analysis context (trenches/ypp/epa) is attached only for games in the current season, using the prior-season-full window, and is null/unavailable everywhere else -- see nfl-game-context.ts for the leakage guarantee.",
        "Coaching Rating v1 context is joined per row (Phase C): historical rows use the point-in-time data/nfl/coaching/rating-snapshots/<season>/<week>.json; current-season rows use the current coaching-ratings artifact only when its source cutoff is strictly pregame. A historical row never falls back to current ratings. Coaching is ANALYSIS CONTEXT ONLY and never a model input; no Over/Under coaching lean is ever implied and ATS is never weighted.",
      ],
      generatedAt,
    }),
    schemaVersion: TOTALS_PERFORMANCE_SCHEMA_VERSION,
    performanceMeta: {
      schemaVersion: TOTALS_PERFORMANCE_SCHEMA_VERSION,
      generatedAt,
      seasons,
      modelVersions,
      gradedGames: rows.length,
      latestPredictionTimestamp: predictionTimestamps.length ? predictionTimestamps[predictionTimestamps.length - 1] : null,
      latestOutcomeTimestamp: rows.length ? rows.map((r) => r.prediction_timestamp).sort().slice(-1)[0] : null,
      marketCoverageCount: rows.filter((r) => r.market_total != null).length,
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

  const { artifact, predictionsCount } = buildTotalsPerformanceArtifact(generatedAt);
  const rows = artifact.rows;
  const exclusions = artifact.exclusions;

  console.log(
    `[nfl:totals-performance] graded=${rows.length} excluded=${JSON.stringify(exclusions)} predictions=${predictionsCount}`
  );

  if (dryRun) {
    console.log(`[nfl:totals-performance] dry-run -- not writing ${OUT_FILE}`);
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
  console.log(`[nfl:totals-performance] wrote ${OUT_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`[nfl:totals-performance] FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
