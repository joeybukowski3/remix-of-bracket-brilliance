import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_RAW_DIR } from "../config/researchConfig";
import { COACHING_BACKFILL_START_SEASON } from "./config";
import type { CfbdResearchCoachRaw } from "./ingestion/types";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");

function loadCoaches(season: number): CfbdResearchCoachRaw[] {
  try {
    return JSON.parse(readFileSync(resolve(REPO_ROOT, CFB_RESEARCH_RAW_DIR, String(season), "coaches.json"), "utf8")) as CfbdResearchCoachRaw[];
  } catch {
    return [];
  }
}

/**
 * Section 10 — head coach by (team, season). CFBD's coach `teamId` uses
 * the same numeric team-id scheme as /teams (our externalTeamId), so no
 * name matching is needed. When a coaching change happens mid-season, the
 * row with the most games coached that year is kept (deterministic
 * tie-break: first in provider response order for equal games).
 */
export function buildCoachByTeamForSeason(season: number): Map<string, { coachId: number; name: string }> {
  const coaches = loadCoaches(season);
  const byTeam = new Map<string, { coachId: number; name: string; games: number }>();
  for (const coach of coaches) {
    for (const s of coach.seasons) {
      if (s.year !== season) continue;
      const teamId = String(s.teamId);
      const existing = byTeam.get(teamId);
      const games = s.games ?? 0;
      if (!existing || games > existing.games) {
        byTeam.set(teamId, { coachId: coach.id, name: `${coach.firstName} ${coach.lastName}`, games });
      }
    }
  }
  const result = new Map<string, { coachId: number; name: string }>();
  for (const [teamId, v] of byTeam) result.set(teamId, { coachId: v.coachId, name: v.name });
  return result;
}

export type CoachingContext = {
  newHeadCoach: boolean | null; // null when the prior season is outside the fetched backfill window (2018+) — never fabricated
  /** Floor, not true tenure: counts only consecutive fetched seasons (>= COACHING_BACKFILL_START_SEASON) with the same coach at this team. */
  tenureYearsObservedFloor: number;
};

export function buildCoachingContext(testSeasons: readonly number[]): Map<string, CoachingContext> {
  const byTeamBySeason = new Map<number, Map<string, { coachId: number; name: string }>>();
  const allSeasons = [...new Set(testSeasons)].sort((a, b) => a - b);
  for (const season of allSeasons) byTeamBySeason.set(season, buildCoachByTeamForSeason(season));

  const result = new Map<string, CoachingContext>();
  for (const season of allSeasons) {
    const current = byTeamBySeason.get(season)!;
    if (!byTeamBySeason.has(season - 1) && season - 1 >= COACHING_BACKFILL_START_SEASON) {
      byTeamBySeason.set(season - 1, buildCoachByTeamForSeason(season - 1));
    }
    const prevResolved = season - 1 >= COACHING_BACKFILL_START_SEASON ? byTeamBySeason.get(season - 1) : undefined;

    for (const [teamId, coach] of current) {
      const newHeadCoach = prevResolved ? prevResolved.get(teamId)?.coachId !== coach.coachId : null;

      let tenure = 1;
      let checkSeason = season - 1;
      while (checkSeason >= COACHING_BACKFILL_START_SEASON) {
        if (!byTeamBySeason.has(checkSeason)) byTeamBySeason.set(checkSeason, buildCoachByTeamForSeason(checkSeason));
        const priorCoach = byTeamBySeason.get(checkSeason)!.get(teamId);
        if (!priorCoach || priorCoach.coachId !== coach.coachId) break;
        tenure += 1;
        checkSeason -= 1;
      }

      result.set(`${season}:${teamId}`, { newHeadCoach, tenureYearsObservedFloor: tenure });
    }
  }
  return result;
}
