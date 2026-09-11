/**
 * WU2.1 -- canonical player/coach subject-identity validation for external
 * NFL evidence. Runs inside normalizeExternalEvidence() (see
 * nfl-evidence-normalizer.ts) alongside the existing team-subject check.
 *
 * Reuses the repo's existing name-normalization engines rather than building
 * a new one:
 *   - normalizeNflPropName (nfl-prop-name-normalizer.mjs) -- the same
 *     diacritic/suffix-insensitive matcher already used for roster/provider
 *     player-name resolution (nfl-roster-identity.mjs).
 *   - normalizeCoachName (nfl-coach-core.mjs) -- the same coach display-name
 *     normalization already used for coaching-rating tenure derivation.
 *
 * Pure/deterministic; no I/O. Callers build a SubjectIdentitySource from
 * whatever authoritative data they already have on hand (nflverse weekly
 * rosters, depth charts, public/data/nfl/coaching-ratings.json) and pass it
 * in via EvidenceNormalizationContext.subjectIdentity.
 */

import { normalizeNflPropName } from "./nfl-prop-name-normalizer.mjs";
import { normalizeCoachName } from "./nfl-coach-core.mjs";
import type {
  CoachSubjectValidation,
  EvidenceSubjectValidation,
  PlayerSubjectValidation,
  SubjectIdentitySource,
  SubjectValidationStatus,
} from "./nfl-evidence-types";

interface GameTeams {
  homeTeam: string;
  awayTeam: string;
}

function normalizedPlayerKey(name: string): string {
  return normalizeNflPropName(name);
}

function normalizedCoachKey(name: string): string {
  return normalizeCoachName(name).toLowerCase();
}

function validatePlayerSubject(rawInput: string, gameTeams: GameTeams, source: SubjectIdentitySource | null): PlayerSubjectValidation {
  const unresolved = (reason: string): PlayerSubjectValidation => ({
    input: rawInput,
    status: "unresolved",
    canonicalPlayerId: null,
    canonicalName: null,
    team: null,
    reason,
  });

  if (!source || source.players.length === 0) {
    return unresolved("roster_source_unavailable");
  }

  const key = normalizedPlayerKey(rawInput);
  if (!key) {
    return unresolved("empty_subject");
  }

  const matches = source.players.filter((entry) => normalizedPlayerKey(entry.canonicalName) === key);
  if (matches.length === 0) {
    return unresolved("not_found_in_roster_source");
  }

  const gameTeamSet = new Set([gameTeams.homeTeam, gameTeams.awayTeam]);
  const inGameMatches = matches.filter((entry) => gameTeamSet.has(entry.team));

  if (inGameMatches.length === 0) {
    // Conclusively rostered, but on neither of this game's two teams.
    const unrelatedTeam = matches[0].team;
    return {
      input: rawInput,
      status: "rejected",
      canonicalPlayerId: null,
      canonicalName: null,
      team: unrelatedTeam,
      reason: `rostered_on_unrelated_team:${unrelatedTeam}`,
    };
  }

  // Multiple rows for the SAME player (e.g. present in both the weekly
  // roster and depth chart, or duplicated within one source) collapse to a
  // single candidate here -- only a genuine second, distinct playerId counts
  // as ambiguity (same-name-different-person, on either team in this game).
  const distinctPlayersById = new Map<string, (typeof inGameMatches)[number]>();
  for (const entry of inGameMatches) {
    if (!distinctPlayersById.has(entry.playerId)) distinctPlayersById.set(entry.playerId, entry);
  }
  if (distinctPlayersById.size > 1) {
    return {
      input: rawInput,
      status: "conflicting",
      canonicalPlayerId: null,
      canonicalName: null,
      team: null,
      reason: "ambiguous_multiple_players_in_game",
    };
  }

  const match = [...distinctPlayersById.values()][0];
  return {
    input: rawInput,
    status: "confirmed",
    canonicalPlayerId: match.playerId,
    canonicalName: match.canonicalName,
    team: match.team,
    reason: "matched_roster_in_game",
  };
}

function validateCoachSubject(rawInput: string, gameTeams: GameTeams, source: SubjectIdentitySource | null): CoachSubjectValidation {
  const unresolved = (reason: string): CoachSubjectValidation => ({
    input: rawInput,
    status: "unresolved",
    canonicalCoachId: null,
    canonicalName: null,
    team: null,
    reason,
  });

  if (!source || source.coaches.length === 0) {
    return unresolved("coach_source_unavailable");
  }

  const key = normalizedCoachKey(rawInput);
  if (!key) {
    return unresolved("empty_subject");
  }

  const matches = source.coaches.filter((entry) => normalizedCoachKey(entry.canonicalName) === key);
  if (matches.length === 0) {
    return unresolved("not_found_in_coach_source");
  }

  const gameTeamSet = new Set([gameTeams.homeTeam, gameTeams.awayTeam]);
  const inGameMatches = matches.filter((entry) => gameTeamSet.has(entry.team));

  if (inGameMatches.length === 0) {
    const unrelatedTeam = matches[0].team;
    return {
      input: rawInput,
      status: "rejected",
      canonicalCoachId: null,
      canonicalName: null,
      team: unrelatedTeam,
      reason: `coach_of_unrelated_team:${unrelatedTeam}`,
    };
  }

  const distinctCoachesById = new Map<string, (typeof inGameMatches)[number]>();
  for (const entry of inGameMatches) {
    if (!distinctCoachesById.has(entry.coachId)) distinctCoachesById.set(entry.coachId, entry);
  }
  if (distinctCoachesById.size > 1) {
    return {
      input: rawInput,
      status: "conflicting",
      canonicalCoachId: null,
      canonicalName: null,
      team: null,
      reason: "ambiguous_multiple_coaches_in_game",
    };
  }

  const match = [...distinctCoachesById.values()][0];
  return {
    input: rawInput,
    status: "confirmed",
    canonicalCoachId: match.coachId,
    canonicalName: match.canonicalName,
    team: match.team,
    reason: "matched_coach_in_game",
  };
}

/**
 * Validates every subjects.players / subjects.coaches entry on a candidate
 * against the supplied identity source (or degrades all of them to
 * "unresolved" when no source is available). Never throws; never guesses a
 * "confirmed" status without a positive roster/coach match.
 */
export function validateSubjectIdentities(
  subjects: { players: readonly string[]; coaches: readonly string[] },
  gameTeams: GameTeams,
  source: SubjectIdentitySource | null
): EvidenceSubjectValidation {
  return {
    players: subjects.players.map((input) => validatePlayerSubject(input, gameTeams, source)),
    coaches: subjects.coaches.map((input) => validateCoachSubject(input, gameTeams, source)),
  };
}

/** True when any subject is a conclusive wrong-team identity -- the only status this module treats as unsafe to normalize. */
export function hasRejectedSubject(validation: EvidenceSubjectValidation): boolean {
  return validation.players.some((p) => p.status === ("rejected" satisfies SubjectValidationStatus)) || validation.coaches.some((c) => c.status === ("rejected" satisfies SubjectValidationStatus));
}
