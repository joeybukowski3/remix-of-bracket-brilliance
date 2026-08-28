// Deterministic DraftKings -> canonical JKB/NFL identity resolution for WU2.
//
// This module never fuzzy-matches. A DK row either exactly resolves to a
// single canonical identity (by conservative normalized name + position,
// optionally disambiguated by team) or it produces an explicit non-resolved
// outcome. Team can only disambiguate among already-exact name+position
// candidates -- it never rescues a materially different name.
//
// Reuses the existing canonical identity infrastructure rather than
// reimplementing name/team normalization:
// - `normalizeProductionPlayerName` (src/lib/fantasy/weekly/productionIdentity.ts)
// - `normalizeNflTeamAbbr` (src/lib/nfl/identity/identity.ts)

import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { normalizeProductionPlayerName } from "@/lib/fantasy/weekly/productionIdentity";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import type { CanonicalNflTeam } from "@/lib/nfl/standings";
import type { DraftKingsNflClassicPosition, ValidatedDraftKingsNflClassicRow } from "@/lib/nfl/dfs/contracts";

/** The four offensive DK positions with a projection authority. */
export type DfsOffensivePosition = Exclude<DraftKingsNflClassicPosition, "DST">;

export type ValidatedDraftKingsOffensiveRow = ValidatedDraftKingsNflClassicRow & { position: DfsOffensivePosition };

export function isDraftKingsOffensiveRow(
  row: ValidatedDraftKingsNflClassicRow,
): row is ValidatedDraftKingsOffensiveRow {
  return row.position !== "DST";
}

export type OffensiveIdentityStatus = "resolved" | "unresolved" | "ambiguous" | "position-conflict" | "team-conflict";

export type OffensiveIdentityResolution = {
  dkId: string;
  dkRow: ValidatedDraftKingsOffensiveRow;
  status: OffensiveIdentityStatus;
  /** Canonical `gsis:*` playerId, only set when status is "resolved". */
  playerId: string | null;
  /** The matched weekly projection row, only set when status is "resolved". */
  projection: WeeklyFantasyProjectionProductionRow | null;
  normalizedName: string;
  normalizedTeam: string | null;
  /** Number of same-name-same-position candidates considered before disambiguation. */
  candidateCount: number;
  /** True when a uniquely resolved player's projection team differs from the DK team (e.g. a trade). */
  teamMismatch: boolean;
  reason: string | null;
};

export type DstIdentityStatus = "resolved" | "unresolved" | "ambiguous";

export type DstIdentityResolution = {
  dkId: string;
  dkRow: ValidatedDraftKingsNflClassicRow;
  status: DstIdentityStatus;
  team: CanonicalNflTeam | null;
  normalizedTeam: string | null;
  /**
   * Whether the DK TeamAbbrev appears as a participant in the row's parsed
   * Game Info. `null` when Game Info could not be parsed (WU1 already warns
   * on that case), so there is nothing to cross-check against.
   */
  gameParticipationConsistent: boolean | null;
  reason: string | null;
};

/**
 * Resolves a single DK offensive row against the weekly projection universe.
 *
 * Flow: conservative normalized name -> exact position match -> team only
 * disambiguates when multiple exact name+position candidates exist.
 */
export function resolveOffensiveIdentity(
  dkRow: ValidatedDraftKingsOffensiveRow,
  projectionUniverse: readonly WeeklyFantasyProjectionProductionRow[],
): OffensiveIdentityResolution {
  const normalizedName = normalizeProductionPlayerName(dkRow.name);
  const normalizedTeam = normalizeNflTeamAbbr(dkRow.teamAbbrev);

  const base = {
    dkId: dkRow.dkId,
    dkRow,
    normalizedName,
    normalizedTeam,
    teamMismatch: false,
  };

  const sameNameAnyPosition = projectionUniverse.filter(
    (row) => normalizeProductionPlayerName(row.playerName) === normalizedName,
  );

  if (sameNameAnyPosition.length === 0) {
    return {
      ...base,
      status: "unresolved",
      playerId: null,
      projection: null,
      candidateCount: 0,
      reason: "No projection-universe player matches the uploaded name.",
    };
  }

  const sameNameSamePosition = sameNameAnyPosition.filter((row) => row.position === dkRow.position);

  if (sameNameSamePosition.length === 0) {
    const otherPositions = Array.from(new Set(sameNameAnyPosition.map((row) => row.position))).sort();
    return {
      ...base,
      status: "position-conflict",
      playerId: null,
      projection: null,
      candidateCount: sameNameAnyPosition.length,
      reason: `Name matches the projection universe only at position(s) ${otherPositions.join(", ")}, not "${dkRow.position}".`,
    };
  }

  if (sameNameSamePosition.length === 1) {
    const projection = sameNameSamePosition[0];
    const teamMismatch = Boolean(normalizedTeam) && normalizeNflTeamAbbr(projection.team) !== normalizedTeam;
    return {
      ...base,
      status: "resolved",
      playerId: projection.playerId,
      projection,
      candidateCount: 1,
      teamMismatch,
      reason: null,
    };
  }

  // Multiple exact name+position candidates: team may disambiguate, but a
  // materially different name is never in this branch to begin with.
  const teamMatches = normalizedTeam
    ? sameNameSamePosition.filter((row) => normalizeNflTeamAbbr(row.team) === normalizedTeam)
    : [];

  if (teamMatches.length === 1) {
    const projection = teamMatches[0];
    return {
      ...base,
      status: "resolved",
      playerId: projection.playerId,
      projection,
      candidateCount: sameNameSamePosition.length,
      reason: null,
    };
  }

  if (normalizedTeam && teamMatches.length === 0) {
    return {
      ...base,
      status: "team-conflict",
      playerId: null,
      projection: null,
      candidateCount: sameNameSamePosition.length,
      reason: `${sameNameSamePosition.length} players share the name and position "${dkRow.position}", and none play for team "${normalizedTeam}".`,
    };
  }

  return {
    ...base,
    status: "ambiguous",
    playerId: null,
    projection: null,
    candidateCount: sameNameSamePosition.length,
    reason: `${sameNameSamePosition.length} players share the name and position "${dkRow.position}"; team did not uniquely disambiguate.`,
  };
}

