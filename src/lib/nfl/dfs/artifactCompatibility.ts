// WU3 slate/artifact compatibility assessment.
//
// Pure domain helper: every input is already-loaded data (parsed DK rows,
// the production projection artifact, an optional research artifact, the
// canonical NFL schedule for the season, WU2 identity resolutions, and an
// optional injectable clock). Nothing here fetches network data or falls
// back to a different week/artifact -- an incompatible season/week is always
// a blocking issue, never silently substituted.

import type { WeeklyFantasyProjectionProductionArtifact } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import type { WeeklyFantasyResearchArtifact } from "@/lib/fantasy/weekly/researchArtifact";
import {
  normalizeNflTeamAbbr,
  resolveWeekEffectiveTeam,
  type NflWeekEffectiveTeamAssignment,
} from "@/lib/nfl/identity/identity";
import type { NflGameRecord } from "@/lib/nfl/standings";
import type { DraftKingsParsedGameInfo, ValidatedDraftKingsNflClassicRow } from "@/lib/nfl/dfs/contracts";
import { findDuplicateOffensiveCanonicalIdentities, type OffensiveIdentityResolution } from "@/lib/nfl/dfs/identity";
import { assessDfsResearchArtifactCompatibility, type DfsResearchArtifactCompatibility } from "@/lib/nfl/dfs/research";

/**
 * WARN-only operational freshness target. The closest documented number is
 * docs/fantasy-weekly-production-operations.md's "Target injury-source age
 * of at most 24 hours from Wednesday through Saturday" cadence guidance,
 * applied here to the whole artifact's `inputAsOf` since no per-source age
 * is exposed on the artifact itself. No canonical loader or generator in
 * this repo defines a hard age-based fail threshold (see that doc: a stale
 * artifact is retained and displayed, never blocked or substituted), so age
 * alone is a WARNING here and never contributes to BLOCKED.
 */
export const DFS_PROJECTION_FRESHNESS_WARNING_HOURS = 24;

export type DfsCompatibilityDiagnosticCode =
  | "PROJECTION_ARTIFACT_MISSING"
  | "PROJECTION_SEASON_MISMATCH"
  | "PROJECTION_WEEK_MISMATCH"
  | "PROJECTION_ARTIFACT_STALE"
  | "RESEARCH_ARTIFACT_MISSING"
  | "RESEARCH_ARTIFACT_WRONG_WEEK"
  | "DK_GAME_UNMATCHED"
  | "DK_GAME_AMBIGUOUS"
  | "TEAM_MISMATCH_AUDITED"
  | "TEAM_MISMATCH_UNEXPLAINED"
  | "IDENTITY_UNRESOLVED_PLAYERS"
  | "IDENTITY_CONFLICTS";

export type DfsCompatibilitySeverity = "error" | "warning";

export type DfsCompatibilityIssue = {
  severity: DfsCompatibilitySeverity;
  code: DfsCompatibilityDiagnosticCode;
  message: string;
  dkGame: string | null;
  dkId: string | null;
};

export type DfsGameMatch = {
  gameInfoRaw: string;
  normalizedAway: string | null;
  normalizedHome: string | null;
  canonicalGame: NflGameRecord | null;
};

export type DfsTeamMismatchStatus = "audited" | "unexplained";

export type DfsTeamMismatchRecord = {
  dkId: string;
  playerId: string;
  dkTeam: string | null;
  projectionTeam: string | null;
  status: DfsTeamMismatchStatus;
};

export type DfsProjectionFreshness = "fresh" | "stale-warning" | "unknown";

export type DfsSlateCompatibility = {
  readiness: "READY" | "READY_WITH_WARNINGS" | "BLOCKED";
  selectedSeason: number;
  selectedWeek: number;
  projection: {
    present: boolean;
    season: number | null;
    week: number | null;
    seasonMatches: boolean;
    weekMatches: boolean;
    generatedAt: string | null;
    inputAsOf: string | null;
    freshness: DfsProjectionFreshness;
    ageHours: number | null;
  };
  research: {
    compatibility: DfsResearchArtifactCompatibility;
  };
  games: {
    matched: DfsGameMatch[];
    unmatched: DfsGameMatch[];
  };
  teamMismatches: DfsTeamMismatchRecord[];
  issues: DfsCompatibilityIssue[];
};

