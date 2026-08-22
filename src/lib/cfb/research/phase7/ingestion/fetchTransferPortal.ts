import { fetchCfbdResearchJson, type CfbdResearchResponse } from "../../ingestion/cfbdClient";
import type { CfbdResearchTransferPortalRaw } from "./types";

/** Section 9 — bulk transfer-portal entries for one season. CFBD's coverage is empty before 2021 (verified empirically). */
export async function fetchTransferPortalForSeason(
  season: number,
  apiKey: string,
): Promise<CfbdResearchResponse<CfbdResearchTransferPortalRaw[]>> {
  return fetchCfbdResearchJson<CfbdResearchTransferPortalRaw[]>(
    { name: `research-phase7-transfer-portal-${season}`, path: "/player/portal", query: { year: season } },
    apiKey,
  );
}
