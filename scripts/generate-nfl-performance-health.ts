/**
 * WU4 -- generate public/data/nfl/performance/health.json, an OPERATIONAL
 * status artifact for the future /nfl/performance dashboard.
 *
 * Health is pipeline plumbing status (are the expected artifacts fresh and
 * complete), never predictive accuracy -- no MAE/hit-rate/bias value is ever
 * read here. Every input is a repo artifact already committed by another
 * step in this pipeline; this script makes NO live GitHub API calls, so
 * health.json is fully derivable offline from a checked-out repo. See
 * scripts/lib/nfl-performance-health.ts (pure, unit-tested) for the
 * status-computation rules themselves.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import { loadArchivedPredictions } from "./resolve-nfl-prediction-outcomes";
import {
  buildCoachingHealthSection,
  buildPropsHealthSection,
  buildSidesHealthSection,
  buildTotalsHealthSection,
  buildWorkflowHealthSection,
} from "./lib/nfl-performance-health";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PREDICTIONS_ROOT = join(ROOT, "data", "nfl", "predictions");
const STARTER_COHORT_ROOT = join(ROOT, "data", "nfl", "starter-cohorts");
const EVALUATION_SUMMARY_ROOT = join(ROOT, "data", "nfl", "prediction-evaluations", "jkb-football-evaluation-v1", "summary");
const RESOLUTION_STATUS_ROOT = join(ROOT, "data", "nfl", "prediction-evaluations", "jkb-football-evaluation-v1", "resolution-status");
const TOTALS_FILE = join(ROOT, "public", "data", "nfl", "performance", "totals.json");
const PROPS_FILE = join(ROOT, "public", "data", "nfl", "performance", "props.json");
const SIDES_FILE = join(ROOT, "public", "data", "nfl", "performance", "sides.json");
const COACHING_RATINGS_FILE = join(ROOT, "public", "data", "nfl", "coaching-ratings.json");
const COACHING_SNAPSHOT_ROOT = join(ROOT, "data", "nfl", "coaching", "rating-snapshots");
const OUT_FILE = join(ROOT, "public", "data", "nfl", "performance", "health.json");

/** All 32 NFL franchises are expected to carry a current head-coach rating. */
const EXPECTED_NFL_TEAM_COUNT = 32;
export const HEALTH_SCHEMA_VERSION = "nfl-performance-health-v1";

/** Matches the default season used elsewhere in this pipeline (e.g. resolve-nfl-current-week.mjs) when no artifact yet reports a season. */
const FALLBACK_SEASON = 2026;

function loadJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function mtimeIsoOrNull(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return statSync(filePath).mtime.toISOString();
}

function ageMs(generatedAt: string, referenceIso: string | null): number | null {
  if (referenceIso == null) return null;
  const ref = Date.parse(referenceIso);
  if (!Number.isFinite(ref)) return null;
  return Date.parse(generatedAt) - ref;
}

type SeasonWeekFile = { season: number; week: number; path: string };

function listSeasonWeekJsonlFiles(root: string, suffix: string): SeasonWeekFile[] {
  if (!existsSync(root)) return [];
  const out: SeasonWeekFile[] = [];
  for (const seasonEntry of readdirSync(root, { withFileTypes: true })) {
    if (!seasonEntry.isDirectory() || !/^[0-9]{4}$/.test(seasonEntry.name)) continue;
    const season = Number(seasonEntry.name);
    const seasonDir = join(root, seasonEntry.name);
    for (const fileEntry of readdirSync(seasonDir, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith(suffix)) continue;
      const weekToken = fileEntry.name.slice(0, -suffix.length);
      if (!/^[0-9]{2}$/.test(weekToken)) continue;
      out.push({ season, week: Number(weekToken), path: join(seasonDir, fileEntry.name) });
    }
  }
  return out;
}

function countJsonlLines(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  return readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).length;
}

type ResolutionStatusRow = {
  prediction_type: "spread" | "passing" | "rushing" | "receiving" | "team_opportunity" | "team_total";
  game_completion_status: "final" | "not_final" | "missing";
  ledger_status: string;
};

function loadResolutionStatusLedger(season: number): ResolutionStatusRow[] {
  const filePath = join(RESOLUTION_STATUS_ROOT, `${season}.jsonl`);
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ResolutionStatusRow);
}

