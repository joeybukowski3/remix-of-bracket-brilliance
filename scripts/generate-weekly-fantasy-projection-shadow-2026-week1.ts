/**
 * Phase 3 SHADOW generator: 2026 Week 1 QB/RB/WR/TE `projectedFantasyPoints`.
 *
 * Reads ONLY the frozen `weekly-fantasy-projection-v1` model authority
 * (`frozenSpec.ts`) plus pregame-known 2026 Week 1 sources and the
 * historical modeling dataset. Never touches, imports, or writes the
 * production weekly-ranking artifact/consumer. Output is written under the
 * already-gitignored `data/fantasy/projections/shadow/` tree.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWeeklyFantasyProjectionDeploymentBundle, type WeeklyFantasyProjectionDeploymentBundle } from "../src/lib/fantasy/weekly/projections/model/deploymentFit.ts";
import { getFrozenModelAuthority, WEEKLY_FANTASY_PROJECTION_MODEL_VERSION, listFrozenPositions } from "../src/lib/fantasy/weekly/projections/model/frozenSpec.ts";
import type { WeeklyFantasyProjectionTrainingRow } from "../src/lib/fantasy/weekly/projections/contract.ts";
import { buildWeeklyFantasyProjectionShadowArtifact } from "../src/lib/fantasy/weekly/projections/shadow/artifactBuilder.ts";
import { auditPositionDistributions, coldStartAudit, largestAdjustments, unresolvedIdentitySummary } from "../src/lib/fantasy/weekly/projections/shadow/audit.ts";
import { compareShadowToCurrentRankings } from "../src/lib/fantasy/weekly/projections/shadow/comparison.ts";
import { buildWeek1ShadowUniverse } from "../src/lib/fantasy/weekly/projections/shadow/week1Universe.ts";
import { buildWeek1ShadowTrainingRow } from "../src/lib/fantasy/weekly/projections/shadow/week1Rows.ts";
import { weeklyFantasyRankingArtifactSchema } from "../src/lib/fantasy/weekly/productionAuthority.ts";
import type { HistoricalPlayerWeek } from "../src/lib/fantasy/weekly/history.ts";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEASON = 2026;
const WEEK = 1;
const OUT_DIR = join(ROOT, "data", "fantasy", "projections", "shadow", "2026");
const PAR_INPUT_AS_OF = "2026-08-16T16:13:26.000Z";

type CsvRow = Record<string, string>;
type ManifestEntry = { season: number | null; filename: string; retrievedDateUtc: string; sha256: string };
type Manifest = { schemaVersion: string; files: ManifestEntry[] };

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
function isoDate(value: string): string {
  return `${value}T00:00:00.000Z`;
}
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
function writeAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}
function verifiedCsv(relativeDirectory: string, season: number | null) {
  const directory = join(ROOT, relativeDirectory);
  const manifest = readJson<Manifest>(join(directory, "manifest.json"));
  const entry = manifest.files.find((candidate) => candidate.season === season);
  if (!entry) throw new Error(`Missing ${relativeDirectory} manifest entry for ${season ?? "league"}.`);
  const path = join(directory, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return { rows: parseCsv(text) as CsvRow[], entry, manifest, path, hash: sha(text), text };
}

function parseArgs(argv: string[]) {
  const args = { generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be ISO.");
  return args;
}

function main(): void {
  const options = parseArgs(process.argv);
  const generatedAt = options.generatedAt;
  const sourceFreshness: { source: string; inputAsOf: string }[] = [];

  // --- 1. Frozen model authority audit (spec section 1) ---
  const positions = listFrozenPositions();
  const specsByPosition = Object.fromEntries(positions.map((p) => [p, getFrozenModelAuthority(WEEKLY_FANTASY_PROJECTION_MODEL_VERSION, p)]));
  const fittedParametersFrozen = false; // frozenSpec.ts stores DESIGN only; see section 1 audit in report below.

  // --- 2. Load ALL historical modeled rows (2023-2025) for the deployment refit ---
  const trainingDatasetPath = join(ROOT, "data", "fantasy", "projections", "weekly-fantasy-projection-training-dataset-v1.json");
  const trainingDataset = readJson<{ _meta: { generatedAt: string }; rows: WeeklyFantasyProjectionTrainingRow[] }>(trainingDatasetPath);
  sourceFreshness.push({ source: trainingDatasetPath, inputAsOf: trainingDataset._meta.generatedAt });
  const inputFingerprint = sha(readFileSync(trainingDatasetPath));
  const deploymentBundle: WeeklyFantasyProjectionDeploymentBundle = buildWeeklyFantasyProjectionDeploymentBundle(
    trainingDataset.rows,
    { generatedAt, inputFingerprint },
  );
  writeAtomic(join(OUT_DIR, "deployment-bundle-v1.json"), deploymentBundle);

  // --- 3. 2026 Week 1 universe sources (identity/roster/schedule/ROS) ---
  const parPath = join(ROOT, "data", "fantasy", "2026-par-consensus.json");
  const parText = readFileSync(parPath, "utf8");
  const par = JSON.parse(parText) as { Player: string; Team: string; Position: string; "2026 Projected PPG": number; "Source ID": string; "Consensus Position Rank": number }[];
  sourceFreshness.push({ source: parPath, inputAsOf: PAR_INPUT_AS_OF });

  const players = verifiedCsv("data/nfl/nflverse/players", null);
  sourceFreshness.push({ source: "data/nfl/nflverse/players", inputAsOf: isoDate(players.entry.retrievedDateUtc) });
  const roster = verifiedCsv("data/nfl/nflverse/weekly-rosters", SEASON);
  sourceFreshness.push({ source: "data/nfl/nflverse/weekly-rosters", inputAsOf: isoDate(roster.entry.retrievedDateUtc) });

  const schedulePath = join(ROOT, "public", "data", "nfl", String(SEASON), "games.json");
  const scheduleText = readFileSync(schedulePath, "utf8");
  const schedule = JSON.parse(scheduleText) as { _meta: { generatedAt: string }; games: { gameId: string; season: number; week: number; seasonType: string; homeAbbr: string; awayAbbr: string; neutralSite: boolean }[] };
  sourceFreshness.push({ source: schedulePath, inputAsOf: schedule._meta.generatedAt });

  const universe = buildWeek1ShadowUniverse({
    season: SEASON, week: WEEK, par,
    players: players.rows.map((r) => ({ gsis_id: r.gsis_id, pfr_id: r.pfr_id, display_name: r.display_name, position: r.position, team_abbr: r.team_abbr, status: r.status })),
    roster: roster.rows.map((r) => ({ gsis_id: r.gsis_id, pfr_id: r.pfr_id, full_name: r.full_name, position: r.position, team: r.team, status: r.status, week: r.week, game_type: r.game_type })),
    games: schedule.games,
  });

  // --- 4. 2025 prior-season history for Week 1 features (spec sections 4/6/7) ---
  const historyPath = join(ROOT, "data", "fantasy", "weekly", "player-week-history-2023-2025.json");
  const historyText = readFileSync(historyPath, "utf8");
  const historyArtifact = JSON.parse(historyText) as { _meta: { generatedAt: string }; rows: HistoricalPlayerWeek[] };
  sourceFreshness.push({ source: historyPath, inputAsOf: historyArtifact._meta.generatedAt });
  const history2025 = historyArtifact.rows.filter((row) => row.season === 2025);

  const rowProvenance: WeeklyFantasyProjectionTrainingRow["provenance"] = {
    generatedAt,
    sourceManifests: [{ cache: "data/fantasy/weekly/player-week-history-2023-2025.json", season: 2025, filename: "player-week-history-2023-2025.json", retrievedDateUtc: historyArtifact._meta.generatedAt, sha256: sha(historyText) }],
    scheduleSource: { url: schedulePath, retrievedAtUtc: schedule._meta.generatedAt, sha256: sha(scheduleText) },
  };

  const shadowInputRows = universe.resolved.map((candidate) => ({
    row: buildWeek1ShadowTrainingRow(candidate, history2025, generatedAt, rowProvenance),
    rosProjectedPpg: candidate.rosProjectedPpg,
  }));

  const artifactProvenance = [
    { source: parPath, sourceVersion: "2026-par-consensus", sourceHash: sha(parText), inputAsOf: PAR_INPUT_AS_OF },
    { source: "data/nfl/nflverse/players", sourceVersion: players.manifest.schemaVersion, sourceHash: players.hash, inputAsOf: isoDate(players.entry.retrievedDateUtc) },
    { source: "data/nfl/nflverse/weekly-rosters", sourceVersion: roster.manifest.schemaVersion, sourceHash: roster.hash, inputAsOf: isoDate(roster.entry.retrievedDateUtc) },
    { source: schedulePath, sourceVersion: "nfl-v0.1", sourceHash: sha(scheduleText), inputAsOf: schedule._meta.generatedAt },
    { source: historyPath, sourceVersion: "fantasy-player-week-history-v1", sourceHash: sha(historyText), inputAsOf: historyArtifact._meta.generatedAt },
    { source: trainingDatasetPath, sourceVersion: "weekly-fantasy-projection-training-dataset-v1", sourceHash: inputFingerprint, inputAsOf: trainingDataset._meta.generatedAt },
  ];
  const inputAsOf = artifactProvenance.map((p) => p.inputAsOf).sort().at(-1)!;

  const artifact = buildWeeklyFantasyProjectionShadowArtifact({
    season: SEASON, week: WEEK, generatedAt, inputAsOf,
    rows: shadowInputRows, deploymentBundle, provenance: artifactProvenance,
  });
  writeAtomic(join(OUT_DIR, "week-01.json"), artifact);

  // --- 5. Comparison vs current canonical production artifact (read-only) ---
  const currentPath = join(ROOT, "public", "data", "fantasy", "weekly", String(SEASON), `week-${String(WEEK).padStart(2, "0")}.json`);
  const currentArtifact = weeklyFantasyRankingArtifactSchema.parse(readJson(currentPath));
  const comparison = compareShadowToCurrentRankings(currentArtifact, artifact);

  // --- 6. Diagnostics / cold-start / largest adjustments ---
  const distributions = auditPositionDistributions(artifact);
  const adjustments = largestAdjustments(artifact, 20);
  const coldStart = coldStartAudit(artifact);
  const unresolvedByPosition = unresolvedIdentitySummary(universe.unresolved);

  const report = {
    generatedAt,
    modelVersion: WEEKLY_FANTASY_PROJECTION_MODEL_VERSION,
    deploymentFitVersion: deploymentBundle.deploymentFitVersion,
    fittedParametersFrozenInFrozenSpecTs: fittedParametersFrozen,
    frozenModelAuthorityByPosition: specsByPosition,
    deploymentFitTrainingSeasons: deploymentBundle.trainingSeasons,
    sourceFreshness,
    playerUniverse: {
      resolvedCount: universe.resolved.length,
      unresolvedCount: universe.unresolved.length,
      unresolvedByPosition,
      duplicateGsisIds: universe.duplicateGsisIds,
      unresolved: universe.unresolved,
    },
    rowCountsByPosition: Object.fromEntries((["QB", "RB", "WR", "TE"] as const).map((p) => [p, artifact.rows[p].length])),
    distributions,
    largestAdjustments: adjustments,
    coldStartAudit: coldStart,
    rankComparisonVsCurrentProduction: comparison,
  };
  writeAtomic(join(OUT_DIR, "week-01-audit-report.json"), report);

  console.log(JSON.stringify({
    output: join(OUT_DIR, "week-01.json"),
    auditReport: join(OUT_DIR, "week-01-audit-report.json"),
    rowCounts: report.rowCountsByPosition,
    unresolved: universe.unresolved.length,
    duplicateGsisIds: universe.duplicateGsisIds.length,
  }, null, 2));
}

main();
