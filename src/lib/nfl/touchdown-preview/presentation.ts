import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import { buildPercentileLookup, lookupPercentile } from "@/lib/shared/jkbHeat";
import type { TouchdownPosition, TouchdownPreviewPlayer, TouchdownWindowKey, TouchdownWindowMetrics } from "./types";

/** Canonical, order-independent matchup key for two teams, e.g. `ne` + `sea` -> `"ne@sea"`. */
export function touchdownMatchupKey(teamA: string, teamB: string): string {
  const normalized = [teamA, teamB].map((team) => normalizeNflTeamAbbr(team) ?? team.trim().toLowerCase());
  return [...normalized].sort().join("@");
}

/** Human-readable matchup label from a `touchdownMatchupKey` value, e.g. `"ne@sea"` -> `"ne @ sea"`. */
export function formatTouchdownMatchupLabel(matchupKey: string): string {
  return matchupKey.replace("@", " @ ");
}

/** Position-specific opponent "TD allowed" label. QBs almost never record receiving TDs, so the QB
 * figure is effectively rushing TD allowance -- the label makes that explicit rather than implying
 * passing TDs are counted (they never are; see aggregateScorerTouchdownsByPosition). */
export const OPPONENT_POSITION_TD_ALLOWED_LABEL: Record<TouchdownPosition, string> = {
  QB: "QB Rush TD Allowed",
  RB: "RB TD Allowed",
  WR: "WR TD Allowed",
  TE: "TE TD Allowed",
};

export type TouchdownSortKey = "player" | "opponent" | "score" | "anytimeTd" | "marketImplied" | "tdPerGame" | "tdLast5" | "usage" | "teamUsage" | "rz" | "inside10" | "goalLine" | "rzShare" | "goalLineShare" | "implied" | "oppOpportunities" | "oppPositionTds" | "oppTdVsPosSeason" | "oppTdVsPosLast5";
export type TouchdownSort = { key: TouchdownSortKey; direction: "asc" | "desc" };
export const DEFAULT_TOUCHDOWN_SORT: TouchdownSort = { key: "score", direction: "desc" };

/** Text columns (Player, Opponent) open ascending, like an A–Z list; numeric columns open descending (best first). */
export function nextTouchdownSort(current: TouchdownSort, key: TouchdownSortKey): TouchdownSort {
  if (current.key !== key) return { key, direction: key === "player" || key === "opponent" ? "asc" : "desc" };
  return { key, direction: current.direction === "desc" ? "asc" : "desc" };
}

function value(row: TouchdownPreviewPlayer, window: TouchdownWindowKey, key: TouchdownSortKey): string | number | null {
  const metrics = row.windows[window];
  return ({ player: row.playerName, opponent: row.opponent, score: metrics.jkbTdScore, anytimeTd: row.anytimeTdOdds ?? null, marketImplied: row.marketImpliedProbability ?? null, tdPerGame: metrics.tdPerGame, tdLast5: metrics.tdLast5PerGame,
    usage: metrics.usagePerGame, teamUsage: metrics.teamUsageShare, rz: metrics.rzOpportunitiesPerGame, inside10: metrics.inside10OpportunitiesPerGame,
    goalLine: metrics.goalLineOpportunitiesPerGame, rzShare: metrics.rzOpportunityShare, goalLineShare: metrics.goalLineOpportunityShare,
    implied: metrics.impliedTeamPoints, oppOpportunities: metrics.opponentTdOpportunitiesPerGame, oppPositionTds: metrics.opponentPositionTdsAllowedPerGame,
    oppTdVsPosSeason: metrics.opponentPositionTdsAllowedPerGameSeason, oppTdVsPosLast5: metrics.opponentPositionTdsAllowedPerGameLast5 })[key];
}

/**
 * Global value -> favorable-percentile lookups for the heat-colored board cells.
 *
 * Built once from the FULL candidate population for the active window -- never
 * position-relative, and never recomputed from a filtered view -- so an
 * identical raw value always resolves to the same percentile, and therefore the
 * same color, anywhere on the board. Higher is better for all three metrics.
 *
 * This deliberately does NOT reuse the per-component percentiles that feed the
 * JKB TD Score: `components.tdSuccess` ranks an opportunity-adjusted conversion
 * rate (not TD/G), and `components.playerUsage` ranks a position-relative usage
 * index -- both would paint two equal raw values different colors.
 */
export type TouchdownBoardHeat = {
  tdPerGame: Map<number, number>;
  tdLast5PerGame: Map<number, number>;
  teamUsageShare: Map<number, number>;
};

export function buildTouchdownBoardHeat(
  players: readonly TouchdownPreviewPlayer[],
  window: TouchdownWindowKey,
): TouchdownBoardHeat {
  const lookupFor = (pick: (metrics: TouchdownWindowMetrics) => number | null): Map<number, number> =>
    buildPercentileLookup(players.map((player) => pick(player.windows[window])));
  return {
    tdPerGame: lookupFor((metrics) => metrics.tdPerGame),
    tdLast5PerGame: lookupFor((metrics) => metrics.tdLast5PerGame),
    teamUsageShare: lookupFor((metrics) => metrics.teamUsageShare),
  };
}

/** Favorable percentile for one board cell; `null` when the value is missing or not in the pool. */
export function touchdownBoardPercentile(value: number | null | undefined, lookup: Map<number, number>): number | null {
  return lookupPercentile(value, lookup);
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
