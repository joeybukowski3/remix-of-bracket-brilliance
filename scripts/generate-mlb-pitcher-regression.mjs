/**
 * generate-mlb-pitcher-regression.mjs
 * 
 * Fetches today's probable starters, pulls their season stats from:
 *   - MLB Stats API (ERA, K, BB, HR, IP, BF, H, airOuts, leftOnBase, HBP, SF)
 *   - Baseball Savant (xERA — the most predictive expected metric)
 *
 * Then computes fully automated:
 *   - K-BB% (skill indicator)
 *   - LOB% (strand rate — luck indicator)
 *   - HR/FB% (luck indicator)
 *   - BABIP (luck indicator)
 *   - xFIP (computed from first principles)
 *   - Regression Score (-10 to +10)
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const OUTPUT_PATH = path.join(DATA_DIR, "pitcher-regression.json");
const SEASON = new Date().getFullYear();

// xFIP league constants
const LG_HR_FB_RATE = 0.105;  // ~10.5% league avg HR/FB
const C_FIP = 3.20;            // constant to normalize to ERA scale

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function getTodayEt() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

const MLB_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://www.mlb.com/",
  "Origin": "https://www.mlb.com",
};

async function fetchJson(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: MLB_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) { console.warn(`fetchJson failed: ${url}`, err.message); return null; }
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: MLB_HEADERS });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function parseCsv(text) {
  if (!text?.trim()) return [];
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

function toNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseIp(ip) {
  if (ip == null) return null;
  const s = String(ip);
  const [whole, frac] = s.split(".");
  return Number(whole) + (Number(frac || 0) / 3);
}

// ── Fetch today's probable starters ─────────────────────────────────────────

async function fetchTodayStarters() {
  const date = getTodayEt();
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=team,probablePitcher`;
  const json = await fetchJson(url);
  if (!json?.dates?.[0]?.games) return [];

  const starters = [];
  for (const game of json.dates[0].games) {
    const away = game.teams?.away;
    const home = game.teams?.home;
    if (away?.probablePitcher) {
      starters.push({
        id: away.probablePitcher.id,
        name: away.probablePitcher.fullName,
        team: away.team?.abbreviation ?? "???",
      });
    }
    if (home?.probablePitcher) {
      starters.push({
        id: home.probablePitcher.id,
        name: home.probablePitcher.fullName,
        team: home.team?.abbreviation ?? "???",
      });
    }
  }
  return starters;
}

// ── Fetch MLB season stats ───────────────────────────────────────────────────

const pitcherSeasonCache = new Map();
async function fetchPitcherSeasonStats(id) {
  if (!id) return null;
  if (pitcherSeasonCache.has(id)) return pitcherSeasonCache.get(id);
  // Try extended stats first (includes leftOnBase, sacFlies, hitByPitch)
  const json = await fetchJson(
    `https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&season=${SEASON}&group=pitching&fields=stats,splits,stat,era,inningsPitched,strikeOuts,baseOnBalls,homeRuns,battersFaced,hits,airOuts,leftOnBase,hitByPitch,sacFlies`
  );
  const stats = json?.stats?.[0]?.splits?.[0]?.stat ?? null;
  pitcherSeasonCache.set(id, stats);
  return stats;
}

// ── Fetch Baseball Savant xERA leaderboard ──────────────────────────────────

async function fetchSavantXeraMap() {
  // Baseball Savant expected_statistics endpoint — returns est_era (xERA) per player
  const url = `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=pitcher&year=${SEASON}&position=&team=&min=1&csv=true`;
  const text = await fetchText(url);
  if (!text || text.startsWith("<!DOCTYPE")) {
    // Fallback: try custom leaderboard endpoint
    const fallbackUrl = `https://baseballsavant.mlb.com/leaderboard/custom?year=${SEASON}&type=pitcher&filter=&min=1` +
      `&selections=player_id,player_name,xera,k_percent,bb_percent,babip,lob_pct` +
      `&sort=xera&sortDir=asc&chart=false&csv=true`;
    const fallbackText = await fetchText(fallbackUrl);
    if (!fallbackText || fallbackText.startsWith("<!DOCTYPE")) {
      console.warn("Savant xERA fetch blocked — will use xFIP as fallback");
      return new Map();
    }
    const rows = parseCsv(fallbackText);
    const map = new Map();
    for (const row of rows) {
      const pid = String(row.player_id ?? "").trim();
      if (pid) map.set(pid, { xera: row.xera ?? null, lobPct: row.lob_pct ?? null });
    }
    console.log(`Savant fallback rows: ${map.size}`);
    return map;
  }
  const rows = parseCsv(text);
  // Also fetch LOB% from custom leaderboard (not in expected_statistics)
  const lobUrl = `https://baseballsavant.mlb.com/leaderboard/custom?year=${SEASON}&type=pitcher&filter=&min=1` +
    `&selections=player_id,lob_pct&sort=lob_pct&sortDir=desc&chart=false&csv=true`;
  const lobText = await fetchText(lobUrl);
  const lobMap = new Map();
  if (lobText && !lobText.startsWith("<!DOCTYPE")) {
    for (const row of parseCsv(lobText)) {
      const pid = String(row.player_id ?? "").trim();
      if (pid && row.lob_pct) lobMap.set(pid, row.lob_pct);
    }
    console.log(`Savant LOB% rows: ${lobMap.size}`);
  }
  const map = new Map();
  for (const row of rows) {
    const pid = String(row.player_id ?? "").trim();
    if (pid) map.set(pid, {
      xera: row.est_era ?? row.xera ?? null,
      lobPct: lobMap.get(pid) ?? null,
    });
  }
  console.log(`Savant expected_statistics rows: ${map.size}`);
  return map;
}

// ── Compute derived regression stats ────────────────────────────────────────

function computeStats(seasonStats, savantRow) {
  if (!seasonStats) return null;

  const era       = toNum(seasonStats.era);
  const ip        = parseIp(seasonStats.inningsPitched);
  const k         = toNum(seasonStats.strikeOuts) ?? 0;
  const bb        = toNum(seasonStats.baseOnBalls) ?? 0;
  const hr        = toNum(seasonStats.homeRuns) ?? 0;
  const bf        = toNum(seasonStats.battersFaced) ?? 0;
  const hits      = toNum(seasonStats.hits) ?? 0;
  const airOuts   = toNum(seasonStats.airOuts) ?? 0;   // fly ball outs (no HR)
  const lob       = toNum(seasonStats.leftOnBase); // null if not returned by API — do NOT default to 0
  const hbp       = toNum(seasonStats.hitByPitch) ?? 0;
  const sf        = toNum(seasonStats.sacFlies) ?? 0;

  if (ip == null || ip < 5) return null; // too few innings to be meaningful

  // K-BB%
  const kPct  = bf > 0 ? (k / bf) * 100 : null;
  const bbPct = bf > 0 ? (bb / bf) * 100 : null;
  const kbb   = kPct != null && bbPct != null ? Math.round((kPct - bbPct) * 10) / 10 : null;

  // LOB% handled below with Savant fallback
  const lobDenom = hits + bb + hbp - 1.4 * hr;

  // HR/FB%: homeRuns / (homeRuns + airOuts) — airOuts = fly ball outs
  const totalFlyBalls = hr + airOuts;
  const hrfb = totalFlyBalls > 0 ? Math.round((hr / totalFlyBalls) * 1000) / 10 : null;

  // BABIP: (H - HR) / (BF - BB - K - HR - HBP + SF)
  const babipDenom = bf - bb - k - hr - hbp + sf;
  const babip = babipDenom > 0 ? Math.round(((hits - hr) / babipDenom) * 1000) / 1000 : null;

  // xFIP: ((13 * flyBalls * lgHRFB + 3 * (BB + HBP) - 2 * K) / IP) + cFIP
  const xfip = ip > 0
    ? Math.round(((13 * totalFlyBalls * LG_HR_FB_RATE + 3 * (bb + hbp) - 2 * k) / ip + C_FIP) * 100) / 100
    : null;

  // xERA from Savant (best predictive metric)
  const xera = savantRow ? toNum(savantRow.xera) : null;

  // LOB% — prefer MLB API leftOnBase, fall back to Savant lob_pct
  const savantLobPct = savantRow ? toNum(savantRow.lobPct) : null;
  const computedStrandRate = (lob != null && lob > 0 && lobDenom > 0)
    ? Math.round((lob / lobDenom) * 1000) / 10
    : savantLobPct != null
      ? Math.round(savantLobPct * 10) / 10  // Savant returns as decimal (0-1) or percent
      : null;
  // Savant lob_pct is typically 0-1 scale, convert to percent if needed
  const strandRate = computedStrandRate != null && computedStrandRate <= 1
    ? Math.round(computedStrandRate * 1000) / 10
    : computedStrandRate;

  return { era, xfip, xera, kbb, strandRate, hrfb, babip };
}

// ── Compute regression score (-10 to +10) ───────────────────────────────────

function computeRegressionScore({ era, xfip, xera, strandRate, hrfb, babip }) {
  if (era == null) return { score: 0, tier: "neutral" };

  const expectedEra = xera ?? xfip;
  if (expectedEra == null) return { score: 0, tier: "neutral" };

  // Base: ERA vs expected (negative = outperforming = regression risk)
  const baseDiff = era - expectedEra;

  let luckAdj = 0;

  // Strand rate: >80% is unsustainable, norm ~73%
  if (strandRate != null) {
    luckAdj += ((strandRate - 73) / 20) * 0.5;
  }

  // HR/FB: <8% is lucky (expecting more HRs), >12% unlucky, norm ~10.5%
  if (hrfb != null) {
    luckAdj += ((hrfb - 10.5) / 5) * 0.4;
  }

  // BABIP: <.280 is lucky, >.310 is unlucky, norm .300
  if (babip != null) {
    luckAdj += (babip - 0.300) * 10 * 0.3;
  }

  const total = baseDiff + luckAdj;
  // Scale: ±4 ERA-run gap = ±10 score (wider than before — avoids clamping at extremes)
  // Luck adjustments are capped so they can't push past ±3 on their own
  const clampedLuck = Math.max(-3, Math.min(3, luckAdj));
  const adjusted = baseDiff + clampedLuck;
  const score = Math.max(-10, Math.min(10, Math.round((adjusted / 4) * 100) / 10));

  let tier;
  if (score < -6.5)     tier = "extreme_positive";
  else if (score < -3)  tier = "strong_positive";
  else if (score < -0.5) tier = "slight_positive";
  else if (score < 0.5)  tier = "neutral";
  else if (score < 3)   tier = "slight_negative";
  else if (score < 6.5) tier = "strong_negative";
  else                  tier = "extreme_negative";

  return { score, tier };
}

function makeSummary(name, tier) {
  const summaries = {
    extreme_positive: `${name} is massively overperforming — ERA will likely regress significantly.`,
    strong_positive:  `${name} is exceeding metrics by ~2 runs — regression risk.`,
    slight_positive:  `${name} has a small edge over expected — slight regression risk.`,
    neutral:          `${name}'s ERA aligns with underlying metrics — sustainable.`,
    slight_negative:  `${name} is slightly underperforming — modest improvement likely.`,
    strong_negative:  `${name} is ~2 runs below expected — strong upside improvement likely.`,
    extreme_negative: `${name} is drastically underperforming — ERA improvement expected.`,
  };
  return summaries[tier] ?? "No assessment available.";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  ensureDataDir();
  console.log("Fetching today's probable starters...");
  const starters = await fetchTodayStarters();
  console.log(`Found ${starters.length} probable starters`);

  if (starters.length === 0) {
    console.log("No starters found — writing empty output");
    writeFileSync(OUTPUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), date: getTodayEt(), pitchers: [] }, null, 2));
    return;
  }

  console.log("Fetching Savant xERA data...");
  const savantMap = await fetchSavantXeraMap();
  console.log(`Savant xERA rows: ${savantMap.size}`);

  const results = [];
  for (const starter of starters) {
    console.log(`  Processing: ${starter.name} (${starter.team}) ID=${starter.id}`);
    const seasonStats = await fetchPitcherSeasonStats(starter.id);
    const savantRow = savantMap.get(String(starter.id));

    const computed = computeStats(seasonStats, savantRow);
    if (!computed) {
      console.log(`    → Skipping: insufficient data`);
      continue;
    }

    const { score, tier } = computeRegressionScore(computed);

    results.push({
      pitcherId: starter.id,
      name: starter.name,
      team: starter.team,
      era: computed.era,
      xfip: computed.xfip,
      xera: computed.xera,
      kbb: computed.kbb,
      strandRate: computed.strandRate,
      hrfb: computed.hrfb,
      babip: computed.babip,
      regressionScore: score,
      regressionTier: tier,
      summary: makeSummary(starter.name, tier),
    });

    console.log(`    → ERA: ${computed.era}, xFIP: ${computed.xfip}, xERA: ${computed.xera}, LOB%: ${computed.strandRate}, HR/FB: ${computed.hrfb}, BABIP: ${computed.babip}, Score: ${score}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: getTodayEt(),
    pitchers: results,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Wrote ${results.length} pitchers to ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
