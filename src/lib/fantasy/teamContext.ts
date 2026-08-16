/**
 * Team-context fallback for board rows with no JKB workbook match.
 *
 * A player can hold an approved PAR row while having no row in the JKB
 * workbook. Their player-level evidence metrics are then genuinely unavailable,
 * but the team-level fields are not: any teammate's row carries them.
 *
 * Two different scopes are involved, verified against the workbook:
 *   - O-line rank and the three playoff-week opponents are TEAM level. Every
 *     row on a team agrees, so any teammate can supply them.
 *   - Strength of schedule is POSITIONAL — it varies by position within a team
 *     (30 of 32 teams disagree across positions) and is constant only within a
 *     (team, position) pair. It is therefore borrowed only from a teammate at
 *     the same position, and left undefined when there is no such teammate.
 *
 * The fallback is a last resort: a row that matched the workbook directly or
 * through the curated alias list always keeps its own values untouched.
 */

import type { FantasyPosition, FantasyRankingRow } from "@/lib/fantasy/rankings";

export type TeamContext = {
  strengthOfSchedule?: number;
  offensiveLineRank?: number;
  playoffWeek15Opponent?: string;
  playoffWeek16Opponent?: string;
  playoffWeek17Opponent?: string;
  /** Set only when values were borrowed; names the teammate row they came from. */
  borrowedFrom?: string;
  /** Set only when the positional SOS was borrowed from a same-position teammate. */
  sosBorrowedFrom?: string;
};

export type TeamContextIndex = {
  byTeam: ReadonlyMap<string, FantasyRankingRow>;
  byTeamPosition: ReadonlyMap<string, FantasyRankingRow>;
};

function teamPositionKey(team: string, position: FantasyPosition): string {
  return `${team}:${position}`;
}

/**
 * Indexes the best-ranked donor row per team and per (team, position). Keying on
 * the best overall rank keeps the choice of donor deterministic.
 */
export function buildTeamContextIndex(
  rows: readonly FantasyRankingRow[],
): TeamContextIndex {
  const byTeam = new Map<string, FantasyRankingRow>();
  const byTeamPosition = new Map<string, FantasyRankingRow>();

  for (const row of [...rows].sort((a, b) => a.overallRank - b.overallRank)) {
    if (!row.team) continue;
    if (!byTeam.has(row.team)) byTeam.set(row.team, row);
    const key = teamPositionKey(row.team, row.position);
    if (!byTeamPosition.has(key)) byTeamPosition.set(key, row);
  }

  return { byTeam, byTeamPosition };
}

/**
 * Resolves the five team-context fields for one board row.
 *
 * When `jkb` is present the row matched the workbook, so its own values are
 * returned verbatim and no borrowing happens.
 */
export function resolveTeamContext(
  jkb: FantasyRankingRow | undefined,
  team: string | undefined,
  position: FantasyPosition,
  index: TeamContextIndex,
): TeamContext {
  if (jkb) {
    return {
      strengthOfSchedule: jkb.strengthOfSchedule,
      offensiveLineRank: jkb.offensiveLineRank,
      playoffWeek15Opponent: jkb.playoffWeek15Opponent,
      playoffWeek16Opponent: jkb.playoffWeek16Opponent,
      playoffWeek17Opponent: jkb.playoffWeek17Opponent,
    };
  }

  const normalizedTeam = team?.toLowerCase();
  if (!normalizedTeam) return {};

  const teamDonor = index.byTeam.get(normalizedTeam);
  const positionDonor = index.byTeamPosition.get(teamPositionKey(normalizedTeam, position));
  if (!teamDonor) return {};

  return {
    // Positional: only a same-position teammate is a valid source.
    strengthOfSchedule: positionDonor?.strengthOfSchedule,
    offensiveLineRank: teamDonor.offensiveLineRank,
    playoffWeek15Opponent: teamDonor.playoffWeek15Opponent,
    playoffWeek16Opponent: teamDonor.playoffWeek16Opponent,
    playoffWeek17Opponent: teamDonor.playoffWeek17Opponent,
    borrowedFrom: teamDonor.player,
    sosBorrowedFrom: positionDonor?.player,
  };
}
