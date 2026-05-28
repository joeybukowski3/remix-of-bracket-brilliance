/**
 * fetch-pga-current-field.mjs
 *
 * Fetches the current PGA Tour tournament field from ESPN's API.
 * Saves to public/data/pga/current-field.json
 *
 * Sources (tried in order):
 *   1. ESPN scoreboard → competitors (works Thu–Sun during event)
 *   2. ESPN event entry list endpoint
 *   3. PGA Tour website __NEXT_DATA__ scrape (fallback)
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, "../public/data/pga/current-field.json");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchJson(url, extra = {}) {
  const res = await fetch(url, { headers: { ...HEADERS, ...extra }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// ── Strategy 1: ESPN Golf Scoreboard ─────────────────────────────────────────
// Returns the current/active PGA Tour event with all competitors
async function fetchFromEspnScoreboard() {
  const data = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard");
  const events = data?.events ?? [];
  if (!events.length) throw new Error("No events in ESPN scoreboard");

  // Find the PGA Tour event (not Champions/LPGA)
  const pgaEvent = events.find((e) =>
    e.leagues?.some((l) => l.abbreviation === "PGA" || l.slug === "pga")
    ?? true // if no league filter available just use first
  ) ?? events[0];

  const name = pgaEvent.name ?? pgaEvent.shortName ?? "Unknown";
  const competitions = pgaEvent.competitions ?? [];
  if (!competitions.length) throw new Error("No competitions in ESPN event");

  const comp = competitions[0];
  const competitors = comp.competitors ?? [];

  const players = competitors
    .map((c) => c.athlete?.displayName ?? c.athlete?.fullName)
    .filter(Boolean);

  if (players.length < 10) throw new Error(`Too few competitors: ${players.length}`);

  return { tournament: name, players, source: "espn-scoreboard", fetchedAt: new Date().toISOString() };
}

// ── Strategy 2: ESPN event competitors via Core API ──────────────────────────
async function fetchFromEspnCoreApi() {
  // First get the current event ID
  const scoreboard = await fetchJson("https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard");
  const eventId = scoreboard?.events?.[0]?.id;
  if (!eventId) throw new Error("No event ID found");

  const eventName = scoreboard.events[0]?.name ?? "Unknown";

  // Fetch all competitors paginated
  let players = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${eventId}/competitions/${eventId}/competitors?limit=200&page=${page}`;
    const data = await fetchJson(url);
    totalPages = data.pageCount ?? 1;

    for (const item of data.items ?? []) {
      // Each item has a $ref to the athlete — resolve it
      if (item.athlete?.$ref) {
        try {
          const athlete = await fetchJson(item.athlete.$ref);
          const name = athlete.displayName ?? athlete.fullName;
          if (name) players.push(name);
        } catch {
          // skip individual failures
        }
      } else if (item.athlete?.displayName) {
        players.push(item.athlete.displayName);
      }
    }
    page++;
  } while (page <= Math.min(totalPages, 5)); // cap at 5 pages

  if (players.length < 10) throw new Error(`Too few players from core API: ${players.length}`);

  return { tournament: eventName, players, source: "espn-core", fetchedAt: new Date().toISOString() };
}

// ── Strategy 3: PGA Tour website __NEXT_DATA__ scrape ────────────────────────
async function fetchFromPgaTourWebsite(tournamentSlug, pgaTourYear = 2026) {
  // Common PGA Tour tournament IDs (2026 season)
  const TOURNAMENT_IDS = {
    "charles-schwab-challenge": "R2026020",
    "the-memorial-tournament": "R2026032",
    "travelers-championship": "R2026033",
    "rbc-canadian-open": "R2026037",
    "rocket-mortgage-classic": "R2026030",
    "3m-open": "R2026034",
    "john-deere-classic": "R2026021",
  };

  const tourId = TOURNAMENT_IDS[tournamentSlug];
  if (!tourId) throw new Error(`No PGA Tour ID mapped for: ${tournamentSlug}`);

  const url = `https://www.pgatour.com/tournaments/${pgaTourYear}/${tournamentSlug}/${tourId}/field`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`PGA Tour page HTTP ${res.status}`);

  const html = await res.text();

  // Extract __NEXT_DATA__ JSON blob
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("No __NEXT_DATA__ found on PGA Tour page");

  const nextData = JSON.parse(match[1]);

  // Walk the props tree to find field entries
  const fieldData =
    nextData?.props?.pageProps?.tournamentFieldPlayers
    ?? nextData?.props?.pageProps?.fieldPlayers
    ?? nextData?.props?.pageProps?.players;

  if (!Array.isArray(fieldData) || !fieldData.length) throw new Error("No field array in __NEXT_DATA__");

  const players = fieldData
    .map((p) => p.displayName ?? p.playerName ?? p.firstName + " " + p.lastName)
    .filter(Boolean);

  const name = nextData?.props?.pageProps?.tournament?.name
    ?? nextData?.props?.pageProps?.tournamentName
    ?? tournamentSlug;

  return { tournament: name, players, source: "pgatour-website", fetchedAt: new Date().toISOString() };
}

// ── Read schedule to find current tournament slug ─────────────────────────────
async function getCurrentTournamentSlug() {
  try {
    const scheduleRes = await fetch("https://raw.githubusercontent.com/joeybukowski3/remix-of-bracket-brilliance/main/public/data/pga/schedule.json");
    if (!scheduleRes.ok) return null;
    const schedule = await scheduleRes.json();

    const today = new Date().toISOString().slice(0, 10);
    const active = schedule.find((e) => e.startDate <= today && e.endDate >= today && e.status === "upcoming");
    if (active) return active.slug;

    const upcoming = schedule
      .filter((e) => e.status === "upcoming" && e.startDate > today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return upcoming[0]?.slug ?? null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Fetching PGA Tour current field...");

  const tournamentSlug = await getCurrentTournamentSlug();
  console.log("Current tournament slug:", tournamentSlug ?? "(unknown)");

  let result = null;

  // Try strategies in order
  const strategies = [
    { name: "ESPN Scoreboard", fn: fetchFromEspnScoreboard },
    { name: "ESPN Core API", fn: fetchFromEspnCoreApi },
    ...(tournamentSlug ? [{ name: "PGA Tour Website", fn: () => fetchFromPgaTourWebsite(tournamentSlug) }] : []),
  ];

  for (const { name, fn } of strategies) {
    try {
      console.log(`Trying: ${name}...`);
      result = await fn();
      console.log(`✅ ${name} → ${result.players.length} players for "${result.tournament}"`);
      break;
    } catch (err) {
      console.warn(`  ❌ ${name}: ${err.message}`);
    }
  }

  if (!result || result.players.length < 10) {
    console.error("All strategies failed or returned too few players. Not updating current-field.json.");
    process.exit(0); // exit 0 so the workflow doesn't fail
  }

  // Deduplicate and sort
  result.players = [...new Set(result.players)].sort();

  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(result, null, 2), "utf-8");
  console.log(`✅ Saved ${result.players.length} players to current-field.json`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
