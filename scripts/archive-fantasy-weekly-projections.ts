import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";
import { buildFantasyCapture, persistFantasyCapture, selectFinalPregame, utcMillis, type ArchiveGame, type ArchivePlayer, type FantasyCaptureRun } from "./lib/nfl-fantasy-projection-archive";
import { writeArchiveManifest, type JsonValue } from "./lib/nfl-production-prediction-archive";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function parseFantasyArchiveArgs(argv: string[]) {
  const args = { season: NaN, week: NaN, capturedAt: null as string | null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const [key, inline] = argv[i].split(/=(.*)/s);
    if (key === "--dry-run") { args.dryRun = true; continue; }
    if (!["--season", "--week", "--captured-at"].includes(key)) throw new Error(`Unknown argument: ${key}`);
    const value = inline ?? argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing ${key}`);
    if (key === "--season") args.season = Number(value);
    if (key === "--week") args.week = Number(value);
    if (key === "--captured-at") args.capturedAt = value;
  }
  if (!Number.isInteger(args.season) || args.season < 2000 || args.season > 2100 || !Number.isInteger(args.week) || args.week < 1 || args.week > 18) throw new Error("Required: --season=YYYY --week=1..18");
  if (args.capturedAt && !Number.isFinite(utcMillis(args.capturedAt))) throw new Error("--captured-at must be UTC ISO-8601");
  return args;
}

export function runFantasyArchive(args: ReturnType<typeof parseFantasyArchiveArgs>, root = ROOT) {
  const archiveRoot = join(root, "data", "nfl", "predictions");
  const partition = join(archiveRoot, String(args.season), String(args.week).padStart(2, "0"));
  const runDir = join(partition, "fantasy-runs");
  const runs = existsSync(runDir) ? readdirSync(runDir).filter(name => name.endsWith(".json")).map(name => JSON.parse(readFileSync(join(runDir, name), "utf8")) as FantasyCaptureRun) : [];
  if (!args.dryRun && args.capturedAt && !runs.some(run => run.capturedAt === args.capturedAt)) throw new Error("New real captures use the actual clock; --captured-at is only for dry-run or an exact persisted retry (no backdating)");
  const sourceArtifact = `public/data/fantasy/projections/${args.season}/week-${String(args.week).padStart(2, "0")}.json`;
  const schedulePath = `public/data/nfl/${args.season}/games.json`;
  const playersPath = "data/nfl/nflverse/players/players.csv";
  const playersManifestPath = "data/nfl/nflverse/players/manifest.json";
  const sourceText = readFileSync(join(root, sourceArtifact), "utf8");
  const scheduleText = readFileSync(join(root, schedulePath), "utf8");
  const playersText = readFileSync(join(root, playersPath), "utf8");
  const playersManifestText = readFileSync(join(root, playersManifestPath), "utf8");
  const entry = JSON.parse(playersManifestText).files.find((row: { filename: string }) => row.filename === "players.csv");
  if (!entry) throw new Error("Missing canonical players manifest entry");
  const errors = verifyCacheEntry(entry, playersText.replace(/\r\n/g, "\n"));
  if (errors.length) throw new Error(errors.join("\n"));
  const observedAt = new Date().toISOString();
  const capture = buildFantasyCapture({ season: args.season, week: args.week, capturedAt: args.capturedAt ?? observedAt,
    sourceArtifact, sourceText, games: JSON.parse(scheduleText).games as ArchiveGame[], players: parseCsv(playersText) as ArchivePlayer[],
    resolutionSources: [{ logicalName: "canonical-schedule", path: schedulePath, content: scheduleText },
      { logicalName: "canonical-players", path: playersPath, content: playersText },
      { logicalName: "canonical-players-manifest", path: playersManifestPath, content: playersManifestText }],
  });
  // An operator-supplied historical clock is only a simulation or an exact existing retry.
  // A new real observation always uses the actual read-time clock.
  if (!args.dryRun && args.capturedAt && !existsSync(join(runDir, `${capture.run.runId}.json`))) throw new Error("New real captures use the actual clock; --captured-at is only for dry-run or an exact persisted retry (no backdating)");
  const write = persistFantasyCapture(archiveRoot, capture, args.dryRun);
  if (!runs.some(run => run.runId === capture.run.runId)) runs.push(capture.run);
  const selection = selectFinalPregame(write.records, runs, args.season, args.week);
  const selectionPath = join(partition, "fantasy-selections", `${selection.selectionId}.json`);
  writeArchiveManifest(selectionPath, selection as unknown as JsonValue, args.dryRun);
  return { dryRun: args.dryRun, ...capture.run, appended: write.appended, duplicates: write.duplicates,
    selected: selection.selections.length, staleSelected: selection.selections.filter(row => row.freshness.stale).length,
    sourceKickoffMissing: capture.events.filter(row => row.sourceKickoffMissing).length,
    intendedWrites: [...write.intendedWrites, selectionPath] };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runFantasyArchive(parseFantasyArchiveArgs(process.argv.slice(2))), (key, value) => key === "predictionIds" ? undefined : value, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
