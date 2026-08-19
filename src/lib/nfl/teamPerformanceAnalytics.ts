/**
 * Types + validator for public/data/nfl/{season}/team-performance-analytics.json
 * (Phase 6). Page-agnostic: not shaped around any specific consumer page, so
 * a future matchup/fantasy surface can do arbitrary lookups like "team A
 * passing efficiency vs team B passing efficiency allowed" directly off this
 * artifact. Framework-free — no fetch, no React — matches the convention of
 * v03Review.ts / performanceComposite2026.ts.
 */

import type { PerformanceRateBundle } from "@/lib/nfl/performanceMetricsCore2026";

export const TEAM_PERFORMANCE_ANALYTICS_SCHEMA_VERSION = "nfl-performance-v1" as const;
export const TEAM_PERFORMANCE_ANALYTICS_TEAM_COUNT = 32;

export type TeamPerformanceWindowKey = "last4" | "last8" | "fullSeason";

export type TeamPerformanceWindowMetrics = {
  sampleSize: number;
  offense: { all: PerformanceRateBundle; filtered: PerformanceRateBundle };
  defenseAllowed: { all: PerformanceRateBundle; filtered: PerformanceRateBundle };
  pointsPerDriveOff: number | null;
  pointsPerDriveAllowed: number | null;
};

/** Only present on the fullSeason window — opponent adjustment is full-season-only by design. */
export type TeamPerformanceFullSeasonAdjusted = {
  offense: { epaPerPlay: number | null; successRate: number | null; explosiveRate: number | null };
  defenseAllowed: { epaPerPlay: number | null; successRate: number | null; explosiveRate: number | null };
  pointDifferentialPerGame: { raw: number | null; adjusted: number | null };
};

export type TeamPerformanceMetricRankDirection = "higher-is-better" | "lower-is-better";

export type TeamPerformanceMetricRanks = Readonly<Record<string, number | null>>;

export type TeamPerformanceRatingBlock = {
  offenseRating: number | null;
  offenseRank: number | null;
  defenseRating: number | null;
  defenseRank: number | null;
  performanceRating: number | null;
  performanceRank: number | null;
};

export type TeamPerformanceAnalyticsRow = {
  team: string;
  gamesPlayed: number;
  windows: {
    last4: TeamPerformanceWindowMetrics;
    last8: TeamPerformanceWindowMetrics;
    fullSeason: TeamPerformanceWindowMetrics & {
      adjusted: TeamPerformanceFullSeasonAdjusted;
      metricRanks: { offense: TeamPerformanceMetricRanks; defenseAllowed: TeamPerformanceMetricRanks };
    };
  };
  performance: TeamPerformanceRatingBlock;
};

export type TeamPerformanceAnalyticsArtifact = {
  schemaVersion: typeof TEAM_PERFORMANCE_ANALYTICS_SCHEMA_VERSION;
  _meta: {
    season: number;
    generatedAt: string;
    source: string;
    ratingFormula: string;
    scaleDivisors: { offense: number; defense: number; overall: number };
  };
  teams: readonly TeamPerformanceAnalyticsRow[];
};

/** Metric rank direction map — every non-composite metric this artifact ranks. */
export const OFFENSE_METRIC_RANK_DIRECTIONS: Readonly<Record<string, TeamPerformanceMetricRankDirection>> = Object.freeze({
  epaPerPlay: "higher-is-better",
  successRate: "higher-is-better",
  earlyDownEpaPerPlay: "higher-is-better",
  earlyDownSuccessRate: "higher-is-better",
  passEpaPerDropback: "higher-is-better",
  passSuccessRate: "higher-is-better",
  rushEpaPerPlay: "higher-is-better",
  rushSuccessRate: "higher-is-better",
  explosiveRate: "higher-is-better",
  sackRate: "lower-is-better", // offense taking sacks is bad
});

export const DEFENSE_METRIC_RANK_DIRECTIONS: Readonly<Record<string, TeamPerformanceMetricRankDirection>> = Object.freeze({
  epaPerPlay: "lower-is-better",
  successRate: "lower-is-better",
  earlyDownEpaPerPlay: "lower-is-better",
  earlyDownSuccessRate: "lower-is-better",
  passEpaPerDropback: "lower-is-better",
  passSuccessRate: "lower-is-better",
  rushEpaPerPlay: "lower-is-better",
  rushSuccessRate: "lower-is-better",
  explosiveRate: "lower-is-better",
  sackRate: "higher-is-better", // defense GENERATING sacks is good
});

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export class TeamPerformanceAnalyticsValidationError extends Error {}

