import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { featureValue, type BacktestFeatureKey } from "./featureRegistry";
import type { PregameFeatureSnapshot } from "./features";

export type FeatureCoverageRow = {
  season: number;
  week: number;
  position: FantasyPosition;
  feature: BacktestFeatureKey;
  rows: number;
  available: number;
  missing: number;
  coverage: number;
};

export function buildFeatureCoverage(
  rows: readonly PregameFeatureSnapshot[],
  features: readonly BacktestFeatureKey[],
): FeatureCoverageRow[] {
  const groups = new Map<string, PregameFeatureSnapshot[]>();
  for (const row of rows) {
    const key = `${row.season}|${row.week}|${row.position}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()].flatMap(([key, group]) => {
    const [season, week, position] = key.split("|");
    return features.map((feature) => {
      const available = group.filter((row) => featureValue(row, feature) != null).length;
      return {
        season: Number(season), week: Number(week), position: position as FantasyPosition,
        feature, rows: group.length, available, missing: group.length - available,
        coverage: group.length ? available / group.length : 0,
      };
    });
  }).sort((a, b) => a.season - b.season || a.week - b.week || a.position.localeCompare(b.position) || a.feature.localeCompare(b.feature));
}
