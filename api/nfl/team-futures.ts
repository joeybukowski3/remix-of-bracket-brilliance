import { NFL_GUIDE_TEAM_BY_ABBR } from "../../src/lib/nfl/guide2026.js";
import {
  getRecognizedTeamMarketCount,
  type PolymarketEvent,
} from "../../src/lib/nfl/superBowlMarkets.js";
import {
  extractNflFutureQuote,
  unavailableNflFutureQuote,
  type NflFutureQuote,
  type NflTeamFuturesResponse,
} from "../../src/lib/nfl/teamFutures.js";
import { NFL_TEAM_ABBRS } from "../../src/lib/nfl/teamSchedule.js";

const GAMMA_API = "https://gamma-api.polymarket.com";
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=600";

type CacheEntry = {
  response: NflTeamFuturesResponse;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();

function normalizeText(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

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

type DiscoveryConfig = {
  key: NflFutureQuote["key"];
  label: string;
  queries: string[];
  minimumTeams: number;
  titleMatches: (title: string) => boolean;
};

async function discoverQuote(team: string, config: DiscoveryConfig): Promise<NflFutureQuote> {
  const payloads = await Promise.all(
    config.queries.map((query) => fetchJson(`${GAMMA_API}/public-search?q=${encodeURIComponent(query)}`)),
  );

  const candidates = new Map<string, PolymarketEvent>();
  for (const payload of payloads) {
    for (const event of asEventList(payload)) {
      if (event.id == null || !event.active || event.closed || event.resolved) continue;
      const title = normalizeText(`${event.title ?? ""} ${event.slug ?? ""}`);
      if (!config.titleMatches(title)) continue;
      if (getRecognizedTeamMarketCount(event) < config.minimumTeams) continue;
      if (!extractNflFutureQuote(event, team, config.key, config.label)) continue;
      candidates.set(String(event.id), event);
    }
  }

  const selected = [...candidates.values()].sort((a, b) => {
    const teamCountDiff = getRecognizedTeamMarketCount(b) - getRecognizedTeamMarketCount(a);
    if (teamCountDiff !== 0) return teamCountDiff;
    return String(a.id).localeCompare(String(b.id));
  })[0];

  return selected
    ? extractNflFutureQuote(selected, team, config.key, config.label) ?? unavailableNflFutureQuote(config.key, config.label)
    : unavailableNflFutureQuote(config.key, config.label);
}

async function fetchTeamFutures(team: string): Promise<NflTeamFuturesResponse> {
  const guideTeam = NFL_GUIDE_TEAM_BY_ABBR.get(team);
  if (!guideTeam) throw new Error(`No NFL guide team found for ${team.toUpperCase()}`);

  const conference = guideTeam.division.slice(0, 3).toUpperCase();
  const division = guideTeam.division.toUpperCase();
  const conferenceToken = conference.toLowerCase();
  const divisionToken = division.toLowerCase();
  const winnerPattern = /(winner|champion|championship|win)/;

  const quotes = await Promise.all([
    discoverQuote(team, {
      key: "superBowl",
      label: "Super Bowl",
      queries: ["Super Bowl winner", "NFL champion"],
      minimumTeams: 28,
      titleMatches: (title) => /(super bowl|nfl champion)/.test(title) && winnerPattern.test(title),
    }),
    discoverQuote(team, {
      key: "conference",
      label: `${conference} champion`,
      queries: [`${conference} champion`, `${conference} winner`],
      minimumTeams: 12,
      titleMatches: (title) => title.includes(conferenceToken) && winnerPattern.test(title),
    }),
    discoverQuote(team, {
      key: "division",
      label: `${division} winner`,
      queries: [`${division} winner`, `win the ${division}`],
      minimumTeams: 4,
      titleMatches: (title) => title.includes(divisionToken) && winnerPattern.test(title),
    }),
  ]);

  return {
    source: "polymarket",
    team,
    updatedAt: new Date().toISOString(),
    quotes,
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const team = requestUrl.searchParams.get("team")?.trim().toLowerCase() ?? "";

  if (!NFL_TEAM_ABBRS.has(team)) {
    return Response.json(
      { error: "A valid NFL team abbreviation is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const now = Date.now();
  const cached = cache.get(team);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return Response.json(cached.response, { headers: { "Cache-Control": CACHE_HEADER } });
  }

  try {
    const response = await fetchTeamFutures(team);
    cache.set(team, { response, cachedAt: now });
    return Response.json(response, { headers: { "Cache-Control": CACHE_HEADER } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load NFL futures markets";
    console.error(`[api/nfl/team-futures] ${team}: ${message}`);

    if (cached) {
      return Response.json(
        { ...cached.response, stale: true },
        { headers: { "Cache-Control": CACHE_HEADER } },
      );
    }

    return Response.json(
      {
        source: "polymarket",
        team,
        updatedAt: new Date().toISOString(),
        quotes: [],
        error: message,
      },
      { status: 503, headers: { "Cache-Control": CACHE_HEADER } },
    );
  }
}
