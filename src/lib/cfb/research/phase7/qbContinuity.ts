import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_RAW_DIR } from "../config/researchConfig";
import { QB_PRIMARY_USAGE_PASS_FLOOR } from "./config";
import { loadTeamNames } from "./teamNames";
import type { CfbdResearchPlayerUsageRaw } from "./ingestion/types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

export type PrimaryQb = { playerId: string; name: string; passShare: number } | null;

function loadQbUsage(season: number): CfbdResearchPlayerUsageRaw[] {
  try {
    return JSON.parse(
      readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_RAW_DIR, String(season), "player-usage-qb.json"), "utf8"),
    ) as CfbdResearchPlayerUsageRaw[];
  } catch {
    return [];
  }
}

/**
 * Section 7 — one primary QB per team per season, defined empirically as
 * the QB with the highest `usage.pass` share, provided it clears
 * QB_PRIMARY_USAGE_PASS_FLOOR (below that, no team has a clear starter —
 * reported as null, never fabricated). Team identity resolved by exact
 * school-name match against that season's raw teams.json (same convention
 * normalizeResearchTeamSeason.ts uses).
 */
export function buildPrimaryQbByTeam(season: number): Map<string, PrimaryQb> {
  const usage = loadQbUsage(season);
  const nameById = loadTeamNames(season);
  const idByName = new Map([...nameById.entries()].map(([id, name]) => [name.trim().toLowerCase(), id]));

  const byTeamName = new Map<string, CfbdResearchPlayerUsageRaw[]>();
  for (const row of usage) {
    const arr = byTeamName.get(row.team) ?? [];
    arr.push(row);
    byTeamName.set(row.team, arr);
  }

  const result = new Map<string, PrimaryQb>();
  for (const teamId of nameById.keys()) result.set(teamId, null);

  for (const [teamName, rows] of byTeamName) {
    const teamId = idByName.get(teamName.trim().toLowerCase());
    if (!teamId) continue; // unmatched team name — never fabricate an id
    const best = [...rows].sort((a, b) => b.usage.pass - a.usage.pass)[0];
    if (best && best.usage.pass >= QB_PRIMARY_USAGE_PASS_FLOOR) {
      result.set(teamId, { playerId: best.id, name: best.name, passShare: best.usage.pass });
    }
  }
  return result;
}

export type QbContinuityFeatures = {
  returningPrimaryQb: boolean | null; // null = insufficient data either season (never fabricated)
  newPrimaryQb: boolean | null;
  starterContinuity: boolean | null; // defined identically to returningPrimaryQb (Section 7: kept empirical, single definition)
  priorYearPassAttemptShare: number | null;
};

export function computeQbContinuityFeatures(
  priorSeasonPrimary: PrimaryQb,
  currentSeasonPrimary: PrimaryQb,
): QbContinuityFeatures {
  if (!priorSeasonPrimary || !currentSeasonPrimary) {
    return {
      returningPrimaryQb: null,
      newPrimaryQb: null,
      starterContinuity: null,
      priorYearPassAttemptShare: priorSeasonPrimary?.passShare ?? null,
    };
  }
  const returning = priorSeasonPrimary.playerId === currentSeasonPrimary.playerId;
  return {
    returningPrimaryQb: returning,
    newPrimaryQb: !returning,
    starterContinuity: returning,
    priorYearPassAttemptShare: priorSeasonPrimary.passShare,
  };
}
