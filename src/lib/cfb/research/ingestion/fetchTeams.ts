import { fetchCfbdResearchJson, type CfbdResearchResponse } from "./cfbdClient";
import type { CfbdResearchTeamRaw } from "../types";

/** One call per season; returns all classifications (not just FBS). */
export async function fetchTeamsForSeason(
  season: number,
  apiKey: string,
): Promise<CfbdResearchResponse<CfbdResearchTeamRaw[]>> {
  return fetchCfbdResearchJson<CfbdResearchTeamRaw[]>(
    { name: `research-teams-${season}`, path: "/teams", query: { year: season } },
    apiKey,
  );
}
