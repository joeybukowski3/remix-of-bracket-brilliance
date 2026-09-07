/**
 * Coaching Rating v1 — Phase C. Reshape the CURRENT public ratings artifact
 * (public/data/nfl/coaching-ratings.json) into the point-in-time
 * `CoachRatingSnapshot` contract consumed by buildCoachingContext().
 *
 * ANALYSIS CONTEXT ONLY — nothing here feeds Sides/Totals model math, and
 * ATS is never a rating component.
 *
 * Leakage rules (all enforced here AND re-checked by buildCoachingContext):
 *   - valid ONLY for current/upcoming games whose season is strictly later
 *     than the ratings artifact's "through <YYYY> season" cutoff;
 *   - the derived source cutoff must be strictly earlier than the target
 *     game's kickoff;
 *   - a historical game (season <= cutoff season) NEVER consumes this
 *     artifact — it must use its own rating-snapshots/<season>/<week>.json;
 *   - if the artifact's sourceCutoff is missing/unparseable, or the artifact
 *     is a full offseason stale, the result is SOURCE_UNAVAILABLE — never a
 *     silent current-ratings fallback.
 *
 * Current-season coach changes (Phase C §9): data/nfl/coaching/
 * coach-effective-overrides.json supplies the smallest safe identity
 * override for an in-season firing/interim before games.csv reflects it.
 * An override applies only from its effective (season, week) forward and
 * never rewrites earlier weeks.
 */

import type { CoachRatingSnapshot, CoachSnapshotEntry } from "./nfl-game-context";

export type CurrentRatingsCoach = {
  coach_id: string;
  coach: string;
  team: string;
  coaching_rating: number;
  career_wl?: string;
  tenure_wl?: string;
  season_wl?: string;
  career_ats?: string;
  tenure_ats?: string;
  season_ats?: string;
  last17_ats?: string;
  tenure_year?: number | null;
  small_sample?: boolean;
  first_year?: boolean;
  interim?: boolean;
};

export type CurrentRatingsArtifact = {
  _meta?: { season?: number | null; generatedAt?: string | null };
  ratingVersion?: string | null;
  sourceCutoff?: string | null;
  coaches?: CurrentRatingsCoach[];
};

/** data/nfl/coaching/coach-effective-overrides.json entry. */
export type CoachEffectiveOverride = {
  coach_id: string;
  coach_name: string;
  team: string;
  effective_season: number;
  effective_week: number;
  kind: "interim" | "permanent";
};

export type CurrentSnapshotResult =
  | { status: "OK"; snapshot: CoachRatingSnapshot }
  | { status: "SOURCE_UNAVAILABLE"; reason: string };

const THROUGH_SEASON_RE = /through\s+(\d{4})\s+season/i;

/** "completed games through 2025 season" -> 2025; unparseable -> null. */
export function parseThroughSeason(sourceCutoff: string | null | undefined): number | null {
  if (!sourceCutoff) return null;
  const match = THROUGH_SEASON_RE.exec(sourceCutoff);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) && year >= 1999 && year <= 2100 ? year : null;
}

/**
 * A leak-safe pregame instant meaning "all of <throughSeason> (incl.
 * playoffs) is ingested, nothing from <throughSeason + 1>". March 1 clears
 * the Super Bowl and precedes every next-season game.
 */
export function deriveCurrentCutoffUtc(throughSeason: number): string {
  return `${throughSeason + 1}-03-01T00:00:00.000Z`;
}

function overridesForWeek(
  overrides: readonly CoachEffectiveOverride[],
  season: number,
  week: number
): Map<string, CoachEffectiveOverride> {
  const byTeam = new Map<string, CoachEffectiveOverride>();
  for (const override of overrides) {
    const inEffect =
      override.effective_season < season ||
      (override.effective_season === season && override.effective_week <= week);
    if (!inEffect) continue;
    const prev = byTeam.get(override.team);
    const isLater =
      !prev ||
      override.effective_season > prev.effective_season ||
      (override.effective_season === prev.effective_season && override.effective_week > prev.effective_week);
    if (isLater) byTeam.set(override.team, override);
  }
  return byTeam;
}

