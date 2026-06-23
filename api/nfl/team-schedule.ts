import {
  NFL_TEAM_ABBRS,
  normalizeNflSchedulePayload,
  type NflTeamScheduleResponse,
} from "../../src/lib/nfl/teamSchedule.js";

const ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const SEASON = 2026;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_HEADER = "public, s-maxage=1800, stale-while-revalidate=3600";

type CacheEntry = {
  response: NflTeamScheduleResponse;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();

async function fetchSchedule(team: string): Promise<NflTeamScheduleResponse> {
  const url = `${ESPN_API}/teams/${encodeURIComponent(team)}/schedule?season=${SEASON}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`ESPN schedule HTTP ${response.status}`);

  const payload = await response.json();
  const games = normalizeNflSchedulePayload(payload, team);
  if (games.length === 0) {
    throw new Error(`ESPN returned no 2026 regular-season games for ${team.toUpperCase()}`);
  }

  return {
    source: "espn",
    season: SEASON,
    team,
    updatedAt: new Date().toISOString(),
    games,
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
    const schedule = await fetchSchedule(team);
    cache.set(team, { response: schedule, cachedAt: now });
    return Response.json(schedule, { headers: { "Cache-Control": CACHE_HEADER } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the NFL schedule";
    console.error(`[api/nfl/team-schedule] ${team}: ${message}`);

    if (cached) {
      return Response.json(
        { ...cached.response, stale: true },
        { headers: { "Cache-Control": CACHE_HEADER } },
      );
    }

    return Response.json(
      {
        source: "espn",
        season: SEASON,
        team,
        updatedAt: new Date().toISOString(),
        games: [],
        error: message,
      },
      { status: 503, headers: { "Cache-Control": CACHE_HEADER } },
    );
  }
}
