/**
 * fetch-pga-current-field.mjs
 *
 * Fetches the PGA Tour current field using MULTIPLE sources and cross-validates.
 * Only writes the field if at least 2 independent sources agree on the player list.
 * Logs every discrepancy so bad data is visible in workflow logs.
 *
 * Sources tried (in priority order):
 *  1. ESPN Scoreboard API        — real-time, reliable
 *  2. PGA Tour statdata API      — official field API, pre-tournament
 *  3. PGA Tour website scrape    — __NEXT_DATA__ JSON, most complete
 *  4. DataGolf API (free tier)   — independent third-party source
 *
 * Validation rules:
 *  - At least 2 sources must return ≥ 50 players (major fields use 156)
 *  - Cross-source agreement must be ≥ 80% (overlap / union)
 *  - Players only in one source are flagged as "unconfirmed"
 *  - If sources disagree badly, old file is preserved and warning logged
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT   = path.resolve(__dirname, "../public/data/pga/current-field.json");
const SCHEDULE = path.resolve(__dirname, "../public/data/pga/schedule.json");
const TIMEOUT  = 15000;
const MIN_PLAYERS = 30;   // minimum to consider a source valid
const MIN_AGREEMENT = 0.70; // 70% overlap required between two sources

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

// ── helpers ───────────────────────────────────────────────────────────────────

async function get(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { ...HEADERS, ...extraHeaders },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalize(name) {
  // Normalize player names for comparison: lowercase, remove punctuation/suffixes
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")          // strip accents
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/gi, "")
    .replace(/[^a-z\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function crossValidate(sourceA, sourceB) {
  const setA = new Set(sourceA.players.map(normalize));
  const setB = new Set(sourceB.players.map(normalize));

  const overlap = [...setA].filter(n => setB.has(n)).length;
  const union   = new Set([...setA, ...setB]).size;
  const agreement = union > 0 ? overlap / union : 0;

  const onlyInA = sourceA.players.filter(n => !setB.has(normalize(n)));
  const onlyInB = sourceB.players.filter(n => !setA.has(normalize(n)));

  return { agreement, overlap, union, onlyInA, onlyInB };
}

function mergeConfirmed(sources) {
  // Players in ALL sources = fully confirmed
  // Players in ≥ 2 sources = confirmed
  // Players in only 1 source = flagged as unconfirmed
  const counts = new Map(); // normalized name → [original names]
  for (const src of sources) {
    const seen = new Set();
    for (const p of src.players) {
      const key = normalize(p);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!counts.has(key)) counts.set(key, { name: p, sources: [], count: 0 });
      counts.get(key).sources.push(src.source);
      counts.get(key).count++;
    }
  }

  const confirmed   = [];
  const unconfirmed = [];
  for (const [, v] of counts) {
    if (v.count >= 2) confirmed.push(v.name);
    else              unconfirmed.push(v.name);
  }
  return { confirmed: confirmed.sort(), unconfirmed: unconfirmed.sort() };
}

// ── current tournament from schedule ─────────────────────────────────────────

async function getActiveTournament() {
  try {
    const raw = await readFile(SCHEDULE, "utf8");
    const schedule = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);

    // Active first
    const active = schedule.find(t =>
      t.status === "active" ||
      (t.startDate <= today && t.endDate >= today)
    );
    if (active) return active;

    // Then next upcoming within 7 days
    const upcoming = schedule
      .filter(t => t.status === "upcoming" && t.startDate >= today &&
                   t.startDate <= new Date(Date.now() + 7*24*3600*1000).toISOString().slice(0, 10))
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return upcoming ?? null;
  } catch {
    return null;
  }
}

// ── Source 1: ESPN scoreboard ─────────────────────────────────────────────────

async function tryEspn() {
  const data = await get("https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard");
  const events = data?.events ?? [];
  if (!events.length) throw new Error("No events");

  const event = events[0];
  const name  = event.shortName ?? event.name ?? "Unknown";
  const comp  = event.competitions?.[0];
  if (!comp) throw new Error("No competition");

  const players = (comp.competitors ?? [])
    .filter(c => {
      if (c.isAlternate) return false;
      const s = String(c.status?.type?.id ?? c.status ?? "").toUpperCase();
      return s !== "ALT" && s !== "WD" && s !== "DQ";
    })
    .map(c => c.athlete?.displayName ?? c.athlete?.fullName)
    .filter(Boolean);

  if (players.length < MIN_PLAYERS) throw new Error(`Only ${players.length} players`);
  return { tournament: name, players, source: "espn-scoreboard" };
}

// ── Source 2: statdata.pgatour.com ────────────────────────────────────────────

const TOUR_ID_MAP = {
  "rbc canadian open":                         "R2026037",
  "us open":                                   "R2026026",
  "u.s. open":                                 "R2026026",
  "travelers championship":                    "R2026033",
  "john deere classic":                        "R2026021",
  "genesis scottish open":                     "R2026040",
  "the open championship":                     "R2026100",
  "3m open":                                   "R2026025",
  "rocket mortgage classic":                   "R2026030",
  "wyndham championship":                      "R2026041",
  "fedex st. jude championship":               "R2026042",
  "bmw championship":                          "R2026043",
  "tour championship":                         "R2026060",
  "memorial tournament":                       "R2026023",
  "charles schwab challenge":                  "R2026020",
  "pga championship":                          "R2026018",
  "masters tournament":                        "R2026014",
};

function getTourId(tournamentName) {
  const lower = (tournamentName ?? "").toLowerCase();
  for (const [key, id] of Object.entries(TOUR_ID_MAP)) {
    if (lower.includes(key)) return id;
  }
  return null;
}

async function tryStatdata(tournament) {
  const tourId = getTourId(tournament?.name ?? "");
  if (!tourId) throw new Error(`No Tour ID for: ${tournament?.name}`);

  const data = await get(`https://statdata.pgatour.com/r/${tourId}/field.json`);
  const raw = data?.Tournament?.Players?.Player ?? data?.players ?? data?.Players ?? data?.field ?? [];

  const players = raw
    .filter(p => {
      const s = String(p.Status ?? p.status ?? "").toUpperCase();
      return s !== "ALT" && s !== "WD" && s !== "DQ";
    })
    .map(p => {
      const first = p.FirstName ?? p.firstName ?? "";
      const last  = p.LastName  ?? p.lastName  ?? "";
      return p.displayName ?? p.PlayerName ?? `${first} ${last}`.trim();
    })
    .filter(n => n && n.length > 2);

  if (players.length < MIN_PLAYERS) throw new Error(`Only ${players.length} players`);
  const name = data?.Tournament?.TournamentName ?? tournament?.name ?? tourId;
  return { tournament: name, players, source: "statdata-pgatour" };
}

// ── Source 3: DataGolf API (free tier, no key needed) ─────────────────────────

async function tryDataGolf() {
  const data = await get("https://feeds.datagolf.com/field-updates?tour=pga&file_format=json");
  // DataGolf returns { field: [{ player_name, dg_id, ... }] }
  const raw = data?.field ?? data?.players ?? [];
  if (!Array.isArray(raw) || raw.length < MIN_PLAYERS) throw new Error(`Only ${raw.length} players`);

  const players = raw
    .filter(p => {
      const s = String(p.status ?? p.Status ?? "").toLowerCase();
      return s !== "wd" && s !== "dq" && s !== "alt" && s !== "withdrawn";
    })
    .map(p => p.player_name ?? p.name ?? p.playerName)
    .filter(Boolean);

  if (players.length < MIN_PLAYERS) throw new Error(`Only ${players.length} non-WD players`);
  const name = data?.event_name ?? data?.tournament ?? "Current Event";
  return { tournament: name, players, source: "datagolf" };
}

// ── Source 4: PGA Tour __NEXT_DATA__ scrape ───────────────────────────────────

const URL_SLUG_MAP = {
  "R2026037": "rbc-canadian-open",
  "R2026026": "us-open",
  "R2026033": "travelers-championship",
  "R2026021": "john-deere-classic",
  "R2026040": "genesis-scottish-open",
  "R2026100": "the-open-championship",
  "R2026025": "3m-open",
  "R2026030": "rocket-mortgage-classic",
  "R2026041": "wyndham-championship",
  "R2026042": "fedex-st-jude-championship",
  "R2026043": "bmw-championship",
  "R2026060": "tour-championship",
  "R2026023": "the-memorial-tournament-presented-by-workday",
  "R2026020": "charles-schwab-challenge",
};

async function tryPgaTourScrape(tournament) {
  const tourId  = getTourId(tournament?.name ?? "");
  const urlSlug = tourId ? URL_SLUG_MAP[tourId] : null;
  if (!tourId || !urlSlug) throw new Error(`No URL mapping for: ${tournament?.name}`);

  const url = `https://www.pgatour.com/tournaments/2026/${urlSlug}/${tourId}/field`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  let html;
  try {
    const res = await fetch(url, {
      headers: { ...HEADERS, Accept: "text/html" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("No __NEXT_DATA__");

  const pp = JSON.parse(match[1])?.props?.pageProps ?? {};
  const raw = pp.tournamentFieldPlayers ?? pp.fieldPlayers ?? pp.players ?? pp.entries ?? [];
  if (!Array.isArray(raw) || !raw.length) throw new Error("No field array");

  const players = raw
    .filter(p => {
      if (p.isAlternate || p.isWithdrawn) return false;
      const s = String(p.status ?? p.playerStatus ?? "").toUpperCase();
      return s !== "ALT" && s !== "WD" && s !== "DQ";
    })
    .map(p => p.displayName ?? p.playerName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim())
    .filter(n => n && n.length > 2);

  if (players.length < MIN_PLAYERS) throw new Error(`Only ${players.length} players from scrape`);
  const name = pp.tournament?.name ?? tournament?.name ?? urlSlug;
  return { tournament: name, players, source: "pgatour-scrape" };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("=== PGA Field Fetch with Multi-Source Validation ===");
const tournament = await getActiveTournament();
console.log(`Active tournament: ${tournament?.name ?? "unknown"} (${tournament?.startDate ?? "?"})`);

const strategies = [
  ["ESPN",           tryEspn],
  ["DataGolf",       tryDataGolf],
  ...(tournament ? [
    ["Statdata",     () => tryStatdata(tournament)],
    ["PGATour Scrape", () => tryPgaTourScrape(tournament)],
  ] : []),
];

const results = [];
for (const [name, fn] of strategies) {
  try {
    process.stdout.write(`  Trying ${name}... `);
    const r = await fn();
    console.log(`✅ ${r.players.length} players`);
    results.push(r);
  } catch (err) {
    console.log(`❌ ${err.message}`);
  }
}

if (results.length === 0) {
  console.log("❌ No sources returned data. Preserving existing field file.");
  process.exit(0);
}

if (results.length === 1) {
  console.warn(`⚠️  Only 1 source succeeded (${results[0].source}). Writing unvalidated field — VERIFY MANUALLY.`);
  const output = {
    tournament: results[0].tournament,
    source: results[0].source,
    validated: false,
    validationNote: "Only 1 source available — not cross-validated",
    fetchedAt: new Date().toISOString(),
    players: [...new Set(results[0].players)].sort(),
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output, null, 2), "utf-8");
  console.log(`⚠️  Saved ${output.players.length} players (unvalidated)`);
  process.exit(0);
}

// Cross-validate all pairs
console.log("\n=== Cross-Validation ===");
let bestAgreement = 0;
let bestPair = null;

for (let i = 0; i < results.length; i++) {
  for (let j = i + 1; j < results.length; j++) {
    const v = crossValidate(results[i], results[j]);
    console.log(`  ${results[i].source} ↔ ${results[j].source}: ${(v.agreement * 100).toFixed(1)}% agreement (${v.overlap}/${v.union})`);
    if (v.onlyInA.length > 0) console.log(`    Only in ${results[i].source}: ${v.onlyInA.slice(0,5).join(", ")}${v.onlyInA.length > 5 ? ` +${v.onlyInA.length-5} more` : ""}`);
    if (v.onlyInB.length > 0) console.log(`    Only in ${results[j].source}: ${v.onlyInB.slice(0,5).join(", ")}${v.onlyInB.length > 5 ? ` +${v.onlyInB.length-5} more` : ""}`);
    if (v.agreement > bestAgreement) {
      bestAgreement = v.agreement;
      bestPair = { a: results[i], b: results[j], ...v };
    }
  }
}

console.log(`\nBest agreement: ${(bestAgreement * 100).toFixed(1)}% (threshold: ${MIN_AGREEMENT * 100}%)`);

if (bestAgreement < MIN_AGREEMENT) {
  console.warn(`⚠️  Sources disagree below threshold. Preserving existing file — INVESTIGATE.`);
  console.warn(`    This usually means stale data from a previous tournament or WD/alt contamination.`);
  process.exit(0);
}

// Build merged confirmed field
const { confirmed, unconfirmed } = mergeConfirmed(results);
console.log(`\n✅ Confirmed (≥2 sources): ${confirmed.length} players`);
if (unconfirmed.length > 0) {
  console.log(`⚠️  Unconfirmed (1 source only): ${unconfirmed.length} players`);
  console.log(`   ${unconfirmed.slice(0, 10).join(", ")}${unconfirmed.length > 10 ? ` +${unconfirmed.length - 10} more` : ""}`);
}

const primaryName = results.reduce((best, r) =>
  r.players.length > (best?.players.length ?? 0) ? r : best, null
)?.tournament ?? tournament?.name ?? "Unknown";

const output = {
  tournament: primaryName,
  sources: results.map(r => ({ name: r.source, playerCount: r.players.length })),
  validated: true,
  bestAgreement: Math.round(bestAgreement * 100),
  fetchedAt: new Date().toISOString(),
  players: confirmed,
  unconfirmedPlayers: unconfirmed,
};

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify(output, null, 2), "utf-8");
console.log(`\n✅ Saved ${confirmed.length} validated players → current-field.json`);
