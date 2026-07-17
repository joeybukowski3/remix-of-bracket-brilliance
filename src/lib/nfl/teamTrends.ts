import teamsArtifact from "../../../public/data/nfl/teams.json";
import fullSeason2025Artifact from "../../../public/data/nfl/2025/full-season-team-metrics.json";
import finalEight2025Artifact from "../../../public/data/nfl/2025/final-eight-team-metrics.json";
import {
  NFL_V03_METRIC_KEYS,
  publicScaleEquivalent,
  validateNflV03ReviewArtifact,
  type NflV03FinalEightArtifact,
  type NflV03FinalEightTeam,
  type NflV03FullSeasonArtifact,
  type NflV03FullSeasonTeam,
  type NflV03Metric,
  type NflV03Meta,
} from "@/lib/nfl/v03Review";

export type NflTrendClassification =
  | "strong_improvement"
  | "moderate_improvement"
  | "stable"
  | "moderate_decline"
  | "strong_decline"
  | "insufficient_data";

export type NflTrendConfidenceLevel = "high" | "medium" | "low";

export type NflTrendRecord = {
  teamId: string;
  slug: string;
  abbr: string;
  name: string;
  season: number;
  sourceSeason: number;
  fullSeason: {
    comparableRating: number | null;
    rank: number | null;
    adjustedComposite: number | null;
    offense: number | null;
    defense: number | null;
    netEpa: number | null;
    pointDiff: number | null;
  };
  finalEight: {
    comparableRating: number | null;
    rank: number | null;
    adjustedComposite: number | null;
    windowSize: number;
    shortWindow: boolean;
    opponentStrength: number | null;
    sourceTrajectoryLabel: string | null;
    offense: number | null;
    defense: number | null;
    netEpa: number | null;
    pointDiff: number | null;
  };
  deltas: {
    rating: number | null;
    rank: number | null;
    offense: number | null;
    defense: number | null;
    netEpa: number | null;
    pointDiff: number | null;
  };
  classification: NflTrendClassification;
  confidence: {
    level: NflTrendConfidenceLevel;
    missingReasons: string[];
  };
  sources: {
    fullSeasonArtifact: string;
    finalEightArtifact: string;
    modelVersion: string;
    generatedAt: string;
    validationStatus: string;
  };
};

export type NflTrendThresholds = {
  count: number;
  q10: number | null;
  q25: number | null;
  median: number | null;
  q75: number | null;
  q90: number | null;
  stabilityRatingDeltaMaximum: number;
  stabilityRankDeltaMaximum: number;
  algorithm: "R-7 linear interpolation";
};

export type NflTrendDatasetMetadata = {
  season: number;
  sourceSeason: number;
  teamCount: number;
  thresholds: NflTrendThresholds;
  sourceArtifacts: {
    teams: string;
    fullSeason: string;
    finalEight: string;
  };
  modelVersion: string;
  generatedAt: string;
  validationStatus: string;
  metricCompatibility: {
    comparableCompositeField: "adjustedComposite";
    comparableRatingTransform: "50 + 15 * (adjustedComposite / 0.733), capped to [1, 99]";
    offenseField: "metrics.offEpaPerPlay.zScore";
    defenseField: "metrics.defEpaPerPlay.zScore";
    defenseSignConvention: "higher is better; defensive EPA was inverted by the v0.3 generator before z-score ranking";
    netEpaField: "metrics.netEpaPerPlay.zScore";
    pointDiffField: "metrics.pointDiffPerGame.zScore";
    rankDirection: "1 is best";
    deltaDirection: "positive means final-eight improved versus full season";
  };
  validationWarnings: string[];
};

export type NflTrendDataset = {
  metadata: NflTrendDatasetMetadata;
  records: NflTrendRecord[];
};

export type BuildNflTrendDatasetInput = {
  teamsArtifact?: unknown;
  teamsArtifactPath?: string;
  fullSeasonArtifact?: unknown;
  fullSeasonArtifactPath?: string;
  finalEightArtifact?: unknown;
  finalEightArtifactPath?: string;
  season?: 2025;
};

type UnknownRecord = Record<string, unknown>;

