import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_NORMALIZED_DIR } from "../config/researchConfig";
import type { CfbResearchTeamSeason } from "../types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

/** externalTeamId -> conference for one season, sourced from the already-normalized team-season.json (read-only). */
export function loadTeamConferenceById(season: number): Map<string, string | null> {
  const rows = JSON.parse(
    readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_NORMALIZED_DIR, String(season), "team-season.json"), "utf8"),
  ) as CfbResearchTeamSeason[];
  return new Map(rows.map((r) => [r.externalTeamId, r.conference]));
}
