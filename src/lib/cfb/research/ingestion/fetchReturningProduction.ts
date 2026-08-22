import { fetchCfbdResearchJson, type CfbdResearchResponse } from "./cfbdClient";
import type { CfbdResearchReturningProductionRaw } from "../types";

export async function fetchReturningProductionForSeason(
  season: number,
  apiKey: string,
): Promise<CfbdResearchResponse<CfbdResearchReturningProductionRaw[]>> {
  return fetchCfbdResearchJson<CfbdResearchReturningProductionRaw[]>(
    { name: `research-returning-production-${season}`, path: "/player/returning", query: { year: season } },
    apiKey,
  );
}
