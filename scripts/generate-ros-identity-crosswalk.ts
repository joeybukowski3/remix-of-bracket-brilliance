/**
 * ROS projection authority -- Phase 1 identity crosswalk generator.
 *
 * Joins JKB workbook rows (`FANTASY_RANKINGS`) -> PAR consensus rows
 * (`data/fantasy/2026-par-consensus.json`, keyed by a PFR `Source ID`) ->
 * canonical GSIS identity, reusing the already-approved
 * `resolveProductionProjectionIdentity` resolver and the nflverse
 * players/weekly-roster caches already committed for the weekly production
 * pipeline. Read-only against live rank/PAR/projection data: this script
 * never writes to `data/fantasy/2026-par-consensus.json`,
 * `src/data/fantasyRankings2026.ts`, or any `public/data/fantasy/weekly`
 * artifact.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRosIdentityCrosswalk, ROS_IDENTITY_CROSSWALK_SCHEMA_VERSION } from "../src/lib/fantasy/rosResearch/identity.ts";
import { FANTASY_RANKING_ROWS_2026 } from "../src/data/fantasyRankings2026.ts";
import type { ProductionIdentitySourceRow } from "../src/lib/fantasy/weekly/productionIdentity.ts";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUTPUT = join(ROOT, "data", "fantasy", "ros-research", "2026", "identity-crosswalk.json");
const ROSTER_SEASON = 2026;

type CsvRow = Record<string, string>;
type ManifestEntry = { season: number | null; filename: string; retrievedDateUtc: string; [key: string]: unknown };
type Manifest = { files: ManifestEntry[] };

function sha(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }

function parseArgs(argv: string[]) {
  const args = { output: DEFAULT_OUTPUT, generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be an ISO timestamp.");
  return args;
}

function verifiedCsv(relativeDirectory: string, season: number | null) {
  const directory = join(ROOT, relativeDirectory);
  const manifest = readJson<Manifest>(join(directory, "manifest.json"));
  const entry = manifest.files.find((candidate) => candidate.season === season);
  if (!entry) throw new Error(`Missing ${relativeDirectory} manifest entry for season ${season ?? "league"}.`);
  const path = join(directory, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return { rows: parseCsv(text) as CsvRow[], entry, hash: sha(text), path };
}

function writeAtomic(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function main() {
  const options = parseArgs(process.argv);

  const parPath = join(ROOT, "data", "fantasy", "2026-par-consensus.json");
  const parText = readFileSync(parPath, "utf8");
  const parRows = JSON.parse(parText);

  const players = verifiedCsv("data/nfl/nflverse/players", null);
  const roster = verifiedCsv("data/nfl/nflverse/weekly-rosters", ROSTER_SEASON);
  const rosterWeek1 = roster.rows.filter((row) => Number(row.week) === 1 && String(row.game_type).toUpperCase() === "REG");
  if (!rosterWeek1.length) throw new Error(`No ${ROSTER_SEASON} Week 1 REG roster rows found.`);

  const identityPlayers: ProductionIdentitySourceRow[] = players.rows.map((row) => ({
    gsisId: row.gsis_id || null, pfrId: row.pfr_id || null, playerName: row.display_name,
    position: row.position, team: row.team_abbr || null, status: row.status || null,
  }));
  const identityRoster: ProductionIdentitySourceRow[] = rosterWeek1.map((row) => ({
    gsisId: row.gsis_id || null, pfrId: row.pfr_id || null, playerName: row.full_name,
    position: row.position, team: row.team || null, status: row.status || null,
  }));

  const result = buildRosIdentityCrosswalk({
    rankingRows: FANTASY_RANKING_ROWS_2026,
    parRows,
    playerRows: identityPlayers,
    rosterRows: identityRoster,
  });

  const artifact = {
    schemaVersion: ROS_IDENTITY_CROSSWALK_SCHEMA_VERSION,
    season: 2026,
    generatedAt: options.generatedAt,
    provenance: {
      inputAsOf: [players.entry.retrievedDateUtc, roster.entry.retrievedDateUtc].sort().at(-1),
      sources: [
        { name: "jkb-workbook", path: "src/data/fantasyRankings2026.ts", rowCount: FANTASY_RANKING_ROWS_2026.length },
        { name: "par-consensus", path: "data/fantasy/2026-par-consensus.json", hash: sha(parText), rowCount: parRows.length },
        { name: "nflverse-players", path: players.path, hash: players.hash, retrievedDateUtc: players.entry.retrievedDateUtc, rowCount: players.rows.length },
        {
          name: "nflverse-weekly-roster",
          path: roster.path,
          hash: roster.hash,
          retrievedDateUtc: roster.entry.retrievedDateUtc,
          season: ROSTER_SEASON,
          week: 1,
          rowCount: rosterWeek1.length,
        },
      ],
    },
    methodology: {
      priority: ["stable-id", "exact-name-position", "reviewed-alias", "unresolved"],
      notes: [
        "JKB workbook rows join to PAR consensus rows by exact normalized name+position, or a reviewed literal alias (rosPlayerIdentity.CONSENSUS_NAME_ALIASES). No fuzzy/similarity matching.",
        "PAR consensus rows (Source ID = PFR id) join to a canonical GSIS identity via the already-approved weekly production resolver (resolveProductionProjectionIdentity): direct PFR id match first, then exact normalized name+position against the current roster/player crosswalk (team disambiguates ties), then a reviewed literal alias, else unresolved.",
        "This artifact is read-only research input. It does not change Overall Rank, PAR/G, replacement levels, projectedFantasyPoints, weekly fantasy artifacts, or 2026-par-consensus.json.",
      ],
    },
    counts: result.counts,
    rows: result.rows,
  };

  writeAtomic(options.output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Generated ${result.rows.length} identity crosswalk rows at ${options.output}`);
  console.log(JSON.stringify(result.counts, null, 2));
}

main();
