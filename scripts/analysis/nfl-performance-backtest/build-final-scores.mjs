/** Extract final game scores per team (for point-differential backtest targets). */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BACKTEST_PBP_COLUMNS } from "./lib/columns.mjs";
import { readFileSync } from "node:fs";

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

function buildTeamMap() {
  const teamsJson = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf-8"));
  return new Map(teamsJson.teams.map((t) => [t.nflverseAbbr, t]));
}

async function main() {
  const teamMap = buildTeamMap();
  const seasons = [2023, 2024, 2025];
  const rows = [["gameId", "season", "week", "team", "opponent", "teamScore", "oppScore"]];

  for (const season of seasons) {
    const path = join(RAW_DIR, `pbp_${season}_reg_trimmed.csv`);
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    let header = null;
    const lastRowByGame = new Map();
    const firstRowByGame = new Map();
    for await (const line of rl) {
      if (line === "") continue;
      const cells = splitCsvLine(line);
      if (header === null) { header = cells; continue; }
      const row = {};
      for (let i = 0; i < BACKTEST_PBP_COLUMNS.length; i += 1) row[BACKTEST_PBP_COLUMNS[i]] = cells[i] ?? "";
      const gid = row.game_id;
      if (!firstRowByGame.has(gid)) firstRowByGame.set(gid, row);
      lastRowByGame.set(gid, row);
    }
    for (const [gid, last] of lastRowByGame) {
      const first = firstRowByGame.get(gid);
      const home = teamMap.get(String(first.home_team).trim());
      const away = teamMap.get(String(first.away_team).trim());
      if (!home || !away) continue;
      const homeScore = Number(last.total_home_score);
      const awayScore = Number(last.total_away_score);
      const week = Number(first.week);
      rows.push([gid, season, week, home.abbr, away.abbr, homeScore, awayScore]);
      rows.push([gid, season, week, away.abbr, home.abbr, awayScore, homeScore]);
    }
    console.log(`[scores] ${season}: ${lastRowByGame.size} games`);
  }

  writeFileSync(join(OUT_DIR, "final_scores.csv"), rows.map((r) => r.join(",")).join("\n") + "\n", "utf-8");
}

main().catch((err) => { console.error(err); process.exit(1); });
