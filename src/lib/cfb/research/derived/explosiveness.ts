import { weightedRate } from "./weightedStats";
import type { WeightedPlay } from "./teamGameAggregation.types";

export type ExplosivenessBundle = {
  explosivePlayRate: number | null;
  explosivePassRate: number | null;
  explosiveRushRate: number | null;
};

/** Section 7: research-default thresholds live in metricsConfig (explosivePassYards/explosiveRushYards). */
export function computeExplosivenessRates(rows: readonly WeightedPlay[]): ExplosivenessBundle {
  const passAndRush = rows.filter((row) => row.row.explosiveType !== null);
  const pass = rows.filter((row) => row.row.explosiveType === "pass");
  const rush = rows.filter((row) => row.row.explosiveType === "rush");
  return {
    explosivePlayRate: weightedRate(
      passAndRush.map((row) => ({ value: row.row.isExplosive, weight: row.weight })),
    ).rate,
    explosivePassRate: weightedRate(pass.map((row) => ({ value: row.row.isExplosive, weight: row.weight }))).rate,
    explosiveRushRate: weightedRate(rush.map((row) => ({ value: row.row.isExplosive, weight: row.weight }))).rate,
  };
}
