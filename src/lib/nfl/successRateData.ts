/**
 * RBSDM success-rate consumption (Phase 3A).
 *
 * Success rate deliberately does NOT follow the Phase 2 Season/Last 5 +
 * historical-blend controls. RBSDM publishes the finished rate but not the
 * eligible-play denominator, so two season ranges cannot be combined exactly.
 * Rather than approximate a blend, the analyzer shows the relevant periods side
 * by side and switches which periods are visible as the 2026 season develops.
 *
 * Values here are RBSDM's published numbers, consumed verbatim — success is
 * never recomputed at the play level anywhere in this repository.
 *
 * Attribution: RBSDM / Ben Baldwin (https://rbsdm.com/stats).
 */

export type SuccessPeriodKey = "2025-last8" | "2026-season" | "2026-last5";

export type SuccessMetricValue = {
  /** Display percentage, e.g. 50.5. */
  pct: number;
  /** Unrounded source fraction, e.g. 0.5049900199600799. Used for ranking. */
  raw: number;
  rank: number | null;
};

export type SuccessRateTeamPeriod = {
  gamesIncluded: number | null;
  gameIds: string[] | null;
  metrics: Record<string, SuccessMetricValue>;
};

export type SuccessRatesArtifact = {
  _meta: {
    schemaVersion: string;
    generatedAt: string;
    source: string;
    attribution: string;
    endpoint: string;
    currentSeason: number;
    priorSeason: number;
    completedGameCounts: Record<string, Record<string, number>>;
    notes: string[];
  };
  periods: Partial<Record<SuccessPeriodKey, Record<string, SuccessRateTeamPeriod>>>;
};

export const SUCCESS_RATES_ARTIFACT_PATH = "/data/nfl/matchup-success-rates.json";

/** The six analyzer metrics RBSDM supplies. Nothing else is sourced from it. */
export const SUCCESS_RATE_METRIC_KEYS: readonly string[] = [
  "off.successRate",
  "off.passSuccessRate",
  "off.rushSuccessRate",
  "def.successRateAllowed",
  "def.passSuccessRateAllowed",
  "def.rushSuccessRateAllowed",
] as const;

export function isSuccessRateMetric(metricKey: string): boolean {
  return SUCCESS_RATE_METRIC_KEYS.includes(metricKey);
}

/** Completed 2026 games each team needs before the matchup switches presentation. */
export const SUCCESS_TRANSITION_GAME_COUNT = 6;

export const SUCCESS_PERIOD_LABELS: Record<SuccessPeriodKey, { label: string; short: string }> = {
  "2025-last8": { label: "2025 Last 8", short: "2025 L8" },
  "2026-season": { label: "2026 Season", short: "2026 Szn" },
  "2026-last5": { label: "2026 Last 5", short: "2026 L5" },
};

/**
 * Which periods the matchup shows, from each team's completed 2026 game count.
 *
 * The whole matchup transitions together — a comparison where one team showed
 * Last 5 and the other showed Last 8 would not be comparable. So the switch
 * happens only when BOTH teams have reached the threshold.
 *
 *   both 0 completed          -> 2025 Last 8 only
 *   any completed, either < 6 -> 2025 Last 8 + 2026 Season
 *   both >= 6                 -> 2026 Season + 2026 Last 5 (2025 hidden)
 *
 * Counts are completed games, never week numbers, so a bye cannot trigger an
 * early transition.
 */
export function resolveSuccessPeriods(
  awayCompleted: number,
  homeCompleted: number
): SuccessPeriodKey[] {
  const away = Number.isFinite(awayCompleted) && awayCompleted > 0 ? Math.floor(awayCompleted) : 0;
  const home = Number.isFinite(homeCompleted) && homeCompleted > 0 ? Math.floor(homeCompleted) : 0;

  if (Math.max(away, home) === 0) return ["2025-last8"];
  if (Math.min(away, home) < SUCCESS_TRANSITION_GAME_COUNT) return ["2025-last8", "2026-season"];
  return ["2026-season", "2026-last5"];
}

/** One compact explanation per section — never repeated on every metric row. */
export function describeSuccessPeriods(periods: SuccessPeriodKey[]): string {
  if (periods.length === 1) {
    return "Success rate shows each team's final eight completed 2025 games.";
  }
  if (periods.includes("2025-last8")) {
    return "Success rate shows 2025 Last 8 alongside the developing 2026 season.";
  }
  return "Success rate shows 2026 season performance and each team's most recent five games.";
}

/** Completed regular-season games in `season` for a canonical team abbreviation. */
export function completedGamesFor(
  artifact: SuccessRatesArtifact | null,
  season: number,
  teamAbbr: string
): number {
  return artifact?._meta?.completedGameCounts?.[String(season)]?.[teamAbbr] ?? 0;
}

export type SuccessRateResolver = (
  teamAbbr: string,
  metricKey: string,
  period: SuccessPeriodKey
) => SuccessMetricValue | null;

/**
 * Look up one published success rate. Returns null — never a substituted value —
 * when the period, team or metric is absent, so the row renders "N/A".
 */
export function createSuccessRateResolver(
  artifact: SuccessRatesArtifact | null
): SuccessRateResolver {
  if (!artifact?.periods) return () => null;
  return (teamAbbr, metricKey, period) => {
    const value = artifact.periods[period]?.[teamAbbr]?.metrics?.[metricKey];
    if (!value || !Number.isFinite(value.pct)) return null;
    return value;
  };
}

/**
 * Gather one team's value for each visible period, keyed by period.
 * Missing periods stay null so the row shows "N/A" for that line rather than
 * borrowing another period's number.
 */
export function collectPeriodValues(
  resolve: SuccessRateResolver,
  teamAbbr: string,
  metricKey: string,
  periods: readonly SuccessPeriodKey[]
): Partial<Record<SuccessPeriodKey, SuccessMetricValue | null>> {
  const out: Partial<Record<SuccessPeriodKey, SuccessMetricValue | null>> = {};
  for (const period of periods) out[period] = resolve(teamAbbr, metricKey, period);
  return out;
}

/** Display formatting. Rounding happens here only; ranking uses `raw`. */
export function formatSuccessRate(value: SuccessMetricValue | null): string {
  if (!value || !Number.isFinite(value.pct)) return "N/A";
  return `${value.pct.toFixed(1)}%`;
}
