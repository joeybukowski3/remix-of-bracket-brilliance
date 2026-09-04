/**
 * Research-only: builds a compact per-team-game "scoring support" cache
 * (EPA/play, traditional success rate, explosive-play rate -- offense side
 * only; defense-allowed is derived downstream by reading the opponent's
 * offense row for the same game, exactly like teamPlayVolume.ts's
 * "opponent-allowed windows read off the opponent field of the same
 * records" pattern) for the NFL total-model research build.
 *
 * This is NOT the production epa-team-game cache (which has no success/
 * explosive columns -- see data/nfl/nflverse/epa-team-game/manifest.json)
 * and NOT the production performance-team-game cache (which has zero
 * committed files -- data/nfl/nflverse/performance-team-game/manifest.json
 * "files": []). Raw play-by-play is streamed and gunzipped in memory,
 * aggregated directly to team-game sums, and discarded -- never committed,
 * matching scripts/analysis/nfl-performance-backtest/fetch-pbp.mjs's own
 * "raw play-by-play is never committed" convention.
 *
 * Definitions mirror scripts/analysis/nfl-performance-backtest/lib/metrics-
 * engine.mjs exactly (same eligible-play filter, same traditional success-
 * rate thresholds, same explosive-play thresholds), UNFILTERED for garbage
 * time (this research build does not implement the garbage-time filter --
 * documented simplification, see docs/modeling/JKB_MODELING_MASTER_SPEC.md
 * Phase C update).
 *
 * Usage: node scripts/analysis/nfl-total-model-research/fetch-scoring-support-cache.mjs [--seasons=2021,2022,2023,2024,2025]
 */
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_DIR = join(ROOT, "data", "nfl", "research", "nfl-total-model");
const USER_AGENT = "JoeKnowsBall-nfl-total-model-research/1.0 (+https://www.joeknowsball.com)";

const PBP_COLUMNS = [
  "game_id", "season", "season_type", "week", "posteam", "defteam",
  "qtr", "down", "ydstogo", "yards_gained", "pass", "rush",
  "two_point_attempt", "epa",
];

const TEAM_ALIASES = {
  JAC: "jax", JAX: "jax",
  LA: "lar", LAR: "lar",
  WAS: "wsh", WSH: "wsh",
  AZ: "ari", ARI: "ari",
};
function normalizeTeam(code) {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return null;
  return TEAM_ALIASES[c] ?? c.toLowerCase();
}

