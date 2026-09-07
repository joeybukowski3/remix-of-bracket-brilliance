import type { CoachRecordContext, CoachingContext } from "@/types/nfl/performance";

/**
 * Test-only builders for the shared Coaching Rating v1 contract, so Sides,
 * Totals, the reusable component and the matchup adapter all exercise one
 * fixture shape instead of four hand-written copies that drift apart.
 */

export function coachRecordFixture(overrides: Partial<CoachRecordContext> = {}): CoachRecordContext {
  return {
    career_wl: "102-63",
    tenure_wl: "102-63",
    season_wl: "0-0",
    career_ats: "89-72-4",
    tenure_ats: "89-72-4",
    season_ats: "0-0",
    recent_ats: "9-8",
    small_sample: false,
    tenure_year: 9,
    first_year: false,
    interim: false,
    ...overrides,
  };
}

/** Rated on both sides, home favoured by 8 (HOME advantage). */
export function coachingContextFixture(overrides: Partial<CoachingContext> = {}): CoachingContext {
  return {
    home_coach: "Sean McVay",
    away_coach: "Kyle Shanahan",
    home_coaching_rating: 59,
    away_coaching_rating: 51,
    coaching_differential: 8,
    coaching_advantage_team: "home",
    home_coach_context: coachRecordFixture(),
    away_coach_context: coachRecordFixture({ career_wl: "91-72", career_ats: "83-79-1", tenure_year: 10 }),
    rating_version: "coaching-v1.0.0",
    source_timestamp: "2026-09-06T15:38:21.304Z",
    pregame_cutoff: "completed games through 2025 season",
    coaching_context_status: "OK",
    ...overrides,
  };
}

/** Every field nulled out -- the SOURCE_UNAVAILABLE contract. */
export function coachingUnavailableFixture(): CoachingContext {
  return {
    home_coach: null,
    away_coach: null,
    home_coaching_rating: null,
    away_coaching_rating: null,
    coaching_differential: null,
    coaching_advantage_team: null,
    home_coach_context: null,
    away_coach_context: null,
    rating_version: null,
    source_timestamp: null,
    pregame_cutoff: null,
    coaching_context_status: "SOURCE_UNAVAILABLE",
  };
}
