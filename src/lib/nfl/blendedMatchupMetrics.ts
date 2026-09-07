import { MATCHUP_CATEGORIES } from "./matchupCategoryAdvantage";
import { getMetricDef, type NflMatchupMetricResolver, type NflMatchupMetricValue } from "./matchupMetrics";
import { formatMetricValue } from "./matchupMetricsData";
import { rankProjectedMetric, type ProjectedMatchupMetricsArtifact } from "./projectedMatchupMetrics";
import { getProjectionBlendWeights, PROJECTION_BLEND_POLICY, projectionBlendFamily, projectionBlendMode,
  type ProjectionBlendPolicy, type ProjectionBlendWeights } from "./projectionBlendPolicy";
import { observedSampleIssue, type ObservedComparisonResolver, type ObservedComparisonValue } from "./observedComparisonMetrics";
import type { ComparisonCompletedGames } from "./comparisonCompletedGames";
import type { CurrentRatingBoard } from "./currentRating2026";
import type { CurrentRatingSourceProvenance } from "@/hooks/useNflCurrentRating2026";

export const BLENDED_LENS_DESCRIPTION = "Combines JKB 2026 projections with observed 2026 performance, fading the projection prior as each team accumulates completed games.";
export const BLENDED_RATING_NOTE = "JKB Power Rating is model-managed: canonical Current Rating is used directly, with its own six-game fade and no additional blend.";
export const COMPARISON_STAT_KEYS = [...new Set(MATCHUP_CATEGORIES.flatMap((category) =>
  category.metrics.flatMap((ref) => ref.kind === "metric" ? [ref.key] : [])))];

export type BlendedMetricProvenance = {
  mode: ReturnType<typeof projectionBlendMode>;
  policyVersion: string | null;
  projectedValue: number | null;
  observedValue: number | null;
  blendedValue: number | null;
  projected: { source: string; version: string; generatedAt: string | null; cutoff: string | null } | null;
  observed: ObservedComparisonValue | null;
  completedGames: number | null;
  modelCompletedGames?: number;
  weights: ProjectionBlendWeights | null;
  results: Omit<ComparisonCompletedGames, "byTeam"> | null;
  availableTeams: number;
  excludedTeams: string[];
  issue: string | null;
};

