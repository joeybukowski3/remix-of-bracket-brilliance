import { z } from "zod";
import { MATCHUP_CATEGORIES } from "@/lib/nfl/matchupCategoryAdvantage";
import { getMetricDef, type NflMatchupMetricResolver } from "@/lib/nfl/matchupMetrics";
import { formatMetricValue } from "@/lib/nfl/matchupMetricsData";
import type { CanonicalNflTeam } from "@/lib/nfl/standings";

export type MatchupComparisonLens = "observed" | "projection";
export const PROJECTED_MATCHUP_METRICS_PATH = "/data/nfl/2026/projected-matchup-metrics.json";
export const PROJECTION_LENS_DESCRIPTION =
  "Forward-looking JKB team projections for the 2026 season. Projected metrics are distinct from observed 2025 and 2026 performance.";
export const PROJECTION_RATING_NOTE =
  "JKB Power Rating uses the canonical current 2026 rating, including its preseason anchor. Other metrics show N/A until a season projection is available.";

const metricKeys = new Set(MATCHUP_CATEGORIES.flatMap((category) =>
  category.metrics.flatMap((ref) => ref.kind === "metric" ? [ref.key] : [])
));
const timestamp = z.string().datetime({ offset: true });
const metricSchema = z.object({
  value: z.number().finite(),
  rank: z.number().int().min(1).max(32).nullable(),
}).strict();
const artifactSchema = z.object({
  schemaVersion: z.literal("nfl-projected-matchup-metrics-v1"),
  season: z.literal(2026),
  horizon: z.literal("regular-season"),
  generatedAt: timestamp,
  asOf: timestamp,
  projectionVersion: z.string().min(1),
  // Shared per-column provenance prevents mixing definitions across teams.
  metrics: z.record(z.object({
    source: z.string().min(1),
    producer: z.string().min(1),
    modelVersion: z.string().min(1),
    definition: z.string().min(1),
    opponentAdjusted: z.boolean(),
    dependsOnPowerRating: z.literal(false),
  }).strict()),
  // All 32 identity slots are required. Omitted/null metrics are unavailable.
  teams: z.array(z.object({
    teamId: z.string().min(1),
    abbr: z.string().min(1),
    metrics: z.record(metricSchema.nullable()),
  }).strict()).length(32),
}).strict();

export type ProjectedMatchupMetricsArtifact = z.infer<typeof artifactSchema>;
export type ProjectionTeamIdentity = Pick<CanonicalNflTeam, "id" | "abbr">;

/** Competition ranks from unrounded values; context metrics are never ranked. */
export function rankProjectedMetric(
  values: ReadonlyMap<string, number>,
  direction: "higher-is-better" | "lower-is-better" | "context-only",
): Map<string, number | null> {
  const sorted = [...values].filter(([, value]) => Number.isFinite(value));
  sorted.sort((a, b) => (direction === "lower-is-better" ? a[1] - b[1] : b[1] - a[1]) || a[0].localeCompare(b[0]));
  let rank = 0;
  return new Map(sorted.map(([abbr, value], index) => {
    if (index === 0 || value !== sorted[index - 1][1]) rank = index + 1;
    return [abbr, direction === "context-only" ? null : rank];
  }));
}

/** Reject wrong identity, season, provenance or ranks instead of repairing data. */
export function validateProjectedMatchupMetrics(
  input: unknown,
  canonicalTeams: readonly ProjectionTeamIdentity[],
): ProjectedMatchupMetricsArtifact {
  const artifact = artifactSchema.parse(input);
  const canonical = new Map(canonicalTeams.map((team) => [team.abbr, team.id]));
  if (canonical.size !== 32 || new Set(canonical.values()).size !== 32) {
    throw new Error("Projection requires the canonical 32-team registry.");
  }
  if (Date.parse(artifact.asOf) > Date.parse(artifact.generatedAt)) {
    throw new Error("Projection asOf must not follow generatedAt.");
  }
  const seen = new Set<string>();
  for (const team of artifact.teams) {
    if (canonical.get(team.abbr) !== team.teamId || seen.has(team.abbr)) {
      throw new Error(`Invalid or duplicate projected team: ${team.abbr}`);
    }
    seen.add(team.abbr);
    for (const [key, metric] of Object.entries(team.metrics)) {
      if (!metricKeys.has(key) || !artifact.metrics[key]) {
        throw new Error(`Unknown projected metric or missing provenance: ${key}`);
      }
      const format = getMetricDef(key)!.format;
      if (metric && ((format === "percent1" && (metric.value < 0 || metric.value > 100)) ||
          (format !== "epa" && metric.value < 0))) {
        throw new Error(`Invalid projected value: ${team.abbr} ${key}`);
      }
    }
  }
  for (const key of Object.keys(artifact.metrics)) {
    if (!metricKeys.has(key)) throw new Error(`Unknown projected metric: ${key}`);
    const values = new Map(artifact.teams.flatMap((team) => {
      const metric = team.metrics[key];
      return metric ? [[team.abbr, metric.value] as const] : [];
    }));
    const ranks = rankProjectedMetric(values, getMetricDef(key)!.direction);
    for (const team of artifact.teams) {
      const metric = team.metrics[key];
      if (metric && metric.rank !== ranks.get(team.abbr)) {
        throw new Error(`Projected rank disagrees with values: ${team.abbr} ${key}`);
      }
    }
  }
  return artifact;
}

/** Dedicated abbreviation lookup. Never consults any observed artifact. */
export function createProjectedMatchupMetricResolver(
  artifact: ProjectedMatchupMetricsArtifact | null,
): NflMatchupMetricResolver {
  const byAbbr = new Map(artifact?.teams.map((team) => [team.abbr, team]) ?? []);
  return (abbr, key) => {
    const metric = byAbbr.get(abbr)?.metrics[key];
    if (!metric || !artifact) return null;
    const provenance = artifact.metrics[key];
    return {
      key, value: metric.value, rank: metric.rank,
      formattedValue: formatMetricValue(key, metric.value),
      source: `${provenance.source} (${provenance.modelVersion}); ${provenance.definition}`,
      updatedAt: artifact.generatedAt,
    };
  };
}
