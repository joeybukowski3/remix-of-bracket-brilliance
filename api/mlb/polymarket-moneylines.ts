import {
  normalizeMoneylineResponse,
  findMoneylineMarket,
  type PolymarketMlbEvent,
  type ScheduleGame,
  type MoneylineApiResponse,
} from "../../src/lib/mlb/polymarketMoneylines.js";

const GAMMA_API = "https://gamma-api.polymarket.com";
const MLB_SCHEDULE_API = "https://statsapi.mlb.com/api/v1/schedule";
const CACHE_TTL_MS = 60 * 1000; // 1 minute
const CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=120";

let cachedResponse: MoneylineApiResponse | null = null;
let cachedDate: string | null = null;
let cachedAtMs = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOperationalDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json();
}

// ---------------------------------------------------------------------------
// MLB Schedule
// ---------------------------------------------------------------------------

async function fetchMlbSchedule(date: string): Promise<ScheduleGame[]> {
  const url = `${MLB_SCHEDULE_API}?sportId=1&date=${date}&hydrate=team,probablePitcher`;
  const data = (await fetchJson(url)) as {
    dates?: Array<{
      games?: Array<{
        gamePk: number;
        gameDate: string;
        gameNumber?: number;
        status?: { detailedState?: string };
        venue?: { name?: string };
        teams?: {
          away?: {
            team?: { id?: number; name?: string; abbreviation?: string };
            probablePitcher?: { fullName?: string };
          };
          home?: {
            team?: { id?: number; name?: string; abbreviation?: string };
            probablePitcher?: { fullName?: string };
          };
        };
      }>;
    }>;
  };

  const games: ScheduleGame[] = [];
  for (const dateEntry of data.dates ?? []) {
    for (const game of dateEntry.games ?? []) {
      const away = game.teams?.away?.team;
      const home = game.teams?.home?.team;
      if (!away?.abbreviation || !home?.abbreviation) continue;

      games.push({
        gamePk: game.gamePk,
        gameDate: game.gameDate,
        status: game.status?.detailedState ?? "Unknown",
        venue: game.venue?.name ?? "Unknown",
        gameNumber: game.gameNumber ?? 1,
        away: {
          id: away.id ?? 0,
          name: away.name ?? "",
          abbreviation: away.abbreviation,
          probablePitcher: game.teams?.away?.probablePitcher?.fullName ?? null,
        },
        home: {
          id: home.id ?? 0,
          name: home.name ?? "",
          abbreviation: home.abbreviation,
          probablePitcher: game.teams?.home?.probablePitcher?.fullName ?? null,
        },
      });
    }
  }

  return games;
}

// ---------------------------------------------------------------------------
// Polymarket discovery
// ---------------------------------------------------------------------------

async function fetchPolymarketMlbEvents(date: string): Promise<PolymarketMlbEvent[]> {
  // Use the series_slug + event_date query which returns MLB game events
  const url = `${GAMMA_API}/events?series_slug=mlb&active=true&closed=false&limit=50&event_date=${date}`;

  try {
    const data = await fetchJson(url);
    if (!Array.isArray(data)) return [];
    return data as PolymarketMlbEvent[];
  } catch (error) {
    console.error("[api/mlb/polymarket-moneylines] Gamma API error:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date")?.trim();
  const date = dateParam && isValidDate(dateParam) ? dateParam : getOperationalDate();
  const isDev = process.env.NODE_ENV !== "production";

  // Check in-memory cache
  const now = Date.now();
  if (cachedResponse && cachedDate === date && now - cachedAtMs < CACHE_TTL_MS) {
    return Response.json(cachedResponse, {
      headers: { "Cache-Control": CACHE_HEADER },
    });
  }

  try {
    // Fetch schedule and Polymarket events in parallel
    const [scheduleGames, polymarketEvents] = await Promise.all([
      fetchMlbSchedule(date),
      fetchPolymarketMlbEvents(date),
    ]);

    const response = normalizeMoneylineResponse(
      polymarketEvents,
      scheduleGames,
      date,
      isDev,
    );

    // Cache successful response
    cachedResponse = response;
    cachedDate = date;
    cachedAtMs = now;

    console.log(
      `[api/mlb/polymarket-moneylines] ${date}: ${response.matchedCount}/${response.totalGames} matched`,
    );

    return Response.json(response, {
      headers: { "Cache-Control": CACHE_HEADER },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load Polymarket MLB moneylines";
    console.error("[api/mlb/polymarket-moneylines]", message);

    // Return stale cache if available
    if (cachedResponse && cachedDate === date) {
      return Response.json(
        { ...cachedResponse, stale: true },
        { headers: { "Cache-Control": CACHE_HEADER } },
      );
    }

    return Response.json(
      {
        source: "polymarket" as const,
        date,
        updatedAt: new Date().toISOString(),
        stale: false,
        matchedCount: 0,
        totalGames: 0,
        games: [],
        error: message,
      },
      { status: 503, headers: { "Cache-Control": CACHE_HEADER } },
    );
  }
}