function fail(message: string): never {
  throw new TeamPerformanceAnalyticsValidationError(message);
}

function requireRateBundle(value: unknown, path: string): PerformanceRateBundle {
  if (!value || typeof value !== "object") fail(`${path}: missing rate bundle`);
  const bundle = value as Record<string, unknown>;
  const numericOrNullFields = [
    "epaPerPlay", "successRate", "epaPositiveRate", "earlyDownEpaPerPlay", "earlyDownSuccessRate",
    "passEpaPerDropback", "passSuccessRate", "rushEpaPerPlay", "rushSuccessRate", "explosiveRate",
    "thirdDownEpaPerPlay", "thirdDownSuccessRate", "thirdDownRawConversionRate", "sackRate",
  ];
  for (const field of numericOrNullFields) {
    const v = bundle[field];
    if (v !== null && !isFiniteNumber(v)) fail(`${path}.${field}: must be a finite number or null`);
  }
  for (const field of ["explosivePassCount", "explosiveRushCount", "offPlays", "dropbacks"]) {
    if (!isFiniteNumber(bundle[field])) fail(`${path}.${field}: must be a finite number`);
  }
  return bundle as unknown as PerformanceRateBundle;
}

function requireWindow(value: unknown, path: string): TeamPerformanceWindowMetrics {
  if (!value || typeof value !== "object") fail(`${path}: missing window`);
  const w = value as Record<string, unknown>;
  if (!isFiniteNumber(w.sampleSize) || w.sampleSize < 0) fail(`${path}.sampleSize: must be a non-negative finite number`);
  if (!w.offense || typeof w.offense !== "object") fail(`${path}.offense: missing`);
  if (!w.defenseAllowed || typeof w.defenseAllowed !== "object") fail(`${path}.defenseAllowed: missing`);
  const offense = w.offense as Record<string, unknown>;
  const defenseAllowed = w.defenseAllowed as Record<string, unknown>;
  requireRateBundle(offense.all, `${path}.offense.all`);
  requireRateBundle(offense.filtered, `${path}.offense.filtered`);
  requireRateBundle(defenseAllowed.all, `${path}.defenseAllowed.all`);
  requireRateBundle(defenseAllowed.filtered, `${path}.defenseAllowed.filtered`);
  if (w.pointsPerDriveOff !== null && !isFiniteNumber(w.pointsPerDriveOff)) fail(`${path}.pointsPerDriveOff: must be finite or null`);
  if (w.pointsPerDriveAllowed !== null && !isFiniteNumber(w.pointsPerDriveAllowed)) fail(`${path}.pointsPerDriveAllowed: must be finite or null`);
  return w as unknown as TeamPerformanceWindowMetrics;
}

function requireRatingBlock(value: unknown, path: string, gamesPlayed: number): TeamPerformanceRatingBlock {
  if (!value || typeof value !== "object") fail(`${path}: missing`);
  const block = value as Record<string, unknown>;
  const fields = ["offenseRating", "offenseRank", "defenseRating", "defenseRank", "performanceRating", "performanceRank"];
  for (const field of fields) {
    const v = block[field];
    if (v === null) continue;
    if (!isFiniteNumber(v)) fail(`${path}.${field}: must be finite or null`);
    if (gamesPlayed === 0) fail(`${path}.${field}: must be null when gamesPlayed is 0, got ${v}`);
  }
  return block as unknown as TeamPerformanceRatingBlock;
}

/**
 * Validate a raw JSON value as a TeamPerformanceAnalyticsArtifact. Throws
 * TeamPerformanceAnalyticsValidationError on the first problem found.
 */
