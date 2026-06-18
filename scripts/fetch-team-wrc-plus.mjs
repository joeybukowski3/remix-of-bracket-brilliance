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

// Returns last-N-days hitting split
async function fetchTeamBattingLastDays(teamId, days = 14) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - days);
  const fmt = (d) => d.toISOString().split("T")[0];
  const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=byDateRange&group=hitting&season=${SEASON}&startDate=${fmt(start)}&endDate=${fmt(today)}`;
  const json = await fetchJson(url);
  return json?.stats?.[0]?.splits?.[0]?.stat ?? null;
}

// Returns season hitting split vs LHP or RHP (sitCodes: vl or vr)
async function fetchTeamBattingSplit(teamId, sitCode) {
  const url = `https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=statSplits&group=hitting&season=${SEASON}&sitCodes=${sitCode}`;
  const json = await fetchJson(url);
  return json?.stats?.[0]?.splits?.[0]?.stat ?? null;
}

// Returns season team xBA (expected batting average) keyed by MLB team_id, from Baseball Savant
async function fetchTeamXba() {
  const url = `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter-team&year=${SEASON}&team=&min=q&csv=true`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; joeknowsball/1.0)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for Savant xBA`);
  const text = await res.text();
  const lines = text.trim().split("\n");
  const map = new Map(); // abbreviation -> xBA
  for (let i = 1; i < lines.length; i++) {
    // CSV: "team","team_id","year","pa","bip","ba","est_ba",...
    // NOTE: Savant's "team_id" column actually holds the team ABBREVIATION (e.g. "PIT")
    const cols = lines[i].split(",");
    const abbr = cols[1]?.replace(/"/g, "").trim();
    const estBa = parseFloat(cols[6]);
    if (abbr && Number.isFinite(estBa)) map.set(abbr, estBa);
  }
  return map;
}

