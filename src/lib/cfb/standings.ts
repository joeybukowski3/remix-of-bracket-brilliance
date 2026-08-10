import type { CfbTeam } from "@/data/cfb/types";

/**
 * Conference standings utilities.
 *
 * Priority:
 * 1. Conference win percentage
 * 2. Conference wins
 * 3. Overall win percentage
 * 4. Overall wins
 * 5. JKB Power Rating (fallback; used fully in preseason when all conf records are 0-0)
 *
 * Does NOT implement official conference championship tiebreakers.
 */

export type ConferenceStandingRow = {
  team: CfbTeam;
  conferenceWins: number;
  conferenceLosses: number;
  conferenceTies: number;
  conferenceWinPct: number;
  overallWins: number;
  overallLosses: number;
  overallTies: number;
  overallWinPct: number;
  jkbPowerRating: number | null;
};

export function conferenceWinPct(w: number, l: number, t = 0): number {
  const games = w + l + t;
  if (games === 0) return 0;
  return (w + t * 0.5) / games;
}

export function overallWinPct(w: number, l: number, t = 0): number {
  return conferenceWinPct(w, l, t);
}

export function toStandingRow(team: CfbTeam): ConferenceStandingRow {
  const {
    conferenceWins,
    conferenceLosses,
    conferenceTies,
    wins,
    losses,
    ties,
  } = team.record;
  return {
    team,
    conferenceWins,
    conferenceLosses,
    conferenceTies,
    conferenceWinPct: conferenceWinPct(conferenceWins, conferenceLosses, conferenceTies),
    overallWins: wins,
    overallLosses: losses,
    overallTies: ties,
    overallWinPct: overallWinPct(wins, losses, ties),
    jkbPowerRating: team.ratings.jkbPowerRating,
  };
}

export function isPreseasonConferenceRecords(rows: ConferenceStandingRow[]): boolean {
  return rows.every(
    (r) => r.conferenceWins === 0 && r.conferenceLosses === 0 && r.conferenceTies === 0,
  );
}

/**
 * Sort conference teams for standings display.
 * Preseason (all 0-0 conf): JKB Power Rating descending.
 * In-season: conf win% → conf wins → overall win% → overall wins → JKB power.
 */
export function sortConferenceStandings(teams: CfbTeam[]): CfbTeam[] {
  const rows = teams.map(toStandingRow);
  const preseason = isPreseasonConferenceRecords(rows);

  const sorted = [...rows].sort((a, b) => {
    if (preseason) {
      const ap = a.jkbPowerRating ?? -Infinity;
      const bp = b.jkbPowerRating ?? -Infinity;
      if (bp !== ap) return bp - ap;
      return a.team.name.localeCompare(b.team.name);
    }

    if (b.conferenceWinPct !== a.conferenceWinPct) {
      return b.conferenceWinPct - a.conferenceWinPct;
    }
    if (b.conferenceWins !== a.conferenceWins) {
      return b.conferenceWins - a.conferenceWins;
    }
    if (b.overallWinPct !== a.overallWinPct) {
      return b.overallWinPct - a.overallWinPct;
    }
    if (b.overallWins !== a.overallWins) {
      return b.overallWins - a.overallWins;
    }
    const ap = a.jkbPowerRating ?? -Infinity;
    const bp = b.jkbPowerRating ?? -Infinity;
    if (bp !== ap) return bp - ap;
    return a.team.name.localeCompare(b.team.name);
  });

  return sorted.map((r) => r.team);
}
