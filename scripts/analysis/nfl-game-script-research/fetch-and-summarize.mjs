/**
 * WU4C Part 3/4 research: stream nflverse play-by-play, aggregate score-state
 * pass/rush tendency per team-game, and report league-wide pass-rate splits
 * by score state and half. Research-only: raw PBP is streamed and discarded
 * (never written to disk), matching the convention in
 * `refresh-nfl-play-volume-source-cache.mjs`. Writes only the compact,
 * team-game-level aggregate (no play-level data) to
 * data/nfl/research/game-script/ for reuse by later analysis steps.
 *
 * Usage: npx tsx scripts/analysis/nfl-game-script-research/fetch-and-summarize.mjs --seasons=2022,2023,2024,2025
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflverseTeamMap } from "../../lib/nfl-schedules-results-core.mjs";
import { nflversePbpUrl } from "../../lib/nfl-epa-core.mjs";
import {
  REQUIRED_GAME_SCRIPT_PBP_COLUMNS,
  aggregateGameScript,
  flattenGameScriptSummary,
  serializeGameScriptCompact,
} from "../../lib/nfl-game-script-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_DIR = join(ROOT, "data", "nfl", "research", "game-script");
const USER_AGENT = "JoeKnowsBall-nfl-wu4c-research/1.0 (+https://www.joeknowsball.com)";

function parseArgs(argv) {
  const args = { seasons: [2022, 2023, 2024, 2025] };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--seasons=")) args.seasons = raw.slice(10).split(",").map((s) => Number(s.trim())).filter(Number.isInteger);
  }
  return args;
}

function splitCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

async function streamSeason(season, teamMap) {
  const url = nflversePbpUrl(season);
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${season}: HTTP ${response.status}`);
  const compressed = Buffer.from(await response.arrayBuffer());
  const lines = createInterface({ input: Readable.from(compressed).pipe(createGunzip()), crlfDelay: Number.POSITIVE_INFINITY });

  let header = null;
  let indices = null;
  const rows = [];
  for await (const line of lines) {
    if (line === "") continue;
    if (header === null) {
      header = splitCsvLine(line);
      const missing = REQUIRED_GAME_SCRIPT_PBP_COLUMNS.filter((c) => !header.includes(c));
      if (missing.length > 0) throw new Error(`${season}: play-by-play missing columns ${missing.join(", ")}`);
      indices = Object.fromEntries(REQUIRED_GAME_SCRIPT_PBP_COLUMNS.map((c) => [c, header.indexOf(c)]));
      continue;
    }
    const cells = splitCsvLine(line);
    const row = {};
    for (const column of REQUIRED_GAME_SCRIPT_PBP_COLUMNS) row[column] = cells[indices[column]] ?? "";
    rows.push(row);
  }
  return aggregateGameScript(rows, { season, teamMap });
}

function pct(n, d) { return d > 0 ? ((n / d) * 100).toFixed(1) : "n/a"; }

async function main() {
  const args = parseArgs(process.argv);
  const teamsJson = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf-8"));
  const teamMap = buildNflverseTeamMap(teamsJson);
  mkdirSync(OUT_DIR, { recursive: true });

  const allTeamGames = [];
  for (const season of args.seasons) {
    console.log(`[game-script-research] fetching ${season}...`);
    const result = await streamSeason(season, teamMap);
    console.log(`[game-script-research] ${season}: ${result.sourceRows} rows -> ${result.eligiblePlays} eligible plays (missing score_differential: ${result.missingScoreDifferential})`);
    allTeamGames.push(...result.teamGames);
    writeFileSync(join(OUT_DIR, `game_script_team_game_${season}.csv`), serializeGameScriptCompact(result.teamGames), "utf-8");
  }

  const totals = flattenGameScriptSummary(allTeamGames);
  console.log("\n[game-script-research] League-wide pass rate by score state (all halves):");
  for (const bucket of ["trailing", "close", "leading"]) {
    const b = totals[bucket];
    console.log(`  ${bucket.padEnd(9)} plays=${b.eligiblePlays} passRate=${pct(b.passPlays, b.eligiblePlays)}%`);
  }
  console.log("\n[game-script-research] By half:");
  for (const half of ["firstHalf", "secondHalf"]) {
    for (const bucket of ["Trailing", "Close", "Leading"]) {
      const key = `${half}${bucket}`;
      const b = totals[key];
      console.log(`  ${key.padEnd(20)} plays=${b.eligiblePlays} passRate=${pct(b.passPlays, b.eligiblePlays)}%`);
    }
  }

  writeFileSync(
    join(OUT_DIR, "summary.json"),
    JSON.stringify({ seasons: args.seasons, totals, generatedAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );
  console.log(`\n[game-script-research] wrote ${OUT_DIR}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
