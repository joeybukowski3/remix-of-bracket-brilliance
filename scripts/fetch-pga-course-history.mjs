/**
 * fetch-pga-course-history.mjs
 *
 * Fetches historical Strokes Gained data for a PGA Tour tournament at a specific
 * course and aggregates it into a course-history JSON file for use in the model.
 *
 * Data source: DataGolf historical-raw-data API
 *   https://feeds.datagolf.com/historical-raw-data/event
 *
 * Matches the columns shown on Betsportsgolf.com "The Rabbit Hole":
 *   Finish positions, AVG FINISH, Rds, SG:TOTAL, SG:AVG, SG:T2G, SG:OTT,
 *   SG:APP, SG:ARG, SG:Putting
 *
 * Usage:
 *   node scripts/fetch-pga-course-history.mjs --slug charles-schwab-challenge-2026-picks
 *   node scripts/fetch-pga-course-history.mjs --slug charles-schwab-challenge-2026-picks --years 5 --force
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "public", "data", "pga");

const API_KEY = process.env.DATAGOLF_API_KEY ?? "";
const BASE_URL = "https://feeds.datagolf.com";

// ─── DataGolf event ID mapping ────────────────────────────────────────────────
// Source: https://feeds.datagolf.com/historical-raw-data/event-list (or manual lookup)
// Add event IDs here as new tournaments are added to the schedule.
const DATAGOLF_EVENT_IDS = {
  "charles-schwab-challenge":        "014",  // Colonial Country Club
  "the-memorial-tournament":         "030",  // Muirfield Village
  "rbc-canadian-open":               "023",  // various courses
  "us-open":                         "026",  // various courses
  "travelers-championship":          "034",  // TPC River Highlands
  "rocket-mortgage-classic":         "070",  // Detroit Golf Club
  "genesis-scottish-open":           "478",  // The Renaissance Club
  "the-open-championship":           "100",  // various courses
  "wyndham-championship":            "041",  // Sedgefield CC
  "fedex-st-jude-championship":      "061",  // TPC Southwind
  "bmw-championship":                "062",  // various courses
  "tour-championship":               "060",  // East Lake
  "the-sentry":                      "002",  // Plantation Course
  "sony-open-in-hawaii":             "006",  // Waialae CC
  "the-american-express":            "007",  // La Quinta
  "farmers-insurance-open":          "010",  // Torrey Pines
  "at-t-pebble-beach-pro-am":        "011",  // Pebble Beach
  "waste-management-phoenix-open":   "013",  // TPC Scottsdale
  "the-genesis-invitational":        "015",  // Riviera
  "cognizant-classic":               "009",  // PGA National
  "arnold-palmer-invitational":      "021",  // Bay Hill
  "the-players-championship":        "020",  // TPC Sawgrass
  "valspar-championship":            "036",  // Innisbrook
  "texas-childrens-houston-open":    "043",  // Memorial Park
  "masters-tournament":              "014",  // Augusta National
  "rbc-heritage":                    "017",  // Harbour Town
  "zurich-classic":                  "022",  // TPC Louisiana
  "wells-fargo-championship":        "025",  // Quail Hollow
  "pga-championship":                "033",  // various courses
  "truist-championship":             "025",  // Quail Hollow
};

// Normalize a tournament slug to look up event IDs
function slugToEventKey(slug) {
  return slug
    .replace(/-\d{4}-picks$/, "")
    .replace(/-\d{4}$/, "")
    .replace(/^the-/, "")
    .toLowerCase();
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Try to fetch the DataGolf event list to validate/discover event IDs
async function fetchEventList() {
  const url = `${BASE_URL}/historical-raw-data/event-list?file_format=json${API_KEY ? `&key=${API_KEY}` : ""}`;
  try {
    const data = await fetchJson(url);
    return Array.isArray(data) ? data : (data?.events ?? []);
  } catch {
    return [];
  }
}

async function fetchEventRounds(eventId, year) {
  if (!API_KEY) throw new Error("DATAGOLF_API_KEY is required for historical data");
  const url = `${BASE_URL}/historical-raw-data/event?tour=pga&event_id=${eventId}&year=${year}&file_format=json&key=${API_KEY}`;
  return fetchJson(url);
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mean(arr) {
  const valid = arr.filter((n) => n != null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function round2(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

/**
 * Aggregate DataGolf historical rounds into a per-player course history summary.
 * DataGolf round objects look like:
 *   { player_name, dg_id, year, round_num, fin_text, sg_total, sg_ott,
 *     sg_app, sg_arg, sg_t2g, sg_putt, ... }
 */
