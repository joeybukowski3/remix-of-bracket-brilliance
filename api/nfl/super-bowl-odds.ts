import {
  normalizeSuperBowlEvent,
  type PolymarketEvent,
  validateSuperBowlEvent,
} from "../../src/lib/nfl/superBowlMarkets.js";

const GAMMA_API = "https://gamma-api.polymarket.com";
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=300";

type SuperBowlOddsResponse = {
  source: "polymarket";
  eventId: string;
  eventTitle: string;
  eventSlug: string | null;
  updatedAt: string;
  stale?: boolean;
  teams: ReturnType<typeof normalizeSuperBowlEvent>["teams"];
  diagnostics?: { unmatchedMarketTitles: string[] };
};

let cachedResponse: SuperBowlOddsResponse | null = null;
let cachedAtMs = 0;

function asEventList(payload: unknown): PolymarketEvent[] {
  if (Array.isArray(payload)) return payload as PolymarketEvent[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { events?: unknown }).events)) {
    return (payload as { events: PolymarketEvent[] }).events;
  }
  return [];
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Polymarket HTTP ${response.status}`);
  return response.json();
}

async function fetchEventById(eventId: string): Promise<PolymarketEvent> {
  const payload = await fetchJson(`${GAMMA_API}/events/${encodeURIComponent(eventId)}`);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("configured Polymarket event was malformed");
  return payload as PolymarketEvent;
}

async function discoverEvent(): Promise<PolymarketEvent> {
  const searchTerms = ["Super Bowl winner", "win the Super Bowl", "NFL champion"];
  const results = await Promise.all(
    searchTerms.map((query) => fetchJson(`${GAMMA_API}/public-search?q=${encodeURIComponent(query)}`)),
  );

  const candidates = new Map<string, PolymarketEvent>();
  for (const payload of results) {
    for (const event of asEventList(payload)) {
      const reason = validateSuperBowlEvent(event);
      if (!reason && event.id != null) candidates.set(String(event.id), event);
    }
  }

  if (candidates.size === 0) throw new Error("No active, unresolved Super Bowl winner event with 28 recognizable NFL teams was found");
  if (candidates.size > 1) throw new Error(`Multiple plausible Super Bowl winner events found (${candidates.size}); set POLYMARKET_SUPER_BOWL_EVENT_ID to select one`);
  return [...candidates.values()][0];
}

function buildResponse(event: PolymarketEvent): SuperBowlOddsResponse {
  const reason = validateSuperBowlEvent(event);
  if (reason) throw new Error(`Polymarket event validation failed: ${reason}`);

  const normalized = normalizeSuperBowlEvent(event);
  const response: SuperBowlOddsResponse = {
    source: "polymarket",
    eventId: String(event.id),
    eventTitle: event.title ?? "Super Bowl winner",
    eventSlug: event.slug ?? null,
    updatedAt: new Date().toISOString(),
    teams: normalized.teams,
  };

  if (process.env.NODE_ENV !== "production" && normalized.unmatchedMarketTitles.length > 0) {
    response.diagnostics = { unmatchedMarketTitles: normalized.unmatchedMarketTitles };
  }

  return response;
}

export async function GET() {
  const now = Date.now();
  if (cachedResponse && now - cachedAtMs < CACHE_TTL_MS) {
    return Response.json(cachedResponse, { headers: { "Cache-Control": CACHE_HEADER } });
  }

  try {
    const configuredId = process.env.POLYMARKET_SUPER_BOWL_EVENT_ID?.trim();
    const event = configuredId ? await fetchEventById(configuredId) : await discoverEvent();
    const response = buildResponse(event);

    cachedResponse = response;
    cachedAtMs = now;
    console.log(`[api/nfl/super-bowl-odds] Polymarket event ${response.eventId}: ${response.teams.filter((team) => team.price != null).length} prices`);
    return Response.json(response, { headers: { "Cache-Control": CACHE_HEADER } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Polymarket Super Bowl odds";
    console.error("[api/nfl/super-bowl-odds]", message);

    if (cachedResponse) {
      return Response.json(
        { ...cachedResponse, stale: true },
        { headers: { "Cache-Control": CACHE_HEADER } },
      );
    }

    return Response.json(
      { source: "polymarket", teams: [], updatedAt: new Date().toISOString(), error: message },
      { status: 503, headers: { "Cache-Control": CACHE_HEADER } },
    );
  }
}