function toEntry(coach: CurrentRatingsCoach): CoachSnapshotEntry {
  return {
    coach_id: coach.coach_id,
    coach: coach.coach,
    team: coach.team,
    coaching_rating: coach.coaching_rating,
    career_wl: coach.career_wl ?? "0-0",
    tenure_wl: coach.tenure_wl ?? "0-0",
    season_wl: coach.season_wl ?? "0-0",
    career_ats: coach.career_ats ?? "0-0",
    tenure_ats: coach.tenure_ats ?? "0-0",
    season_ats: coach.season_ats ?? "0-0",
    recent_ats: coach.last17_ats ?? "0-0",
    tenure_year: coach.tenure_year ?? null,
    small_sample: Boolean(coach.small_sample),
    first_year: Boolean(coach.first_year),
    interim: Boolean(coach.interim),
  };
}

/**
 * An in-season coach change not yet in games.csv. The override schema
 * carries identity only, so the new coach gets the league-average prior
 * (rating 50) with an empty NFL-HC record — the honest representation of
 * "no rated history for this coach in our system yet".
 */
function overrideEntry(override: CoachEffectiveOverride): CoachSnapshotEntry {
  return {
    coach_id: override.coach_id,
    coach: override.coach_name,
    team: override.team,
    coaching_rating: 50,
    career_wl: "0-0",
    tenure_wl: "0-0",
    season_wl: "0-0",
    career_ats: "0-0",
    tenure_ats: "0-0",
    season_ats: "0-0",
    recent_ats: "0-0",
    tenure_year: 1,
    small_sample: true,
    first_year: true,
    interim: override.kind === "interim",
  };
}

export function adaptCurrentRatingsToSnapshot(input: {
  artifact: CurrentRatingsArtifact | null;
  targetSeason: number;
  targetWeek: number;
  gameKickoffUtc: string | null;
  overrides?: readonly CoachEffectiveOverride[];
}): CurrentSnapshotResult {
  const { artifact, targetSeason, targetWeek, gameKickoffUtc } = input;

  if (!artifact || !Array.isArray(artifact.coaches) || artifact.coaches.length === 0) {
    return { status: "SOURCE_UNAVAILABLE", reason: "missing_or_empty_current_ratings" };
  }

  const throughSeason = parseThroughSeason(artifact.sourceCutoff);
  if (throughSeason == null) {
    return { status: "SOURCE_UNAVAILABLE", reason: "unparseable_source_cutoff" };
  }
  if (targetSeason <= throughSeason) {
    return { status: "SOURCE_UNAVAILABLE", reason: "historical_game_refuses_current_artifact" };
  }
  if (targetSeason > throughSeason + 1) {
    return { status: "SOURCE_UNAVAILABLE", reason: "stale_current_ratings" };
  }

  const cutoffUtc = deriveCurrentCutoffUtc(throughSeason);
  if (gameKickoffUtc != null && cutoffUtc >= gameKickoffUtc) {
    return { status: "SOURCE_UNAVAILABLE", reason: "source_cutoff_not_before_kickoff" };
  }

  const overrideByTeam = overridesForWeek(input.overrides ?? [], targetSeason, targetWeek);
  const seen = new Set<string>();
  const coaches: CoachSnapshotEntry[] = [];
  for (const raw of artifact.coaches) {
    if (!raw || !raw.team || !raw.coach_id) continue;
    if (seen.has(raw.team)) continue;
    seen.add(raw.team);
    const override = overrideByTeam.get(raw.team);
    coaches.push(override && override.coach_id !== raw.coach_id ? overrideEntry(override) : toEntry(raw));
  }
  // Overrides for a team with no current-ratings row still take effect.
  for (const [team, override] of overrideByTeam) {
    if (!seen.has(team)) {
      seen.add(team);
      coaches.push(overrideEntry(override));
    }
  }

  if (coaches.length === 0) {
    return { status: "SOURCE_UNAVAILABLE", reason: "no_usable_coach_rows" };
  }

  return {
    status: "OK",
    snapshot: {
      rating_version: artifact.ratingVersion ?? "coaching-v1.0.0",
      season: targetSeason,
      week: targetWeek,
      generated_from_cutoff: cutoffUtc,
      source_timestamp: artifact._meta?.generatedAt ?? null,
      coaches: coaches.sort((a, b) => a.team.localeCompare(b.team)),
    },
  };
}
