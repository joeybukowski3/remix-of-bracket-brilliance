/**
 * PRODUCTION generator: canonical `projectedFantasyPoints` artifact for a
 * given season/week, published to
 * `public/data/fantasy/projections/<season>/week-<NN>.json`.
 *
 * Promotes the approved Phase 3 shadow architecture
 * (`src/lib/fantasy/weekly/projections/shadow/*`) into a real production
 * consumer path via the generic `buildProductionProjectionArtifact`
 * (`src/lib/fantasy/weekly/projections/production/generator.ts`). Reads
 * ONLY the frozen `weekly-fantasy-projection-v1` model authority
 * (`frozenSpec.ts`) and pregame-known sources; never reads rejected V2
 * research (`projections-v2/`).
 *
 * Fails closed: any schema/version mismatch, duplicate GSIS id, non-finite
 * projection, or unsupported position throws and nothing is published. The
 * artifact is written to a `.tmp` staging file and atomically renamed into
 * place only after `weeklyFantasyProjectionProductionArtifactSchema` and
 * the rank invariants both pass -- a failed run never overwrites, and never
 * relabels, the previous canonical artifact for another week.
 *
 * Currently generic on `--week`, but Week 2+ current-season history
 * (`data/fantasy/weekly/player-week-history-2023-2025.json`-equivalent for
 * 2026) is not yet populated by any refresh job in this repo -- see
 * `--week=1` being the only week with real input data today. The Week 2+
 * code path itself is exercised by
 * `src/lib/fantasy/weekly/projections/production/generator.test.ts`
 * (synthetic fixtures), proving the activation logic works generically
 * before any real Week 2+ history source exists.
 *
 * Usage:
 *   tsx scripts/generate-fantasy-weekly-projections.ts --season=2026 --week=1
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWeeklyFantasyProjectionDeploymentBundle, type WeeklyFantasyProjectionDeploymentBundle } from "../src/lib/fantasy/weekly/projections/model/deploymentFit.ts";
import { buildProductionProjectionArtifact, type ProductionProjectionCandidate } from "../src/lib/fantasy/weekly/projections/production/generator.ts";
import { weeklyFantasyProjectionProductionArtifactSchema, assertProductionArtifactRankInvariants, type WeeklyFantasyProjectionProductionArtifact } from "../src/lib/fantasy/weekly/projections/production/artifactContract.ts";
import { buildWeek1ShadowUniverse } from "../src/lib/fantasy/weekly/projections/shadow/week1Universe.ts";
import type { WeeklyFantasyProjectionTrainingRow } from "../src/lib/fantasy/weekly/projections/contract.ts";
import type { HistoricalPlayerWeek } from "../src/lib/fantasy/weekly/history.ts";
import type { MarketArtifact } from "../src/lib/nfl/marketData.ts";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  const tmp = `${path}.tmp-${process.pid}`;
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
  const args = { season: 2026, week: 1, generatedAt: new Date().toISOString(), outRoot: join(ROOT, "public", "data", "fantasy", "projections") };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else if (raw.startsWith("--out-root=")) args.outRoot = resolve(raw.slice(11));
    else if (raw === "--validate-only") continue;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || args.season < 2000) throw new Error("--season must be a valid year.");
  if (!Number.isInteger(args.week) || args.week < 1 || args.week > 18) throw new Error("--week must be 1-18.");
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be ISO.");
  return args;
}

/** Freshness for inputs actually consulted at this week -- Week 1 never needs current-season team-context data because none exists yet. */
function reportSourceFreshness(entries: { source: string; inputAsOf: string }[]): void {
  console.log("[fantasy:projections] source freshness:");
  for (const entry of entries) console.log(`  - ${entry.source}: ${entry.inputAsOf}`);
}

