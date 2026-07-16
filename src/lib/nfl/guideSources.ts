import { z } from "zod";
import rawTeams from "../../../public/data/nfl/teams.json";
import rawPreseasonRatings from "../../../public/data/nfl/2026/preseason-power-ratings.json";
import rawFullSeasonMetrics from "../../../public/data/nfl/2025/full-season-team-metrics.json";
import rawFinalEightMetrics from "../../../public/data/nfl/2025/final-eight-team-metrics.json";

// Generator-owned artifacts, copied byte-identically from the NFL pipeline on `main`
// (scripts/generate-nfl-v03-artifacts.mjs, PR-1 canonical teams). They are imported
// rather than fetched so the guide and its print view render synchronously with no
// loading state. Never hand-edit the JSON: regenerate it upstream instead.

const metaSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.string(),
  season: z.number().nullable(),
  source: z.string(),
  modelVersion: z.string().nullable().optional(),
  validationStatus: z.string().optional(),
  notes: z.array(z.string()).default([]),
});

export type NflSourceMeta = z.infer<typeof metaSchema>;

const canonicalTeamSchema = z.object({
  id: z.string(),
  slug: z.string(),
  abbr: z.string(),
  nflverseAbbr: z.string(),
  name: z.string(),
  fullName: z.string(),
  shortName: z.string(),
  conference: z.enum(["AFC", "NFC"]),
  division: z.string(),
  primaryColor: z.string(),
  logoUrl: z.string(),
});

export type NflCanonicalTeam = z.infer<typeof canonicalTeamSchema>;

const preseasonRatingSchema = z.object({
  teamId: z.string(),
  slug: z.string(),
  abbr: z.string(),
  name: z.string(),
  publicRating: z.number(),
  offenseRating: z.number(),
  defenseRating: z.number(),
  rank: z.number(),
  historical: z.object({
    fullSeasonComposite: z.number(),
    l8AdjustedComposite: z.number(),
  }),
  uncertainty: z.object({ band: z.string() }).optional(),
});

export type NflPreseasonRating = z.infer<typeof preseasonRatingSchema>;

const metricSchema = z.object({
  raw: z.number().nullable(),
  adjusted: z.number().nullable(),
  rank: z.number().nullable(),
  missing: z.boolean(),
});

const seasonMetricsSchema = z.object({
  teamId: z.string(),
  abbr: z.string(),
  metrics: z.object({
    offEpaPerPlay: metricSchema,
    defEpaPerPlay: metricSchema,
    netEpaPerPlay: metricSchema,
    pointDiffPerGame: metricSchema,
  }),
});

export type NflSeasonMetrics = z.infer<typeof seasonMetricsSchema>;

const fullSeasonMetricsSchema = seasonMetricsSchema.extend({
  wins: z.number(),
  losses: z.number(),
  ties: z.number(),
  gamesPlayed: z.number(),
  pythagoreanExpectedWins: z.number().nullable(),
  expectedWinsDelta: z.number().nullable(),
});

export type NflFullSeasonMetrics = z.infer<typeof fullSeasonMetricsSchema>;

const finalEightMetricsSchema = seasonMetricsSchema.extend({
  trajectoryLabel: z.enum(["Late Riser", "Late Decline", "Stable"]),
  contextFlags: z.array(z.unknown()).default([]),
  l8OpponentStrength: z.number(),
});

export type NflFinalEightMetrics = z.infer<typeof finalEightMetricsSchema>;

/**
 * Parses each record independently so a single malformed team is dropped rather
 * than throwing and taking the whole guide down with it.
 */
function parseRecords<T>(records: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(records)) return [];
  const parsed: T[] = [];
  for (const record of records) {
    const result = schema.safeParse(record);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

function parseMeta(raw: unknown): NflSourceMeta | null {
  const result = metaSchema.safeParse((raw as { _meta?: unknown })?._meta);
  return result.success ? result.data : null;
}

export const NFL_PRESEASON_RATINGS_META = parseMeta(rawPreseasonRatings);

export const NFL_CANONICAL_TEAMS: NflCanonicalTeam[] = parseRecords(
  (rawTeams as { teams?: unknown }).teams,
  canonicalTeamSchema,
);

export const NFL_PRESEASON_RATINGS: NflPreseasonRating[] = parseRecords(
  (rawPreseasonRatings as { ratings?: unknown }).ratings,
  preseasonRatingSchema,
);

export const NFL_FULL_SEASON_METRICS: NflFullSeasonMetrics[] = parseRecords(
  (rawFullSeasonMetrics as { teams?: unknown }).teams,
  fullSeasonMetricsSchema,
);

export const NFL_FINAL_EIGHT_METRICS: NflFinalEightMetrics[] = parseRecords(
  (rawFinalEightMetrics as { teams?: unknown }).teams,
  finalEightMetricsSchema,
);

/**
 * Season the v0.3 ratings were derived from (the completed season feeding the
 * 2026 preseason model), not the season being previewed.
 */
export const NFL_RATINGS_SOURCE_SEASON: number | null =
  typeof (rawPreseasonRatings as { sourceSeason?: unknown }).sourceSeason === "number"
    ? (rawPreseasonRatings as { sourceSeason: number }).sourceSeason
    : null;
