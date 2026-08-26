import type { NflTeamPregameFeatures } from "./types/teamPregameFeatures";

/** Pure QA/integrity helpers for the Phase 2 team pregame-feature artifact. */

export type NflDistributionSummary = {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
};

export function summarizeDistribution(values: readonly number[]): NflDistributionSummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted.at(-1) as number,
    mean: sum / sorted.length,
    median,
  };
}

/** Rows whose `seasonPrior` window is backed by fewer than `minSample` neutral plays -- low-confidence, not invalid. */
export function countLowNeutralSampleRows(
  rows: readonly NflTeamPregameFeatures[],
  minSample: number,
): number {
  return rows.filter(
    (r) => r.seasonPrior.gamesIncluded > 0 && r.seasonPrior.neutralEligiblePlaysSample < minSample,
  ).length;
}

export function countRowsWithInsufficientPriorHistory(
  rows: readonly NflTeamPregameFeatures[],
  minGames: number,
): number {
  return rows.filter((r) => r.gamesPlayedPriorThisSeason < minGames && !r.hasPriorSeason).length;
}

export function findDuplicatePregameFeatureKeys(rows: readonly NflTeamPregameFeatures[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const key = `${row.season}|${row.week}|${row.team}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

export function summarizeByWeek(
  rows: readonly NflTeamPregameFeatures[],
): { season: number; week: number; rows: number }[] {
  const counts = new Map<string, { season: number; week: number; rows: number }>();
  for (const row of rows) {
    const key = `${row.season}|${row.week}`;
    const entry = counts.get(key) ?? { season: row.season, week: row.week, rows: 0 };
    entry.rows += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => a.season - b.season || a.week - b.week);
}
