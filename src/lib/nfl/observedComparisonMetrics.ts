import { EPA_ARTIFACT_PATH, isEpaMetric, type EpaArtifact } from "./epaData";
import { MATCHUP_METRICS_ARTIFACT_PATH, type MatchupMetricsArtifact } from "./matchupMetricsData";
import { SUCCESS_RATES_ARTIFACT_PATH, isSuccessRateMetric, type SuccessRatesArtifact } from "./successRateData";
import { TRENCH_METRICS_ARTIFACT_PATH, isTrenchMetric, type TrenchMetricsArtifact } from "./trenchMetricsData";
import type { ComparisonCompletedGames } from "./comparisonCompletedGames";

export type ObservedComparisonValue = {
  value: number | null;
  /** Provider/window rank for observed-only presentation; never used in blend math. */
  rank?: number | null;
  source: string;
  version: string;
  generatedAt: string;
  cutoff: string | null;
  gameIds: readonly string[] | null;
  precision: "raw" | "published";
  issue?: string;
};
export type ObservedComparisonResolver = (abbr: string, key: string) => ObservedComparisonValue | null;
export type ObservedComparisonSources = {
  conventional: MatchupMetricsArtifact | null;
  epa: EpaArtifact | null;
  success: SuccessRatesArtifact | null;
  trench: TrenchMetricsArtifact | null;
};

export function sameGameSample(actual: readonly string[] | null, expected: readonly string[]): boolean {
  return Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length &&
    actual.every((id) => expected.includes(id));
}

/** Explicit full-season selection. Never invokes historical/rolling fallback policies. */
export function createObservedComparisonResolver(
  sources: ObservedComparisonSources,
  season: 2025 | 2026,
): ObservedComparisonResolver {
  return (abbr, key) => {
    const windowId = season === 2026 ? "season-current" : "prior-season-full";
    if (isTrenchMetric(key)) {
      const artifact = sources.trench;
      const entry = artifact?.seasons?.[String(season)];
      const metric = entry?.teams?.[abbr]?.metrics?.[key];
      if (!artifact || !entry || !metric) return null;
      return { value: metric.valuePct, rank: metric.espnRank, source: TRENCH_METRICS_ARTIFACT_PATH, version: artifact.schemaVersion,
        generatedAt: artifact.generatedAt, cutoff: entry.sourceLastModified, gameIds: null, precision: "published",
        issue: "Trench source does not identify its completed-game sample" };
    }
    if (isSuccessRateMetric(key)) {
      const artifact = sources.success;
      if (!artifact || artifact._meta?.currentSeason !== 2026) return null;
      const team = artifact.periods?.[`${season}-season`]?.[abbr];
      const metric = team?.metrics?.[key];
      if (!team || !metric) return null;
      return { value: Number.isFinite(metric.raw) ? metric.raw * 100 : null,
        rank: metric.rank,
        source: SUCCESS_RATES_ARTIFACT_PATH, version: artifact._meta.schemaVersion,
        generatedAt: artifact._meta.generatedAt, cutoff: null, gameIds: team.gameIds, precision: "raw" };
    }
    const isEpa = isEpaMetric(key);
    const artifact = isEpa ? sources.epa : sources.conventional;
    if (!artifact?._meta || (isEpa ? sources.epa?.currentSeason : sources.conventional?._meta?.currentSeason) !== 2026) return null;
    const window = artifact.windows?.[windowId];
    const team = window?.teams?.[abbr];
    if (!team || !Array.isArray(team.seasons) || team.seasons.length !== 1 || team.seasons[0] !== season ||
        team.through?.season !== season || !Array.isArray(team.gameIds) || team.gamesIncluded !== team.gameIds.length ||
        (season === 2026 && (window.includePriorSeason || window.mode !== "season"))) return null;
    let value: number | null = null;
    let precision: ObservedComparisonValue["precision"] = "published";
    if (isEpa) {
      const totals = sources.epa!.windows[windowId].teams[abbr].totals;
      const side = key.startsWith("def.") ? totals?.defense : totals?.offense;
      const prefix = key.includes("Pass") ? "pass" : key.includes("Rush") ? "rush" : "off";
      if (side && side[`${prefix}Plays`] > 0) {
        value = side[`${prefix}Epa`] / side[`${prefix}Plays`];
        precision = "raw";
      }
    } else {
      const raw = sources.conventional!.windows[windowId].teams[abbr].rawMetrics?.[key];
      value = raw !== undefined ? raw : team.metrics?.[key]?.[0] ?? null;
      if (raw !== undefined) precision = "raw";
    }
    return { value, source: isEpa ? EPA_ARTIFACT_PATH : MATCHUP_METRICS_ARTIFACT_PATH,
      rank: team.metrics?.[key]?.[1] ?? null,
      version: artifact._meta.schemaVersion, generatedAt: artifact._meta.generatedAt,
      cutoff: team.through.dateUtc, gameIds: team.gameIds, precision };
  };
}

export function observedSampleIssue(value: ObservedComparisonValue | null, games: ComparisonCompletedGames, abbr: string): string | null {
  if (!value || value.value == null || !Number.isFinite(value.value)) return "Observed 2026 value missing";
  if (!Number.isFinite(Date.parse(value.generatedAt))) return "Observed timestamp missing";
  const expected = games.byTeam.get(abbr);
  if (!expected || !sameGameSample(value.gameIds, expected)) return value.issue ?? "Observed sample differs from completed results";
  return null;
}
