import { normalizeWeights } from "@/lib/pga/modelEngine";
import { getPercentileFromRank } from "@/lib/pga/rankColors";
import type { PgaPlayerInput, PgaWeights, PlayerModelRow } from "@/lib/pga/pgaTypes";

export type PgaDashboardDatasetMode = "current-field" | "all-loaded" | "trend-top-100";
export type PgaDashboardViewMode = "percentile" | "rank";
export type PgaDashboardWindowMode = "current-export" | "trend-window" | "long-term";
export type PgaDashboardCourseContext = "event" | "neutral";
export type PgaDashboardCondition = "all" | "elite-approach" | "strong-form" | "course-fit" | "short-game";
export type PgaDashboardPercentileContext = "tour" | "tournament";
export type PgaDashboardStatMetricKey =
  | "trendRank"
  | "sgApproachRank"
  | "par4Rank"
  | "drivingAccuracyRank"
  | "bogeyAvoidanceRank"
  | "sgAroundGreenRank"
  | "birdie125150Rank"
  | "sgPuttingRank"
  | "birdieUnder125Rank"
  | "courseFit";

const FAVORITES_STORAGE_KEY = "pga:dashboard:favorites";

export type PgaPercentileMetricSnapshot = {
  modelPercentile: number | null;
  trendPercentile: number | null;
  courseFitPercentile: number | null;
  shortGamePercentile: number | null;
  statPercentiles: Partial<Record<PgaDashboardStatMetricKey, number | null>>;
};

type RankMetricKey = Exclude<PgaDashboardStatMetricKey, "courseFit">;
type PercentileSampleCollections = {
  scoreValues: number[];
  courseFitValues: number[];
  rankCollections: Partial<Record<RankMetricKey, number[]>>;
};

export function countPlayerDataPoints(player: PgaPlayerInput) {
  return [
    player.statRanks.trendRank,
    player.statRanks.sgApproachRank,
    player.statRanks.par4Rank,
    player.statRanks.drivingAccuracyRank,
    player.statRanks.bogeyAvoidanceRank,
    player.statRanks.sgAroundGreenRank,
    player.statRanks.birdie125150Rank,
    player.statRanks.sgPuttingRank,
    player.statRanks.birdieUnder125Rank,
    player.courseHistoryRounds,
    player.courseHistoryScore,
  ].filter((value) => value != null).length;
}

export function dedupeDashboardPlayers(players: PgaPlayerInput[]) {
  const bestById = new Map<string, PgaPlayerInput>();

  players.forEach((player) => {
    const current = bestById.get(player.id);
    if (!current || countPlayerDataPoints(player) > countPlayerDataPoints(current)) {
      bestById.set(player.id, player);
    }
  });

  return Array.from(bestById.values());
}

export function getDashboardWeights(
  baseWeights: PgaWeights,
  windowMode: PgaDashboardWindowMode,
  courseContext: PgaDashboardCourseContext,
) {
  const next: PgaWeights = { ...baseWeights };

  if (windowMode === "trend-window") {
    next.trendRank *= 1.7;
    next.sgApproach *= 1.15;
    next.par4 *= 1.1;
    next.sgPutting *= 0.85;
    next.courseTrueSg *= 0.45;
  }

  if (windowMode === "long-term") {
    next.trendRank *= 0.65;
    next.sgApproach *= 1.1;
    next.drivingAccuracy *= 1.08;
    next.bogeyAvoidance *= 1.08;
    next.courseTrueSg *= 1.2;
  }

  if (courseContext === "neutral") {
    next.courseTrueSg = 0;
  }

  return normalizeWeights(next);
}

export function readDashboardFavorites() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((value): value is string => typeof value === "string")) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

export function storeDashboardFavorites(favorites: Iterable<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favorites)));
}

