import { fetchCfbdResearchJson, type CfbdResearchResponse } from "../../ingestion/cfbdClient";
import type { CfbdResearchPlayerUsageRaw } from "./types";

/** Section 7 — bulk (all-teams) QB usage for one season; usage.pass is the primary signal for identifying a team's starter. */
export async function fetchQbUsageForSeason(
  season: number,
  apiKey: string,
): Promise<CfbdResearchResponse<CfbdResearchPlayerUsageRaw[]>> {
  return fetchCfbdResearchJson<CfbdResearchPlayerUsageRaw[]>(
    { name: `research-phase7-qb-usage-${season}`, path: "/player/usage", query: { year: season, position: "QB" } },
    apiKey,
  );
}
