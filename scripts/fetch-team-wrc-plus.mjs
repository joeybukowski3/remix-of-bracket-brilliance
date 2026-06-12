/**
 * fetch-team-wrc-plus.mjs
 *
 * Fetches season and last-14-day team batting stats from MLB Stats API,
 * computes a wRC+ approximation from available fields, ranks all 30 teams,
 * and writes public/data/mlb/team-wrc-plus.json.
 *
 * wRC+ approximation:
 *   wOBA is the best available proxy from the MLB Stats API.
 *   wRC+ ≈ ((wOBA - lgwOBA) / wOBAScale + lgR/PA) / lgR/PA × 100
 *   Because MLB Stats API does not expose wOBAScale directly, we use a
 *   well-established constant (1.157 for recent seasons) and derive
 *   lgR/PA from the league aggregate returned by the same endpoint.
 *
 * Writes:
 *   public/data/mlb/team-wrc-plus.json
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const OUTPUT_PATH = path.join(DATA_DIR, "team-wrc-plus.json");
const SEASON = new Date().getFullYear();
const WOBA_SCALE = 1.157;

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/html, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.mlb.com/",
};

async function fetchJson(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Returns { id, abbreviation, name } for every MLB team
async function fetchAllTeams() {
  const json = await fetchJson(`https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${SEASON}&activeStatus=Active`);
  return (json.teams || []).map((t) => ({
    id: t.id,
    abbreviation: t.abbreviation,
    name: t.teamName,
  }));
}

// Returns raw batting stat split for a team for a given statsType
async function fetchTeamBatting(teamId, statsType) {
  const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=${statsType}&group=hitting&season=${SEASON}`;
  const json = await fetchJson(url);
  return json?.stats?.[0]?.splits?.[0]?.stat ?? null;
}

// Returns last-N-days hitting split using sitCode "lastDays"
async function fetchTeamBattingLastDays(teamId, days = 14) {
  // MLB Stats API supports lastXDays split via sitCodes
  const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=statSplits&group=hitting&season=${SEASON}&sitCodes=lastDays${days}`;
  const json = await fetchJson(url);
  // Try first split
  return json?.stats?.[0]?.splits?.[0]?.stat ?? null;
}

function safeNum(val, fallback = 0) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Approximate wRC+ from a stat object.
 * Uses wOBA if available; falls back to OPS-based approximation.
 * lgWoba / lgRunsPerPA are derived from league aggregate passed in.
 */
function approximateWrcPlus(stat, lgWoba, lgRunsPerPA) {
  if (!stat) return null;

  const woba = safeNum(stat.wOBA ?? stat.obp, null);
  if (woba === null) return null;

  // wRC+ = ((wOBA - lgWOBA) / wOBAScale + lgR/PA) / lgR/PA * 100
  const wrcPlus = ((woba - lgWoba) / WOBA_SCALE + lgRunsPerPA) / lgRunsPerPA * 100;
  return Math.round(wrcPlus);
}

/**
 * Compute league average wOBA and R/PA from array of team stats.
 * Falls back to well-known league averages if data is insufficient.
 */
function computeLeagueAverages(teamStats) {
  const valid = teamStats.filter((s) => s && safeNum(s.wOBA ?? s.obp) > 0);
  if (valid.length < 15) {
    // Well-known 2024/2025 MLB league averages as fallback
    return { lgWoba: 0.310, lgRunsPerPA: 0.122 };
  }

  const totalPA = valid.reduce((sum, s) => sum + safeNum(s.plateAppearances), 0);
  const totalRuns = valid.reduce((sum, s) => sum + safeNum(s.runs), 0);
  const totalWoba = valid.reduce((sum, s) => sum + safeNum(s.wOBA ?? s.obp) * safeNum(s.plateAppearances), 0);

  const lgWoba = totalPA > 0 ? totalWoba / totalPA : 0.310;
  const lgRunsPerPA = totalPA > 0 ? totalRuns / totalPA : 0.122;

  return { lgWoba, lgRunsPerPA };
}

