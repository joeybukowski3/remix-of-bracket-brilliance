/**
 * FOR-side (team offensive production) game log, mirroring
 * fantasyAllowed/aggregate.ts's buildDefenseGameLog but grouped by the
 * scoring team instead of the opponent that allowed it. Reuses the exact
 * same `DefenseGamePoints` shape (and downstream `computePositionSample`)
 * because both are structurally "fantasy points scored by <team> in
 * <season>/<week>" -- only which team the points are attributed to differs.
 */
import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { DefenseGamePoints } from "@/lib/nfl/fantasyAllowed/aggregate";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildOffenseGameLog(
  rows: readonly HistoricalPlayerWeek[],
  position: FantasyPosition,
): DefenseGamePoints[] {
  const byGame = new Map<string, DefenseGamePoints>();
  for (const row of rows) {
    if (row.position !== position) continue;
    const key = `${row.team}|${row.season}|${row.week}`;
    const existing = byGame.get(key);
    if (existing) {
      existing.fantasyPointsAllowed = round2(existing.fantasyPointsAllowed + row.actualFantasyPoints);
    } else {
      byGame.set(key, {
        team: row.team,
        season: row.season,
        week: row.week,
        fantasyPointsAllowed: round2(row.actualFantasyPoints),
      });
    }
  }
  return [...byGame.values()];
}
