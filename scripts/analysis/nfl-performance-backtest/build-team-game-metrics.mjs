/**
 * Run the metric engine over cached trimmed play-by-play and write one flat
 * per-team-per-game CSV per season plus a combined file. Analysis-only.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateSeason } from "./lib/metrics-engine.mjs";
import { BACKTEST_PBP_COLUMNS } from "./lib/columns.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const RAW_DIR = join(ROOT, "data", "nfl", "backtest-2026", "raw");
const OUT_DIR = join(ROOT, "data", "nfl", "backtest-2026", "out");

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

async function readTrimmed(season) {
  const path = join(RAW_DIR, `pbp_${season}_reg_trimmed.csv`);
  if (!existsSync(path)) throw new Error(`Missing ${path} — run fetch-pbp.mjs first`);
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let header = null;
  const rows = [];
  for await (const line of rl) {
    if (line === "") continue;
    const cells = splitCsvLine(line);
    if (header === null) { header = cells; continue; }
    const row = {};
    for (let i = 0; i < BACKTEST_PBP_COLUMNS.length; i += 1) row[BACKTEST_PBP_COLUMNS[i]] = cells[i] ?? "";
    rows.push(row);
  }
  return rows;
}

function buildTeamMap() {
  const teamsJson = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf-8"));
  return new Map(teamsJson.teams.map((t) => [t.nflverseAbbr, t]));
}

const FLAT_COLUMNS = [
  "gameId", "season", "week", "team", "opponent",
  ...["all", "filtered"].flatMap((v) => [
    `${v}_offEpa`, `${v}_offPlays`,
    `${v}_successNum`, `${v}_successDen`,
    `${v}_epaPosNum`, `${v}_epaPosDen`,
    `${v}_earlyEpa`, `${v}_earlyPlays`, `${v}_earlySuccessNum`, `${v}_earlySuccessDen`,
    `${v}_passEpa`, `${v}_passPlays`, `${v}_passSuccessNum`, `${v}_passSuccessDen`,
    `${v}_rushEpa`, `${v}_rushPlays`, `${v}_rushSuccessNum`, `${v}_rushSuccessDen`,
    `${v}_explosivePass`, `${v}_explosiveRush`,
    `${v}_thirdEpa`, `${v}_thirdPlays`, `${v}_thirdSuccessNum`, `${v}_thirdSuccessDen`,
    `${v}_thirdRawConvNum`, `${v}_thirdRawConvDen`,
    `${v}_sacks`, `${v}_dropbacks`,
  ]),
  "drivesOff", "drivePointsOff", "oppTouchdownAgainst", "safetyAgainst",
];

function flatten(record) {
  const row = [record.gameId, record.season, record.week, record.team, record.opponent];
  for (const v of ["all", "filtered"]) {
    const s = record[v];
    row.push(
      s.offEpa, s.offPlays, s.successNum, s.successDen, s.epaPosNum, s.epaPosDen,
      s.earlyEpa, s.earlyPlays, s.earlySuccessNum, s.earlySuccessDen,
      s.passEpa, s.passPlays, s.passSuccessNum, s.passSuccessDen,
      s.rushEpa, s.rushPlays, s.rushSuccessNum, s.rushSuccessDen,
      s.explosivePass, s.explosiveRush,
      s.thirdEpa, s.thirdPlays, s.thirdSuccessNum, s.thirdSuccessDen,
      s.thirdRawConvNum, s.thirdRawConvDen,
      s.sacks, s.dropbacks
    );
  }
  row.push(record.drivesOff, record.drivePointsOff, record.oppTouchdownAgainst, record.safetyAgainst);
  return row;
}

async function main() {
  const teamMap = buildTeamMap();
  const seasons = [2023, 2024, 2025];
  const all = [];

  for (const season of seasons) {
    console.log(`[metrics] ${season}: reading trimmed play-by-play...`);
    const rows = await readTrimmed(season);
    console.log(`[metrics] ${season}: ${rows.length} REG rows loaded; aggregating...`);
    const teamGames = aggregateSeason(rows, { season, teamMap });
    console.log(`[metrics] ${season}: ${teamGames.length} team-game rows`);
    all.push(...teamGames);
  }

  all.sort((a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team));

  const lines = [FLAT_COLUMNS.join(",")];
  for (const r of all) lines.push(flatten(r).join(","));
  const outPath = join(OUT_DIR, "team_game_metrics.csv");
  writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");
  console.log(`[metrics] wrote ${all.length} rows -> ${outPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
