import { getJkbTeamIdForCfbdName } from "../../../../data/cfb/externalTeamMapping";
import type {
  CfbdResearchReturningProductionRaw,
  CfbdResearchTalentRaw,
  CfbdResearchTeamRaw,
  CfbResearchTeamSeason,
} from "../types";

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * External CFBD team id is authoritative source identity; jkbTeamId is
 * best-effort and may be null for historical/unmapped programs (never
 * fabricated). Callers should log any unresolved jkbTeamId for the
 * research coverage manifest — this function does not throw on misses.
 */
export function normalizeResearchTeamSeason(
  season: number,
  teams: readonly CfbdResearchTeamRaw[],
  returningProduction: readonly CfbdResearchReturningProductionRaw[],
  talent: readonly CfbdResearchTalentRaw[],
): CfbResearchTeamSeason[] {
  const returningByName = new Map(
    returningProduction.map((row) => [normalizeKey(row.team), row] as const),
  );
  const talentByName = new Map(talent.map((row) => [normalizeKey(row.team), row] as const));

  return teams.map((team): CfbResearchTeamSeason => {
    const returning = returningByName.get(normalizeKey(team.school));
    const teamTalent = talentByName.get(normalizeKey(team.school));
    return {
      externalTeamId: String(team.id),
      jkbTeamId: getJkbTeamIdForCfbdName(team.school),
      season,
      conference: team.conference ?? null,
      classification: team.classification ?? null,
      returningProductionPercentPpa: returning ? finiteOrNull(returning.percentPPA) : null,
      returningProductionUsage: returning ? finiteOrNull(returning.usage) : null,
      talentComposite: teamTalent ? finiteOrNull(teamTalent.talent) : null,
    };
  });
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}