/** Raw values first, league ranks second, formatting last. No observed fallback resolver. */
export function createBlendedMatchupMetrics(input: {
  teams: readonly { abbr: string }[];
  projected: ProjectedMatchupMetricsArtifact | null;
  observed: ObservedComparisonResolver;
  completed: ComparisonCompletedGames | null;
  currentRating: CurrentRatingBoard | null;
  ratingProvenance?: CurrentRatingSourceProvenance;
  policy?: ProjectionBlendPolicy;
}) {
  const policy = input.policy ?? PROJECTION_BLEND_POLICY;
  const records = new Map<string, BlendedMetricProvenance>();
  const values = new Map<string, NflMatchupMetricValue>();
  const projectedTeams = new Map(input.projected?.teams.map((team) => [team.abbr, team]) ?? []);
  const results = input.completed ? { source: input.completed.source, version: input.completed.version,
    generatedAt: input.completed.generatedAt } : null;
  for (const key of ["team.overallRating", ...COMPARISON_STAT_KEYS]) {
    const raw = new Map<string, number>();
    for (const { abbr } of input.teams) {
      const ids = input.completed?.byTeam.get(abbr);
      const count = ids?.length ?? null;
      const modelManaged = projectionBlendMode(key) === "modelManaged";
      const projection = input.projected?.season === 2026 ? projectedTeams.get(abbr)?.metrics[key]?.value ?? null : null;
      const observed = input.observed(abbr, key);
      const record: BlendedMetricProvenance = {
        mode: projectionBlendMode(key), policyVersion: modelManaged ? null : policy.version,
        projectedValue: projection, observedValue: observed?.value ?? null, blendedValue: null,
        projected: input.projected?.metrics[key] ? { source: input.projected.metrics[key].source,
          version: `${input.projected.projectionVersion} / ${input.projected.metrics[key].modelVersion}`,
          generatedAt: input.projected.generatedAt, cutoff: input.projected.asOf } : null,
        observed, completedGames: count, weights: count == null ? null : getProjectionBlendWeights(count, projectionBlendFamily(key), policy),
        results, availableTeams: 0, excludedTeams: [], issue: null,
      };
      if (modelManaged) {
        const rating = input.currentRating?.season === 2026 ? input.currentRating.teams.find((team) => team.abbr === abbr) : null;
        record.weights = rating ? { projectionWeight: rating.preseasonWeight, observedWeight: rating.performanceWeight } : null;
        record.projectedValue = rating?.preseasonV04Rating ?? null;
        record.observedValue = rating?.performanceRating ?? null;
        record.modelCompletedGames = rating?.gamesPlayed;
        record.projected = { source: "/data/nfl/2026/projected-power-ratings-v04.json", version: input.ratingProvenance?.projectedVersion ?? "nfl-power-v0.4-beta", generatedAt: null, cutoff: input.ratingProvenance?.projectedCutoff ?? null };
        record.observed = { value: rating?.performanceRating ?? null, source: "/data/nfl/2026/team-performance-analytics.json",
          version: input.ratingProvenance?.observedVersion ?? "nfl-performance-v1",
          generatedAt: input.ratingProvenance?.observedGeneratedAt ?? "unavailable", cutoff: null, gameIds: null, precision: "raw" };
        record.availableTeams = input.currentRating?.teams.length ?? 0;
        record.issue = !rating ? "Canonical Current Rating unavailable" : count !== rating.gamesPlayed
          ? "Canonical rating sample differs from results; model value retained unchanged" : null;
        record.blendedValue = rating?.rating ?? null;
        if (rating && Number.isFinite(rating.rating)) values.set(`${abbr}|${key}`, {
          key, value: rating.rating, rank: rating.rank, formattedValue: rating.rating.toFixed(1),
          source: BLENDED_RATING_NOTE,
        });
      } else if (count == null || !input.completed) {
        record.issue = "Completed-game sample unavailable";
      } else {
        const weights = record.weights!;
        if (weights.projectionWeight > 0 && (projection == null || !Number.isFinite(projection))) {
          record.issue = "Projected 2026 value missing";
        } else if (weights.projectionWeight > 0 && weights.observedWeight > 0 && input.projected?.metrics[key]?.opponentAdjusted) {
          record.issue = "Opponent-adjusted projection has no matching adjusted observed counterpart";
        } else if (weights.observedWeight > 0 && observedSampleIssue(observed, input.completed, abbr)) {
          record.issue = observedSampleIssue(observed, input.completed, abbr);
        } else {
          const value = (weights.projectionWeight > 0 ? weights.projectionWeight * projection! : 0) +
            (weights.observedWeight > 0 ? weights.observedWeight * observed!.value! : 0);
          if (Number.isFinite(value)) { record.blendedValue = value; raw.set(abbr, value); }
          else record.issue = "Nonfinite blended value";
        }
      }
      records.set(`${abbr}|${key}`, record);
    }
    if (key === "team.overallRating") continue; // Canonical ranking is also model-owned.
    const ranks = rankProjectedMetric(raw, getMetricDef(key)!.direction);
    const excluded = input.teams.filter((team) => !raw.has(team.abbr)).map((team) => team.abbr).sort();
    for (const { abbr } of input.teams) {
      const record = records.get(`${abbr}|${key}`)!;
      record.availableTeams = raw.size;
      record.excludedTeams = excluded;
      const value = raw.get(abbr);
      if (value !== undefined) values.set(`${abbr}|${key}`, { key, value, rank: ranks.get(abbr) ?? null,
        formattedValue: formatMetricValue(key, value), source: `${policy.version}; ${raw.size} available teams`,
        updatedAt: input.completed?.generatedAt });
    }
  }
  const resolve: NflMatchupMetricResolver = (abbr, key) => values.get(`${abbr}|${key}`) ?? null;
  return { resolve, provenance: (abbr: string, key: string) => records.get(`${abbr}|${key}`) ?? null };
}

/** Explicit observed season lens retains source-window ranks, including ESPN's finer-precision ranks. */
export function createSeasonComparisonMetrics(teams: readonly { abbr: string }[], observed: ObservedComparisonResolver): NflMatchupMetricResolver {
  const values = new Map<string, NflMatchupMetricValue>();
  for (const key of COMPARISON_STAT_KEYS) {
    for (const { abbr } of teams) {
      const metric = observed(abbr, key);
      if (metric?.value != null && Number.isFinite(metric.value)) values.set(`${abbr}|${key}`, {
        key, value: metric.value, rank: metric.rank ?? null, formattedValue: formatMetricValue(key, metric.value),
        source: metric.source, updatedAt: metric.generatedAt,
      });
    }
  }
  return (abbr, key) => values.get(`${abbr}|${key}`) ?? null;
}
