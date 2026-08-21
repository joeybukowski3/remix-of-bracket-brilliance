import { normalizeFantasyAvailability, type FantasyAvailabilityStatus } from "@/lib/fantasy/weekly/availability";
import { normalizeNflTeamAbbr, resolveCanonicalPlayerIdentity } from "@/lib/fantasy/weekly/identity";
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { FANTASY_SCORING_VERSION } from "@/lib/fantasy/weekly/scoring";
import { normalizeWeeklyUsage } from "@/lib/fantasy/weekly/usage";

export type HistoricalRosterWeek = {
  season: number;
  week: number;
  team: string;
  gsisId: string | null;
  pfrId: string | null;
  espnId: string | null;
  playerName: string;
  position: string;
  rosterStatus: string | null;
};

export type HistoricalInjuryWeek = {
  season: number;
  week: number;
  gsisId: string;
  reportStatus: string | null;
  practiceStatus: string | null;
};

export type HistoricalScheduleTeamWeek = {
  season: number;
  week: number;
  team: string;
  opponent: string;
};

export type HistoricalUniverseAudit = {
  rosterRows: number;
  includedRows: number;
  statOutcomeRows: number;
  eligibleZeroRows: number;
  excludedOut: number;
  excludedReserve: number;
  excludedByeOrMissingSchedule: number;
  excludedInactiveRoster: number;
  unresolvedIdentity: number;
  notOnInjuryReport: number;
};

function emptyHistoricalRow(
  roster: HistoricalRosterWeek,
  opponent: string,
): HistoricalPlayerWeek | null {
  const identity = resolveCanonicalPlayerIdentity({
    gsisId: roster.gsisId, pfrId: roster.pfrId, espnId: roster.espnId,
    playerName: roster.playerName, position: roster.position,
  });
  const team = normalizeNflTeamAbbr(roster.team);
  const normalizedOpponent = normalizeNflTeamAbbr(opponent);
  if (!identity.resolved || !team || !normalizedOpponent) return null;
  return {
    season: roster.season, week: roster.week,
    playerId: identity.identity.playerId, playerName: identity.identity.playerName,
    position: identity.identity.position, team, opponent: normalizedOpponent,
    externalIds: identity.identity.externalIds, actualFantasyPoints: 0,
    stats: {
      passAttempts: 0, completions: 0, passingYards: 0, passingTouchdowns: 0, interceptions: 0,
      rushAttempts: 0, rushingYards: 0, rushingTouchdowns: 0, receptions: 0, targets: 0,
      receivingYards: 0, receivingTouchdowns: 0, sackFumblesLost: 0, rushingFumblesLost: 0,
      receivingFumblesLost: 0, fumblesLost: 0, passingTwoPointConversions: 0,
      rushingTwoPointConversions: 0, receivingTwoPointConversions: 0, specialTeamsTouchdowns: 0,
    },
    usage: normalizeWeeklyUsage({
      passAttempts: 0, completions: 0, rushAttempts: 0, targets: 0, receptions: 0,
    }),
    provenance: {
      source: "nflverse weekly roster eligible zero",
      sourceSeason: roster.season, sourceWeek: roster.week,
      scoringVersion: FANTASY_SCORING_VERSION, snapSource: null,
    },
  };
}

export function buildHistoricalRankingUniverse(input: {
  outcomes: readonly HistoricalPlayerWeek[];
  rosters: readonly HistoricalRosterWeek[];
  injuries: readonly HistoricalInjuryWeek[];
  schedule: readonly HistoricalScheduleTeamWeek[];
}): { rows: HistoricalPlayerWeek[]; availability: Map<string, FantasyAvailabilityStatus>; audit: HistoricalUniverseAudit } {
  const outcomeByKey = new Map(input.outcomes.map((row) => [`${row.season}|${row.week}|${row.playerId}`, row]));
  const injuryByKey = new Map(input.injuries.map((row) => [`${row.season}|${row.week}|${row.gsisId}`, row]));
  const scheduleByKey = new Map(input.schedule.map((row) => [
    `${row.season}|${row.week}|${normalizeNflTeamAbbr(row.team)}`, normalizeNflTeamAbbr(row.opponent),
  ]));
  const rows: HistoricalPlayerWeek[] = [];
  const availability = new Map<string, FantasyAvailabilityStatus>();
  const audit: HistoricalUniverseAudit = {
    rosterRows: input.rosters.length, includedRows: 0, statOutcomeRows: 0, eligibleZeroRows: 0,
    excludedOut: 0, excludedReserve: 0, excludedByeOrMissingSchedule: 0,
    excludedInactiveRoster: 0, unresolvedIdentity: 0, notOnInjuryReport: 0,
  };
  const seen = new Set<string>();

  for (const roster of input.rosters) {
    const rosterStatus = String(roster.rosterStatus ?? "").toUpperCase();
    if (rosterStatus === "RES") {
      audit.excludedReserve += 1;
      continue;
    }
    if (rosterStatus !== "ACT") {
      audit.excludedInactiveRoster += 1;
      continue;
    }
    const identity = resolveCanonicalPlayerIdentity({
      gsisId: roster.gsisId, pfrId: roster.pfrId, espnId: roster.espnId,
      playerName: roster.playerName, position: roster.position,
    });
    if (!identity.resolved) {
      audit.unresolvedIdentity += 1;
      continue;
    }
    const team = normalizeNflTeamAbbr(roster.team);
    const opponent = scheduleByKey.get(`${roster.season}|${roster.week}|${team}`) ?? null;
    if (!team || !opponent) {
      audit.excludedByeOrMissingSchedule += 1;
      continue;
    }
    const injury = injuryByKey.get(`${roster.season}|${roster.week}|${identity.identity.externalIds.gsis}`);
    if (!injury) audit.notOnInjuryReport += 1;
    const normalizedAvailability = normalizeFantasyAvailability({
      gameStatus: injury?.reportStatus,
      rosterStatus: roster.rosterStatus,
      practiceStatus: injury?.practiceStatus,
      sourceSeason: injury ? roster.season : null,
      sourceWeek: injury ? roster.week : null,
      sourceAsOf: null,
    }, { season: roster.season, week: roster.week });
    if (normalizedAvailability.status === "out") {
      audit.excludedOut += 1;
      continue;
    }
    if (normalizedAvailability.status === "reserve") {
      audit.excludedReserve += 1;
      continue;
    }
    const key = `${roster.season}|${roster.week}|${identity.identity.playerId}`;
    if (seen.has(key)) throw new Error(`Duplicate pregame universe identity ${key}.`);
    seen.add(key);
    const outcome = outcomeByKey.get(key) ?? emptyHistoricalRow(roster, opponent);
    if (!outcome) {
      audit.unresolvedIdentity += 1;
      continue;
    }
    rows.push(outcome);
    availability.set(key, normalizedAvailability.status);
    audit.includedRows += 1;
    if (outcome.provenance.source === "nflverse stats_player weekly") audit.statOutcomeRows += 1;
    else audit.eligibleZeroRows += 1;
  }

  rows.sort((a, b) => a.season - b.season || a.week - b.week || a.position.localeCompare(b.position) || a.playerId.localeCompare(b.playerId));
  return { rows, availability, audit };
}
