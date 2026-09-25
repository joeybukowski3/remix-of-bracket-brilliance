/**
 * SHADOW-ONLY generator: production vs Candidate A vs Candidate B for one season/week.
 *
 * Reads the PUBLIC production artifact exactly as published (never modifies it) and the manifest-verified snap-count cache. For week > 1 the production
 * artifact MUST carry the epa-team-game provenance entry (proof the RB team-history repair is in production); otherwise Candidate A's RB path would sit on a
 * defective baseline and the run fails closed. Writes ONLY to data/fantasy/shadow/<season>/week-NN.json (NOT under public/, never served).
 *
 * Usage:
 *   tsx scripts/generate-fantasy-shadow-candidates.ts --season=2026 --week=3 [--out-root=<dir>] [--generated-at=<iso>]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";
import { resolveKickoff, type ShadowGame } from "./lib/fantasy-shadow-archive";
import { weeklyFantasyProjectionProductionArtifactSchema, type WeeklyFantasyProjectionProductionArtifact, type WeeklyFantasyProjectionProductionRow } from "../src/lib/fantasy/weekly/projections/production/artifactContract.ts";
import { computeCandidateA, computeCandidateB } from "../src/lib/fantasy/weekly/projections/shadow-candidates/candidates.ts";
import { CANDIDATE_A_SPEC, CANDIDATE_B_SNAP_SPEC, SHADOW_ARTIFACT_SCHEMA_VERSION, SHADOW_CANDIDATE_A_VERSION, SHADOW_CANDIDATE_B_VERSION, SHADOW_EXCLUDED_SIGNALS, SHADOW_FROZEN_AT } from "../src/lib/fantasy/weekly/projections/shadow-candidates/spec.ts";
import { buildGsisToPfr, buildSnapIndex, laggingPriorWeeks, parseSnapCountRows, pointInTimeSnapFeatures, rawGsisId, type SnapCountRow, type SnapSourceProvenance } from "../src/lib/fantasy/weekly/snap/pointInTimeSnap.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const sha = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");

function parseArgs(argv: string[]) {
  const args = { season: NaN, week: NaN, productionArtifact: null as string | null, outRoot: ROOT, generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw.startsWith("--production-artifact=")) args.productionArtifact = resolve(raw.slice(22));   // pre-merge rehearsal only
    else if (raw.startsWith("--out-root=")) args.outRoot = resolve(raw.slice(11));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season) || !Number.isInteger(args.week) || args.week < 1 || args.week > 18) throw new Error("Required: --season=YYYY --week=1..18");
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be ISO.");
  return args;
}

function verifiedCache(relativeDir: string, season: number | null) {
  const dir = join(ROOT, relativeDir);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { files: { season: number | null; filename: string; retrievedDateUtc: string; sha256: string; rowCount: number }[] };
  const entry = manifest.files.find((file) => file.season === season);
  if (!entry) return null;
  const text = readFileSync(join(dir, entry.filename), "utf8").replace(/\r\n/g, "\n");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return { entry, rows: parseCsv(text) as Record<string, string>[] };
}

function loadArtifact(path: string, season: number, week: number): { artifact: WeeklyFantasyProjectionProductionArtifact; sha256: string } {
  const text = readFileSync(path, "utf8");
  const artifact = weeklyFantasyProjectionProductionArtifactSchema.parse(JSON.parse(text));
  if (artifact.season !== season || artifact.week !== week) throw new Error(`${path} is season ${artifact.season} week ${artifact.week}, expected ${season}/${week}.`);
  return { artifact, sha256: sha(text) };
}

const rank = (values: { id: string; value: number }[]) => new Map(values.sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)).map((v, i) => [v.id, i + 1] as const));

function main(): void {
  const args = parseArgs(process.argv);
  const { season, week } = args;
  const nn = String(week).padStart(2, "0");
  const production = loadArtifact(args.productionArtifact ?? join(ROOT, "public", "data", "fantasy", "projections", String(season), `week-${nn}.json`), season, week);
  if (week > 1 && !production.artifact.provenance.some((p) => p.source === "data/nfl/nflverse/epa-team-game")) {
    throw new Error("Production artifact lacks epa-team-game provenance: the RB team-history repair is not in production. Merge the RB fix before generating shadow candidates.");
  }

  const games = (JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", String(season), "games.json"), "utf8")) as { games: ShadowGame[] }).games;
  const players = verifiedCache("data/nfl/nflverse/players", null);
  if (!players) throw new Error("Missing verified players cache.");
  const gsisToPfr = buildGsisToPfr(players.rows);
  const provenance: SnapSourceProvenance[] = []; const snapRows: SnapCountRow[] = [];
  for (const s of [season - 1, season]) {
    const cache = verifiedCache("data/nfl/nflverse/snap-counts", s);
    if (!cache) continue;
    snapRows.push(...parseSnapCountRows(cache.rows));
    provenance.push({ season: s, filename: cache.entry.filename, sha256: cache.entry.sha256, retrievedDateUtc: cache.entry.retrievedDateUtc, rowCount: cache.entry.rowCount });
  }
  const snapIndex = buildSnapIndex(snapRows);
  const lagging = laggingPriorWeeks(snapRows, season, week);

  const rows: (Record<string, unknown> & { position: (typeof POSITIONS)[number] })[] = [];
  for (const pos of POSITIONS) {
    const prodRows = production.artifact.rows[pos];
    const results = prodRows.map((row: WeeklyFantasyProjectionProductionRow) => {
      const a = computeCandidateA(row);
      const gsis = rawGsisId(row.playerId);
      const snap = pointInTimeSnapFeatures(snapIndex, gsis ? gsisToPfr.get(gsis) ?? null : null, { season, week });
      const b = computeCandidateB(a, pos, snap.snapShareL3);
      return { row, a, b, snap };
    });
    const rankA = rank(results.map((r) => ({ id: r.row.playerId, value: r.a.projection })));
    const rankB = rank(results.map((r) => ({ id: r.row.playerId, value: r.b.projection })));
    for (const { row, a, b, snap } of results) {
      const k = resolveKickoff(games, season, week, row.team);
      rows.push({
        playerId: row.playerId, playerName: row.playerName, position: pos, team: row.team, opponent: row.opponent, homeAway: row.homeAway,
        season, week, gameId: k?.gameId ?? null, kickoff: k?.kickoff ?? null,
        production: {
          baseline: row.baselineFantasyPoints, rosProjectedPpg: row.rosProjectedPpg, projection: row.projectedFantasyPoints, positionRank: row.positionRank,
          components: row.components, residualActivated: row.residualActivated, modelAuthority: row.modelAuthority, inferenceAuthority: row.inferenceAuthority,
        },
        context: {
          teamImpliedTotal: row.context.scoringEnvironment.teamImpliedTotal, leagueAverageImpliedTeamTotal: row.context.scoringEnvironment.leagueAverageImpliedTeamTotal,
          impliedTotalDelta: row.context.scoringEnvironment.impliedTotalDelta, opponentFpa: row.context.opponentFpa,
        },
        candidateA: { projection: a.projection, positionRank: rankA.get(row.playerId)!, components: a.components },
        candidateB: { projection: b.projection, positionRank: rankB.get(row.playerId)!, components: b.components },
        snap: pos === "WR" || pos === "TE" ? snap : null,
      });
    }
  }

  const specText = JSON.stringify({ CANDIDATE_A_SPEC, CANDIDATE_B_SNAP_SPEC });
  const artifact = {
    schemaVersion: SHADOW_ARTIFACT_SCHEMA_VERSION, status: "SHADOW_ONLY_NOT_PUBLIC", season, week, generatedAt: args.generatedAt,
    candidateVersions: { candidateA: SHADOW_CANDIDATE_A_VERSION, candidateB: SHADOW_CANDIDATE_B_VERSION }, frozenAt: SHADOW_FROZEN_AT,
    productionModelVersion: production.artifact.modelVersion, productionGeneratedAt: production.artifact.generatedAt,
    excludedSignals: SHADOW_EXCLUDED_SIGNALS, specSha256: sha(specText), spec: { candidateA: CANDIDATE_A_SPEC, candidateB: CANDIDATE_B_SNAP_SPEC },
    sourceHashes: { productionArtifact: production.sha256, players: players.entry.sha256, ...Object.fromEntries(provenance.map((p) => [`snapCounts${p.season}`, p.sha256])) },
    snapSources: provenance, snapLaggingPriorWeeks: lagging, rbTeamHistoryRepairInProduction: week > 1, rows,
  };
  const out = join(args.outRoot, "data", "fantasy", "shadow", String(season), `week-${nn}.json`);
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  renameSync(tmp, out);
  const counts = Object.fromEntries(POSITIONS.map((p) => [p, rows.filter((r) => r.position === p).length]));
  console.log(JSON.stringify({ output: out, season, week, counts, snapLaggingPriorWeeks: lagging, existsSnap2026: existsSync(join(ROOT, "data/nfl/nflverse/snap-counts", `snap_counts_${season}.csv`)) }, null, 2));
}

main();
