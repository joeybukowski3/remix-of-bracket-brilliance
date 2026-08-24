import { fetchCfbdResearchJson, type CfbdResearchResponse } from "./cfbdClient";
import type { CfbdResearchLinesGameRaw } from "../types";

/** /lines accepts a year-only query (unlike /plays and /games/teams) — one call per season. */
export async function fetchLinesForSeason(
  season: number,
  apiKey: string,
): Promise<CfbdResearchResponse<CfbdResearchLinesGameRaw[]>> {
  return fetchCfbdResearchJson<CfbdResearchLinesGameRaw[]>(
    { name: `research-lines-${season}`, path: "/lines", query: { year: season } },
    apiKey,
  );
}
