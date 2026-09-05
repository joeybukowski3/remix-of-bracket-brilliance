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

export type CoachingContext = {
  home_coaching_rating: null;
  away_coaching_rating: null;
  coaching_advantage_team: null;
  coaching_differential: null;
  coaching_context_status: "NOT_IMPLEMENTED";
};

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

export const NOT_IMPLEMENTED_COACHING_CONTEXT: CoachingContext = {
  home_coaching_rating: null,
  away_coaching_rating: null,
  coaching_advantage_team: null,
  coaching_differential: null,
  coaching_context_status: "NOT_IMPLEMENTED",
};

export function buildPregameGameContext(input: {
  epaWindow: EpaPriorSeasonWindow | null;
  yppWindow: MetricsPriorSeasonWindow | null;
  trenchSeasonData: TrenchSeasonData | null;
  trenchSeasonKey: number | null;
  homeTeam: string;
  awayTeam: string;
}): PregameGameContext {
  return {
    epa: buildEpaContext(input.epaWindow, input.homeTeam, input.awayTeam),
    ypp: buildYppContext(input.yppWindow, input.homeTeam, input.awayTeam),
    trenches: buildTrenchesContext(input.trenchSeasonData, input.trenchSeasonKey, input.homeTeam, input.awayTeam),
    coaching: NOT_IMPLEMENTED_COACHING_CONTEXT,
  };
}
