/**
 * fetch-pitcher-percentiles.mjs
 *
 * Fetches season pitching stats for all MLB pitchers with 10+ IP,
 * computes true percentile ranks for ERA, WHIP, K/9, K%, BB%, HR/9,
 * and writes public/data/mlb/pitcher-percentiles.json.
 *
 * Lower-is-better stats (ERA, WHIP, HR/9, BB%) are inverted so that
 * a percentile of 99 always means "elite" (like Baseball Savant).
 *
 * Runs daily (same schedule as fetch-team-wrc-plus.mjs).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "public", "data", "mlb");
const OUTPUT_PATH = path.join(DATA_DIR, "pitcher-percentiles.json");
const SEASON = new Date().getFullYear();
const MIN_IP = 10;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; joeknowsball/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function safeFloat(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Given a sorted array of values (ascending) and a target value,
 * return 0-100 percentile. For lower-is-better stats, invert at the end.
 */
function computePercentile(sortedAsc, value, lowerIsBetter) {
  if (value == null || sortedAsc.length === 0) return null;
  // Count how many values are strictly below this value
  let below = 0;
  let equal = 0;
  for (const v of sortedAsc) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  // Percentile rank = (below + 0.5 * equal) / total * 100
  const pct = Math.round(((below + 0.5 * equal) / sortedAsc.length) * 100);
  // Invert for lower-is-better: elite low ERA → high percentile
  return lowerIsBetter ? 100 - pct : pct;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  console.log("[pitcher-pct] Fetching all pitcher season stats (playerPool=all)...");
  const url = `https://statsapi.mlb.com/api/v1/stats?stats=season&group=pitching&season=${SEASON}&sportId=1&limit=1000&playerPool=all`;
  const data = await fetchJson(url);
  const splits = data?.stats?.[0]?.splits || [];
  console.log(`[pitcher-pct] Total pitchers returned: ${splits.length}`);

  // Filter to 10+ IP
  const qualified = splits.filter((s) => safeFloat(s.stat?.inningsPitched) >= MIN_IP);
  console.log(`[pitcher-pct] Pitchers with ${MIN_IP}+ IP: ${qualified.length}`);

  // Extract raw stat values per pitcher
  const pitchers = qualified.map((s) => ({
    id: s.player?.id ?? null,
    name: s.player?.fullName ?? null,
    ip: safeFloat(s.stat?.inningsPitched),
    era: safeFloat(s.stat?.era),
    whip: safeFloat(s.stat?.whip),
    k9: safeFloat(s.stat?.strikeoutsPer9Inn),
    bb9: safeFloat(s.stat?.walksPer9Inn),
    hr9: safeFloat(s.stat?.homeRunsPer9),
    // K% and BB% aren't in season stats directly — derive from SO/BF
    strikeOuts: safeFloat(s.stat?.strikeOuts),
    battersFaced: safeFloat(s.stat?.battersFaced),
    baseOnBalls: safeFloat(s.stat?.baseOnBalls),
  }));

  // Compute K% and BB% from components
  pitchers.forEach((p) => {
    p.kPct = (p.strikeOuts != null && p.battersFaced != null && p.battersFaced > 0)
      ? (p.strikeOuts / p.battersFaced) * 100
      : null;
    p.bbPct = (p.baseOnBalls != null && p.battersFaced != null && p.battersFaced > 0)
      ? (p.baseOnBalls / p.battersFaced) * 100
      : null;
  });

  // Build sorted distributions for each stat
  const statDefs = [
    { key: "era",   lowerIsBetter: true  },
    { key: "whip",  lowerIsBetter: true  },
    { key: "k9",    lowerIsBetter: false },
    { key: "kPct",  lowerIsBetter: false },
    { key: "bb9",   lowerIsBetter: true  },
    { key: "bbPct", lowerIsBetter: true  },
    { key: "hr9",   lowerIsBetter: true  },
  ];

  const distributions = {};
  for (const { key } of statDefs) {
    distributions[key] = pitchers
      .map((p) => p[key])
      .filter((v) => v != null)
      .sort((a, b) => a - b);
  }

  // Compute percentiles for each pitcher
  const result = {};
  for (const p of pitchers) {
    if (!p.id) continue;
    const pcts = {};
    for (const { key, lowerIsBetter } of statDefs) {
      pcts[key] = computePercentile(distributions[key], p[key], lowerIsBetter);
    }
    result[p.id] = {
      id: p.id,
      name: p.name,
      ip: p.ip,
      // Raw values (for display)
      era: p.era,
      whip: p.whip,
      k9: p.k9,
      kPct: p.kPct != null ? Math.round(p.kPct * 10) / 10 : null,
      bb9: p.bb9,
      bbPct: p.bbPct != null ? Math.round(p.bbPct * 10) / 10 : null,
      hr9: p.hr9,
      // Percentile ranks (0-100, higher = better/elite for all stats)
      eraPct:   pcts.era,
      whipPct:  pcts.whip,
      k9Pct:    pcts.k9,
      kPctPct:  pcts.kPct,
      bb9Pct:   pcts.bb9,
      bbPctPct: pcts.bbPct,
      hr9Pct:   pcts.hr9,
    };
  }

  // League averages (for the tick mark reference line)
  const leagueAvg = {};
  for (const { key } of statDefs) {
    const vals = distributions[key];
    leagueAvg[key] = vals.length > 0
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1000) / 1000
      : null;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    season: SEASON,
    minIp: MIN_IP,
    pitcherCount: Object.keys(result).length,
    leagueAvg,
    pitchers: result,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`[pitcher-pct] Wrote ${Object.keys(result).length} pitchers to ${OUTPUT_PATH}`);

  // Spot-check
  const mclean = Object.values(result).find((p) => p.name?.includes("McLean"));
  const lodolo = Object.values(result).find((p) => p.name?.includes("Lodolo"));
  if (mclean) console.log(`[pitcher-pct] McLean: ERA ${mclean.era} (${mclean.eraPct}th pct) | K9 ${mclean.k9} (${mclean.k9Pct}th pct) | WHIP ${mclean.whip} (${mclean.whipPct}th pct)`);
  if (lodolo) console.log(`[pitcher-pct] Lodolo: ERA ${lodolo.era} (${lodolo.eraPct}th pct) | K9 ${lodolo.k9} (${lodolo.k9Pct}th pct) | WHIP ${lodolo.whip} (${lodolo.whipPct}th pct)`);
}

main().catch((err) => {
  console.error("[pitcher-pct] Fatal error:", err.message);
  process.exitCode = 1;
});
