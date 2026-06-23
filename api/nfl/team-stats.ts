import {
  normalizeNflTeamStats,
  type NflTeamStatsResponse,
} from "../../src/lib/nfl/teamStats.js";
import { NFL_TEAM_ABBRS } from "../../src/lib/nfl/teamSchedule.js";

const ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const SEASON = 2025 as const;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_HEADER = "public, s-maxage=21600, stale-while-revalidate=86400";

const ESPN_TEAM_IDS: Record<string, number> = {
  ari: 22, atl: 1, bal: 33, buf: 2, car: 29, chi: 3, cin: 4, cle: 5,
  dal: 6, den: 7, det: 8, gb: 9, hou: 34, ind: 11, jax: 30, kc: 12,
  lv: 13, lac: 24, lar: 14, mia: 15, min: 16, ne: 17, no: 18, nyg: 19,
  nyj: 20, phi: 21, pit: 23, sf: 25, sea: 26, tb: 27, ten: 10, wsh: 28,
};

type CacheEntry = {
  response: NflTeamStatsResponse;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();

async function fetchTeamStats(team: string): Promise<NflTeamStatsResponse> {
  const teamId = ESPN_TEAM_IDS[team];
  if (!teamId) throw new Error(`No ESPN team id configured for ${team.toUpperCase()}`);

  const response = await fetch(`${ESPN_API}/teams/${teamId}/statistics?season=${SEASON}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`ESPN statistics HTTP ${response.status}`);

  const payload = await response.json();
  const normalized = normalizeNflTeamStats(payload);
  if (normalized.offense.length < 5 || normalized.defense.length < 5) {
    throw new Error(`ESPN returned an incomplete 2025 statistics payload for ${team.toUpperCase()}`);
  }

  return {
    source: "espn",
    season: SEASON,
    team,
    updatedAt: new Date().toISOString(),
    ...normalized,
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
    const stats = await fetchTeamStats(team);
    cache.set(team, { response: stats, cachedAt: now });
    return Response.json(stats, { headers: { "Cache-Control": CACHE_HEADER } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load 2025 NFL team statistics";
    console.error(`[api/nfl/team-stats] ${team}: ${message}`);

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
        offense: [],
        defense: [],
        error: message,
      },
      { status: 503, headers: { "Cache-Control": CACHE_HEADER } },
    );
  }
}
