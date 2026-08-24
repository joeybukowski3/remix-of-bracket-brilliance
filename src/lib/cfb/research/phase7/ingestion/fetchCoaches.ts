import { fetchCfbdResearchJson, type CfbdResearchResponse } from "../../ingestion/cfbdClient";
import type { CfbdResearchCoachRaw } from "./types";

/** Section 10 — bulk (all-teams) coaching records for one season. */
export async function fetchCoachesForSeason(
  season: number,
  apiKey: string,
): Promise<CfbdResearchResponse<CfbdResearchCoachRaw[]>> {
  return fetchCfbdResearchJson<CfbdResearchCoachRaw[]>(
    { name: `research-phase7-coaches-${season}`, path: "/coaches", query: { year: season } },
    apiKey,
  );
}