export type DfsSlateCompatibilityInput = {
  dkRows: readonly ValidatedDraftKingsNflClassicRow[];
  selectedSeason: number;
  selectedWeek: number;
  projectionArtifact: WeeklyFantasyProjectionProductionArtifact | null;
  researchArtifact?: WeeklyFantasyResearchArtifact | null;
  /** Canonical NFL schedule -- any season's games are accepted; only rows matching selectedSeason/selectedWeek are used. */
  canonicalGames: readonly NflGameRecord[];
  offensiveIdentityResolutions: readonly OffensiveIdentityResolution[];
  /** Week-effective team assignment history, when a canonical source is available. Defaults to none. */
  weekEffectiveTeamAssignments?: readonly NflWeekEffectiveTeamAssignment[];
  /** Injectable clock for deterministic freshness classification. Defaults to `new Date()`. */
  now?: Date | string;
};

function computeFreshness(inputAsOf: string | null, now: Date): { freshness: DfsProjectionFreshness; ageHours: number | null } {
  if (!inputAsOf) return { freshness: "unknown", ageHours: null };
  const inputDate = new Date(inputAsOf);
  if (Number.isNaN(inputDate.getTime())) return { freshness: "unknown", ageHours: null };
  const ageHours = (now.getTime() - inputDate.getTime()) / (1000 * 60 * 60);
  return { freshness: ageHours > DFS_PROJECTION_FRESHNESS_WARNING_HOURS ? "stale-warning" : "fresh", ageHours };
}

function normalizedGameTeams(game: DraftKingsParsedGameInfo): { away: string | null; home: string | null } {
  return { away: normalizeNflTeamAbbr(game.awayTeam), home: normalizeNflTeamAbbr(game.homeTeam) };
}

function distinctDkGames(
  dkRows: readonly ValidatedDraftKingsNflClassicRow[],
): Array<{ gameInfoRaw: string; game: DraftKingsParsedGameInfo | null }> {
  const seen = new Map<string, { gameInfoRaw: string; game: DraftKingsParsedGameInfo | null }>();
  dkRows.forEach((row) => {
    const key = row.game
      ? `${normalizeNflTeamAbbr(row.game.awayTeam)}@${normalizeNflTeamAbbr(row.game.homeTeam)}`
      : `raw:${row.gameInfoRaw}`;
    if (!seen.has(key)) seen.set(key, { gameInfoRaw: row.gameInfoRaw, game: row.game });
  });
  return Array.from(seen.values());
}

function findCanonicalGames(
  away: string | null,
  home: string | null,
  season: number,
  week: number,
  games: readonly NflGameRecord[],
): NflGameRecord[] {
  if (!away || !home) return [];
  return games.filter(
    (game) =>
      game.season === season &&
      game.week === week &&
      normalizeNflTeamAbbr(game.awayAbbr) === away &&
      normalizeNflTeamAbbr(game.homeAbbr) === home,
  );
}

/**
 * Adjudicates a WU2 `teamMismatch: true` resolution. Team never invalidates
 * an already-exact name+position match -- it is only classified as
 * "audited" (explained by a canonical week-effective-team record) or
 * "unexplained" (no such record covers it). No trade logic is invented here.
 */
function adjudicateTeamMismatch(
  resolution: OffensiveIdentityResolution,
  selectedSeason: number,
  selectedWeek: number,
  assignments: readonly NflWeekEffectiveTeamAssignment[],
): DfsTeamMismatchStatus | null {
  if (resolution.status !== "resolved" || !resolution.teamMismatch || !resolution.playerId) return null;
  const weekEffectiveTeam = resolveWeekEffectiveTeam(assignments, resolution.playerId, selectedSeason, selectedWeek);
  if (weekEffectiveTeam && resolution.normalizedTeam && weekEffectiveTeam === resolution.normalizedTeam) return "audited";
  return "unexplained";
}