/** A genuine backlog: the game is final but the ledger still has no resolved outcome for this prediction. Never counts a not-yet-final game -- that is expected pregame state, not degradation. */
function unresolvedFinalCount(ledger: readonly ResolutionStatusRow[], predictionTypes: readonly ResolutionStatusRow["prediction_type"][]): number {
  return ledger.filter((row) => predictionTypes.includes(row.prediction_type) && row.game_completion_status === "final" && row.ledger_status !== "resolved").length;
}

type GamesArtifact = { games: { gameId: string; dateUtc: string; status: string }[] };

/** Games already at/past kickoff by `generatedAt` -- the only games this pipeline should already have archived a team_total prediction for. A future-scheduled game is never counted as "expected" yet. */
function countGamesAtOrPastKickoff(season: number, generatedAt: string): number {
  const filePath = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  const artifact = loadJsonIfExists<GamesArtifact>(filePath);
  if (!artifact) return 0;
  const nowMs = Date.parse(generatedAt);
  return artifact.games.filter((g) => Date.parse(g.dateUtc) <= nowMs).length;
}

/**
 * Pure(-ish) artifact build: reads the same on-disk sources `main()` does,
 * but performs no writes. Exported so tests can call it twice and assert
 * determinism.
 */
export function buildPerformanceHealthArtifact(generatedAt: string) {
  const totals = loadJsonIfExists<{
    _meta: { generatedAt: string };
    performanceMeta: { seasons: number[]; latestPredictionTimestamp: string | null; modelVersions: string[] };
    summary: { graded_games: number };
    exclusions: { not_resolved: number };
    rows: unknown[];
  }>(TOTALS_FILE);
  const props = loadJsonIfExists<{
    _meta: { generatedAt: string };
    performanceMeta: { seasons: number[]; modelVersions: string[] };
    coverage: { total_cohort_rows: number; gradeable_rows: number; exclusions_by_reason: Record<string, number> };
    rows: { detail: { fitted_model_hash: string | null } }[];
  }>(PROPS_FILE);

  const totalsSeasons = totals?.performanceMeta.seasons ?? [];
  const propsSeasons = props?.performanceMeta.seasons ?? [];
  const allSeasons = [...new Set([...totalsSeasons, ...propsSeasons])].sort();
  const season = allSeasons.length ? allSeasons[allSeasons.length - 1] : FALLBACK_SEASON;

  const ledger = loadResolutionStatusLedger(season);
  const allPredictions = loadArchivedPredictions(PREDICTIONS_ROOT, season, null);

  // ---- TOTALS ----
  const totalTridgePredictions = allPredictions.filter((p) => p.prediction_type === "team_total");
  const totalTridgeIds = totalTridgePredictions.map((p) => p.prediction_id);
  const totalDuplicateIds = totalTridgeIds.length - new Set(totalTridgeIds).size;
  const totalFittedHashes = [...new Set(totalTridgePredictions.map((p) => p.feature_snapshot.fitted_model_hash).filter((h): h is string => h != null))].sort();
  const expectedGames = countGamesAtOrPastKickoff(season, generatedAt);
  const archivedGames = totals ? totals.summary.graded_games + totals.exclusions.not_resolved : 0;

  const totalsSection = buildTotalsHealthSection({
    artifactExists: totals != null,
    latestPredictionTimestamp: totals?.performanceMeta.latestPredictionTimestamp ?? null,
    latestGenerationTimestamp: totals?._meta.generatedAt ?? null,
    expectedGames,
    archivedGames,
    duplicatePredictionIds: Math.max(0, totalDuplicateIds),
    unresolvedCompletedGames: unresolvedFinalCount(ledger, ["team_total"]),
    modelVersionsSeen: totals?.performanceMeta.modelVersions ?? [],
    fittedHashesSeen: totalFittedHashes,
    publicArtifactAgeMs: totals ? ageMs(generatedAt, totals._meta.generatedAt) : null,
  });

  // ---- PROPS ----
  const passingPredictions = allPredictions.filter((p) => p.prediction_type === "passing");
  const rushingPredictions = allPredictions.filter((p) => p.prediction_type === "rushing");
  const receivingPredictions = allPredictions.filter((p) => p.prediction_type === "receiving");
  const latestTimestamp = (rows: { prediction_timestamp: string }[]): string | null =>
    rows.length ? rows.map((r) => r.prediction_timestamp).sort().slice(-1)[0] : null;

  const cohortFiles = listSeasonWeekJsonlFiles(STARTER_COHORT_ROOT, ".jsonl").filter((f) => !f.path.endsWith(".missing.jsonl") && f.season === season);
  const missingSlotFiles = listSeasonWeekJsonlFiles(STARTER_COHORT_ROOT, ".missing.jsonl").filter((f) => f.season === season);
  const starterCohortRowCount = cohortFiles.reduce((sum, f) => sum + countJsonlLines(f.path), 0);
  const missingStarterSlots = missingSlotFiles.reduce((sum, f) => sum + countJsonlLines(f.path), 0);

  const propsFittedHashes = [...new Set((props?.rows ?? []).map((r) => r.detail.fitted_model_hash).filter((h): h is string => h != null))].sort();

  const propsSection = buildPropsHealthSection({
    artifactExists: props != null,
    latestPassingPredictionTimestamp: latestTimestamp(passingPredictions),
    latestRushingPredictionTimestamp: latestTimestamp(rushingPredictions),
    latestReceivingPredictionTimestamp: latestTimestamp(receivingPredictions),
    starterCohortRowCount,
    missingStarterSlots,
    starterPropEvaluationRowCount: props?.coverage.gradeable_rows ?? 0,
    unresolvedFinalGames: unresolvedFinalCount(ledger, ["passing", "rushing", "receiving"]),
    missingComparisonLineCount: props?.coverage.exclusions_by_reason["NO_VALID_COMPARISON_LINE"] ?? 0,
    playerOutcomeBacklog: props?.coverage.exclusions_by_reason["ACTUAL_UNRESOLVED"] ?? 0,
    modelVersionsSeen: props?.performanceMeta.modelVersions ?? [],
    fittedHashesSeen: propsFittedHashes,
    publicArtifactAgeMs: props ? ageMs(generatedAt, props._meta.generatedAt) : null,
  });

  // ---- SIDES ----
  const spreadPredictions = allPredictions.filter((p) => p.prediction_type === "spread");
  const spreadModelVersions = [...new Set(spreadPredictions.map((p) => p.model_version))].sort();
  const evaluationSummaryFile = join(EVALUATION_SUMMARY_ROOT, `${season}.json`);
  const resolutionStatusFile = join(RESOLUTION_STATUS_ROOT, `${season}.jsonl`);

  const sides = loadJsonIfExists<{ _meta: { generatedAt: string }; summary: { graded_games: number } }>(SIDES_FILE);
  const sidesSection = buildSidesHealthSection({
    ledgerExists: existsSync(resolutionStatusFile),
    latestSpreadPredictionTimestamp: latestTimestamp(spreadPredictions),
    latestSpreadEvaluationTimestamp: mtimeIsoOrNull(evaluationSummaryFile),
    evaluationAgeMs: ageMs(generatedAt, mtimeIsoOrNull(evaluationSummaryFile)),
    modelVersionsSeen: spreadModelVersions,
    unresolvedFinalGames: unresolvedFinalCount(ledger, ["spread"]),
    sidesArtifactExists: sides != null,
    sidesArtifactGenerationTimestamp: sides?._meta.generatedAt ?? null,
    sidesArtifactGradedGames: sides?.summary.graded_games ?? 0,
    sidesArtifactAgeMs: sides ? ageMs(generatedAt, sides._meta.generatedAt) : null,
  });

  // ---- COACHING (Coaching Rating v1 — ANALYSIS CONTEXT ONLY) ----
  const coachingRatings = loadJsonIfExists<{
    _meta?: { generatedAt?: string };
    ratingVersion?: string | null;
    sourceCutoff?: string | null;
    coaches?: { team?: string; small_sample?: boolean; first_year?: boolean }[];
  }>(COACHING_RATINGS_FILE);
  const coachRows = coachingRatings?.coaches ?? [];
  const ratedTeams = new Set(coachRows.map((c) => c.team).filter((t): t is string => !!t));

  let snapshotFileCount = 0;
  let latestSnapshotSeason: number | null = null;
  let latestSnapshotWeek: number | null = null;
  if (existsSync(COACHING_SNAPSHOT_ROOT)) {
    for (const seasonEntry of readdirSync(COACHING_SNAPSHOT_ROOT, { withFileTypes: true })) {
      if (!seasonEntry.isDirectory() || !/^[0-9]{4}$/.test(seasonEntry.name)) continue;
      const season = Number(seasonEntry.name);
      for (const fileEntry of readdirSync(join(COACHING_SNAPSHOT_ROOT, seasonEntry.name), { withFileTypes: true })) {
        const weekMatch = fileEntry.isFile() ? /^([0-9]{1,2})\.json$/.exec(fileEntry.name) : null;
        if (!weekMatch) continue;
        snapshotFileCount += 1;
        const week = Number(weekMatch[1]);
        if (
          latestSnapshotSeason == null ||
          season > latestSnapshotSeason ||
          (season === latestSnapshotSeason && week > (latestSnapshotWeek ?? 0))
        ) {
          latestSnapshotSeason = season;
          latestSnapshotWeek = week;
        }
      }
    }
  }

  const coachingSection = buildCoachingHealthSection({
    currentArtifactExists: coachingRatings != null,
    ratingVersion: coachingRatings?.ratingVersion ?? null,
    artifactGeneratedAt: coachingRatings?._meta?.generatedAt ?? null,
    sourceCutoff: coachingRatings?.sourceCutoff ?? null,
    expectedTeamCount: EXPECTED_NFL_TEAM_COUNT,
    ratedTeamCount: ratedTeams.size,
    smallSampleCoachCount: coachRows.filter((c) => c.small_sample).length,
    firstYearCoachCount: coachRows.filter((c) => c.first_year).length,
    historicalSnapshotFileCount: snapshotFileCount,
    latestSnapshotSeason,
    latestSnapshotWeek,
    publicArtifactAgeMs: coachingRatings ? ageMs(generatedAt, coachingRatings._meta?.generatedAt ?? null) : null,
  });

  // ---- WORKFLOW ----
  const workflowSection = buildWorkflowHealthSection({
    "public/data/nfl/performance/totals.json": totals?._meta.generatedAt ?? null,
    "public/data/nfl/performance/props.json": props?._meta.generatedAt ?? null,
    "public/data/nfl/performance/sides.json": sides?._meta.generatedAt ?? null,
    "data/nfl/prediction-evaluations/jkb-football-evaluation-v1/summary": mtimeIsoOrNull(evaluationSummaryFile),
    "data/nfl/prediction-evaluations/jkb-football-evaluation-v1/resolution-status": mtimeIsoOrNull(resolutionStatusFile),
    "public/data/nfl/coaching-ratings.json": coachingRatings?._meta?.generatedAt ?? null,
  });

  const artifact = {
    _meta: buildNflMeta({
      source: "generated (public/data/nfl/performance/{totals,props}.json + data/nfl/predictions/** + data/nfl/prediction-evaluations/jkb-football-evaluation-v1/{summary,resolution-status} + public/data/nfl/<season>/games.json)",
      season,
      notes: [
        "Operational pipeline status, not predictive performance -- never reflects MAE/hit-rate/bias.",
        "A game that has not yet kicked off is expected-pregame-incomplete, not degraded; only a genuinely stuck (game-final, outcome-unresolved) row counts toward a backlog.",
        "Fully derivable from repo artifacts already committed by this pipeline -- makes no live GitHub API calls.",
      ],
      generatedAt,
    }),
    schemaVersion: HEALTH_SCHEMA_VERSION,
    performanceMeta: {
      schemaVersion: HEALTH_SCHEMA_VERSION,
      generatedAt,
      season,
    },
    totals: totalsSection,
    props: propsSection,
    sides: sidesSection,
    coaching: coachingSection,
    workflow: workflowSection,
  };

  return { artifact };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const generatedAt = args.find((a) => a.startsWith("--generated-at="))?.slice(15) ?? new Date().toISOString();

  const { artifact } = buildPerformanceHealthArtifact(generatedAt);

  console.log(
    `[nfl:performance-health] season=${artifact.performanceMeta.season} totals=${artifact.totals.status} props=${artifact.props.status} sides=${artifact.sides.status} coaching=${artifact.coaching.status}`,
  );

  if (dryRun) {
    console.log(`[nfl:performance-health] dry-run -- not writing ${OUT_FILE}`);
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
  console.log(`[nfl:performance-health] wrote ${OUT_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`[nfl:performance-health] FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
