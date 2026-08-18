/**
 * Small, page-scoped helpers for the 2026 preseason division board
 * (NFLStandings.tsx). Kept separate from the page component so the sort and
 * tone logic can be unit-tested without rendering.
 *
 * These helpers only ever read `rating2026` / `projectionAdjustment2026` /
 * `sosRank` from the public v0.4 projection board — never the legacy
 * nflPreseason2026.ts ranks, and never actual-standings results.
 */

import type { TeamStanding } from "@/lib/nfl/standings";

export type ProjectedRatingLookup = { rating2026: number };

/**
 * Preseason division order: rating2026 descending. Teams with no projection
 * available (fetch/validation failure, or a team missing from the artifact)
 * sort to the end of their division rather than silently reusing any other
 * ranking, and ties fall back to team name for a stable order.
 */
export function sortTeamsByProjectedRating<T extends { abbr: string; name: string }>(
  rows: readonly T[],
  projectionByAbbr: ReadonlyMap<string, ProjectedRatingLookup>
): T[] {
  return [...rows].sort((a, b) => {
    const av = projectionByAbbr.get(a.abbr)?.rating2026;
    const bv = projectionByAbbr.get(b.abbr)?.rating2026;
    if (av == null && bv == null) return a.name.localeCompare(b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av || a.name.localeCompare(b.name);
  });
}

export type DeltaTone = "positive" | "negative" | "neutral";

/** Tone for the Δ26 projection-adjustment cell. Never the sole signal — always paired with a signed number. */
export function deltaTone(value: number): DeltaTone {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

/** "+2.5" / "-1.0" / "0.0" — the sign itself carries meaning independent of color. */
export function formatSignedDelta(value: number): string {
  const rounded = value.toFixed(1);
  return value > 0 ? `+${rounded}` : rounded;
}

export type SosTone = "hard" | "middle" | "easy";

/** 1-8 hardest, 9-24 middle, 25-32 easiest. Display/context only — never fed back into rating2026. */
export function sosTone(sosRank: number): SosTone {
  if (sosRank <= 8) return "hard";
  if (sosRank <= 24) return "middle";
  return "easy";
}

/**
 * True only when the current season has zero completed regular-season
 * games — the signal for showing the preseason projection board instead of
 * actual standings. Never date-based, mirroring the rest of the NFL
 * platform's rating-state conventions.
 */
export function isPreseasonDivisionView(isCurrentSeason: boolean, hasCompletedGames: boolean): boolean {
  return isCurrentSeason && !hasCompletedGames;
}

export function formatRating2026(value: number): string {
  return value.toFixed(1);
}

export function formatRating2025Adjusted(value: number): string {
  return value.toFixed(1);
}

export type StandingsDisplayMode = "preseasonProjection" | "actualStandings";

/**
 * Column-set mode for a division card. Preseason projection only applies to
 * the current season before any completed games; every other case — a
 * historical season, or the current season once results exist — renders the
 * actual-standings column set. Power Rating is never part of that decision.
 */
export function standingsDisplayMode(
  isCurrentSeason: boolean,
  hasCompletedGames: boolean
): StandingsDisplayMode {
  return isPreseasonDivisionView(isCurrentSeason, hasCompletedGames)
    ? "preseasonProjection"
    : "actualStandings";
}

export type { TeamStanding };