export function validateTeamPerformanceAnalyticsArtifact(value: unknown): TeamPerformanceAnalyticsArtifact {
  if (!value || typeof value !== "object") fail("artifact: not an object");
  const artifact = value as Record<string, unknown>;

  if (artifact.schemaVersion !== TEAM_PERFORMANCE_ANALYTICS_SCHEMA_VERSION) {
    fail(`artifact.schemaVersion: expected "${TEAM_PERFORMANCE_ANALYTICS_SCHEMA_VERSION}", got ${JSON.stringify(artifact.schemaVersion)}`);
  }
  if (!artifact._meta || typeof artifact._meta !== "object") fail("artifact._meta: missing");
  const meta = artifact._meta as Record<string, unknown>;
  if (!isFiniteNumber(meta.season)) fail("artifact._meta.season: must be a finite number");
  if (typeof meta.generatedAt !== "string" || Number.isNaN(Date.parse(meta.generatedAt))) {
    fail("artifact._meta.generatedAt: must be a valid ISO date string");
  }
  if (typeof meta.source !== "string" || meta.source.length === 0) fail("artifact._meta.source: missing");
  if (typeof meta.ratingFormula !== "string" || meta.ratingFormula.length === 0) fail("artifact._meta.ratingFormula: missing");
  if (!meta.scaleDivisors || typeof meta.scaleDivisors !== "object") fail("artifact._meta.scaleDivisors: missing");

  if (!Array.isArray(artifact.teams)) fail("artifact.teams: must be an array");
  if (artifact.teams.length !== TEAM_PERFORMANCE_ANALYTICS_TEAM_COUNT) {
    fail(`artifact.teams: expected ${TEAM_PERFORMANCE_ANALYTICS_TEAM_COUNT} teams, got ${artifact.teams.length}`);
  }

  const seenAbbrs = new Set<string>();
  for (const [i, rawRow] of artifact.teams.entries()) {
    const path = `artifact.teams[${i}]`;
    if (!rawRow || typeof rawRow !== "object") fail(`${path}: not an object`);
    const row = rawRow as Record<string, unknown>;
    if (typeof row.team !== "string" || row.team.length === 0) fail(`${path}.team: missing`);
    if (seenAbbrs.has(row.team)) fail(`${path}.team: duplicate team abbr "${row.team}"`);
    seenAbbrs.add(row.team);

    if (!isFiniteNumber(row.gamesPlayed) || row.gamesPlayed < 0) fail(`${path}.gamesPlayed: must be a non-negative finite number`);
    const gamesPlayed = row.gamesPlayed as number;

    if (!row.windows || typeof row.windows !== "object") fail(`${path}.windows: missing`);
    const windows = row.windows as Record<string, unknown>;
    requireWindow(windows.last4, `${path}.windows.last4`);
    requireWindow(windows.last8, `${path}.windows.last8`);
    const fullSeason = requireWindow(windows.fullSeason, `${path}.windows.fullSeason`);
    const fullSeasonRaw = windows.fullSeason as Record<string, unknown>;
    if (!fullSeasonRaw.adjusted || typeof fullSeasonRaw.adjusted !== "object") fail(`${path}.windows.fullSeason.adjusted: missing`);
    if (!fullSeasonRaw.metricRanks || typeof fullSeasonRaw.metricRanks !== "object") fail(`${path}.windows.fullSeason.metricRanks: missing`);

    if (fullSeason.sampleSize > gamesPlayed) {
      fail(`${path}.windows.fullSeason.sampleSize (${fullSeason.sampleSize}) cannot exceed gamesPlayed (${gamesPlayed}) — a window must never fabricate games`);
    }

    requireRatingBlock(row.performance, `${path}.performance`, gamesPlayed);
    const perf = row.performance as TeamPerformanceRatingBlock;
    if (gamesPlayed > 0 && fullSeason.sampleSize > 0) {
      const ranksPresent = [perf.offenseRank, perf.defenseRank, perf.performanceRank];
      const ratingsPresent = [perf.offenseRating, perf.defenseRating, perf.performanceRating];
      const ranksAllNullOrAllSet = ranksPresent.every((v) => v === null) || ranksPresent.every((v) => v !== null);
      const ratingsAllNullOrAllSet = ratingsPresent.every((v) => v === null) || ratingsPresent.every((v) => v !== null);
      if (!ranksAllNullOrAllSet || !ratingsAllNullOrAllSet) {
        fail(`${path}.performance: rank/rating fields must be consistently null or consistently set`);
      }
    }
  }

  return artifact as unknown as TeamPerformanceAnalyticsArtifact;
}