function ordinalRank(rank) {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

function rankTeams(teams, field) {
  const sorted = [...teams]
    .filter((t) => t[field] !== null)
    .sort((a, b) => b[field] - a[field]);

  const rankMap = new Map();
  sorted.forEach((t, i) => rankMap.set(t.abbreviation, i + 1));
  return rankMap;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  console.log("[wrc-plus] Fetching all MLB teams...");
  const teams = await fetchAllTeams();
  console.log(`[wrc-plus] Found ${teams.length} teams`);

  // Fetch season + last-14-day stats for all teams concurrently
  console.log("[wrc-plus] Fetching season batting stats...");
  const seasonStats = await Promise.all(
    teams.map((t) => fetchTeamBatting(t.id, "season").catch(() => null))
  );

  console.log("[wrc-plus] Fetching last-14-day batting stats...");
  const recentStats = await Promise.all(
    teams.map((t) => fetchTeamBattingLastDays(t.id, 14).catch(() => null))
  );

  // Compute league averages from season stats
  const { lgWoba: lgWobaSeason, lgRunsPerPA: lgRpaSeason } = computeLeagueAverages(seasonStats);
  const { lgWoba: lgWobaRecent, lgRunsPerPA: lgRpaRecent } = computeLeagueAverages(recentStats);

  console.log(`[wrc-plus] League avg season wOBA=${lgWobaSeason.toFixed(3)} R/PA=${lgRpaSeason.toFixed(3)}`);
  console.log(`[wrc-plus] League avg recent wOBA=${lgWobaRecent.toFixed(3)} R/PA=${lgRpaRecent.toFixed(3)}`);

  // Compute raw wRC+ for each team
  const withWrc = teams.map((team, i) => ({
    ...team,
    seasonWrcPlus: approximateWrcPlus(seasonStats[i], lgWobaSeason, lgRpaSeason),
    recentWrcPlus: approximateWrcPlus(recentStats[i], lgWobaRecent, lgRpaRecent),
  }));

  // Rank teams (1 = best)
  const seasonRanks = rankTeams(withWrc, "seasonWrcPlus");
  const recentRanks = rankTeams(withWrc, "recentWrcPlus");

  const result = withWrc.map((team) => ({
    id: team.id,
    abbreviation: team.abbreviation,
    name: team.name,
    seasonWrcPlus: team.seasonWrcPlus,
    seasonRank: seasonRanks.get(team.abbreviation) ?? null,
    seasonRankLabel: seasonRanks.has(team.abbreviation) ? ordinalRank(seasonRanks.get(team.abbreviation)) : null,
    recentWrcPlus: team.recentWrcPlus,
    recentRank: recentRanks.get(team.abbreviation) ?? null,
    recentRankLabel: recentRanks.has(team.abbreviation) ? ordinalRank(recentRanks.get(team.abbreviation)) : null,
  }));

  const output = {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()),
    generatedAt: new Date().toISOString(),
    season: SEASON,
    lgWobaSeason: parseFloat(lgWobaSeason.toFixed(3)),
    lgWobaRecent: parseFloat(lgWobaRecent.toFixed(3)),
    teams: result,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`[wrc-plus] Wrote ${result.length} teams to ${OUTPUT_PATH}`);

  // Print top 5 for verification
  const top5 = [...result]
    .filter((t) => t.seasonWrcPlus !== null)
    .sort((a, b) => a.seasonRank - b.seasonRank)
    .slice(0, 5);
  console.log("[wrc-plus] Top 5 season wRC+:");
  top5.forEach((t) => console.log(`  ${t.abbreviation}: ${t.seasonWrcPlus} (${t.seasonRankLabel})`));
}

main().catch((err) => {
  console.error("[wrc-plus] Fatal error:", err.message);
  process.exitCode = 1;
});
