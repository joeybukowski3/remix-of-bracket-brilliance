/**
 * Generate public/data/nfl/team-totals.json — a small, deterministic frontend
 * read view over the live JKB team_total prediction archive
 * (jkb-nfl-total-ridge-v1.0.0).
 *
 * This is a READ-ONLY consumer of data/nfl/predictions/<season>/<week>/
 * nfl-total-ridge.jsonl. It reuses the existing archive loader
 * (loadArchivedPredictions from resolve-nfl-prediction-outcomes.ts) rather
 * than re-implementing JSONL parsing, and writes nothing back to the
 * archive. It contains no model math: every number here is copied straight
 * from an already-archived `projection.projected_team_points` value.
 *
 * Why this file exists: the archive is an append-only, ever-growing history
 * of every snapshot ever produced (full feature vectors, provenance,
 * manifests). The browser should never fetch or parse that directly — this
 * script reduces it to exactly what the matchup page needs, one row per
 * game, using the SAME generated-artifact pattern as
 * public/data/nfl/matchup-projections.json (see generate-nfl-matchup-
 * projections.mts): a small keyed-by-gameId JSON file with a `_meta` block,
 * written atomically.
 *
 * Snapshot-selection logic (append-only archive, so a game can accumulate
 * more than one snapshot across scheduled runs): group archived team_total
 * rows by (game_id, home_away), and within each group take the row with the
 * lexicographically-latest `prediction_timestamp` (ISO-8601, so lexical
 * order is chronological order). A game is only included in the output when
 * BOTH a home and an away row resolve for that same game — a lopsided
 * archive (one side written, one side not yet) is treated as unavailable
 * for that game rather than half-shown.
 *
 * Run via tsx (imports TypeScript modules directly):
 *   npx tsx scripts/generate-nfl-team-totals-view.mts
 *   npx tsx scripts/generate-nfl-team-totals-view.mts --dry-run
 */
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflMeta, toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import { loadArchivedPredictions } from "./resolve-nfl-prediction-outcomes";
import type { PredictionSnapshotV1 } from "./lib/nfl-production-prediction-archive";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_ROOT = join(ROOT, "data", "nfl", "predictions");
const OUT_FILE = join(ROOT, "public", "data", "nfl", "team-totals.json");
export const TEAM_TOTALS_VIEW_SCHEMA_VERSION = "nfl-team-totals-view-v1";

export type TeamTotalProjection = {
  gameId: string;
  season: number;
  week: number;
  kickoffUtc: string;
  homeTeam: string;
  awayTeam: string;
  /** Model-projected points for the home team. Unrounded. */
  homeExpectedPoints: number;
  /** Model-projected points for the away team. Unrounded. */
  awayExpectedPoints: number;
  /** homeExpectedPoints + awayExpectedPoints, unrounded. */
  projectedGameTotal: number;
  modelVersion: string;
  /** Latest of the two teams' prediction_timestamp values used for this game. */
  predictionTimestamp: string;
  status: PredictionSnapshotV1["status"];
};

export type TeamTotalsViewArtifact = {
  _meta: ReturnType<typeof buildNflMeta>;
  schemaVersion: typeof TEAM_TOTALS_VIEW_SCHEMA_VERSION;
  /** The team_total model version, when every included game agrees on one. */
  modelVersion: string | null;
  projections: Record<string, TeamTotalProjection>;
  provenance: {
    generatedAt: string;
    gamesProjected: number;
    archiveRoot: string;
  };
};

/** Within one (game_id, home_away) group, the row with the latest ISO timestamp. */
function latestByTimestamp(rows: PredictionSnapshotV1[]): PredictionSnapshotV1 {
  return rows.reduce((latest, row) =>
    row.prediction_timestamp > latest.prediction_timestamp ? row : latest
  );
}

