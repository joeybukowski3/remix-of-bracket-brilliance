/**
 * Shared PRE-GAME analysis context for game-level evaluation artifacts
 * (WU3 totals performance; a future sides performance artifact reuses the
 * same shape). Every field here is diagnostic/segmentation only -- it is
 * never fed back into a model as a training input.
 *
 * Leakage guarantee: every metric here is sourced from the team's
 * `prior-season-full` window (matchup-epa.json / matchup-metrics.json) or
 * the ESPN trench-metrics archive for the season immediately before the
 * graded game's season. A prior-season-full window is computed entirely
 * from games in season (gradedSeason - 1) or earlier, so by construction it
 * cannot contain any information about the graded game itself, regardless
 * of when in the graded season the game was played. No in-season,
 * point-in-time weekly snapshot of EPA/YPP/trenches is currently archived,
 * so that finer-grained (but leak-safe) alternative is not available yet --
 * using it would require archiving one snapshot per week, which is a
 * separate future work item, not a WU3 change.
 *
 * Coaching: no canonical coaching-rating system exists in this repo yet.
 * Fields are always the explicit NOT_IMPLEMENTED null contract so the
 * schema never needs to churn when one is added.
 */

export type TeamAdvantage = "home" | "away" | "even";

export type EpaContext = {
  metric: "off.epaPerPlay";
  window: "prior-season-full";
  home_epa_value: number | null;
  away_epa_value: number | null;
  epa_advantage_team: TeamAdvantage | null;
  epa_differential: number | null;
  source_season: number | null;
  source_timestamp: string | null;
  provenance_status: "available" | "unavailable";
};

export type YppContext = {
  metric: "off.yardsPerPlay";
  window: "prior-season-full";
  home_ypp: number | null;
  away_ypp: number | null;
  ypp_advantage_team: TeamAdvantage | null;
  ypp_differential: number | null;
  source_season: number | null;
  source_timestamp: string | null;
  provenance_status: "available" | "unavailable";
};

export type TrenchesComponents = {
  off_pass_block_win_rate: number | null;
  off_run_block_win_rate: number | null;
  def_pass_rush_win_rate: number | null;
  def_run_stop_win_rate: number | null;
};

export type TrenchesContext = {
  metric: "espn_trench_composite";
  window: "prior_season_through_week_18";
  home_trenches_value: TrenchesComponents | null;
  away_trenches_value: TrenchesComponents | null;
  trenches_advantage_team: TeamAdvantage | null;
  trenches_differential: number | null;
  source_season: number | null;
  source_timestamp: string | null;
  provenance_status: "available" | "unavailable";
};

/**
 * Coaching Rating v1 context — ANALYSIS CONTEXT ONLY. The rating and every
 * record below are diagnostic/segmentation, never a Sides/Totals model input.
 * ATS records are shown as historical context and are NOT weighted in the
 * rating (research: coach ATS skill did not persist).
 */
export type CoachingContextStatus = "OK" | "COACH_UNRATED" | "SOURCE_UNAVAILABLE";

export type CoachRecordContext = {
  career_wl: string;
  tenure_wl: string;
  season_wl: string;
  career_ats: string;
  tenure_ats: string;
  season_ats: string;
  recent_ats: string;
  small_sample: boolean;
  tenure_year: number | null;
  first_year: boolean;
  interim: boolean;
};

export type CoachingContext = {
  home_coach: string | null;
  away_coach: string | null;
  home_coaching_rating: number | null;
  away_coaching_rating: number | null;
  coaching_differential: number | null;
  coaching_advantage_team: TeamAdvantage | null;
  home_coach_context: CoachRecordContext | null;
  away_coach_context: CoachRecordContext | null;
  rating_version: string | null;
  source_timestamp: string | null;
  pregame_cutoff: string | null;
  coaching_context_status: CoachingContextStatus;
};

/** |differential| <= this -> EVEN (frozen Coaching Rating v1 even_threshold). */
export const COACHING_EVEN_THRESHOLD = 4;

