import type { MarketCurrentGame } from "@/lib/nfl/marketData";

export type ImpliedTeamTotals = {
  home: number;
  away: number;
  neutralSite: boolean;
  provenance: {
    source: string;
    generatedAt: string;
    perRowTimestampAvailable: boolean;
  };
};

export type ImpliedTeamTotalProvenance = ImpliedTeamTotals["provenance"];

function requireFiniteMarketValue(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite.`);
}

/**
 * Uses the stored conventional home spread. A negative value means the
 * designated home team is favoured. JKB model margins are never accepted.
 */
export function deriveImpliedTeamTotals(
  market: Pick<MarketCurrentGame, "spread" | "total" | "neutralSite"> | null,
  provenance: ImpliedTeamTotalProvenance,
): ImpliedTeamTotals | null {
  const homeSpread = market?.spread.home;
  const total = market?.total;
  if (homeSpread == null || total == null) return null;
  requireFiniteMarketValue(homeSpread, "homeSpread");
  requireFiniteMarketValue(total, "total");
  if (total < 0) throw new Error("total must be non-negative.");

  const home = (total - homeSpread) / 2;
  const away = (total + homeSpread) / 2;
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
    throw new Error("Market inputs produced invalid implied team totals.");
  }

  return { home, away, neutralSite: market.neutralSite, provenance };
}
