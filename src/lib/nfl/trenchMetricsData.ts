/**
 * ESPN Analytics trench win-rate consumption (Phase 3B).
 *
 * PBWR / RBWR / PRWR / RSWR are ESPN-created metrics built on NFL Next Gen Stats
 * tracking data. ESPN's published team percentages and official ranks are used
 * verbatim; nothing is approximated or derived from sacks, pressure rate,
 * player leaderboards or play-by-play.
 *
 * The source is cumulative season-to-date only — there is no weekly split,
 * arbitrary window or cross-season blend — so these metrics deliberately do not
 * follow the Phase 2 Season/Last 5 controls and never produce a Last 5 or
 * Last 8 value. Seasons are shown separately and never blended.
 *
 * Ranking: ESPN ranks on finer internal precision than it publishes, so the
 * published whole-number percentages cannot reproduce its 1-32 ordering (RSWR
 * has only ~7 distinct published values). Only ESPN's official rank is stored
 * and displayed; no local rank is computed or presented as verification.
 *
 * Attribution: ESPN Analytics / NFL Next Gen Stats.
 */

export type TrenchPeriodKey = "2025-season" | "2026-season";

export type TrenchMetricValue = {
  /** ESPN's published whole-number percentage, e.g. 71 for "71%". */
  valuePct: number;
  /** ESPN's official league rank, 1-32. */
  espnRank: number;
};

export type TrenchSeason = {
  articleId: string;
  /** Parsed from ESPN's freshness marker; null when it could not be read safely. */
  throughWeek: number | null;
  sourceUpdatedText: string | null;
  sourceLastModified: string | null;
  teams: Record<string, { espnSlug: string; metrics: Record<string, TrenchMetricValue> }>;
};

export type TrenchMetricsArtifact = {
  schemaVersion: string;
  generatedAt: string;
  source: string;
  attribution: string;
  metricColumns: Record<string, string>;
  seasons: Record<string, TrenchSeason>;
  provenance: unknown;
};

export const TRENCH_METRICS_ARTIFACT_PATH = "/data/nfl/matchup-trench-metrics.json";

/** The four analyzer metrics ESPN supplies. Nothing else is sourced from it. */
export const TRENCH_METRIC_KEYS: readonly string[] = [
  "off.passBlockWinRate",
  "off.runBlockWinRate",
  "def.passRushWinRate",
  "def.runStopWinRate",
] as const;

export function isTrenchMetric(metricKey: string): boolean {
  return TRENCH_METRIC_KEYS.includes(metricKey);
}

/** Completed 2026 games each team needs before the matchup drops the 2025 period. */
export const TRENCH_TRANSITION_GAME_COUNT = 6;

export const TRENCH_PRIOR_SEASON = 2025;
export const TRENCH_CURRENT_SEASON = 2026;

const PERIOD_SEASON: Record<TrenchPeriodKey, number> = {
  "2025-season": TRENCH_PRIOR_SEASON,
  "2026-season": TRENCH_CURRENT_SEASON,
};

/**
 * Completed regular-season games for one team, counted from the repository's
 * own results — independent of any generated artifact.
 */
export function countCompletedGames(
  results: readonly { seasonType?: string; final?: boolean; homeAbbr?: string; awayAbbr?: string }[] | null | undefined,
  teamAbbr: string
): number {
  if (!results) return 0;
  let count = 0;
  for (const result of results) {
    if (result.seasonType !== "REG" || result.final !== true) continue;
    if (result.homeAbbr === teamAbbr || result.awayAbbr === teamAbbr) count += 1;
  }
  return count;
}

/**
 * Which periods the Trenches section shows.
 *
 *   both 0 completed 2026 games -> 2025 Season only (no empty 2026 column)
 *   any completed, either < 6   -> 2025 Season + 2026 Through Week X
 *   both >= 6                   -> 2026 only, 2025 hidden
 *
 * The matchup transitions as one unit: 6 vs 5 keeps both teams in the
 * two-period state, so a bye can never move one side ahead of the other.
 * Counts are completed games, never week numbers.
 */
export function resolveTrenchPeriods(
  awayCompleted: number,
  homeCompleted: number
): TrenchPeriodKey[] {
  const away = Number.isFinite(awayCompleted) && awayCompleted > 0 ? Math.floor(awayCompleted) : 0;
  const home = Number.isFinite(homeCompleted) && homeCompleted > 0 ? Math.floor(homeCompleted) : 0;

  if (Math.max(away, home) === 0) return ["2025-season"];
  if (Math.min(away, home) < TRENCH_TRANSITION_GAME_COUNT) return ["2025-season", "2026-season"];
  return ["2026-season"];
}

/**
 * Period label. The current season reports ESPN's published week when it parsed
 * safely, otherwise falls back to "Season to Date" — the week is never guessed.
 */
export function trenchPeriodLabel(
  artifact: TrenchMetricsArtifact | null,
  period: TrenchPeriodKey
): { label: string; short: string } {
  const season = PERIOD_SEASON[period];
  if (period === "2025-season") return { label: "2025 Season", short: "2025" };

  const week = artifact?.seasons?.[String(season)]?.throughWeek ?? null;
  if (week == null) return { label: `${season} Season to Date`, short: `${season} STD` };
  return { label: `${season} Through Week ${week}`, short: `${season} Wk ${week}` };
}

/** One compact section-level explanation — never repeated per row. */
export function describeTrenchPeriods(periods: readonly TrenchPeriodKey[]): string {
  if (periods.length === 1 && periods[0] === "2025-season") {
    return "Trench win rates are ESPN Analytics season-level metrics based on NFL Next Gen Stats tracking data.";
  }
  if (periods.includes("2025-season")) {
    return "Trench metrics show the 2025 final season alongside ESPN's developing 2026 season-to-date values.";
  }
  return "Trench metrics show ESPN's 2026 season-to-date values through the latest published week.";
}

export type TrenchResolver = (
  teamAbbr: string,
  metricKey: string,
  period: TrenchPeriodKey
) => TrenchMetricValue | null;

/**
 * Look up one published trench value. Returns null — never a substituted or
 * cross-season value — when the season, team or metric is absent, so the row
 * renders "N/A".
 */
export function createTrenchResolver(artifact: TrenchMetricsArtifact | null): TrenchResolver {
  if (!artifact?.seasons) return () => null;
  return (teamAbbr, metricKey, period) => {
    const season = artifact.seasons[String(PERIOD_SEASON[period])];
    const value = season?.teams?.[teamAbbr]?.metrics?.[metricKey];
    if (!value || !Number.isFinite(value.valuePct) || !Number.isFinite(value.espnRank)) return null;
    return value;
  };
}

/**
 * Display formatting. ESPN publishes whole numbers, so no decimal precision is
 * invented.
 */
export function formatTrenchValue(value: TrenchMetricValue | null): string {
  if (!value || !Number.isFinite(value.valuePct)) return "N/A";
  return `${value.valuePct}%`;
}

/** Gather a team's value for each visible period, leaving absent periods null. */
export function collectTrenchPeriodValues(
  resolve: TrenchResolver,
  teamAbbr: string,
  metricKey: string,
  periods: readonly TrenchPeriodKey[]
): Partial<Record<TrenchPeriodKey, TrenchMetricValue | null>> {
  const out: Partial<Record<TrenchPeriodKey, TrenchMetricValue | null>> = {};
  for (const period of periods) out[period] = resolve(teamAbbr, metricKey, period);
  return out;
}
