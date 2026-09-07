/**
 * Refresh the committed compact success-rate cache from nflverse play-by-play.
 *
 * A deliberate sibling of data/nfl/nflverse/epa-team-game/, not an extension of
 * it. The EPA cache is an input to the Power Rating pipeline and its committed
 * bytes are load-bearing, so success counts are cached separately rather than
 * added as columns there.
 *
 * The eligible-play filter is the same approved filter the EPA cache uses, with
 * one addition: nflfastR's `success` must also be present. A handful of plays
 * each season carry an EPA but no success flag, so the denominators here are
 * not identical to the EPA cache's and are recorded independently.
 *
 * Verified against RBSDM's published 2025 team success rates (the observed
 * lens's source): every team/metric agrees to within 0.13 percentage points.
 *
 * Usage:
 *   node scripts/refresh-nfl-success-source-cache.mjs
 *   node scripts/refresh-nfl-success-source-cache.mjs --seasons=2024,2025
 *   node scripts/refresh-nfl-success-source-cache.mjs --dry-run
 */

import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNflverseTeamMap } from "./lib/nfl-schedules-results-core.mjs";
import { buildCacheManifestEntry, sha256Hex } from "./lib/nfl-source-cache.mjs";
import { classifyPlay, nflversePbpUrl } from "./lib/nfl-epa-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "success-team-game");
const MANIFEST_PATH = join(CACHE_DIR, "manifest.json");

export const SUCCESS_CACHE_MANIFEST_VERSION = "nfl-success-team-game-cache-v1";
export const SUCCESS_ELIGIBLE_PLAY_FILTER =
  "(pass == 1 OR rush == 1) AND epa is present AND success is present AND posteam is present AND two_point_attempt != 1";

/** Seven seasons: the two the 2026 projection consumes plus the backtest history. */
const DEFAULT_SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const REQUEST_TIMEOUT_MS = 300000;
const USER_AGENT = "JoeKnowsBall-nfl-matchup-analyzer/1.0 (+https://www.joeknowsball.com)";

export const SUCCESS_COMPACT_COLUMNS = Object.freeze([
  "game_id", "season", "week", "team", "opponent",
  "off_success", "off_plays", "pass_success", "pass_plays", "rush_success", "rush_plays",
]);

const REQUIRED_PBP_COLUMNS = Object.freeze([
  "game_id", "season", "season_type", "week", "posteam", "defteam",
  "epa", "success", "pass", "rush", "two_point_attempt",
]);

function parseArgs(argv) {
  const args = { seasons: DEFAULT_SEASONS, dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--seasons=")) {
      args.seasons = raw.slice(10).split(",").map((season) => Number(season.trim())).filter(Number.isInteger);
    } else throw new Error(`Unknown argument: ${raw}`);
  }
  if (args.seasons.length === 0) throw new Error("No valid seasons requested");
  return args;
}

/** Split one CSV line, honouring quoted fields. */
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

const successFlag = (raw) => {
  const text = String(raw ?? "").trim();
  if (text === "" || text === "NA") return null;
  const value = Number(text);
  return value === 0 || value === 1 ? value : null;
};

function emptyTeamGame(gameId, season, week, team, opponent) {
  return { gameId, season, week, team, opponent,
    offSuccess: 0, offPlays: 0, passSuccess: 0, passPlays: 0, rushSuccess: 0, rushPlays: 0 };
}

/**
 * Relocated franchises, so the backtest history joins to today's registry.
 * Only pre-2020 seasons need these; the current registry covers 2020 onward.
 */
const HISTORICAL_ABBRS = Object.freeze({ OAK: "LV", SD: "LAC", STL: "LA" });

/** Aggregate regular-season plays into one record per (game_id, posteam). */
export function aggregateSuccessPlays(rows, { season, teamMap }) {
  const canonical = (abbr) => {
    const upper = String(abbr ?? "").trim().toUpperCase();
    return teamMap.get(HISTORICAL_ABBRS[upper] ?? upper)?.abbr ?? null;
  };
  const byKey = new Map();
  for (const row of rows) {
    if (String(row.season_type ?? "").trim() !== "REG") continue;
    if (Number(row.season) !== season) continue;
    const unit = classifyPlay(row);
    if (unit === null) continue;
    const success = successFlag(row.success);
    if (success === null) continue;
    const team = canonical(row.posteam);
    const opponent = canonical(row.defteam);
    if (!team || !opponent) continue;
    const gameId = String(row.game_id ?? "").trim();
    const key = `${gameId}|${team}`;
    if (!byKey.has(key)) byKey.set(key, emptyTeamGame(gameId, season, Number(row.week), team, opponent));
    const record = byKey.get(key);
    record.offPlays += 1;
    record.offSuccess += success;
    if (unit === "pass") { record.passPlays += 1; record.passSuccess += success; }
    else { record.rushPlays += 1; record.rushSuccess += success; }
  }
  return [...byKey.values()];
}

