import { resolve } from "node:path";
import {
  CFB_TRANSITION_TEAM_PRIOR_FALLBACKS,
  type CfbdGame,
  type CfbdGameTeamStats,
  type CfbdTransitionTeamCache,
} from "../src/lib/cfb/pipeline";
import { fetchCfbdJson, sha256, writeAtomic } from "./lib/cfb-cfbd-client";

const ROOT = resolve(import.meta.dirname, "..");
const RAW_DIR = resolve(ROOT, "data", "cfb", "cfbd", "raw");
const CACHE_FILENAME = "transition-teams-2025.json";
const MANIFEST_FILENAME = "transition-teams-2025.manifest.json";
const API_KEY = process.env.CFBD_API_KEY?.trim();

async function main() {
  if (!API_KEY) {
    throw new Error("CFBD_API_KEY is required. No transition-team cache files were written.");
  }

  const fetchedAt = new Date().toISOString();
  const teams: CfbdTransitionTeamCache["teams"] = [];
  const requests: Array<Record<string, unknown>> = [];
  let remainingCalls: string | null = null;

  for (const transitionTeam of CFB_TRANSITION_TEAM_PRIOR_FALLBACKS) {
    const gamesResponse = await fetchCfbdJson<CfbdGame[]>(
      {
        name: `transition-${transitionTeam.teamId}-games-2025`,
        path: "/games",
        query: { year: 2025, team: transitionTeam.cfbdName },
      },
      API_KEY,
    );
    const statsResponse = await fetchCfbdJson<CfbdGameTeamStats[]>(
      {
        name: `transition-${transitionTeam.teamId}-team-stats-2025`,
        path: "/games/teams",
        query: { year: 2025, team: transitionTeam.cfbdName },
      },
      API_KEY,
    );
    remainingCalls = statsResponse.remainingCalls;

    const gameIds = new Set(gamesResponse.data.map((game) => game.id));
    const unexpectedStats = statsResponse.data.filter((game) => !gameIds.has(game.id));
    if (unexpectedStats.length > 0) {
      throw new Error(
        `${transitionTeam.cfbdName}: ${unexpectedStats.length} team-stat games lack matching game metadata`,
      );
    }

    teams.push({
      teamId: transitionTeam.teamId,
      team: transitionTeam.cfbdName,
      sourceClassification: transitionTeam.sourceClassification,
      games: gamesResponse.data,
      teamStats: statsResponse.data,
    });
    requests.push(
      {
        teamId: transitionTeam.teamId,
        endpoint: "/games",
        requestUrl: gamesResponse.url,
        rowCount: gamesResponse.data.length,
      },
      {
        teamId: transitionTeam.teamId,
        endpoint: "/games/teams",
        requestUrl: statsResponse.url,
        rowCount: statsResponse.data.length,
      },
    );
    console.log(
      `[cfb:fetch-transition-teams] ${transitionTeam.cfbdName}: ` +
        `${gamesResponse.data.length} games; ${statsResponse.data.length} team-stat games`,
    );
  }

  const cache: CfbdTransitionTeamCache = {
    schemaVersion: "jkb-cfbd-transition-team-cache-v1",
    provider: "CollegeFootballData.com API v2",
    season: 2025,
    fetchedAt,
    teams,
  };
  const cacheText = `${JSON.stringify(cache, null, 2)}\n`;
  const cacheHash = sha256(cacheText);
  const manifestText = `${JSON.stringify(
    {
      schemaVersion: "jkb-cfbd-transition-team-manifest-v1",
      provider: cache.provider,
      authentication: "Bearer CFBD_API_KEY (credential not stored)",
      fetchedAt,
      filename: CACHE_FILENAME,
      byteSize: Buffer.byteLength(cacheText),
      sha256: cacheHash,
      requestCount: requests.length,
      requests,
    },
    null,
    2,
  )}\n`;

  writeAtomic(resolve(RAW_DIR, CACHE_FILENAME), cacheText);
  writeAtomic(resolve(RAW_DIR, MANIFEST_FILENAME), manifestText);
  console.log(
    `[cfb:fetch-transition-teams] wrote ${CACHE_FILENAME}; sha256 ${cacheHash}` +
      (remainingCalls ? `; ${remainingCalls} calls remaining` : ""),
  );
}

main().catch((error) => {
  console.error(`[cfb:fetch-transition-teams] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});