export function computeValuePercentile(value: number | null, values: number[], higherIsBetter: boolean) {
  if (value == null || values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = ordered.findIndex((entry) => entry === value);
  if (index < 0) return null;
  const ratio = ordered.length === 1 ? 1 : index / (ordered.length - 1);
  const normalized = higherIsBetter ? ratio : 1 - ratio;
  return Math.round(normalized * 100);
}

export function computeRankPercentile(rank: number | null, ranks: number[]) {
  if (rank == null || ranks.length === 0) return null;
  const maxRank = Math.max(...ranks);
  return getPercentileFromRank(rank, maxRank);
}

export function getDashboardRankMetricValue(row: PlayerModelRow, key: RankMetricKey) {
  switch (key) {
    case "trendRank":
      return row.trendRank;
    case "sgApproachRank":
      return row.sgApproachRank;
    case "par4Rank":
      return row.par4Rank;
    case "drivingAccuracyRank":
      return row.drivingAccuracyRank;
    case "bogeyAvoidanceRank":
      return row.bogeyAvoidanceRank;
    case "sgAroundGreenRank":
      return row.sgAroundGreenRank;
    case "birdie125150Rank":
      return row.birdie125150Rank;
    case "sgPuttingRank":
      return row.sgPuttingRank;
    case "birdieUnder125Rank":
      return row.birdieUnder125Rank;
    default:
      return null;
  }
}

export function buildPercentileSampleCollections(rows: PlayerModelRow[]): PercentileSampleCollections {
  return {
    scoreValues: rows.map((row) => row.score),
    courseFitValues: rows
      .map((row) => row.courseHistoryScore)
      .filter((value): value is number => typeof value === "number"),
    rankCollections: {
      trendRank: rows.map((row) => row.trendRank).filter((value): value is number => typeof value === "number"),
      sgApproachRank: rows.map((row) => row.sgApproachRank).filter((value): value is number => typeof value === "number"),
      par4Rank: rows.map((row) => row.par4Rank).filter((value): value is number => typeof value === "number"),
      drivingAccuracyRank: rows.map((row) => row.drivingAccuracyRank).filter((value): value is number => typeof value === "number"),
      bogeyAvoidanceRank: rows.map((row) => row.bogeyAvoidanceRank).filter((value): value is number => typeof value === "number"),
      sgAroundGreenRank: rows.map((row) => row.sgAroundGreenRank).filter((value): value is number => typeof value === "number"),
      birdie125150Rank: rows.map((row) => row.birdie125150Rank).filter((value): value is number => typeof value === "number"),
      sgPuttingRank: rows.map((row) => row.sgPuttingRank).filter((value): value is number => typeof value === "number"),
      birdieUnder125Rank: rows.map((row) => row.birdieUnder125Rank).filter((value): value is number => typeof value === "number"),
    },
  };
}

export function buildPercentileSnapshotForRow(
  row: PlayerModelRow,
  samples: PercentileSampleCollections,
): PgaPercentileMetricSnapshot {
  const trendPercentile = computeRankPercentile(row.trendRank, samples.rankCollections.trendRank ?? []);
  const sgAroundGreenPercentile = computeRankPercentile(row.sgAroundGreenRank, samples.rankCollections.sgAroundGreenRank ?? []);
  const sgPuttingPercentile = computeRankPercentile(row.sgPuttingRank, samples.rankCollections.sgPuttingRank ?? []);
  const shortGamePercentile =
    sgAroundGreenPercentile != null && sgPuttingPercentile != null
      ? Math.round((sgAroundGreenPercentile + sgPuttingPercentile) / 2)
      : sgAroundGreenPercentile ?? sgPuttingPercentile ?? null;

  return {
    modelPercentile: computeValuePercentile(row.score, samples.scoreValues, true),
    trendPercentile,
    courseFitPercentile: computeValuePercentile(row.courseHistoryScore, samples.courseFitValues, true),
    shortGamePercentile,
    statPercentiles: {
      trendRank: trendPercentile,
      sgApproachRank: computeRankPercentile(row.sgApproachRank, samples.rankCollections.sgApproachRank ?? []),
      par4Rank: computeRankPercentile(row.par4Rank, samples.rankCollections.par4Rank ?? []),
      drivingAccuracyRank: computeRankPercentile(row.drivingAccuracyRank, samples.rankCollections.drivingAccuracyRank ?? []),
      bogeyAvoidanceRank: computeRankPercentile(row.bogeyAvoidanceRank, samples.rankCollections.bogeyAvoidanceRank ?? []),
      sgAroundGreenRank: sgAroundGreenPercentile,
      birdie125150Rank: computeRankPercentile(row.birdie125150Rank, samples.rankCollections.birdie125150Rank ?? []),
      sgPuttingRank: sgPuttingPercentile,
      birdieUnder125Rank: computeRankPercentile(row.birdieUnder125Rank, samples.rankCollections.birdieUnder125Rank ?? []),
      courseFit: computeValuePercentile(row.courseHistoryScore, samples.courseFitValues, true),
    },
  };
}

export function buildPercentileContextMap(
  displayRows: PlayerModelRow[],
  sampleRows: PlayerModelRow[],
) {
  const samples = buildPercentileSampleCollections(sampleRows);
  const metrics = new Map<string, PgaPercentileMetricSnapshot>();

  displayRows.forEach((row) => {
    metrics.set(row.id, buildPercentileSnapshotForRow(row, samples));
  });

  return metrics;
}