/** One coach's point-in-time snapshot entry (rating-snapshots/<season>/<week>.json). */
export type CoachSnapshotEntry = {
  coach_id: string;
  coach: string;
  team: string;
  coaching_rating: number;
  career_wl: string;
  tenure_wl: string;
  season_wl: string;
  career_ats: string;
  tenure_ats: string;
  season_ats: string;
  recent_ats: string;
  tenure_year: number | null;
  small_sample: boolean;
  first_year: boolean;
  interim: boolean;
};

export type CoachRatingSnapshot = {
  rating_version: string;
  season: number;
  week: number;
  generated_from_cutoff: string | null;
  source_timestamp: string | null;
  coaches: CoachSnapshotEntry[];
};

function coachRecord(entry: CoachSnapshotEntry): CoachRecordContext {
  return {
    career_wl: entry.career_wl,
    tenure_wl: entry.tenure_wl,
    season_wl: entry.season_wl,
    career_ats: entry.career_ats,
    tenure_ats: entry.tenure_ats,
    season_ats: entry.season_ats,
    recent_ats: entry.recent_ats,
    small_sample: entry.small_sample,
    tenure_year: entry.tenure_year,
    first_year: entry.first_year,
    interim: entry.interim,
  };
}

function coachingAdvantageTeam(differential: number | null): TeamAdvantage | null {
  if (differential == null || !Number.isFinite(differential)) return null;
  if (Math.abs(differential) <= COACHING_EVEN_THRESHOLD) return "even";
  return differential > 0 ? "home" : "away";
}

/**
 * Build the coaching context for one game from a point-in-time rating snapshot.
 *
 * Leakage rule (enforced by the caller's snapshot selection AND re-checked
 * here): a game may only consume a snapshot whose `generated_from_cutoff` is
 * not later than the game's kickoff. `snapshot === null` (no leak-safe
 * snapshot, or the current-season source cutoff is invalid) yields
 * SOURCE_UNAVAILABLE — the context NEVER silently falls back to current
 * ratings for a historical game.
 */
