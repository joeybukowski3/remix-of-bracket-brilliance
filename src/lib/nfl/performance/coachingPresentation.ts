import {
  COACHING_EVEN_THRESHOLD,
  type CoachRecordContext,
  type CoachingContext,
  type TeamAdvantage,
} from "@/types/nfl/performance";

/**
 * Display layer for Coaching Rating v1.
 *
 * ANALYSIS CONTEXT ONLY: nothing here derives a pick, an edge, an over/under
 * lean or any other predictive signal. It only reshapes the artifact's shared
 * CoachingContext into the labels the UI renders, so Sides, Totals and the
 * matchup analyzer all read the same contract the same way.
 *
 * ATS is historical context and is never weighted in the rating -- see
 * COACHING_ATS_NOTE, which every surface renders verbatim.
 */

export const COACHING_ATS_NOTE =
  "ATS record is shown as historical context and is not weighted in the JKB Coaching Rating.";

/** Renders where a real coaching record would go when the coach has none. */
export const NO_NFL_HC_RECORD_LABEL = "No NFL HC record";

export const FIRST_YEAR_LABEL = "First-year HC";

/** One side of the comparison, already reduced to display-ready strings. */
export type CoachingSideView = {
  side: "home" | "away";
  /** Team abbreviation as stored on the row (upper-cased for display). */
  teamLabel: string;
  coachName: string | null;
  rating: number | null;
  /** null when the coach has no prior NFL head-coaching games. */
  careerWl: string | null;
  careerAts: string | null;
  firstYear: boolean;
  smallSample: boolean;
  interim: boolean;
  tenureYear: number | null;
  /** True when this side has no rating at all (COACH_UNRATED). */
  unrated: boolean;
};

export type CoachingComparisonView = {
  status: CoachingContext["coaching_context_status"];
  /** True when neither side can be rendered at all. */
  unavailable: boolean;
  home: CoachingSideView;
  away: CoachingSideView;
  advantage: TeamAdvantage | null;
  differential: number | null;
  /** "LAR +8" / "EVEN" / "—" -- the compact headline value. */
  advantageLabel: string;
  ratingVersion: string | null;
  sourceTimestamp: string | null;
  pregameCutoff: string | null;
};

function isEmptyRecord(value: string | null | undefined): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "0-0" || trimmed === "0-0-0";
}

function recordOrNull(value: string | null | undefined): string | null {
  return isEmptyRecord(value) ? null : (value as string).trim();
}

function buildSide(
  side: "home" | "away",
  team: string,
  coachName: string | null,
  rating: number | null,
  record: CoachRecordContext | null,
): CoachingSideView {
  return {
    side,
    teamLabel: team.toUpperCase(),
    coachName: coachName && coachName.trim() !== "" ? coachName : null,
    rating,
    careerWl: recordOrNull(record?.career_wl),
    careerAts: recordOrNull(record?.career_ats),
    firstYear: record?.first_year ?? false,
    smallSample: record?.small_sample ?? false,
    interim: record?.interim ?? false,
    tenureYear: record?.tenure_year ?? null,
    unrated: rating == null,
  };
}

/**
 * `EVEN` whenever |differential| <= the frozen v1 even threshold, otherwise
 * "<TEAM> +N" for the advantaged side. The differential is always reported
 * as a magnitude so the label never reads "+-6".
 */
export function formatCoachingAdvantage(view: {
  advantage: TeamAdvantage | null;
  differential: number | null;
  home: { teamLabel: string };
  away: { teamLabel: string };
}): string {
  if (view.advantage == null || view.differential == null) return "—";
  if (view.advantage === "even") return "EVEN";
  const team = view.advantage === "home" ? view.home.teamLabel : view.away.teamLabel;
  return `${team} +${Math.abs(Math.round(view.differential))}`;
}

/**
 * Reduces the artifact contract to the display projection the reusable
 * component consumes. `homeTeam` / `awayTeam` come from the row (the coaching
 * block itself carries coach names, not team codes).
 */
export function buildCoachingComparisonView(
  coaching: CoachingContext | null | undefined,
  homeTeam: string,
  awayTeam: string,
): CoachingComparisonView {
  const status = coaching?.coaching_context_status ?? "SOURCE_UNAVAILABLE";
  const home = buildSide(
    "home",
    homeTeam,
    coaching?.home_coach ?? null,
    coaching?.home_coaching_rating ?? null,
    coaching?.home_coach_context ?? null,
  );
  const away = buildSide(
    "away",
    awayTeam,
    coaching?.away_coach ?? null,
    coaching?.away_coaching_rating ?? null,
    coaching?.away_coach_context ?? null,
  );

  const advantage = status === "SOURCE_UNAVAILABLE" ? null : (coaching?.coaching_advantage_team ?? null);
  const differential = status === "SOURCE_UNAVAILABLE" ? null : (coaching?.coaching_differential ?? null);

  return {
    status,
    unavailable: status === "SOURCE_UNAVAILABLE",
    home,
    away,
    advantage,
    differential,
    advantageLabel: formatCoachingAdvantage({ advantage, differential, home, away }),
    ratingVersion: coaching?.rating_version ?? null,
    sourceTimestamp: coaching?.source_timestamp ?? null,
    pregameCutoff: coaching?.pregame_cutoff ?? null,
  };
}

/** "Home" / "Away" / "Even" / "—" for dense field lists. */
export function coachingAdvantageFieldLabel(team: TeamAdvantage | null): string {
  if (team == null) return "—";
  if (team === "even") return "Even";
  return team === "home" ? "Home" : "Away";
}

/** "HOME +6" / "AWAY +6" / "EVEN" / "—" summary used by the Sides drawer. */
export function coachingAdvantageSummary(coaching: CoachingContext | null | undefined): string {
  if (!coaching || coaching.coaching_context_status === "SOURCE_UNAVAILABLE") return "—";
  const { coaching_advantage_team: team, coaching_differential: diff } = coaching;
  if (team == null || diff == null) return "—";
  if (team === "even") return "EVEN";
  return `${team === "home" ? "HOME" : "AWAY"} +${Math.abs(Math.round(diff))}`;
}

/**
 * Whether the JKB ATS side and the coaching advantage point at the same team.
 * Descriptive segmentation only -- agreement is not evidence that coaching
 * caused, or predicts, the result.
 */
export type CoachingAgreement = "agree" | "disagree" | "even" | null;

export function coachingAgreement(
  jkbSide: "home" | "away" | "pick" | null,
  coaching: CoachingContext | null | undefined,
): CoachingAgreement {
  if (!coaching || coaching.coaching_context_status === "SOURCE_UNAVAILABLE") return null;
  const advantage = coaching.coaching_advantage_team;
  if (advantage == null) return null;
  if (advantage === "even") return "even";
  if (jkbSide == null || jkbSide === "pick") return null;
  return jkbSide === advantage ? "agree" : "disagree";
}

export { COACHING_EVEN_THRESHOLD };
