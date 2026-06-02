/**
 * fetch-pga-current-field.mjs
 * Fetches the PGA Tour current field. Always exits 0 — never fails the workflow.
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, "../public/data/pga/current-field.json");
const TIMEOUT_MS = 12000;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "application/json",
};

async function get(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { ...HEADERS, ...extraHeaders }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Strategy 1: ESPN scoreboard (during tournament, Thu–Mon) ──────────────────
async function tryEspnScoreboard() {
  const data = await get("https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard");
  const events = Array.isArray(data?.events) ? data.events : [];
  if (!events.length) throw new Error("No events");

  const event = events[0];
  const name = event.shortName ?? event.name ?? "Unknown";
  const comp = event.competitions?.[0];
  if (!comp) throw new Error("No competition");

  const players = (comp.competitors ?? [])
    .filter((c) => {
      const status = (c.status?.type?.id ?? c.status ?? "").toString().toUpperCase();
      return status !== "ALT" && status !== "WD" && status !== "DQ" && !c.isAlternate;
    })
    .map((c) => c.athlete?.displayName ?? c.athlete?.fullName)
    .filter(Boolean);

  if (players.length < 10) throw new Error(`Only ${players.length} competitors`);
  return { tournament: name, players, source: "espn-scoreboard" };
}

// ── Strategy 2: ESPN scoreboard full event detail ─────────────────────────────
async function tryEspnEventDetail() {
  const scoreboard = await get("https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard");
  const eventId = scoreboard?.events?.[0]?.id;
  if (!eventId) throw new Error("No event ID");

  const name = scoreboard.events[0]?.shortName ?? scoreboard.events[0]?.name ?? "Unknown";

  const detail = await get(
    `https://site.api.espn.com/apis/site/v2/sports/golf/pga/summary?event=${eventId}`
  );

  const players = (detail?.competitors ?? detail?.roster ?? [])
    .map((c) => c.athlete?.displayName ?? c.displayName)
    .filter(Boolean);

  if (players.length < 10) throw new Error(`Only ${players.length} players in detail`);
  return { tournament: name, players, source: "espn-event-detail" };
}

// ── PGA Tour ID + URL slug map ────────────────────────────────────────────────
// Key = schedule.json slug, value = { urlSlug, tourId }
// urlSlug is the exact path segment used in pgatour.com URLs
const PGA_TOUR_MAP = {
  "the-memorial-tournament":          { urlSlug: "the-memorial-tournament-presented-by-workday",   tourId: "R2026023" },
  "travelers-championship-2026-picks":{ urlSlug: "travelers-championship",                         tourId: "R2026033" },
  "rbc-canadian-open-2026-picks":     { urlSlug: "rbc-canadian-open",                              tourId: "R2026037" },
  "us-open-2026-picks":               { urlSlug: "us-open",                                        tourId: "R2026026" },
  "john-deere-classic-2026-picks":    { urlSlug: "john-deere-classic",                             tourId: "R2026021" },
  "genesis-scottish-open-2026-picks": { urlSlug: "genesis-scottish-open",                          tourId: "R2026040" },
  "the-open-championship":            { urlSlug: "the-open-championship",                           tourId: "R2026100" },
  "rocket-classic-2026-picks":        { urlSlug: "rocket-mortgage-classic",                        tourId: "R2026030" },
  "wyndham-championship-2026-picks":  { urlSlug: "wyndham-championship",                           tourId: "R2026041" },
  "fedex-st-jude-championship-2026-picks": { urlSlug: "fedex-st-jude-championship",               tourId: "R2026042" },
  "bmw-championship-2026-picks":      { urlSlug: "bmw-championship",                               tourId: "R2026043" },
  "tour-championship-2026-picks":     { urlSlug: "tour-championship",                              tourId: "R2026060" },
  "charles-schwab-challenge-2026-picks": { urlSlug: "charles-schwab-challenge",                   tourId: "R2026020" },
};

async function tryPgaTourScrape(slug) {
  if (!slug) throw new Error("No slug");
  const entry = PGA_TOUR_MAP[slug];
  if (!entry) throw new Error(`No PGA Tour mapping for: ${slug}`);

  const url = `https://www.pgatour.com/tournaments/2026/${entry.urlSlug}/${entry.tourId}/field`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let html;
  try {
    const res = await fetch(url, {
      headers: { ...HEADERS, Accept: "text/html,application/xhtml+xml" },
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

  const nextData = JSON.parse(match[1]);
  const pp = nextData?.props?.pageProps ?? {};
  const fieldData = pp.tournamentFieldPlayers ?? pp.fieldPlayers ?? pp.players ?? pp.entries ?? [];

  if (!Array.isArray(fieldData) || !fieldData.length) throw new Error("No field array");

  const players = fieldData
    .filter((p) => {
      // Exclude alternates — they have isAlternate, status="ALT", or WD/WD status
      if (p.isAlternate || p.isWithdrawn) return false;
      const status = (p.status ?? p.playerStatus ?? "").toUpperCase();
      if (status === "ALT" || status === "WD" || status === "DQ") return false;
      return true;
    })
    .map((p) => p.displayName ?? p.playerName ?? ((p.firstName ?? "") + " " + (p.lastName ?? "")).trim())
    .filter((n) => n && n.trim().length > 2 && !n.includes("(a)")); // "(a)" = alternate in some feeds

  if (players.length < 10) throw new Error(`Only ${players.length} non-alternate players from scrape`);

  const name = pp.tournament?.name ?? pp.tournamentName ?? slug;
  return { tournament: name, players, source: "pgatour-scrape" };
}

// ── Get current tournament slug from schedule ─────────────────────────────────
async function getCurrentSlug() {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      "https://raw.githubusercontent.com/joeybukowski3/remix-of-bracket-brilliance/main/public/data/pga/schedule.json",
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const schedule = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    // Active tournament first
    const active = schedule.find((e) => e.startDate <= today && e.endDate >= today && e.status === "upcoming");
    if (active?.slug) return active.slug;
    // Otherwise next upcoming
    const next = schedule
      .filter((e) => e.status === "upcoming" && e.startDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    return next?.slug ?? null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
try {
  console.log("Fetching PGA current field...");
  const slug = await getCurrentSlug();
  console.log("Tournament slug:", slug ?? "(unknown)");

  let result = null;

  const strategies = [
    ["ESPN Scoreboard",    tryEspnScoreboard],
    ["ESPN Event Detail",  tryEspnEventDetail],
    ...(slug ? [["PGA Tour Scrape", () => tryPgaTourScrape(slug)]] : []),
  ];

  for (const [name, fn] of strategies) {
    try {
      console.log(`Trying ${name}...`);
      result = await fn();
      console.log(`✅ ${name}: ${result.players.length} players for "${result.tournament}"`);
      break;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
    }
  }

  if (!result || !result.players?.length || result.players.length < 10) {
    console.log("No usable field data found — skipping update.");
    process.exit(0);
  }

  result.players = [...new Set(result.players)].sort();
  result.fetchedAt = new Date().toISOString();

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(result, null, 2), "utf-8");
  console.log(`✅ Saved ${result.players.length} players → current-field.json`);
  process.exit(0);

} catch (err) {
  // Top-level safety net — log but NEVER fail the workflow
  console.error("Unexpected error (non-fatal):", err?.message ?? err);
  process.exit(0);
}
