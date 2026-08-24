import { fetchCfbdResearchJson, type CfbdResearchResponse } from "./cfbdClient";
import type { CfbdResearchGameRaw } from "../types";

/** One call per season returns both regular and postseason games. */
export async function fetchGamesForSeason(
  season: number,
  apiKey: string,
): Promise<CfbdResearchResponse<CfbdResearchGameRaw[]>> {
  return fetchCfbdResearchJson<CfbdResearchGameRaw[]>(
    { name: `research-games-${season}`, path: "/games", query: { year: season } },
    apiKey,
  );
}