export function assessDfsSlateCompatibility(input: DfsSlateCompatibilityInput): DfsSlateCompatibility {
  const {
    dkRows,
    selectedSeason,
    selectedWeek,
    projectionArtifact,
    researchArtifact = null,
    canonicalGames,
    offensiveIdentityResolutions,
    weekEffectiveTeamAssignments = [],
    now = new Date(),
  } = input;
  const nowDate = now instanceof Date ? now : new Date(now);
  const issues: DfsCompatibilityIssue[] = [];

  // --- Projection artifact: season/week (exact, blocking) + freshness (warning only) ---
  const present = projectionArtifact !== null;
  const season = projectionArtifact?.season ?? null;
  const week = projectionArtifact?.week ?? null;
  const seasonMatches = present && season === selectedSeason;
  const weekMatches = present && week === selectedWeek;

  if (!present) {
    issues.push({
      severity: "error",
      code: "PROJECTION_ARTIFACT_MISSING",
      message: "No production weekly fantasy projection artifact was supplied.",
      dkGame: null,
      dkId: null,
    });
  } else {
    if (!seasonMatches) {
      issues.push({
        severity: "error",
        code: "PROJECTION_SEASON_MISMATCH",
        message: `Projection artifact season ${season} does not match the selected season ${selectedSeason}.`,
        dkGame: null,
        dkId: null,
      });
    }
    if (!weekMatches) {
      issues.push({
        severity: "error",
        code: "PROJECTION_WEEK_MISMATCH",
        message: `Projection artifact week ${week} does not match the selected week ${selectedWeek}.`,
        dkGame: null,
        dkId: null,
      });
    }
  }

  const { freshness, ageHours } = computeFreshness(projectionArtifact?.inputAsOf ?? null, nowDate);
  if (present && seasonMatches && weekMatches && freshness === "stale-warning") {
    issues.push({
      severity: "warning",
      code: "PROJECTION_ARTIFACT_STALE",
      message: `Projection inputAsOf is more than ${DFS_PROJECTION_FRESHNESS_WARNING_HOURS}h old (${ageHours?.toFixed(1)}h).`,
      dkGame: null,
      dkId: null,
    });
  }

  // --- Research artifact: season/week compatibility only (never blocking) ---
  const researchCompatibility = assessDfsResearchArtifactCompatibility(researchArtifact, selectedSeason, selectedWeek);
  if (researchCompatibility.status === "not-provided") {
    issues.push({
      severity: "warning",
      code: "RESEARCH_ARTIFACT_MISSING",
      message: "No weekly research artifact was supplied.",
      dkGame: null,
      dkId: null,
    });
  } else if (researchCompatibility.status === "wrong-week") {
    issues.push({
      severity: "warning",
      code: "RESEARCH_ARTIFACT_WRONG_WEEK",
      message: `Research artifact ${researchCompatibility.artifactSeason} week ${researchCompatibility.artifactWeek} does not match selected ${selectedSeason} week ${selectedWeek}; research was not joined.`,
      dkGame: null,
      dkId: null,
    });
  }

  // --- DK games -> canonical selected-week schedule (blocking per unmatched game) ---
  const matched: DfsGameMatch[] = [];
  const unmatched: DfsGameMatch[] = [];
  distinctDkGames(dkRows).forEach(({ gameInfoRaw, game }) => {
    if (!game) {
      unmatched.push({ gameInfoRaw, normalizedAway: null, normalizedHome: null, canonicalGame: null });
      issues.push({
        severity: "error",
        code: "DK_GAME_UNMATCHED",
        message: `Game Info "${gameInfoRaw}" could not be parsed and cannot be matched to the selected week.`,
        dkGame: gameInfoRaw,
        dkId: null,
      });
      return;
    }

    const { away, home } = normalizedGameTeams(game);
    const candidates = findCanonicalGames(away, home, selectedSeason, selectedWeek, canonicalGames);

    if (candidates.length === 1) {
      matched.push({ gameInfoRaw, normalizedAway: away, normalizedHome: home, canonicalGame: candidates[0] });
      return;
    }

    unmatched.push({ gameInfoRaw, normalizedAway: away, normalizedHome: home, canonicalGame: null });
    if (candidates.length === 0) {
      issues.push({
        severity: "error",
        code: "DK_GAME_UNMATCHED",
        message: `DK game "${gameInfoRaw}" (${away}@${home}) does not belong to ${selectedSeason} week ${selectedWeek}.`,
        dkGame: gameInfoRaw,
        dkId: null,
      });
    } else {
      issues.push({
        severity: "error",
        code: "DK_GAME_AMBIGUOUS",
        message: `DK game "${gameInfoRaw}" matched more than one canonical schedule entry for ${selectedSeason} week ${selectedWeek}.`,
        dkGame: gameInfoRaw,
        dkId: null,
      });
    }
  });

  // --- Team-mismatch adjudication (WU2 teamMismatch: true rows) ---
  const teamMismatches: DfsTeamMismatchRecord[] = [];
  offensiveIdentityResolutions.forEach((resolution) => {
    const status = adjudicateTeamMismatch(resolution, selectedSeason, selectedWeek, weekEffectiveTeamAssignments);
    if (!status || !resolution.playerId) return;
    const projectionTeam = resolution.projection ? normalizeNflTeamAbbr(resolution.projection.team) : null;
    teamMismatches.push({ dkId: resolution.dkId, playerId: resolution.playerId, dkTeam: resolution.normalizedTeam, projectionTeam, status });
    issues.push({
      severity: "warning",
      code: status === "audited" ? "TEAM_MISMATCH_AUDITED" : "TEAM_MISMATCH_UNEXPLAINED",
      message:
        status === "audited"
          ? `DK team "${resolution.normalizedTeam}" for "${resolution.dkRow.name}" differs from the projection team but matches the canonical week-effective team.`
          : `DK team "${resolution.normalizedTeam}" for "${resolution.dkRow.name}" differs from the projection team ("${projectionTeam ?? "unknown"}") and is not explained by a canonical week-effective-team record.`,
      dkGame: null,
      dkId: resolution.dkId,
    });
  });

  // --- Identity coverage (informational, never blocking -- fringe players are normal) ---
  const unresolvedCount = offensiveIdentityResolutions.filter((resolution) => resolution.status !== "resolved").length;
  if (unresolvedCount > 0) {
    issues.push({
      severity: "warning",
      code: "IDENTITY_UNRESOLVED_PLAYERS",
      message: `${unresolvedCount} uploaded offensive player(s) did not resolve to a canonical projection.`,
      dkGame: null,
      dkId: null,
    });
  }

  const duplicateGroups = findDuplicateOffensiveCanonicalIdentities(offensiveIdentityResolutions);
  if (duplicateGroups.length > 0) {
    issues.push({
      severity: "warning",
      code: "IDENTITY_CONFLICTS",
      message: `${duplicateGroups.length} canonical identity conflict(s) detected among uploaded players.`,
      dkGame: null,
      dkId: null,
    });
  }

  const readiness: DfsSlateCompatibility["readiness"] = issues.some((issue) => issue.severity === "error")
    ? "BLOCKED"
    : issues.some((issue) => issue.severity === "warning")
      ? "READY_WITH_WARNINGS"
      : "READY";

  return {
    readiness,
    selectedSeason,
    selectedWeek,
    projection: {
      present,
      season,
      week,
      seasonMatches,
      weekMatches,
      generatedAt: projectionArtifact?.generatedAt ?? null,
      inputAsOf: projectionArtifact?.inputAsOf ?? null,
      freshness,
      ageHours,
    },
    research: { compatibility: researchCompatibility },
    games: { matched, unmatched },
    teamMismatches,
    issues,
  };
}