function main(): void {
  const args = parseArgs(process.argv);
  const { season, week, generatedAt } = args;
  const sourceFreshness: { source: string; inputAsOf: string }[] = [];

  // --- 1. Deployment refit from ALL historical modeled rows (2023-2025) ---
  const trainingDatasetPath = join(ROOT, "data", "fantasy", "projections", "weekly-fantasy-projection-training-dataset-v1.json");
  const trainingDataset = readJson<{ _meta: { generatedAt: string }; rows: WeeklyFantasyProjectionTrainingRow[] }>(trainingDatasetPath);
  sourceFreshness.push({ source: trainingDatasetPath, inputAsOf: trainingDataset._meta.generatedAt });
  const inputFingerprint = sha(readFileSync(trainingDatasetPath));
  const deploymentBundle: WeeklyFantasyProjectionDeploymentBundle = buildWeeklyFantasyProjectionDeploymentBundle(
    trainingDataset.rows,
    { generatedAt, inputFingerprint },
  );

  // --- 2. Player universe sources (identity/roster/schedule/ROS) ---
  const parPath = join(ROOT, "data", "fantasy", "2026-par-consensus.json");
  const parText = readFileSync(parPath, "utf8");
  const par = JSON.parse(parText) as { Player: string; Team: string; Position: string; "2026 Projected PPG": number; "Source ID": string; "Consensus Position Rank": number }[];
  sourceFreshness.push({ source: parPath, inputAsOf: PAR_INPUT_AS_OF });

  const players = verifiedCsv("data/nfl/nflverse/players", null);
  sourceFreshness.push({ source: "data/nfl/nflverse/players", inputAsOf: isoDate(players.entry.retrievedDateUtc) });
  const roster = verifiedCsv("data/nfl/nflverse/weekly-rosters", season);
  sourceFreshness.push({ source: "data/nfl/nflverse/weekly-rosters", inputAsOf: isoDate(roster.entry.retrievedDateUtc) });

  const schedulePath = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  const scheduleText = readFileSync(schedulePath, "utf8");
  const schedule = JSON.parse(scheduleText) as { _meta: { generatedAt: string }; games: { gameId: string; season: number; week: number; seasonType: string; homeAbbr: string; awayAbbr: string; neutralSite: boolean }[] };
  sourceFreshness.push({ source: schedulePath, inputAsOf: schedule._meta.generatedAt });

  const universe = buildWeek1ShadowUniverse({
    season, week, par,
    players: players.rows.map((r) => ({ gsis_id: r.gsis_id, pfr_id: r.pfr_id, display_name: r.display_name, position: r.position, team_abbr: r.team_abbr, status: r.status })),
    roster: roster.rows.map((r) => ({ gsis_id: r.gsis_id, pfr_id: r.pfr_id, full_name: r.full_name, position: r.position, team: r.team, status: r.status, week: r.week, game_type: r.game_type })),
    games: schedule.games,
  });
  if (universe.duplicateGsisIds.length > 0) {
    throw new Error(`Duplicate GSIS ids resolved in player universe: ${universe.duplicateGsisIds.join(", ")}`);
  }

  // --- 3. Prior-season history (always needed) + current-season history through week N-1 (only when N > 1) ---
  const historyPath = join(ROOT, "data", "fantasy", "weekly", "player-week-history-2023-2025.json");
  const historyText = readFileSync(historyPath, "utf8");
  const historyArtifact = JSON.parse(historyText) as { _meta: { generatedAt: string }; rows: HistoricalPlayerWeek[] };
  sourceFreshness.push({ source: historyPath, inputAsOf: historyArtifact._meta.generatedAt });
  const priorSeasonHistory = historyArtifact.rows.filter((row) => row.season === season - 1);

  let currentSeasonHistory: HistoricalPlayerWeek[] = [];
  if (week > 1) {
    const currentSeasonHistoryPath = join(ROOT, "data", "fantasy", "weekly", `player-week-history-${season}.json`);
    try {
      const currentText = readFileSync(currentSeasonHistoryPath, "utf8");
      const currentArtifact = JSON.parse(currentText) as { _meta: { generatedAt: string }; rows: HistoricalPlayerWeek[] };
      currentSeasonHistory = currentArtifact.rows.filter((row) => row.season === season && row.week < week);
      sourceFreshness.push({ source: currentSeasonHistoryPath, inputAsOf: currentArtifact._meta.generatedAt });
    } catch {
      throw new Error(
        `Week ${week} requires current-season history through week ${week - 1} at ${currentSeasonHistoryPath}, which is not present. ` +
        `Refusing to generate Week ${week} with no current-season features available -- run the current-season history refresh first.`,
      );
    }
  }
  const history = [...priorSeasonHistory, ...currentSeasonHistory];

  // --- 3b. Current market (spread/total) authority -- best-effort, never fails the run ---
  // The most current pregame spread/total source already approved by the NFL
  // side of the repo (`scripts/generate-nfl-matchup-market.mjs` ->
  // `@/lib/nfl/marketData`). Missing/unreadable market data degrades every
  // row's scoring-environment adjustment to 0 (`marketContextAvailable:
  // false`) rather than blocking generation or fabricating an implied total.
  const marketPath = join(ROOT, "public", "data", "nfl", "matchup-market.json");
  let currentMarket: MarketArtifact["currentMarket"] | null = null;
  let marketProvenanceEntry: WeeklyFantasyProjectionProductionArtifact["provenance"][number] | null = null;
  try {
    const marketText = readFileSync(marketPath, "utf8");
    const marketArtifact = JSON.parse(marketText) as MarketArtifact;
    currentMarket = marketArtifact.currentMarket;
    sourceFreshness.push({ source: marketPath, inputAsOf: marketArtifact._meta.generatedAt });
    marketProvenanceEntry = {
      source: marketPath, sourceVersion: marketArtifact.schemaVersion, sourceHash: sha(marketText),
      inputAsOf: marketArtifact._meta.generatedAt,
    };
  } catch {
    console.warn(`[fantasy:projections] No market data at ${marketPath}; scoring-environment context will be neutral for this run.`);
  }

  const rowProvenance: WeeklyFantasyProjectionTrainingRow["provenance"] = {
    generatedAt,
    sourceManifests: [{ cache: historyPath, season: season - 1, filename: "player-week-history-2023-2025.json", retrievedDateUtc: historyArtifact._meta.generatedAt, sha256: sha(historyText) }],
    scheduleSource: { url: schedulePath, retrievedAtUtc: schedule._meta.generatedAt, sha256: sha(scheduleText) },
  };
  void rowProvenance; // per-row provenance is embedded via buildProductionProjectionArtifact's artifact-level provenance below

  const candidates: ProductionProjectionCandidate[] = universe.resolved.map((c) => ({
    playerId: c.playerId, playerName: c.playerName, position: c.position,
    team: c.team, opponent: c.opponent, homeAway: c.homeAway, rosProjectedPpg: c.rosProjectedPpg,
  }));

  const artifactProvenance: WeeklyFantasyProjectionProductionArtifact["provenance"] = [
    { source: parPath, sourceVersion: "2026-par-consensus", sourceHash: sha(parText), inputAsOf: PAR_INPUT_AS_OF },
    { source: "data/nfl/nflverse/players", sourceVersion: players.manifest.schemaVersion, sourceHash: players.hash, inputAsOf: isoDate(players.entry.retrievedDateUtc) },
    { source: "data/nfl/nflverse/weekly-rosters", sourceVersion: roster.manifest.schemaVersion, sourceHash: roster.hash, inputAsOf: isoDate(roster.entry.retrievedDateUtc) },
    { source: schedulePath, sourceVersion: "nfl-v0.1", sourceHash: sha(scheduleText), inputAsOf: schedule._meta.generatedAt },
    { source: historyPath, sourceVersion: "fantasy-player-week-history-v1", sourceHash: sha(historyText), inputAsOf: historyArtifact._meta.generatedAt },
    { source: trainingDatasetPath, sourceVersion: "weekly-fantasy-projection-training-dataset-v1", sourceHash: inputFingerprint, inputAsOf: trainingDataset._meta.generatedAt },
    ...(marketProvenanceEntry ? [marketProvenanceEntry] : []),
  ];
  const inputAsOf = artifactProvenance.map((p) => p.inputAsOf).sort().at(-1)!;

  reportSourceFreshness(sourceFreshness);

  const artifact = buildProductionProjectionArtifact({
    season, week, generatedAt, inputAsOf, candidates, history, deploymentBundle: deploymentBundle, provenance: artifactProvenance,
    currentMarket,
  });

  // Fail-closed re-validation before any write (defense in depth on top of buildProductionProjectionArtifact's internal parse).
  const parsed = weeklyFantasyProjectionProductionArtifactSchema.parse(artifact);
  assertProductionArtifactRankInvariants(parsed);

  const outPath = join(args.outRoot, String(season), `week-${String(week).padStart(2, "0")}.json`);
  writeAtomic(outPath, parsed);

  const rowCounts = Object.fromEntries((["QB", "RB", "WR", "TE"] as const).map((p) => [p, parsed.rows[p].length]));
  console.log(JSON.stringify({
    output: outPath,
    season, week,
    rowCounts,
    resolvedCount: universe.resolved.length,
    unresolvedCount: universe.unresolved.length,
    unresolved: universe.unresolved,
  }, null, 2));
}

main();
