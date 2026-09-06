import {
  COACHING_EVEN_THRESHOLD,
  type CoachRecordContext,
  type CoachingContext,
  type TeamAdvantage,
} from "@/types/nfl/performance";

/**
 * Current-season coaching-ratings adapter for the matchup analyzer.
 *
 * The Performance Center reads a per-game CoachingContext that the backend
 * already froze at each game's pregame cutoff. An upcoming matchup has no such
 * graded row, so this maps the published current-ratings artifact
 * (public/data/nfl/coaching-ratings.json) into that same shared contract --
 * one shape, one component, one set of display rules everywhere.
 *
 * It reproduces no rating math: ratings come from the artifact verbatim, and
 * the only derived value is the advantage/differential pair, using the frozen
 * v1 even threshold. ANALYSIS CONTEXT ONLY.
 */

export const COACHING_RATINGS_ARTIFACT_PATH = "/data/nfl/coaching-ratings.json";

export type CoachingRatingsEntry = {
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

export type CoachingRatingsArtifact = {
  schemaVersion?: string;
  ratingVersion?: string;
  sourceCutoff?: string | null;
  _meta?: { generatedAt?: string | null };
  coaches: CoachingRatingsEntry[];
};

export function isCoachingRatingsArtifact(json: unknown): json is CoachingRatingsArtifact {
  const candidate = json as Partial<CoachingRatingsArtifact> | null;
  return Boolean(candidate && Array.isArray(candidate.coaches));
}

function toRecordContext(entry: CoachingRatingsEntry): CoachRecordContext {
  return {
    career_wl: entry.career_wl ?? "",
    tenure_wl: entry.tenure_wl ?? "",
    season_wl: entry.season_wl ?? "",
    career_ats: entry.career_ats ?? "",
    tenure_ats: entry.tenure_ats ?? "",
    season_ats: entry.season_ats ?? "",
    recent_ats: entry.last17_ats ?? "",
    small_sample: entry.small_sample ?? false,
    tenure_year: entry.tenure_year ?? null,
    first_year: entry.first_year ?? false,
    interim: entry.interim ?? false,
  };
}

function findCoach(artifact: CoachingRatingsArtifact, team: string): CoachingRatingsEntry | null {
  const wanted = team.trim().toLowerCase();
  if (wanted === "") return null;
  return artifact.coaches.find((entry) => entry.team?.trim().toLowerCase() === wanted) ?? null;
}

/**
 * Home minus away, resolved against the frozen even threshold. Returns nulls
 * whenever either side is unrated -- a differential against a missing rating
 * would be fabricated.
 */
export function resolveCoachingAdvantage(
  homeRating: number | null,
  awayRating: number | null,
): { advantage: TeamAdvantage | null; differential: number | null } {
  if (homeRating == null || awayRating == null) return { advantage: null, differential: null };
  const differential = homeRating - awayRating;
  if (Math.abs(differential) <= COACHING_EVEN_THRESHOLD) return { advantage: "even", differential };
  return { advantage: differential > 0 ? "home" : "away", differential };
}

/**
 * Builds the shared CoachingContext for one upcoming matchup. A missing
 * artifact yields SOURCE_UNAVAILABLE; a rated side paired with an unrated one
 * yields COACH_UNRATED with the known side still fully populated.
 */
export function buildMatchupCoachingContext(
  artifact: CoachingRatingsArtifact | null,
  homeTeam: string,
  awayTeam: string,
): CoachingContext {
  if (!artifact) {
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

  const home = findCoach(artifact, homeTeam);
  const away = findCoach(artifact, awayTeam);
  const homeRating = home?.coaching_rating ?? null;
  const awayRating = away?.coaching_rating ?? null;
  const { advantage, differential } = resolveCoachingAdvantage(homeRating, awayRating);

  return {
    home_coach: home?.coach ?? null,
    away_coach: away?.coach ?? null,
    home_coaching_rating: homeRating,
    away_coaching_rating: awayRating,
    coaching_differential: differential,
    coaching_advantage_team: advantage,
    home_coach_context: home ? toRecordContext(home) : null,
    away_coach_context: away ? toRecordContext(away) : null,
    rating_version: artifact.ratingVersion ?? null,
    source_timestamp: artifact._meta?.generatedAt ?? null,
    pregame_cutoff: artifact.sourceCutoff ?? null,
    coaching_context_status: home && away ? "OK" : "COACH_UNRATED",
  };
}
