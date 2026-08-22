import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_RAW_DIR } from "../config/researchConfig";
import type { CfbdResearchTeamRaw } from "../types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

/** Team display names ONLY (never used for any calculation) — sourced from raw teams.json, id -> school. */
export function loadTeamNames(season: number): Map<string, string> {
  const teams = JSON.parse(
    readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_RAW_DIR, String(season), "teams.json"), "utf8"),
  ) as CfbdResearchTeamRaw[];
  return new Map(teams.map((t) => [String(t.id), t.school]));
}
