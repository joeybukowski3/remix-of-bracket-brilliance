import { fetchCfbdResearchJson, type CfbdResearchResponse } from "./cfbdClient";
import type { CfbdResearchConferenceRaw } from "../types";

/** Conferences are not season-scoped in CFBD's API — fetch once and reuse across seasons. */
export async function fetchConferences(
  apiKey: string,
): Promise<CfbdResearchResponse<CfbdResearchConferenceRaw[]>> {
  return fetchCfbdResearchJson<CfbdResearchConferenceRaw[]>(
    { name: "research-conferences", path: "/conferences", query: {} },
    apiKey,
  );
}