/** Every game must contribute exactly two reciprocal team rows. */
export function validateSuccessTeamGames(teamGames) {
  const problems = [];
  const byGame = new Map();
  for (const record of teamGames) {
    if (record.offPlays <= 0) problems.push(`${record.gameId}/${record.team}: no eligible plays`);
    if (!byGame.has(record.gameId)) byGame.set(record.gameId, []);
    byGame.get(record.gameId).push(record);
  }
  for (const [gameId, sides] of byGame) {
    if (sides.length !== 2) { problems.push(`game ${gameId}: expected 2 team rows, got ${sides.length}`); continue; }
    const [a, b] = sides;
    if (a.opponent !== b.team || b.opponent !== a.team) problems.push(`game ${gameId}: opponents are not reciprocal`);
  }
  return problems;
}

export function serializeSuccessCompact(teamGames) {
  const ordered = [...teamGames].sort((a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team));
  const lines = [SUCCESS_COMPACT_COLUMNS.join(",")];
  for (const record of ordered) {
    lines.push([record.gameId, record.season, record.week, record.team, record.opponent,
      record.offSuccess, record.offPlays, record.passSuccess, record.passPlays,
      record.rushSuccess, record.rushPlays].join(","));
  }
  return `${lines.join("\n")}\n`;
}

async function streamSeason(season, { teamMap }) {
  const url = nflversePbpUrl(season);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/octet-stream" },
      signal: controller.signal,
    });
  } finally { clearTimeout(timer); }
  if (response.status === 404) return { notPublished: true };
  if (!response.ok) throw new Error(`${season}: HTTP ${response.status} fetching play-by-play`);

  const compressed = Buffer.from(await response.arrayBuffer());
  if (compressed.byteLength === 0) throw new Error(`${season}: empty play-by-play response`);
  const lines = createInterface({
    input: Readable.from(compressed).pipe(createGunzip()),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let indices = null;
  let upstreamRows = 0;
  const rows = [];
  for await (const line of lines) {
    if (line === "") continue;
    if (indices === null) {
      const header = splitCsvLine(line);
      const missing = REQUIRED_PBP_COLUMNS.filter((column) => !header.includes(column));
      if (missing.length > 0) throw new Error(`${season}: play-by-play is missing ${missing.join(", ")}`);
      indices = Object.fromEntries(REQUIRED_PBP_COLUMNS.map((column) => [column, header.indexOf(column)]));
      continue;
    }
    upstreamRows += 1;
    const cells = splitCsvLine(line);
    rows.push(Object.fromEntries(REQUIRED_PBP_COLUMNS.map((column) => [column, cells[indices[column]]])));
  }
  return {
    teamGames: aggregateSuccessPlays(rows, { season, teamMap }),
    upstream: { url, byteSize: compressed.byteLength, sha256: sha256Hex(compressed), rowCount: upstreamRows },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const teamsJson = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf-8"));
  const teamMap = buildNflverseTeamMap(teamsJson);
  if (!args.dryRun && !existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const retrievedDateUtc = new Date().toISOString().slice(0, 10);
  const entries = [];
  for (const season of args.seasons) {
    const result = await streamSeason(season, { teamMap });
    if (result.notPublished) { console.log(`${season}: play-by-play not yet published; skipped`); continue; }
    const problems = validateSuccessTeamGames(result.teamGames);
    if (problems.length > 0) throw new Error(`${season}: ${problems.slice(0, 5).join("; ")}`);
    const filename = `success_team_game_${season}.csv`;
    const text = serializeSuccessCompact(result.teamGames);
    entries.push(buildCacheManifestEntry({
      season, filename, sourceUrl: result.upstream.url, sourceType: "projection", text, retrievedDateUtc,
      upstream: { byteSize: result.upstream.byteSize, sha256: result.upstream.sha256, rowCount: result.upstream.rowCount },
      projectedColumns: [...SUCCESS_COMPACT_COLUMNS], projectionFilter: SUCCESS_ELIGIBLE_PLAY_FILTER,
    }));
    if (!args.dryRun) writeFileSync(join(CACHE_DIR, filename), text, "utf-8");
    console.log(`${season}: ${result.teamGames.length} team-games, ${text.length} bytes`);
  }
  if (args.dryRun) return;
  writeFileSync(join(CACHE_DIR, ".gitattributes"),
    "# Compact success cache derived from nflverse play-by-play; keep bytes stable.\n*.csv -text\n", "utf-8");
  const previous = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")).files ?? [] : [];
  const merged = new Map(previous.map((file) => [file.season, file]));
  for (const entry of entries) merged.set(entry.season, entry);
  const manifest = {
    schemaVersion: SUCCESS_CACHE_MANIFEST_VERSION,
    source: "nflverse (play-by-play, nflfastR success)",
    attribution: "Success data: nflverse / nflfastR",
    eligiblePlayFilter: SUCCESS_ELIGIBLE_PLAY_FILTER,
    requiredSourceColumns: [...REQUIRED_PBP_COLUMNS],
    files: [...merged.values()].sort((a, b) => a.season - b.season),
  };
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

main().catch((error) => {
  console.error(`[nfl:success-cache] FAILED: ${error.message}`);
  console.error("[nfl:success-cache] existing cache left untouched");
  process.exit(1);
});
