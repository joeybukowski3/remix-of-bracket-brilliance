/**
 * Opponent yardage-production-allowed resolver.
 *
 * Consumes the generated public/data/nfl/matchup-production-allowed.json
 * artifact, produced by scripts/generate-nfl-production-allowed.mjs from
 * nflverse stats_player_week (regular season only). This is a literal
 * yardage-allowed figure -- NOT Fantasy Points Allowed
 * (src/lib/fantasy/pointsAllowed2025.ts), which is a composite fantasy
 * scoring metric and must never be substituted for this.
 *
 * Position slices are exactly what the source can attribute cleanly:
 * passing/QB, rushing/ALL (team-wide) + rushing/RB, and
 * receiving/{WR,TE,RB} (position-specific, no team-wide receiving slice).
 * See scripts/lib/nfl-production-allowed-core.mjs for the aggregation rules.
 */

export type ProductionAllowedMarket = "passing" | "rushing" | "receiving";
export type ProductionAllowedWindow = "season" | "last5";

export const PRODUCTION_ALLOWED_MARKET_POSITIONS: Record<ProductionAllowedMarket, readonly string[]> = {
  passing: ["QB"],
  rushing: ["ALL", "RB"],
  receiving: ["WR", "TE", "RB"],
};

export type ProductionAllowedCell = {
  yardsAllowedPerGame: number;
  totalYardsAllowed: number;
  gamesIncluded: number;
  weeksIncluded: readonly number[];
};

export type ProductionAllowedArtifact = {
  _meta: { schemaVersion: string; generatedAt: string; source: string; season: number | null; notes: readonly string[] };
  schemaVersion: string;
  sourceSeason: number;
  marketPositions: Record<ProductionAllowedMarket, readonly string[]>;
  teams: Record<string, Record<ProductionAllowedMarket, Record<string, Record<ProductionAllowedWindow, ProductionAllowedCell | null>>>>;
  coverage: Record<ProductionAllowedMarket, Record<string, { season: number; last5: number; ofTeams: number }>>;
};

export const PRODUCTION_ALLOWED_ARTIFACT_PATH = "/data/nfl/matchup-production-allowed.json";

/**
 * Look up one team's yards-allowed cell. Returns null -- never a substituted
 * value -- whenever the team, market, position or window is absent, so the
 * caller renders "N/A" rather than a fabricated number.
 */
export function resolveProductionAllowed(
  artifact: ProductionAllowedArtifact | null,
  teamNflverseAbbr: string | undefined,
  market: ProductionAllowedMarket,
  position: string,
  window: ProductionAllowedWindow,
): ProductionAllowedCell | null {
  if (!artifact || !teamNflverseAbbr) return null;
  const cell = artifact.teams?.[teamNflverseAbbr]?.[market]?.[position]?.[window];
  if (!cell || !Number.isFinite(cell.yardsAllowedPerGame)) return null;
  return cell;
}

/** Display formatting: one decimal, "N/A" for a missing cell. */
export function formatYardsAllowed(cell: ProductionAllowedCell | null): string {
  if (!cell) return "N/A";
  return cell.yardsAllowedPerGame.toFixed(1);
}
