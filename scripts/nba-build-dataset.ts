/**
 * Build canonical NBA tables from preserved raw snapshots (no network).
 *
 *   npm run nba:build-dataset
 *   npm run nba:build-dataset -- --raw=data/nba/raw/stats-nba --out=data/nba/canonical
 *
 * Verifies each raw body against the sha256 recorded at retrieval, normalizes,
 * dedupes, validates and writes (gitignored):
 *   player-games.jsonl, team-games.jsonl, games.json, players.json, teams.json,
 *   coverage.json, revisions.json, validation-issues.json, manifest.json
 * Exits non-zero when any error-severity validation issue is found.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseStatsNbaResultSets } from "../src/lib/nba/props/ingest/statsNbaPayload";
import { buildDataset, type NormalizedSnapshot } from "../src/lib/nba/props/dataset";
import { normalizePlayerGameLogs, normalizeTeamGameLogs } from "../src/lib/nba/props/normalize";
import type { RawSnapshotMeta } from "../src/lib/nba/props/types";

const DEFAULT_RAW_DIR = "data/nba/raw/stats-nba";
const DEFAULT_OUT_DIR = "data/nba/canonical";

function arg(name: string, fallback: string): string {
  const hit = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function findMetaFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findMetaFiles(full);
    return entry.name.endsWith(".meta.json") ? [full] : [];
  });
}

function loadSnapshot(metaPath: string, teamNames: Map<number, Set<string>>): NormalizedSnapshot {
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as RawSnapshotMeta;
  const bodyText = readFileSync(path.join(path.dirname(metaPath), meta.bodyFile), "utf8");
  const sha = createHash("sha256").update(bodyText, "utf8").digest("hex");
  if (sha !== meta.bodySha256) {
    throw new Error(`Raw body integrity failure for ${meta.snapshotId}: sha256 ${sha} != recorded ${meta.bodySha256}`);
  }
  const [resultSet] = parseStatsNbaResultSets(bodyText);
  const teamIdIndex = resultSet.headers.indexOf("TEAM_ID");
  const teamNameIndex = resultSet.headers.indexOf("TEAM_NAME");
  for (const row of resultSet.rowSet) {
    const id = Number(row[teamIdIndex]);
    teamNames.set(id, (teamNames.get(id) ?? new Set()).add(String(row[teamNameIndex])));
  }
  const ctx = { snapshotId: meta.snapshotId, season: meta.season, seasonType: meta.seasonType };
  if (meta.endpoint === "playergamelogs") {
    const { rows, issues } = normalizePlayerGameLogs(resultSet, ctx);
    return { meta, playerRows: rows, issues };
  }
  const { rows, issues } = normalizeTeamGameLogs(resultSet, ctx);
  return { meta, teamRows: rows, issues };
}

const toJsonl = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";

function main(): void {
  const rawDir = arg("raw", DEFAULT_RAW_DIR);
  const outDir = arg("out", DEFAULT_OUT_DIR);
  const metaFiles = findMetaFiles(rawDir).sort();
  if (metaFiles.length === 0) throw new Error(`No raw snapshots under ${rawDir}; retrieval tooling is local-only and not in the repository (docs/nba-player-props-phase-2b-plan.md)`);

  const teamNames = new Map<number, Set<string>>();
  const snapshots = metaFiles.map((file) => loadSnapshot(file, teamNames));
  const dataset = buildDataset(snapshots, teamNames);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "player-games.jsonl"), toJsonl(dataset.playerGames));
  writeFileSync(path.join(outDir, "team-games.jsonl"), toJsonl(dataset.teamGames));
  const json = (name: string, value: unknown) => writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`);
  json("games.json", dataset.games);
  json("players.json", dataset.players);
  json("teams.json", dataset.teams);
  json("coverage.json", dataset.coverage);
  json("revisions.json", dataset.revisions);
  json("validation-issues.json", dataset.issues);

  const issueCounts = dataset.issues.reduce<Record<string, number>>((acc, issue) => {
    const key = `${issue.severity}:${issue.code}`;
    return { ...acc, [key]: (acc[key] ?? 0) + 1 };
  }, {});
  json("manifest.json", {
    schemaVersion: "nba-canonical-manifest-v1",
    builtAtUtc: new Date().toISOString(),
    rawSnapshotsRead: snapshots.length,
    latestSnapshotsUsed: dataset.coverage.flatMap((row) => row.snapshotIds),
    rowCounts: {
      playerGames: dataset.playerGames.length,
      teamGames: dataset.teamGames.length,
      games: dataset.games.length,
      players: dataset.players.length,
      teams: dataset.teams.length,
    },
    issueCounts,
  });

  console.table(dataset.coverage.map(({ snapshotIds: _ids, ...row }) => row));
  console.log("Revisions vs previous snapshots:", dataset.revisions.length ? dataset.revisions : "none (single snapshot per key)");
  console.log("Validation issues:", Object.keys(issueCounts).length ? issueCounts : "none");
  if (dataset.issues.some((issue) => issue.severity === "error")) process.exitCode = 1;
}

main();