function nflversePbpUrl(season) {
  return `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
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

const num = (v) => {
  const t = String(v ?? "").trim();
  if (t === "" || t === "NA") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const int = (v) => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

function isEligiblePlay(cells, idx) {
  if (int(cells[idx.two_point_attempt]) === 1) return null;
  if (String(cells[idx.posteam] ?? "").trim() === "") return null;
  if (num(cells[idx.epa]) === null) return null;
  if (int(cells[idx.pass]) === 1) return "pass";
  if (int(cells[idx.rush]) === 1) return "rush";
  return null;
}

/** Traditional down-and-distance success -- NOT nflfastR's EPA>0 `success` field. */
function traditionalSuccess(down, ydstogo, yardsGained) {
  if (!(ydstogo > 0) || yardsGained === null) return null;
  if (down === 1) return yardsGained >= 0.4 * ydstogo;
  if (down === 2) return yardsGained >= 0.6 * ydstogo;
  if (down === 3 || down === 4) return yardsGained >= ydstogo;
  return null;
}

function isExplosive(playType, yardsGained) {
  if (yardsGained === null) return false;
  if (playType === "pass") return yardsGained >= 15;
  if (playType === "rush") return yardsGained >= 10;
  return false;
}

function emptyTeamGame(gameId, season, week, team, opponent) {
  return {
    game_id: gameId, season, week, team, opponent,
    eligible_plays: 0, off_epa_sum: 0,
    success_num: 0, success_den: 0,
    explosive_count: 0,
  };
}

async function streamSeason(season) {
  const url = nflversePbpUrl(season);
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/octet-stream" }, redirect: "follow" });
  if (response.status === 404) return { notPublished: true };
  if (!response.ok) throw new Error(`${season}: HTTP ${response.status} fetching play-by-play`);

  const compressed = Buffer.from(await response.arrayBuffer());
  if (compressed.byteLength === 0) throw new Error(`${season}: empty play-by-play response`);

  const lines = createInterface({
    input: Readable.from(compressed).pipe(createGunzip()),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let header = null;
  let idx = null;
  let sourceRows = 0;
  let keptRows = 0;
  /** game_id|team -> aggregate row */
  const teamGames = new Map();

  for await (const line of lines) {
    if (line === "") continue;
    if (header === null) {
      header = splitCsvLine(line);
      const missing = PBP_COLUMNS.filter((c) => !header.includes(c));
      if (missing.length > 0) throw new Error(`${season}: play-by-play missing columns ${missing.join(", ")}`);
      idx = Object.fromEntries(PBP_COLUMNS.map((c) => [c, header.indexOf(c)]));
      continue;
    }
    sourceRows += 1;
    const cells = splitCsvLine(line);
    if (cells[idx.season_type] !== "REG") continue;

    const playType = isEligiblePlay(cells, idx);
    if (!playType) continue;
    keptRows += 1;

    const gameId = cells[idx.game_id];
    const week = int(cells[idx.week]);
    const team = normalizeTeam(cells[idx.posteam]);
    const opponent = normalizeTeam(cells[idx.defteam]);
    const key = `${gameId}|${team}`;
    if (!teamGames.has(key)) teamGames.set(key, emptyTeamGame(gameId, season, week, team, opponent));
    const row = teamGames.get(key);

    row.eligible_plays += 1;
    row.off_epa_sum += num(cells[idx.epa]) ?? 0;

    const down = int(cells[idx.down]);
    const ydstogo = num(cells[idx.ydstogo]);
    const yardsGained = num(cells[idx.yards_gained]);
    const success = traditionalSuccess(down, ydstogo, yardsGained);
    if (success !== null) {
      row.success_den += 1;
      if (success) row.success_num += 1;
    }
    if (isExplosive(playType, yardsGained)) row.explosive_count += 1;
  }

  return { notPublished: false, rows: [...teamGames.values()], sourceRows, keptRows };
}

function toCsv(rows) {
  const columns = ["game_id", "season", "week", "team", "opponent", "eligible_plays", "off_epa_sum", "success_num", "success_den", "explosive_count"];
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => row[c]).join(","));
  return lines.join("\n") + "\n";
}

async function main() {
  const seasonsArg = process.argv.find((a) => a.startsWith("--seasons="));
  const seasons = seasonsArg
    ? seasonsArg.slice("--seasons=".length).split(",").map((s) => Number(s.trim()))
    : [2021, 2022, 2023, 2024, 2025];

  mkdirSync(OUT_DIR, { recursive: true });

  const manifestFiles = [];
  for (const season of seasons) {
    process.stdout.write(`[fetch] ${season}: downloading...\n`);
    const result = await streamSeason(season);
    if (result.notPublished) {
      console.log(`[fetch] ${season}: not published upstream`);
      manifestFiles.push({ season, notPublished: true });
      continue;
    }
    const outPath = join(OUT_DIR, `scoring_support_team_game_${season}.csv`);
    writeFileSync(outPath, toCsv(result.rows), "utf-8");
    console.log(`[fetch] ${season}: ${result.sourceRows} source PBP rows -> ${result.keptRows} eligible plays -> ${result.rows.length} team-game rows -> ${outPath}`);
    manifestFiles.push({
      season,
      filename: `scoring_support_team_game_${season}.csv`,
      sourcePbpRows: result.sourceRows,
      eligiblePlays: result.keptRows,
      teamGameRowCount: result.rows.length,
    });
  }

  const manifest = {
    schemaVersion: "nfl-total-model-scoring-support-cache-v1",
    purpose: "Research-only compact per-team-game EPA/play, traditional success rate, explosive-play-rate sums. NOT a production cache -- see file header of fetch-scoring-support-cache.mjs.",
    source: "nflverse (play-by-play, nflfastR EPA)",
    attribution: "EPA/play-by-play data: nflverse / nflfastR",
    eligiblePlayFilter: "(pass == 1 OR rush == 1) AND epa is present AND posteam is present AND two_point_attempt != 1",
    successRateDefinition: "Traditional down-and-distance: 1st >= 0.4*ydstogo, 2nd >= 0.6*ydstogo, 3rd/4th >= ydstogo. NOT nflfastR's EPA>0 `success` field.",
    explosivePlayDefinition: "pass play with yards_gained >= 15, or rush play with yards_gained >= 10.",
    garbageTimeFilter: "NOT APPLIED -- unfiltered (all plays). Documented simplification vs. production performanceComposite2026.ts, which filters EPA/success but not explosive.",
    generatedAt: new Date().toISOString(),
    files: manifestFiles,
  };
  writeFileSync(join(OUT_DIR, "scoring-support-manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`[fetch] wrote manifest -> ${join(OUT_DIR, "scoring-support-manifest.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