/**
 * Resolves a DK DST row to a canonical team identity. No mascot/city fuzzy
 * matching -- only an exact normalized team-abbreviation match.
 */
export function resolveDstIdentity(
  dkRow: ValidatedDraftKingsNflClassicRow,
  teams: readonly CanonicalNflTeam[],
): DstIdentityResolution {
  const normalizedTeam = normalizeNflTeamAbbr(dkRow.teamAbbrev);
  const matches = normalizedTeam ? teams.filter((team) => team.abbr === normalizedTeam) : [];

  const gameTeams = dkRow.game
    ? [normalizeNflTeamAbbr(dkRow.game.awayTeam), normalizeNflTeamAbbr(dkRow.game.homeTeam)]
    : null;
  const gameParticipationConsistent = gameTeams ? gameTeams.includes(normalizedTeam) : null;

  if (matches.length === 1) {
    return {
      dkId: dkRow.dkId,
      dkRow,
      status: "resolved",
      team: matches[0],
      normalizedTeam,
      gameParticipationConsistent,
      reason: null,
    };
  }

  if (matches.length === 0) {
    return {
      dkId: dkRow.dkId,
      dkRow,
      status: "unresolved",
      team: null,
      normalizedTeam,
      gameParticipationConsistent,
      reason: `No canonical NFL team matches TeamAbbrev "${dkRow.teamAbbrev}".`,
    };
  }

  return {
    dkId: dkRow.dkId,
    dkRow,
    status: "ambiguous",
    team: null,
    normalizedTeam,
    gameParticipationConsistent,
    reason: `Multiple canonical NFL teams matched TeamAbbrev "${dkRow.teamAbbrev}".`,
  };
}

export type DuplicateCanonicalIdentityGroup = {
  /** The contested canonical playerId (`gsis:*`) or canonical team id (`nfl-*`). */
  canonicalId: string;
  /** DK IDs of every uploaded row that resolved to this canonical identity, sorted. */
  dkIds: string[];
};

/**
 * Detects distinct uploaded DK rows that resolved to the same canonical
 * playerId. Never silently keeps one -- every contested identity is reported
 * so the analyzer layer can block downstream metrics for those rows.
 */
export function findDuplicateOffensiveCanonicalIdentities(
  resolutions: readonly OffensiveIdentityResolution[],
): DuplicateCanonicalIdentityGroup[] {
  const byPlayerId = new Map<string, string[]>();
  resolutions.forEach((resolution) => {
    if (resolution.status !== "resolved" || !resolution.playerId) return;
    const list = byPlayerId.get(resolution.playerId) ?? [];
    list.push(resolution.dkId);
    byPlayerId.set(resolution.playerId, list);
  });

  return Array.from(byPlayerId.entries())
    .filter(([, dkIds]) => dkIds.length > 1)
    .map(([canonicalId, dkIds]) => ({ canonicalId, dkIds: [...dkIds].sort() }))
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
}

/** Same policy as offensive identities, keyed by canonical team id instead of playerId. */
export function findDuplicateDstCanonicalIdentities(
  resolutions: readonly DstIdentityResolution[],
): DuplicateCanonicalIdentityGroup[] {
  const byTeamId = new Map<string, string[]>();
  resolutions.forEach((resolution) => {
    if (resolution.status !== "resolved" || !resolution.team) return;
    const list = byTeamId.get(resolution.team.id) ?? [];
    list.push(resolution.dkId);
    byTeamId.set(resolution.team.id, list);
  });

  return Array.from(byTeamId.entries())
    .filter(([, dkIds]) => dkIds.length > 1)
    .map(([canonicalId, dkIds]) => ({ canonicalId, dkIds: [...dkIds].sort() }))
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
}