function aggregateRounds(allRounds) {
  const byPlayer = new Map();

  for (const round of allRounds) {
    const name = round.player_name;
    if (!name) continue;

    if (!byPlayer.has(name)) {
      byPlayer.set(name, {
        player: name,
        dgId: round.dg_id ?? null,
        rounds: 0,
        finishes: [],
        sgTotal: [],
        sgOtt: [],
        sgApp: [],
        sgArg: [],
        sgT2g: [],
        sgPutt: [],
        years: new Set(),
      });
    }

    const p = byPlayer.get(name);
    p.rounds += 1;
    p.years.add(round.year);

    // Finish — DataGolf gives "fin_text" like "1", "T4", "MC", "WD"
    const finRaw = String(round.fin_text ?? "").replace(/^T/, "");
    const fin = Number.isFinite(Number(finRaw)) ? Number(finRaw) : null;
    if (fin != null) p.finishes.push(fin);

    const push = (arr, v) => { const n = safeNum(v); if (n != null) arr.push(n); };
    push(p.sgTotal, round.sg_total);
    push(p.sgOtt,   round.sg_ott);
    push(p.sgApp,   round.sg_app);
    push(p.sgArg,   round.sg_arg);
    push(p.sgT2g,   round.sg_t2g);
    push(p.sgPutt,  round.sg_putt);
  }

  return Array.from(byPlayer.values())
    .map((p) => ({
      player:    p.player,
      dgId:      p.dgId,
      rounds:    p.rounds,
      avgFinish: round2(mean(p.finishes)),
      years:     [...p.years].sort(),
      // Cumulative totals (matches Betsportsgolf "SG: TOTAL")
      sgTotal:   round2(p.sgTotal.reduce((a, b) => a + b, 0) || null),
      // Per-round averages (matches "SG: AVG")
      sgAvg:     round2(mean(p.sgTotal)),
      sgT2g:     round2(mean(p.sgT2g)),
      sgOtt:     round2(mean(p.sgOtt)),
      sgApp:     round2(mean(p.sgApp)),
      sgArg:     round2(mean(p.sgArg)),
      sgPutt:    round2(mean(p.sgPutt)),
    }))
    // Sort by cumulative SG total descending (best course history first)
    .sort((a, b) => (b.sgTotal ?? -999) - (a.sgTotal ?? -999));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function fetchCourseHistory(slug, { force = false, years = 5 } = {}) {
  const outPath = path.join(outDir, `${slug}-course-history.json`);

  // Skip if recent and not forced
  if (!force && fs.existsSync(outPath)) {
    const stats = fs.statSync(outPath);
    if (Date.now() - stats.mtimeMs < 12 * 60 * 60 * 1000) {
      const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
      console.log(`[course-history] Cached: ${slug} (${existing.players?.length ?? 0} players, source: ${existing.source})`);
      return outPath;
    }
  }

  // Look up event ID
  const eventKey = slugToEventKey(slug);
  let eventId = DATAGOLF_EVENT_IDS[eventKey];

  if (!eventId) {
    // Try auto-discovery from DataGolf event list
    console.log(`[course-history] No hardcoded ID for "${eventKey}", checking DataGolf event list...`);
    const eventList = await fetchEventList();
    const match = eventList.find((e) => {
      const name = (e.event_name ?? e.name ?? "").toLowerCase();
      return name.includes(eventKey.replace(/-/g, " ")) || eventKey.includes(name.replace(/\s+/g, "-"));
    });
    if (match) {
      eventId = String(match.event_id ?? match.id);
      console.log(`[course-history] Discovered event_id=${eventId} for "${eventKey}"`);
    } else {
      console.warn(`[course-history] Could not find DataGolf event_id for "${slug}". Add it to DATAGOLF_EVENT_IDS in this script.`);
      return null;
    }
  }

  const currentYear = new Date().getFullYear();
  const yearRange = Array.from({ length: years }, (_, i) => currentYear - 1 - i);
  console.log(`[course-history] Fetching ${slug} (event_id=${eventId}) for years: ${yearRange.join(", ")}`);

  const allRounds = [];
  for (const year of yearRange) {
    try {
      const data = await fetchEventRounds(eventId, year);
      // DataGolf returns { event_name, year, rounds: [...] } or just an array
      const rounds = Array.isArray(data) ? data : (data?.rounds ?? []);
      console.log(`  ${year}: ${rounds.length} rounds`);
      allRounds.push(...rounds.map((r) => ({ ...r, year })));
    } catch (err) {
      console.warn(`  ${year}: skipped (${err.message})`);
    }
  }

  if (!allRounds.length) {
    console.warn(`[course-history] No data returned for ${slug}. Check your DATAGOLF_API_KEY.`);
    return null;
  }

  const players = aggregateRounds(allRounds);
  const payload = {
    slug,
    eventId,
    source: "DataGolf",
    updatedAt: new Date().toISOString(),
    yearsIncluded: yearRange.filter((y) => allRounds.some((r) => r.year === y)),
    totalRounds: allRounds.length,
    playerCount: players.length,
    players,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[course-history] Saved ${players.length} players → ${path.relative(repoRoot, outPath)}`);

  // Print top 10 for manual verification against Betsportsgolf
  console.log("\n── Top 10 by cumulative SG Total (verify vs Betsportsgolf) ──");
  console.log("Player".padEnd(28) + "Rds  AvgFin  SG:Tot  SG:Avg  SG:OTT  SG:APP  SG:ARG  SG:Putt");
  players.slice(0, 15).forEach((p) => {
    const fmt = (v) => (v == null ? "  —   " : String(v).padStart(6));
    console.log(
      p.player.padEnd(28) +
      String(p.rounds).padStart(4) +
      fmt(p.avgFinish) +
      fmt(p.sgTotal) +
      fmt(p.sgAvg) +
      fmt(p.sgOtt) +
      fmt(p.sgApp) +
      fmt(p.sgArg) +
      fmt(p.sgPutt)
    );
  });

  return outPath;
}

// CLI
if (process.argv[1] === __filename) {
  const argv = process.argv.slice(2);
  const slugIdx = argv.indexOf("--slug");
  const yearsIdx = argv.indexOf("--years");
  const slug = slugIdx !== -1 ? argv[slugIdx + 1] : null;
  const years = yearsIdx !== -1 ? Number(argv[yearsIdx + 1]) : 5;
  const force = argv.includes("--force");

  if (!slug) {
    console.error("Usage: node scripts/fetch-pga-course-history.mjs --slug <slug> [--years 5] [--force]");
    process.exit(1);
  }

  fetchCourseHistory(slug, { force, years })
    .then((out) => { if (!out) process.exit(1); })
    .catch((err) => { console.error(err); process.exit(1); });
}

export { fetchCourseHistory, DATAGOLF_EVENT_IDS };