// Returns a team's W-L record over their most recent N completed games
async function fetchTeamLast14Record(teamId, n = 14) {
  const today = new Date().toISOString().split("T")[0];
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&season=${SEASON}&gameType=R&startDate=${SEASON}-03-01&endDate=${today}&fields=dates,games,status,codedGameState,teams,home,away,team,id,isWinner`;
  const json = await fetchJson(url);
  const games = [];
  for (const day of json?.dates ?? []) {
    for (const g of day?.games ?? []) {
      if (g?.status?.codedGameState === "F") games.push(g);
    }
  }
  const last = games.slice(-n);
  let w = 0, l = 0;
  for (const g of last) {
    const isHome = g.teams?.home?.team?.id === teamId;
    const side = isHome ? g.teams.home : g.teams.away;
    if (side?.isWinner === true) w++;
    else if (side?.isWinner === false) l++;
  }
  return `${w}-${l}`;
}

function safeNum(val, fallback = 0) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Approximate wRC+ from a stat object.
 * Uses wOBA if available; falls back to OBP as wOBA proxy.
 * For splits (vsLHP/vsRHP) the MLB API omits runs, so we use a
 * well-known constant lgR/PA (0.122) rather than deriving it from the data.
 */
function approximateWrcPlus(stat, lgWoba, lgRunsPerPA) {
  if (!stat) return null;

  const woba = safeNum(stat.wOBA ?? stat.obp, null);
  if (woba === null) return null;

  // Use passed-in lgRunsPerPA if valid, otherwise fall back to constant
  const rpa = (lgRunsPerPA > 0) ? lgRunsPerPA : 0.122;

  // wRC+ = ((wOBA - lgWOBA) / wOBAScale + lgR/PA) / lgR/PA * 100
  const wrcPlus = ((woba - lgWoba) / WOBA_SCALE + rpa) / rpa * 100;
  return Math.round(wrcPlus);
}

/**
 * For split stats that lack runs (vsLHP/vsRHP), compute league wOBA
 * from OBP across all teams and use constant lgR/PA.
 */
function computeLeagueAveragesForSplits(teamStats) {
  const valid = teamStats.filter((s) => s && safeNum(s.obp) > 0);
  if (valid.length < 15) return { lgWoba: 0.310, lgRunsPerPA: 0.122 };
  const totalPA = valid.reduce((sum, s) => sum + safeNum(s.plateAppearances), 0);
  const totalWoba = valid.reduce((sum, s) => sum + safeNum(s.obp) * safeNum(s.plateAppearances), 0);
  const lgWoba = totalPA > 0 ? totalWoba / totalPA : 0.310;
  return { lgWoba, lgRunsPerPA: 0.122 };
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

  console.log("[wrc-plus] Fetching vs LHP / vs RHP splits...");
  const [vsLhpStats, vsRhpStats] = await Promise.all([
    Promise.all(teams.map((t) => fetchTeamBattingSplit(t.id, "vl").catch(() => null))),
    Promise.all(teams.map((t) => fetchTeamBattingSplit(t.id, "vr").catch(() => null))),
  ]);

  console.log("[wrc-plus] Fetching team xBA from Baseball Savant...");
  const xbaMap = await fetchTeamXba().catch((e) => {
    console.warn("[wrc-plus] xBA fetch failed:", e.message);
    return new Map();
  });

  console.log("[wrc-plus] Fetching last-14-games records...");
  const last14Records = await Promise.all(
    teams.map((t) => fetchTeamLast14Record(t.id, 14).catch(() => null))
  );

  // Compute league averages from season stats
  const { lgWoba: lgWobaSeason, lgRunsPerPA: lgRpaSeason } = computeLeagueAverages(seasonStats);
  const { lgWoba: lgWobaRecent, lgRunsPerPA: lgRpaRecent } = computeLeagueAverages(recentStats);
  const { lgWoba: lgWobaVsL, lgRunsPerPA: lgRpaVsL } = computeLeagueAveragesForSplits(vsLhpStats);
  const { lgWoba: lgWobaVsR, lgRunsPerPA: lgRpaVsR } = computeLeagueAveragesForSplits(vsRhpStats);

  console.log(`[wrc-plus] League avg season wOBA=${lgWobaSeason.toFixed(3)} R/PA=${lgRpaSeason.toFixed(3)}`);
  console.log(`[wrc-plus] League avg recent wOBA=${lgWobaRecent.toFixed(3)} R/PA=${lgRpaRecent.toFixed(3)}`);
  console.log(`[wrc-plus] League avg vsLHP wOBA=${lgWobaVsL.toFixed(3)} | vsRHP wOBA=${lgWobaVsR.toFixed(3)}`);

  // Compute raw wRC+ for each team
  const withWrc = teams.map((team, i) => ({
    ...team,
    seasonWrcPlus: approximateWrcPlus(seasonStats[i], lgWobaSeason, lgRpaSeason),
    recentWrcPlus: approximateWrcPlus(recentStats[i], lgWobaRecent, lgRpaRecent),
    vsLhpWrcPlus: approximateWrcPlus(vsLhpStats[i], lgWobaVsL, lgRpaVsL),
    vsRhpWrcPlus: approximateWrcPlus(vsRhpStats[i], lgWobaVsR, lgRpaVsR),
    seasonAvg: seasonStats[i]?.avg != null ? parseFloat(seasonStats[i].avg) : null,
    recentAvg: recentStats[i]?.avg != null ? parseFloat(recentStats[i].avg) : null,
    last14Record: last14Records[i] ?? null,
  }));

  // Rank teams (1 = best)
  const seasonRanks = rankTeams(withWrc, "seasonWrcPlus");
  const recentRanks = rankTeams(withWrc, "recentWrcPlus");
  const vsLhpRanks = rankTeams(withWrc, "vsLhpWrcPlus");
  const vsRhpRanks = rankTeams(withWrc, "vsRhpWrcPlus");

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
    vsLhpWrcPlus: team.vsLhpWrcPlus,
    vsLhpRank: vsLhpRanks.get(team.abbreviation) ?? null,
    vsLhpRankLabel: vsLhpRanks.has(team.abbreviation) ? ordinalRank(vsLhpRanks.get(team.abbreviation)) : null,
    vsRhpWrcPlus: team.vsRhpWrcPlus,
    vsRhpRank: vsRhpRanks.get(team.abbreviation) ?? null,
    vsRhpRankLabel: vsRhpRanks.has(team.abbreviation) ? ordinalRank(vsRhpRanks.get(team.abbreviation)) : null,
    seasonXba: xbaMap.get(team.abbreviation) ?? null,
    seasonAvg: team.seasonAvg ?? null,
    recentAvg: team.recentAvg ?? null,
    last14Record: team.last14Record ?? null,
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