type CanonicalTeam = {
  id: string;
  slug: string;
  abbr: string;
  name: string;
};

const DEFAULT_SEASON = 2025 as const;
const DEFAULT_TEAMS_PATH = "public/data/nfl/teams.json";
const DEFAULT_FULL_SEASON_PATH = "public/data/nfl/2025/full-season-team-metrics.json";
const DEFAULT_FINAL_EIGHT_PATH = "public/data/nfl/2025/final-eight-team-metrics.json";
const EXPECTED_TEAM_COUNT = 32;
const STABILITY_RATING_DELTA_MAXIMUM = 3.0;
const STABILITY_RANK_DELTA_MAXIMUM = 2;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundTrendNumber(value: number | null, digits = 6): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function delta(finalValue: number | null, fullValue: number | null): number | null {
  if (finalValue === null || fullValue === null) return null;
  return roundTrendNumber(finalValue - fullValue);
}

function validateCanonicalTeams(value: unknown, path: string): CanonicalTeam[] {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  const teams = requireArray(value.teams, `${path}.teams`).map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`${path}.teams[${index}] must be an object`);
    return {
      id: requireString(entry.id, `${path}.teams[${index}].id`),
      slug: requireString(entry.slug, `${path}.teams[${index}].slug`),
      abbr: requireString(entry.abbr, `${path}.teams[${index}].abbr`),
      name: requireString(entry.name, `${path}.teams[${index}].name`),
    };
  });

  validateUnique(teams.map((team) => team.id), `${path}.teams[].id`);
  validateUnique(teams.map((team) => team.abbr), `${path}.teams[].abbr`);
  if (teams.length !== EXPECTED_TEAM_COUNT) {
    throw new Error(`${path} must contain exactly ${EXPECTED_TEAM_COUNT} teams`);
  }
  return teams;
}

function validateUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} contains duplicate value ${value}`);
    seen.add(value);
  }
}

function indexByTeamId<T extends { teamId: string; abbr: string; slug: string; name: string }>(
  rows: readonly T[],
  path: string,
  canonicalById: ReadonlyMap<string, CanonicalTeam>
): Map<string, T> {
  validateUnique(rows.map((row) => row.teamId), `${path}.teams[].teamId`);
  validateUnique(rows.map((row) => row.abbr), `${path}.teams[].abbr`);
  const byId = new Map<string, T>();
  for (const row of rows) {
    const canonical = canonicalById.get(row.teamId);
    if (!canonical) throw new Error(`${path} contains orphan source row ${row.teamId}`);
    if (row.abbr !== canonical.abbr || row.slug !== canonical.slug || row.name !== canonical.name) {
      throw new Error(`${path} identity mismatch for ${row.teamId}`);
    }
    byId.set(row.teamId, row);
  }
  return byId;
}

function metricZ(metric: NflV03Metric): number | null {
  return metric.missing ? null : finiteOrNull(metric.zScore);
}

function comparableRating(adjustedComposite: number | null): number | null {
  return roundTrendNumber(publicScaleEquivalent(adjustedComposite));
}

export function toNflTrendComparableRating(adjustedComposite: number | null): number | null {
  return comparableRating(adjustedComposite);
}

function rankByComparableRating<T extends { teamId: string; adjustedComposite: number | null }>(
  rows: readonly T[]
): Map<string, number | null> {
  const ranked = [...rows].sort((a, b) => {
    const aRating = comparableRating(a.adjustedComposite);
    const bRating = comparableRating(b.adjustedComposite);
    const aRated = aRating !== null;
    const bRated = bRating !== null;
    if (aRated !== bRated) return aRated ? -1 : 1;
    if (aRating !== null && bRating !== null && bRating !== aRating) return bRating - aRating;
    const aComposite = finiteOrNull(a.adjustedComposite) ?? Number.NEGATIVE_INFINITY;
    const bComposite = finiteOrNull(b.adjustedComposite) ?? Number.NEGATIVE_INFINITY;
    if (bComposite !== aComposite) return bComposite - aComposite;
    return a.teamId.localeCompare(b.teamId);
  });

  const ranks = new Map<string, number | null>();
  let rank = 0;
  for (const row of ranked) {
    if (comparableRating(row.adjustedComposite) === null) {
      ranks.set(row.teamId, null);
    } else {
      rank += 1;
      ranks.set(row.teamId, rank);
    }
  }
  return ranks;
}

function sourceValue(meta: NflV03Meta, key: keyof Pick<NflV03Meta, "modelVersion" | "generatedAt" | "validationStatus">): string {
  return String(meta[key]);
}

function combineSourceValue(
  fullMeta: NflV03Meta,
  finalMeta: NflV03Meta,
  key: keyof Pick<NflV03Meta, "modelVersion" | "generatedAt" | "validationStatus">,
  warnings: string[]
): string {
  const full = sourceValue(fullMeta, key);
  const final = sourceValue(finalMeta, key);
  if (full === final) return full;
  warnings.push(`full-season and final-eight ${key} differ`);
  return `full-season: ${full}; final-eight: ${final}`;
}

function primaryMissingReasons(
  full: NflV03FullSeasonTeam,
  finalEight: NflV03FinalEightTeam,
  fullRank: number | null,
  finalRank: number | null,
  validationWarnings: readonly string[]
): string[] {
  const reasons: string[] = [];
  if (full.adjustedComposite === null) reasons.push("missing full-season adjustedComposite");
  if (finalEight.adjustedComposite === null) reasons.push("missing final-eight adjustedComposite");
  if (fullRank === null) reasons.push("missing full-season rank");
  if (finalRank === null) reasons.push("missing final-eight rank");
  if (finalEight.windowSize < 8 || finalEight.shortWindow) reasons.push("final-eight window contains fewer than 8 games");
  for (const key of NFL_V03_METRIC_KEYS) {
    if (metricZ(full.metrics[key]) === null) reasons.push(`missing full-season ${key} zScore`);
    if (metricZ(finalEight.metrics[key]) === null) reasons.push(`missing final-eight ${key} zScore`);
  }
  validationWarnings.forEach((warning) => reasons.push(`validation warning: ${warning}`));
  return reasons;
}

function confidenceFromReasons(
  ratingDelta: number | null,
  rankDelta: number | null,
  missingReasons: readonly string[]
): NflTrendConfidenceLevel {
  if (
    ratingDelta === null ||
    rankDelta === null ||
    missingReasons.some((reason) =>
      reason.includes("adjustedComposite") ||
      reason.includes("rank") ||
      reason.includes("fewer than 8 games") ||
      reason.startsWith("validation warning:")
    )
  ) {
    return "low";
  }
  return missingReasons.length === 0 ? "high" : "medium";
}

export function calculateTrendThresholds(
  records: readonly { deltas: { rating: number | null } }[]
): NflTrendThresholds {
  const values = records
    .map((record) => record.deltas.rating)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);

  return {
    count: values.length,
    q10: quantileR7(values, 0.1),
    q25: quantileR7(values, 0.25),
    median: quantileR7(values, 0.5),
    q75: quantileR7(values, 0.75),
    q90: quantileR7(values, 0.9),
    stabilityRatingDeltaMaximum: STABILITY_RATING_DELTA_MAXIMUM,
    stabilityRankDeltaMaximum: STABILITY_RANK_DELTA_MAXIMUM,
    algorithm: "R-7 linear interpolation",
  };
}

function quantileR7(sortedValues: readonly number[], probability: number): number | null {
  if (sortedValues.length === 0) return null;
  if (probability < 0 || probability > 1 || !Number.isFinite(probability)) return null;
  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  if (lowerIndex === upperIndex) return roundTrendNumber(lower);
  const interpolated = lower + (upper - lower) * (position - lowerIndex);
  return roundTrendNumber(interpolated);
}

export function classifyNflTrend(
  ratingDelta: number | null,
  rankDelta: number | null,
  thresholds: NflTrendThresholds
): NflTrendClassification {
  if (
    ratingDelta === null ||
    !Number.isFinite(ratingDelta) ||
    thresholds.count < EXPECTED_TEAM_COUNT ||
    thresholds.q10 === null ||
    thresholds.q25 === null ||
    thresholds.q75 === null ||
    thresholds.q90 === null
  ) {
    return "insufficient_data";
  }

  if (
    rankDelta !== null &&
    Number.isFinite(rankDelta) &&
    Math.abs(ratingDelta) < thresholds.stabilityRatingDeltaMaximum &&
    Math.abs(rankDelta) <= thresholds.stabilityRankDeltaMaximum
  ) {
    return "stable";
  }

  if (ratingDelta >= thresholds.q90) return "strong_improvement";
  if (ratingDelta >= thresholds.q75 && ratingDelta < thresholds.q90) return "moderate_improvement";
  if (ratingDelta <= thresholds.q10) return "strong_decline";
  if (ratingDelta > thresholds.q10 && ratingDelta <= thresholds.q25) return "moderate_decline";
  return "stable";
}

export function buildNflTrendDataset(input: BuildNflTrendDatasetInput = {}): NflTrendDataset {
  const season = input.season ?? DEFAULT_SEASON;
  const teamsPath = input.teamsArtifactPath ?? DEFAULT_TEAMS_PATH;
  const fullSeasonPath = input.fullSeasonArtifactPath ?? DEFAULT_FULL_SEASON_PATH;
  const finalEightPath = input.finalEightArtifactPath ?? DEFAULT_FINAL_EIGHT_PATH;
  const canonicalTeams = validateCanonicalTeams(input.teamsArtifact ?? teamsArtifact, teamsPath);
  const fullSeason = validateNflV03ReviewArtifact(
    "fullSeason",
    season,
    input.fullSeasonArtifact ?? fullSeason2025Artifact,
    fullSeasonPath
  ) as NflV03FullSeasonArtifact;
  const finalEight = validateNflV03ReviewArtifact(
    "finalEight",
    season,
    input.finalEightArtifact ?? finalEight2025Artifact,
    finalEightPath
  ) as NflV03FinalEightArtifact;

  const canonicalById = new Map(canonicalTeams.map((team) => [team.id, team]));
  const fullById = indexByTeamId(fullSeason.teams, fullSeasonPath, canonicalById);
  const finalById = indexByTeamId(finalEight.teams, finalEightPath, canonicalById);
  if (fullById.size !== EXPECTED_TEAM_COUNT) throw new Error(`${fullSeasonPath} must contain exactly ${EXPECTED_TEAM_COUNT} canonical teams`);
  if (finalById.size !== EXPECTED_TEAM_COUNT) throw new Error(`${finalEightPath} must contain exactly ${EXPECTED_TEAM_COUNT} canonical teams`);

  const fullRanks = rankByComparableRating(fullSeason.teams);
  const finalRanks = rankByComparableRating(finalEight.teams);
  const validationWarnings: string[] = [];
  const modelVersion = combineSourceValue(fullSeason._meta, finalEight._meta, "modelVersion", validationWarnings);
  const generatedAt = combineSourceValue(fullSeason._meta, finalEight._meta, "generatedAt", validationWarnings);
  const validationStatus = combineSourceValue(fullSeason._meta, finalEight._meta, "validationStatus", validationWarnings);

  const preliminary = canonicalTeams.map((team) => {
    const full = fullById.get(team.id);
    const finalWindow = finalById.get(team.id);
    if (!full) throw new Error(`${fullSeasonPath} is missing canonical team ${team.id}`);
    if (!finalWindow) throw new Error(`${finalEightPath} is missing canonical team ${team.id}`);

    const fullRank = fullRanks.get(team.id) ?? null;
    const finalRank = finalRanks.get(team.id) ?? null;
    const fullComparableRating = comparableRating(full.adjustedComposite);
    const finalComparableRating = comparableRating(finalWindow.adjustedComposite);
    const ratingDelta = delta(finalComparableRating, fullComparableRating);
    const rankDelta = fullRank !== null && finalRank !== null ? fullRank - finalRank : null;
    const missingReasons = primaryMissingReasons(full, finalWindow, fullRank, finalRank, validationWarnings);

    return {
      team,
      record: {
        teamId: team.id,
        slug: team.slug,
        abbr: team.abbr,
        name: team.name,
        season,
        sourceSeason: season,
        fullSeason: {
          comparableRating: fullComparableRating,
          rank: fullRank,
          adjustedComposite: finiteOrNull(full.adjustedComposite),
          offense: metricZ(full.metrics.offEpaPerPlay),
          defense: metricZ(full.metrics.defEpaPerPlay),
          netEpa: metricZ(full.metrics.netEpaPerPlay),
          pointDiff: metricZ(full.metrics.pointDiffPerGame),
        },
        finalEight: {
          comparableRating: finalComparableRating,
          rank: finalRank,
          adjustedComposite: finiteOrNull(finalWindow.adjustedComposite),
          windowSize: finalWindow.windowSize,
          shortWindow: finalWindow.shortWindow,
          opponentStrength: finiteOrNull(finalWindow.l8OpponentStrength),
          sourceTrajectoryLabel: finalWindow.trajectoryLabel || null,
          offense: metricZ(finalWindow.metrics.offEpaPerPlay),
          defense: metricZ(finalWindow.metrics.defEpaPerPlay),
          netEpa: metricZ(finalWindow.metrics.netEpaPerPlay),
          pointDiff: metricZ(finalWindow.metrics.pointDiffPerGame),
        },
        deltas: {
          rating: ratingDelta,
          rank: rankDelta,
          offense: delta(metricZ(finalWindow.metrics.offEpaPerPlay), metricZ(full.metrics.offEpaPerPlay)),
          defense: delta(metricZ(finalWindow.metrics.defEpaPerPlay), metricZ(full.metrics.defEpaPerPlay)),
          netEpa: delta(metricZ(finalWindow.metrics.netEpaPerPlay), metricZ(full.metrics.netEpaPerPlay)),
          pointDiff: delta(metricZ(finalWindow.metrics.pointDiffPerGame), metricZ(full.metrics.pointDiffPerGame)),
        },
        classification: "insufficient_data" as NflTrendClassification,
        confidence: {
          level: confidenceFromReasons(ratingDelta, rankDelta, missingReasons),
          missingReasons,
        },
        sources: {
          fullSeasonArtifact: fullSeasonPath,
          finalEightArtifact: finalEightPath,
          modelVersion,
          generatedAt,
          validationStatus,
        },
      },
    };
  });

  const thresholds = calculateTrendThresholds(preliminary.map((entry) => entry.record));
  const records = preliminary.map(({ record }) => ({
    ...record,
    classification: record.confidence.level === "low" && record.deltas.rating === null
      ? "insufficient_data"
      : classifyNflTrend(record.deltas.rating, record.deltas.rank, thresholds),
  }));

  return {
    metadata: {
      season,
      sourceSeason: season,
      teamCount: records.length,
      thresholds,
      sourceArtifacts: {
        teams: teamsPath,
        fullSeason: fullSeasonPath,
        finalEight: finalEightPath,
      },
      modelVersion,
      generatedAt,
      validationStatus,
      metricCompatibility: {
        comparableCompositeField: "adjustedComposite",
        comparableRatingTransform: "50 + 15 * (adjustedComposite / 0.733), capped to [1, 99]",
        offenseField: "metrics.offEpaPerPlay.zScore",
        defenseField: "metrics.defEpaPerPlay.zScore",
        defenseSignConvention: "higher is better; defensive EPA was inverted by the v0.3 generator before z-score ranking",
        netEpaField: "metrics.netEpaPerPlay.zScore",
        pointDiffField: "metrics.pointDiffPerGame.zScore",
        rankDirection: "1 is best",
        deltaDirection: "positive means final-eight improved versus full season",
      },
      validationWarnings,
    },
    records,
  };
}

export const NFL_2025_TREND_DATASET = buildNflTrendDataset();
export const NFL_TREND_METADATA = NFL_2025_TREND_DATASET.metadata;

export function getNflTrendRecord(
  teamIdOrAbbr: string,
  dataset: NflTrendDataset = NFL_2025_TREND_DATASET
): NflTrendRecord | null {
  const key = teamIdOrAbbr.trim().toLowerCase();
  return dataset.records.find((record) => record.teamId.toLowerCase() === key || record.abbr.toLowerCase() === key) ?? null;
}
