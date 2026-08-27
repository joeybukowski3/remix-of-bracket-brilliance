import type { NflCurrentWeekProjectionRow } from "@/lib/nfl/props/types/currentWeekProjection";

/** Market-specific opportunity x efficiency breakdown line, e.g. "14.2 car x 4.3 ypc". Display only. */
export function marketRoleStat(row: NflCurrentWeekProjectionRow): string | null {
  if (row.market === "rushing") {
    const { projectedCarries, projectedYardsPerCarry } = row;
    if (projectedCarries == null || projectedYardsPerCarry == null) return null;
    return `${projectedCarries.toFixed(1)} car × ${projectedYardsPerCarry.toFixed(1)} ypc`;
  }
  if (row.market === "receiving") {
    const { projectedTargets, projectedYardsPerTarget } = row;
    if (projectedTargets == null || projectedYardsPerTarget == null) return null;
    return `${projectedTargets.toFixed(1)} tgt × ${projectedYardsPerTarget.toFixed(1)} ypt`;
  }
  return null;
}
