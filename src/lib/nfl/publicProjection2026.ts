/**
 * Public projection of the nfl-power-v0.4-beta 2026 preseason layer.
 *
 * Strips everything that must stay internal: the raw guide corroboration
 * value/weight, the raw luck panel, and the personnel/coach/injury component
 * breakdown. The public surface only ever sees the three headline numbers
 * (rating2025Adjusted, projectionAdjustment2026, rating2026), SOS context,
 * confidence, and a sanitized note.
 *
 * Does not touch offense/defense — those remain v0.3.1 / 2025-performance
 * fields owned by publicPowerRatings.ts. This module produces no offense or
 * defense rating of any kind.
 */

import {
  NFL_V04_MODEL_VERSION,
  type NflV04ProjectionArtifact,
  type NflV04TeamProjection,
} from "@/lib/nfl/v04Projection";

/**
 * Case-insensitive terms that must never reach a public artifact: betting
 * language, and any reference to the internal corroborating guide or its
 * vendor/provenance. Notes containing any of these are dropped rather than
 * partially redacted.
 */
const FORBIDDEN_PUBLIC_TERMS = [
  "claude",
  "anthropic",
  "guide",
  "vsin",
  "warren sharp",
  "sharp",
  "odds",
  "spread",
  "betting",
  "wager",
  "picks",
  "pick'em",
  "edge",
  "vegas",
  "sportsbook",
  "proprietary",
];

function containsForbiddenTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_PUBLIC_TERMS.some((term) => lower.includes(term));
}

/** Exported so callers/tests can sanitize free-text notes consistently. */
export function sanitizePublicNote(note: string): string | null {
  const trimmed = note.trim();
  if (!trimmed) return null;
  if (containsForbiddenTerm(trimmed)) return null;
  return trimmed;
}

export type NflPublicProjectionTeam = {
  team: string;
  abbr: string;
  division: string;
  rank: number;
  rating2025Adjusted: number;
  projectionAdjustment2026: number;
  rating2026: number;
  sosRank: number;
  sosAvgOpponentRating: number;
  confidence: string;
  notes: string | null;
};

export type NflPublicProjectionBoard = {
  season: number;
  sourceSeason: number;
  modelVersion: string;
  offseasonSnapshotVerifiedThrough: string;
  teams: NflPublicProjectionTeam[];
};

function projectTeam(team: NflV04TeamProjection): NflPublicProjectionTeam {
  return {
    team: team.team,
    abbr: team.abbr,
    division: team.division,
    rank: team.rank,
    rating2025Adjusted: team.rating2025Adjusted,
    projectionAdjustment2026: team.projectionAdjustment2026,
    rating2026: team.rating2026,
    sosRank: team.sosRank,
    sosAvgOpponentRating: team.sosAvgOpponentRating,
    confidence: team.confidence,
    notes: sanitizePublicNote(team.notes),
  };
}

/**
 * Build the public-safe 2026 projection board from a validated v0.4
 * artifact. The returned shape has no field for guideRating,
 * guideCalibrationAdjustment, luckAverageRank, luckAdjustment, or any other
 * internal component — there is nothing to accidentally forget to strip.
 */
export function buildPublicProjectionBoard(
  artifact: NflV04ProjectionArtifact
): NflPublicProjectionBoard {
  if (artifact._meta.modelVersion !== NFL_V04_MODEL_VERSION) {
    throw new Error(
      `Unexpected modelVersion ${artifact._meta.modelVersion}; expected ${NFL_V04_MODEL_VERSION}`
    );
  }
  const teams = [...artifact.teams]
    .sort((a, b) => a.rank - b.rank)
    .map(projectTeam);

  return {
    season: artifact._meta.season,
    sourceSeason: artifact._meta.sourceSeason,
    modelVersion: artifact._meta.modelVersion,
    offseasonSnapshotVerifiedThrough: artifact._meta.offseasonSnapshotVerifiedThrough,
    teams,
  };
}
