import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";

export function searchFantasyPlayers(rows: readonly WeeklyFantasyProjectionProductionRow[], query: string, excluded: ReadonlySet<string>, limit = 20) {
  const term = query.trim().toLowerCase();
  return rows.filter((row) => !excluded.has(row.playerId) && (!term || `${row.playerName} ${row.position} ${row.team}`.toLowerCase().includes(term)))
    .sort((a, b) => b.projectedFantasyPoints - a.projectedFantasyPoints || a.playerName.localeCompare(b.playerName))
    .slice(0, limit);
}
