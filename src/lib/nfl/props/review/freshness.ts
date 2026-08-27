/**
 * Source freshness classification for the NFL Yardage Props Review page.
 * Pure presentation/diagnostic helpers -- never used by the model, the
 * Matchup Score, or any generator. Each source on this page (projection,
 * depth chart, sportsbook line, opponent context) has its own real-world
 * refresh cadence, so each gets its own fresh/aging/stale thresholds rather
 * than one arbitrary global cutoff:
 *
 *   - Projection: regenerated at most once per week (Phase 9 weekly-snapshot
 *     contract), so same-day is "fresh" and anything beyond a few days old
 *     signals the week's snapshot was never refreshed.
 *   - Depth chart: the source artifact already computes its own binary
 *     stale flag at a 48h threshold (`DEPTH_CHART_STALENESS_THRESHOLD_HOURS`
 *     in `currentWeekDepthChart.ts`) -- this module's "stale" tier boundary
 *     matches that number exactly so the two never disagree.
 *   - Sportsbook line: refreshes multiple times a day during the season
 *     (see `nfl-yardage-market.yml`), so a much shorter window applies.
 *   - Opponent context (EPA / Success Rate / production-allowed): each is a
 *     weekly-cadence artifact; the review page shows the OLDEST of the
 *     three as the worst-case signal for this compact overlay.
 */

export type NflFreshnessTier = "fresh" | "aging" | "stale" | "unknown";

export type NflFreshnessThresholds = {
  /** Age (hours) at or below which the source counts as "fresh". */
  freshMaxHours: number;
  /** Age (hours) at or below which the source counts as "aging" (beyond this, "stale"). */
  agingMaxHours: number;
};

export type NflFreshnessResult = {
  tier: NflFreshnessTier;
  ageHours: number | null;
  generatedAt: string | null;
};

export const NFL_YARDAGE_FRESHNESS_THRESHOLDS = {
  projection: { freshMaxHours: 24, agingMaxHours: 72 },
  depthChart: { freshMaxHours: 24, agingMaxHours: 48 },
  sportsbook: { freshMaxHours: 6, agingMaxHours: 24 },
  opponentContext: { freshMaxHours: 168, agingMaxHours: 336 },
} as const satisfies Record<string, NflFreshnessThresholds>;

export type NflYardageFreshnessSourceKey = keyof typeof NFL_YARDAGE_FRESHNESS_THRESHOLDS;

/** Negative age (clock skew / future timestamp) is treated as fresh rather than surfaced as a false stale warning. */
export function classifyFreshness(
  generatedAt: string | null | undefined,
  thresholds: NflFreshnessThresholds,
  now: Date = new Date(),
): NflFreshnessResult {
  if (!generatedAt) return { tier: "unknown", ageHours: null, generatedAt: null };
  const generatedMs = Date.parse(generatedAt);
  if (Number.isNaN(generatedMs)) return { tier: "unknown", ageHours: null, generatedAt: null };

  const ageHours = (now.getTime() - generatedMs) / (1000 * 60 * 60);
  if (ageHours <= 0) return { tier: "fresh", ageHours, generatedAt };
  if (ageHours <= thresholds.freshMaxHours) return { tier: "fresh", ageHours, generatedAt };
  if (ageHours <= thresholds.agingMaxHours) return { tier: "aging", ageHours, generatedAt };
  return { tier: "stale", ageHours, generatedAt };
}

/** The single oldest ISO timestamp among the inputs (nulls ignored), or null if none are present. */
export function oldestTimestamp(timestamps: readonly (string | null | undefined)[]): string | null {
  let oldest: { value: string; ms: number } | null = null;
  for (const value of timestamps) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) continue;
    if (!oldest || ms < oldest.ms) oldest = { value, ms };
  }
  return oldest?.value ?? null;
}

export type NflYardageFreshnessSource = {
  key: NflYardageFreshnessSourceKey;
  label: string;
} & NflFreshnessResult;

export type NflYardageFreshnessInputs = {
  projectionGeneratedAt: string | null | undefined;
  depthChartSnapshotAt: string | null | undefined;
  sportsbookGeneratedAt: string | null | undefined;
  opponentContextGeneratedAts: readonly (string | null | undefined)[];
};

const SOURCE_LABELS: Record<NflYardageFreshnessSourceKey, string> = {
  projection: "Projections",
  depthChart: "Depth chart",
  sportsbook: "Sportsbook",
  opponentContext: "Opponent context",
};

export function buildYardageReviewFreshness(
  inputs: NflYardageFreshnessInputs,
  now: Date = new Date(),
): readonly NflYardageFreshnessSource[] {
  const opponentContextGeneratedAt = oldestTimestamp(inputs.opponentContextGeneratedAts);
  const entries: readonly [NflYardageFreshnessSourceKey, string | null | undefined][] = [
    ["projection", inputs.projectionGeneratedAt],
    ["depthChart", inputs.depthChartSnapshotAt],
    ["sportsbook", inputs.sportsbookGeneratedAt],
    ["opponentContext", opponentContextGeneratedAt],
  ];
  return entries.map(([key, generatedAt]) => ({
    key,
    label: SOURCE_LABELS[key],
    ...classifyFreshness(generatedAt, NFL_YARDAGE_FRESHNESS_THRESHOLDS[key], now),
  }));
}

/** Worst tier across all sources, "unknown" ranked below "stale" since a missing source is at least as concerning. */
export function worstFreshnessTier(sources: readonly NflYardageFreshnessSource[]): NflFreshnessTier {
  const rank: Record<NflFreshnessTier, number> = { fresh: 0, aging: 1, stale: 2, unknown: 3 };
  let worst: NflFreshnessTier = "fresh";
  for (const source of sources) {
    if (rank[source.tier] > rank[worst]) worst = source.tier;
  }
  return worst;
}
