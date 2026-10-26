/**
 * Conservative intervals for paired error differences. Errors repeat by player (the same player is mispredicted in a
 * similar way week after week) and by calendar week (a slate shares injuries and schedule), so a paired difference is
 * clustered both ways and the wider of the two standard errors is used, with a Student-t critical value on the smaller
 * cluster count instead of 1.96.
 */
import { pairedDifference, timeBlock, type PairedDifference } from "../../stats";

export const CLUSTER_BLOCK_DAYS = 7;

export interface RobustItem {
  candidate: number;
  benchmark: number;
  gameDate: string;
  playerId: string;
}

export interface RobustDifference extends PairedDifference {
  /** Which clustering gave the reported (wider) standard error. */
  clusteredBy: "player" | "week" | null;
  playerClusters: number;
  weekClusters: number;
}

/** Two-sided 95% Student-t critical value (Cornish-Fisher expansion about the normal; exact enough for df >= 3). */
export function tCritical95(df: number): number {
  if (df < 1) return Number.NaN;
  const z = 1.959963984540054;
  return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3);
}

export function robustDifference(items: readonly RobustItem[]): RobustDifference {
  const byWeek = pairedDifference(items.map((i) => ({ candidate: i.candidate, benchmark: i.benchmark, cluster: timeBlock(i.gameDate, CLUSTER_BLOCK_DAYS) })));
  const byPlayer = pairedDifference(items.map((i) => ({ candidate: i.candidate, benchmark: i.benchmark, cluster: i.playerId })));
  const base = { n: byWeek.n, meanDiff: byWeek.meanDiff, playerClusters: byPlayer.clusters, weekClusters: byWeek.clusters };
  if (byWeek.se === null || byPlayer.se === null || byWeek.meanDiff === null) return { ...base, clusters: Math.min(byWeek.clusters, byPlayer.clusters), se: null, ci95: null, clusteredBy: null };
  const player = byPlayer.se >= byWeek.se;
  const se = player ? byPlayer.se : byWeek.se;
  const clusters = player ? byPlayer.clusters : byWeek.clusters;
  const half = tCritical95(clusters - 1) * se;
  return { ...base, clusters, se, ci95: [byWeek.meanDiff - half, byWeek.meanDiff + half], clusteredBy: player ? "player" : "week" };
}