export function buildCoachingContext(input: {
  snapshot: CoachRatingSnapshot | null;
  homeTeam: string;
  awayTeam: string;
  gameKickoffUtc?: string | null;
}): CoachingContext {
  const base: CoachingContext = {
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

  const { snapshot, homeTeam, awayTeam, gameKickoffUtc } = input;
  if (!snapshot) return base;
  if (
    gameKickoffUtc != null &&
    snapshot.generated_from_cutoff != null &&
    snapshot.generated_from_cutoff > gameKickoffUtc
  ) {
    // snapshot cutoff is AFTER this game -> would leak -> refuse
    return base;
  }

  const byTeam = new Map(snapshot.coaches.map((c) => [c.team, c]));
  const home = byTeam.get(homeTeam) ?? null;
  const away = byTeam.get(awayTeam) ?? null;
  const meta = {
    rating_version: snapshot.rating_version,
    source_timestamp: snapshot.source_timestamp,
    pregame_cutoff: snapshot.generated_from_cutoff,
  };

  if (!home || !away) {
    return {
      ...base,
      ...meta,
      home_coach: home?.coach ?? null,
      away_coach: away?.coach ?? null,
      home_coaching_rating: home?.coaching_rating ?? null,
      away_coaching_rating: away?.coaching_rating ?? null,
      home_coach_context: home ? coachRecord(home) : null,
      away_coach_context: away ? coachRecord(away) : null,
      coaching_context_status: "COACH_UNRATED",
    };
  }

  const differential = home.coaching_rating - away.coaching_rating;
  return {
    ...meta,
    home_coach: home.coach,
    away_coach: away.coach,
    home_coaching_rating: home.coaching_rating,
    away_coaching_rating: away.coaching_rating,
    coaching_differential: differential,
    coaching_advantage_team: coachingAdvantageTeam(differential),
    home_coach_context: coachRecord(home),
    away_coach_context: coachRecord(away),
    coaching_context_status: "OK",
  };
}

export type PregameGameContext = {
  epa: EpaContext;
  ypp: YppContext;
  trenches: TrenchesContext;
  coaching: CoachingContext;
};

function advantageFromDifferential(differential: number | null): TeamAdvantage | null {
  if (differential == null || !Number.isFinite(differential)) return null;
  if (differential > 0) return "home";
  if (differential < 0) return "away";
  return "even";
}

/** Minimal shape read out of public/data/nfl/matchup-epa.json's `windows["prior-season-full"]`. */
export type EpaPriorSeasonWindow = {
  teams: Record<
    string,
    {
      through: { season: number; dateUtc: string } | null;
      totals: { offense: { offEpa: number; offPlays: number } };
    }
  >;
};

export function buildEpaContext(
  window: EpaPriorSeasonWindow | null,
  homeTeam: string,
  awayTeam: string
): EpaContext {
  const home = window?.teams[homeTeam] ?? null;
  const away = window?.teams[awayTeam] ?? null;
  const homeValue = home && home.totals.offense.offPlays > 0 ? home.totals.offense.offEpa / home.totals.offense.offPlays : null;
  const awayValue = away && away.totals.offense.offPlays > 0 ? away.totals.offense.offEpa / away.totals.offense.offPlays : null;
  const differential = homeValue != null && awayValue != null ? homeValue - awayValue : null;
  return {
    metric: "off.epaPerPlay",
    window: "prior-season-full",
    home_epa_value: homeValue,
    away_epa_value: awayValue,
    epa_advantage_team: advantageFromDifferential(differential),
    epa_differential: differential,
    source_season: home?.through?.season ?? away?.through?.season ?? null,
    source_timestamp: home?.through?.dateUtc ?? away?.through?.dateUtc ?? null,
    provenance_status: homeValue != null && awayValue != null ? "available" : "unavailable",
  };
}

/** Minimal shape read out of public/data/nfl/matchup-metrics.json's `windows["prior-season-full"]`. */
export type MetricsPriorSeasonWindow = {
  teams: Record<
    string,
    {
      through: { season: number; dateUtc: string } | null;
      metrics: Record<string, [number, number]>;
    }
  >;
};

export function buildYppContext(
  window: MetricsPriorSeasonWindow | null,
  homeTeam: string,
  awayTeam: string
): YppContext {
  const home = window?.teams[homeTeam] ?? null;
  const away = window?.teams[awayTeam] ?? null;
  const homeValue = home?.metrics["off.yardsPerPlay"]?.[0] ?? null;
  const awayValue = away?.metrics["off.yardsPerPlay"]?.[0] ?? null;
  const differential = homeValue != null && awayValue != null ? homeValue - awayValue : null;
  return {
    metric: "off.yardsPerPlay",
    window: "prior-season-full",
    home_ypp: homeValue,
    away_ypp: awayValue,
    ypp_advantage_team: advantageFromDifferential(differential),
    ypp_differential: differential,
    source_season: home?.through?.season ?? away?.through?.season ?? null,
    source_timestamp: home?.through?.dateUtc ?? away?.through?.dateUtc ?? null,
    provenance_status: homeValue != null && awayValue != null ? "available" : "unavailable",
  };
}

/** Minimal shape read out of public/data/nfl/matchup-trench-metrics.json's `seasons[season]`. */
export type TrenchSeasonData = {
  throughWeek: number;
  sourceLastModified: string;
  teams: Record<
    string,
    {
      metrics: {
        "off.passBlockWinRate": { valuePct: number };
        "off.runBlockWinRate": { valuePct: number };
        "def.passRushWinRate": { valuePct: number };
        "def.runStopWinRate": { valuePct: number };
      };
    }
  >;
};

function trenchComponents(team: TrenchSeasonData["teams"][string] | null): TrenchesComponents | null {
  if (!team) return null;
  return {
    off_pass_block_win_rate: team.metrics["off.passBlockWinRate"]?.valuePct ?? null,
    off_run_block_win_rate: team.metrics["off.runBlockWinRate"]?.valuePct ?? null,
    def_pass_rush_win_rate: team.metrics["def.passRushWinRate"]?.valuePct ?? null,
    def_run_stop_win_rate: team.metrics["def.runStopWinRate"]?.valuePct ?? null,
  };
}

/** Composite = (off pass+run block win rate) - (opponent's def pass-rush+run-stop win rate). Positive favors the team's offensive line. */
function trenchComposite(components: TrenchesComponents | null): number | null {
  if (!components) return null;
  const { off_pass_block_win_rate, off_run_block_win_rate } = components;
  if (off_pass_block_win_rate == null || off_run_block_win_rate == null) return null;
  return off_pass_block_win_rate + off_run_block_win_rate;
}

/**
 * `seasonData` must be the archive for (gradedGameSeason - 1), the prior
 * completed season -- callers select that season before calling in, so no
 * game/date filtering happens here. `seasonKey` is that season for
 * provenance display.
 */
export function buildTrenchesContext(
  seasonData: TrenchSeasonData | null,
  seasonKey: number | null,
  homeTeam: string,
  awayTeam: string
): TrenchesContext {
  const home = seasonData?.teams[homeTeam] ?? null;
  const away = seasonData?.teams[awayTeam] ?? null;
  const homeComponents = trenchComponents(home);
  const awayComponents = trenchComponents(away);
  const homeComposite = trenchComposite(homeComponents);
  const awayComposite = trenchComposite(awayComponents);
  const differential = homeComposite != null && awayComposite != null ? homeComposite - awayComposite : null;
  return {
    metric: "espn_trench_composite",
    window: "prior_season_through_week_18",
    home_trenches_value: homeComponents,
    away_trenches_value: awayComponents,
    trenches_advantage_team: advantageFromDifferential(differential),
    trenches_differential: differential,
    source_season: seasonData ? seasonKey : null,
    source_timestamp: seasonData?.sourceLastModified ?? null,
    provenance_status: homeComponents != null && awayComponents != null ? "available" : "unavailable",
  };
}

/**
 * The explicit "no leak-safe coaching source" contract. Returned whenever a
 * game has no valid point-in-time snapshot (all historical rows a generator
 * has no snapshot for; a current-season game whose ratings-artifact cutoff is
 * invalid). Never a silent current-ratings fallback.
 */
export const SOURCE_UNAVAILABLE_COACHING_CONTEXT: CoachingContext = {
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

/** @deprecated back-compat alias — use SOURCE_UNAVAILABLE_COACHING_CONTEXT. */
export const NOT_IMPLEMENTED_COACHING_CONTEXT = SOURCE_UNAVAILABLE_COACHING_CONTEXT;

export function buildPregameGameContext(input: {
  epaWindow: EpaPriorSeasonWindow | null;
  yppWindow: MetricsPriorSeasonWindow | null;
  trenchSeasonData: TrenchSeasonData | null;
  trenchSeasonKey: number | null;
  homeTeam: string;
  awayTeam: string;
  /**
   * Optional leak-safe coaching snapshot for this game. Callers select it
   * (historical: rating-snapshots/<season>/<week>.json; current season: the
   * public coaching-ratings artifact only if its source cutoff is valid) and
   * pass it in. Omit / null -> SOURCE_UNAVAILABLE, never a silent fallback.
   */
  coachingSnapshot?: CoachRatingSnapshot | null;
  gameKickoffUtc?: string | null;
}): PregameGameContext {
  return {
    epa: buildEpaContext(input.epaWindow, input.homeTeam, input.awayTeam),
    ypp: buildYppContext(input.yppWindow, input.homeTeam, input.awayTeam),
    trenches: buildTrenchesContext(input.trenchSeasonData, input.trenchSeasonKey, input.homeTeam, input.awayTeam),
    coaching: buildCoachingContext({
      snapshot: input.coachingSnapshot ?? null,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      gameKickoffUtc: input.gameKickoffUtc ?? null,
    }),
  };
}