export function buildTeamTotalsProjections(
  records: readonly PredictionSnapshotV1[]
): Record<string, TeamTotalProjection> {
  const teamTotalRows = records.filter(
    (record): record is PredictionSnapshotV1 & { projection: { type: "team_total"; projected_team_points: number } } =>
      record.prediction_type === "team_total" &&
      record.status === "projected" &&
      record.projection.type === "team_total" &&
      Number.isFinite(record.projection.projected_team_points)
  );

  // Group by game_id, then by home/away side.
  const byGame = new Map<string, { home: PredictionSnapshotV1[]; away: PredictionSnapshotV1[] }>();
  for (const row of teamTotalRows) {
    const bucket = byGame.get(row.game_id) ?? { home: [], away: [] };
    bucket[row.home_away].push(row);
    byGame.set(row.game_id, bucket);
  }

  const projections: Record<string, TeamTotalProjection> = {};
  for (const [gameId, { home, away }] of byGame) {
    if (home.length === 0 || away.length === 0) continue; // lopsided archive: unavailable
    const homeRow = latestByTimestamp(home);
    const awayRow = latestByTimestamp(away);
    if (homeRow.projection.type !== "team_total" || awayRow.projection.type !== "team_total") continue;
    if (homeRow.model_version !== awayRow.model_version) {
      console.warn(
        `[nfl:team-totals-view] ${gameId}: home/away model_version mismatch (${homeRow.model_version} vs ${awayRow.model_version}) — skipping game`
      );
      continue;
    }

    const homeExpectedPoints = homeRow.projection.projected_team_points;
    const awayExpectedPoints = awayRow.projection.projected_team_points;
    projections[gameId] = {
      gameId,
      season: homeRow.season,
      week: homeRow.week,
      kickoffUtc: homeRow.kickoff_utc,
      homeTeam: homeRow.team,
      awayTeam: awayRow.team,
      homeExpectedPoints,
      awayExpectedPoints,
      projectedGameTotal: homeExpectedPoints + awayExpectedPoints,
      modelVersion: homeRow.model_version,
      predictionTimestamp:
        homeRow.prediction_timestamp > awayRow.prediction_timestamp
          ? homeRow.prediction_timestamp
          : awayRow.prediction_timestamp,
      status: "projected",
    };
  }
  return projections;
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

  const records = loadArchivedPredictions(args.archiveRoot, null, null);
  const projections = buildTeamTotalsProjections(records);
  const gameIds = Object.keys(projections);
  const modelVersions = new Set(gameIds.map((id) => projections[id].modelVersion));
  const modelVersion = modelVersions.size === 1 ? [...modelVersions][0] : null;

  const artifact: TeamTotalsViewArtifact = {
    _meta: buildNflMeta({
      source: "generated (data/nfl/predictions/**/nfl-total-ridge.jsonl)",
      modelVersion,
      notes: [
        "Read-only derived view over the live team_total prediction archive.",
        "One row per game: latest pregame snapshot per team, by prediction_timestamp.",
        "market_reference_status on every source row is not_applicable — no Vegas data entered this model.",
      ],
      generatedAt: args.generatedAt,
    }),
    schemaVersion: TEAM_TOTALS_VIEW_SCHEMA_VERSION,
    modelVersion,
    projections,
    provenance: {
      generatedAt: args.generatedAt,
      gamesProjected: gameIds.length,
      archiveRoot: args.archiveRoot,
    },
  };

  console.log(`[nfl:team-totals-view] games=${gameIds.length} modelVersion=${modelVersion ?? "MIXED"}`);

  if (args.dryRun) {
    console.log(`[nfl:team-totals-view] dry-run — not writing ${args.output}`);
    return;
  }

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
  console.log(`[nfl:team-totals-view] wrote ${args.output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`[nfl:team-totals-view] FAILED: ${err instanceof Error ? err.message : err}`);
    console.error("[nfl:team-totals-view] existing artifact left untouched");
    process.exit(1);
  }
}
