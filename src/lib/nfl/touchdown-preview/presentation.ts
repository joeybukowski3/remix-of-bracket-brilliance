import type { TouchdownPreviewPlayer, TouchdownWindowKey } from "./types";

export type TouchdownSortKey = "player" | "team" | "score" | "tdPerGame" | "tdLast5" | "usage" | "teamUsage" | "rz" | "inside10" | "goalLine" | "rzShare" | "goalLineShare" | "implied" | "oppOpportunities" | "oppPositionTds";
export type TouchdownSort = { key: TouchdownSortKey; direction: "asc" | "desc" };
export const DEFAULT_TOUCHDOWN_SORT: TouchdownSort = { key: "score", direction: "desc" };

export function nextTouchdownSort(current: TouchdownSort, key: TouchdownSortKey): TouchdownSort {
  if (current.key !== key) return { key, direction: key === "player" || key === "team" ? "asc" : "desc" };
  return { key, direction: current.direction === "desc" ? "asc" : "desc" };
}

function value(row: TouchdownPreviewPlayer, window: TouchdownWindowKey, key: TouchdownSortKey): string | number | null {
  const metrics = row.windows[window];
  return ({ player: row.playerName, team: row.team, score: metrics.jkbTdScore, tdPerGame: metrics.tdPerGame, tdLast5: metrics.tdLast5PerGame,
    usage: metrics.usagePerGame, teamUsage: metrics.teamUsageShare, rz: metrics.rzOpportunitiesPerGame, inside10: metrics.inside10OpportunitiesPerGame,
    goalLine: metrics.goalLineOpportunitiesPerGame, rzShare: metrics.rzOpportunityShare, goalLineShare: metrics.goalLineOpportunityShare,
    implied: metrics.impliedTeamPoints, oppOpportunities: metrics.opponentTdOpportunitiesPerGame, oppPositionTds: metrics.opponentPositionTdsAllowedPerGame })[key];
}

export function sortTouchdownPlayers(rows: readonly TouchdownPreviewPlayer[], window: TouchdownWindowKey, sort: TouchdownSort): TouchdownPreviewPlayer[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = value(a, window, sort.key); const bv = value(b, window, sort.key);
    if (av == null && bv == null) return a.playerName.localeCompare(b.playerName);
    if (av == null) return 1; if (bv == null) return -1;
    const compared = typeof av === "string" ? av.localeCompare(String(bv)) : av - Number(bv);
    return compared * direction || a.playerName.localeCompare(b.playerName);
  });
}
