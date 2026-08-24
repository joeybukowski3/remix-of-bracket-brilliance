/**
 * Generates display-only Weekly Fantasy research context beside, never inside,
 * the canonical production projection artifact.
 *
 * Usage:
 *   npx tsx scripts/generate-fantasy-weekly-research.ts --season=2026 --week=1
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getMatchupGrade } from "../src/lib/fantasy/matchupGrade.ts";
import { normalizeHistoricalPlayerWeek, type HistoricalPlayerWeek } from "../src/lib/fantasy/weekly/history.ts";
import {
  assertProductionArtifactRankInvariants,
  weeklyFantasyProjectionProductionArtifactSchema,
  type WeeklyFantasyProjectionProductionArtifact,
} from "../src/lib/fantasy/weekly/projections/production/artifactContract.ts";
import { WEEKLY_RESEARCH_CONTEXT_VERSION, buildWeeklyFantasyResearchContexts } from "../src/lib/fantasy/weekly/researchContext.ts";
import {
  WEEKLY_FANTASY_RESEARCH_ARTIFACT_SCHEMA_VERSION,
  assertWeeklyFantasyResearchArtifactIdentity,
  weeklyFantasyResearchArtifactSchema,
  type WeeklyFantasyResearchArtifact,
} from "../src/lib/fantasy/weekly/researchArtifact.ts";
import type { EpaArtifact } from "../src/lib/nfl/epaData.ts";
import { buildNflOffenseMatchupEdges, selectFantasyMatchupEdges } from "../src/lib/nfl/matchupEdges.ts";
import type { SuccessRatesArtifact } from "../src/lib/nfl/successRateData.ts";
import type { NflGameRecord } from "../src/lib/nfl/standings.ts";
import type { TrenchMetricsArtifact } from "../src/lib/nfl/trenchMetricsData.ts";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;

type CsvRow = Record<string, string>;
type ManifestEntry = { season: number | null; filename: string; retrievedDateUtc: string; sha256: string };
type Manifest = { schemaVersion: string; files: ManifestEntry[] };
type GamesArtifact = { _meta?: { schemaVersion?: string; generatedAt?: string }; games: NflGameRecord[] };

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readTextJson<T>(path: string): { value: T; text: string; hash: string } {
  const text = readFileSync(path, "utf8");
  return { value: JSON.parse(text) as T, text, hash: sha(text) };
}

function readText(path: string): { text: string; hash: string } {
  const text = readFileSync(path, "utf8");
  return { text, hash: sha(text) };
}

function writeAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function loadHistory(season: number): { rows: HistoricalPlayerWeek[]; entry: ManifestEntry; manifest: Manifest; hash: string } {
  const directory = join(ROOT, "data", "nfl", "nflverse", "stats-player-week");
  const manifest = readTextJson<Manifest>(join(directory, "manifest.json")).value;
  const entry = manifest.files.find((candidate) => candidate.season === season);
  if (!entry) throw new Error(`Missing player-week history cache manifest entry for ${season}.`);
  const rawSource = readText(join(directory, entry.filename));
  const text = rawSource.text.replace(/\r\n/g, "\n");
  const source = { text, hash: sha(text) };
  const problems = verifyCacheEntry(entry, source.text);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const rows = (parseCsv(source.text) as CsvRow[])
    .map((row) => normalizeHistoricalPlayerWeek(row))
    .filter((row): row is HistoricalPlayerWeek => row != null);
  return { rows, entry, manifest, hash: source.hash };
}

function parseArgs(argv: string[]) {
  const args = { season: 2026, week: 1, out: null as string | null, generatedAt: null as string | null };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw.startsWith("--out=")) args.out = resolve(raw.slice(6));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || !Number.isInteger(args.week) || args.week < 1 || args.week > 18) {
    throw new Error("Invalid --season/--week.");
  }
  if (args.generatedAt != null && Number.isNaN(Date.parse(args.generatedAt))) throw new Error("Invalid --generated-at.");
  return args;
}

function projectionTuples(artifact: WeeklyFantasyProjectionProductionArtifact) {
  return POSITIONS.flatMap((position) => artifact.rows[position])
    .map((row) => [row.playerId, row.positionRank, row.projectedFantasyPoints] as const);
}

function main(): void {
  const args = parseArgs(process.argv);
  const projectionSourcePath = `public/data/fantasy/projections/${args.season}/week-${String(args.week).padStart(2, "0")}.json`;
  const projectionPath = join(ROOT, ...projectionSourcePath.split("/"));
  const outputPath = args.out ?? join(ROOT, "public", "data", "fantasy", "weekly-research", String(args.season), `week-${String(args.week).padStart(2, "0")}.json`);
  const projectionSource = readTextJson<unknown>(projectionPath);
  const projection = weeklyFantasyProjectionProductionArtifactSchema.parse(projectionSource.value);
  assertProductionArtifactRankInvariants(projection);
  const beforeTuples = projectionTuples(projection);

  const prior = loadHistory(args.season - 1);
  const current = args.week > 1 ? loadHistory(args.season) : null;
  const history = [...prior.rows, ...(current?.rows.filter((row) => row.week < args.week) ?? [])];

  const trenchSourcePath = "public/data/nfl/matchup-trench-metrics.json";
  const epaSourcePath = "public/data/nfl/matchup-epa.json";
  const successSourcePath = "public/data/nfl/matchup-success-rates.json";
  const gamesSourcePath = `public/data/nfl/${args.season}/games.json`;
  const trenchPath = join(ROOT, ...trenchSourcePath.split("/"));
  const epaPath = join(ROOT, ...epaSourcePath.split("/"));
  const successPath = join(ROOT, ...successSourcePath.split("/"));
  const gamesPath = join(ROOT, ...gamesSourcePath.split("/"));
  const trenchSource = readTextJson<TrenchMetricsArtifact>(trenchPath);
  const epaSource = readTextJson<EpaArtifact>(epaPath);
  const successSource = readTextJson<SuccessRatesArtifact>(successPath);
  const gamesSource = readTextJson<GamesArtifact>(gamesPath);

  const completedGamesByTeam = new Map<string, number>();
  for (const game of gamesSource.value.games) {
    if (game.seasonType !== "REG" || game.status !== "final") continue;
    for (const team of [game.homeAbbr, game.awayAbbr]) {
      if (team) completedGamesByTeam.set(team, (completedGamesByTeam.get(team) ?? 0) + 1);
    }
  }

  const projectionRows = POSITIONS.flatMap((position) => projection.rows[position]);
  const contexts = buildWeeklyFantasyResearchContexts(projectionRows, history, args.season, args.week);
  const rows: WeeklyFantasyResearchArtifact["rows"] = projectionRows.map((row) => {
    const context = contexts.get(row.playerId);
    if (!context) throw new Error(`Missing generated research context for ${row.playerId}.`);
    const allEdges = buildNflOffenseMatchupEdges({
      team: row.team,
      opponent: row.opponent,
      teamCompletedGames: completedGamesByTeam.get(row.team) ?? 0,
      opponentCompletedGames: completedGamesByTeam.get(row.opponent) ?? 0,
      trench: trenchSource.value,
      epa: epaSource.value,
      success: successSource.value,
    });
    return {
      playerId: row.playerId,
      position: row.position,
      context,
      matchupGrade: getMatchupGrade(context.opponentFpaSeason.rank)?.id ?? null,
      matchupEdges: selectFantasyMatchupEdges(row.position, allEdges),
    };
  });

  const historyInputAsOf = `${prior.entry.retrievedDateUtc}T00:00:00.000Z`;
  const currentInputAsOf = current ? `${current.entry.retrievedDateUtc}T00:00:00.000Z` : null;
  const trenchInputAsOf = trenchSource.value.generatedAt;
  const epaInputAsOf = epaSource.value._meta.generatedAt;
  const successInputAsOf = successSource.value._meta.generatedAt;
  const gamesInputAsOf = gamesSource.value._meta?.generatedAt ?? projection.inputAsOf;
  const inputAsOf = [projection.inputAsOf, historyInputAsOf, currentInputAsOf, trenchInputAsOf, epaInputAsOf, successInputAsOf, gamesInputAsOf]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)!;

  const artifact = weeklyFantasyResearchArtifactSchema.parse({
    schemaVersion: WEEKLY_FANTASY_RESEARCH_ARTIFACT_SCHEMA_VERSION,
    researchContextVersion: WEEKLY_RESEARCH_CONTEXT_VERSION,
    season: args.season,
    week: args.week,
    scoringVersion: projection.scoringVersion,
    generatedAt: args.generatedAt ?? inputAsOf,
    inputAsOf,
    projectionArtifact: {
      path: `/data/fantasy/projections/${args.season}/week-${String(args.week).padStart(2, "0")}.json`,
      schemaVersion: projection.schemaVersion,
      sourceHash: projectionSource.hash,
    },
    matchupGradeAuthority: {
      input: "opponentFpaSeason.rank",
      bands: "1-6 Great; 7-12 Good; 13-20 Neutral; 21-26 Tough; 27-32 Very Tough",
    },
    provenance: [
      { source: projectionSourcePath, sourceVersion: projection.schemaVersion, sourceHash: projectionSource.hash, inputAsOf: projection.inputAsOf },
      { source: "data/nfl/nflverse/stats-player-week", sourceVersion: prior.manifest.schemaVersion, sourceHash: prior.hash, inputAsOf: historyInputAsOf },
      ...(current ? [{ source: "data/nfl/nflverse/stats-player-week", sourceVersion: current.manifest.schemaVersion, sourceHash: current.hash, inputAsOf: currentInputAsOf! }] : []),
      { source: trenchSourcePath, sourceVersion: trenchSource.value.schemaVersion, sourceHash: trenchSource.hash, inputAsOf: trenchInputAsOf },
      { source: epaSourcePath, sourceVersion: epaSource.value.schemaVersion, sourceHash: epaSource.hash, inputAsOf: epaInputAsOf },
      { source: successSourcePath, sourceVersion: successSource.value._meta.schemaVersion, sourceHash: successSource.hash, inputAsOf: successInputAsOf },
      { source: gamesSourcePath, sourceVersion: gamesSource.value._meta?.schemaVersion ?? "nfl-games-v1", sourceHash: gamesSource.hash, inputAsOf: gamesInputAsOf },
    ],
    rows,
  });
  assertWeeklyFantasyResearchArtifactIdentity(artifact);

  const researchIds = new Set(artifact.rows.map((row) => row.playerId));
  if (researchIds.size !== beforeTuples.length || beforeTuples.some(([playerId]) => !researchIds.has(playerId))) {
    throw new Error("Research artifact identity set does not exactly match the projection artifact.");
  }
  writeAtomic(outputPath, artifact);

  const afterProjection = weeklyFantasyProjectionProductionArtifactSchema.parse(readTextJson<unknown>(projectionPath).value);
  if (JSON.stringify(beforeTuples) !== JSON.stringify(projectionTuples(afterProjection))) {
    throw new Error("Projection/rank authority changed while generating research context.");
  }

  console.log(JSON.stringify({
    output: outputPath,
    schemaVersion: artifact.schemaVersion,
    rows: artifact.rows.length,
    exactPlayerIdSet: true,
    projectionTuplesUnchanged: true,
  }, null, 2));
}

main();
