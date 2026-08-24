import { fetchCfbdResearchJson, type CfbdResearchResponse } from "./cfbdClient";
import type { CfbdResearchTalentRaw } from "../types";

export async function fetchTalentForSeason(
  season: number,
  apiKey: string,
): Promise<CfbdResearchResponse<CfbdResearchTalentRaw[]>> {
  return fetchCfbdResearchJson<CfbdResearchTalentRaw[]>(
    { name: `research-talent-${season}`, path: "/talent", query: { year: season } },
    apiKey,
  );
}
