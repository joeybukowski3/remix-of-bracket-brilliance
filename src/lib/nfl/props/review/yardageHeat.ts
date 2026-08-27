/**
 * Presentation-only stat/ranking heat treatment for the Yardage Props Review
 * table. Reuses the existing site-wide `WeeklyHeatTone` scale
 * (src/lib/fantasy/weekly/researchPresentation.ts, itself built on the MLB
 * percentile color scale in src/lib/mlb/percentileColorScale.ts) instead of
 * inventing a yardage-specific heat system. Every function here is a pure
 * mapping from an already-computed rank/band/score value to a visual tone --
 * no projection, rank, EPA, success, edge, or matchup-score value is
 * recomputed or altered.
 */
import {
  weeklyHeatClass,
  weeklyHeatStyle,
  weeklyHeatTextClass,
  weeklyMatchupComponentHeatTone,
  weeklyMatchupDifferenceHeatTone,
  weeklyRankHeatTone,
  type WeeklyHeatTone,
} from "@/lib/fantasy/weekly/researchPresentation";
import type {
  ProductionAllowedArtifact,
  ProductionAllowedMarket,
  ProductionAllowedWindow,
} from "@/lib/nfl/productionAllowedData";
import type { NflMatchupScoreBand, NflYardageReviewRow } from "./yardageMarketJoin";
import type { NflYardageOpponentContext } from "./opponentContext";

export type { WeeklyHeatTone };
export { weeklyHeatClass, weeklyHeatStyle, weeklyHeatTextClass };

/**
 * Matchup Score keeps its existing 5-band bucketing and thresholds
 * (`matchupScoreBand` in yardageMarketJoin.ts) untouched -- this only maps
 * those band names onto the site-wide 8-tone heat scale so the Matchup tile
 * paints with the same gold/green/neutral/red language as every other
 * ranked column on the page.
 */
const MATCHUP_BAND_TONE: Record<NflMatchupScoreBand, WeeklyHeatTone> = {
  elite: "gold",
  strong: "green",
  average: "neutral",
  weak: "light-red",
  poor: "red",
};

export function matchupScoreHeatTone(band: NflMatchupScoreBand | null | undefined): WeeklyHeatTone {
  return band ? MATCHUP_BAND_TONE[band] : "missing";
}

/**
 * Opponent EPA/Success-Allowed rank cells: rank 1 = strongest defense, which
 * is the *least* favorable matchup for the offense. Reuses the site-wide
 * "opponent-defense" perspective helper (already used by the Fantasy Weekly
 * Command Center for the identical convention) rather than re-deriving the
 * inversion here.
 */
export function opponentDefenseRankHeatTone(rank: number | null | undefined): WeeklyHeatTone {
  return weeklyMatchupComponentHeatTone(rank ?? null, "opponent-defense");
}

/**
 * Edge is already the signed -31..31 (defenseRank - offenseRank) difference
 * -- positive favors the offense (see matchupEdges.ts). Reuses the exact
 * site-wide helper built for that convention.
 */
export function edgeHeatTone(rankDifference: number | null | undefined): WeeklyHeatTone {
  return weeklyMatchupDifferenceHeatTone(rankDifference ?? null);
}

/**
 * Opponent yards-allowed has no rank field on the resolved cell, only the
 * raw yardsAllowedPerGame. Derives a dense 1..N rank across every team with
 * a valid cell for the same market/position/window slice (higher yards
 * allowed = more favorable to the offense = rank 1), then reuses the same
 * site-wide rank-to-tone bucketing as every other ranked column. Pure
 * presentation -- never touches productionAllowedData.ts or changes any
 * yardsAllowedPerGame value.
 */
function yardsAllowedRank(
  artifact: ProductionAllowedArtifact | null,
  market: ProductionAllowedMarket,
  position: string,
  window: ProductionAllowedWindow,
  teamAbbr: string | undefined,
): { rank: number | null; poolSize: number } {
  if (!artifact || !teamAbbr) return { rank: null, poolSize: 0 };
  const entries: Array<[string, number]> = [];
  for (const [abbr, byMarket] of Object.entries(artifact.teams)) {
    const cell = byMarket?.[market]?.[position]?.[window];
    if (cell && Number.isFinite(cell.yardsAllowedPerGame)) entries.push([abbr, cell.yardsAllowedPerGame]);
  }
  if (entries.length === 0) return { rank: null, poolSize: 0 };
  // Descending by yards allowed -- most yards allowed is the most favorable matchup, rank 1.
  entries.sort((a, b) => b[1] - a[1]);
  let rank: number | null = null;
  let priorValue: number | null = null;
  let priorRank = 0;
  entries.forEach(([abbr, value], index) => {
    const r = priorValue !== null && value === priorValue ? priorRank : index + 1;
    if (abbr === teamAbbr) rank = r;
    priorValue = value;
    priorRank = r;
  });
  return { rank, poolSize: entries.length };
}

export function yardsAllowedHeatTone(
  artifact: ProductionAllowedArtifact | null,
  market: ProductionAllowedMarket,
  position: string,
  window: ProductionAllowedWindow,
  teamAbbr: string | undefined,
): WeeklyHeatTone {
  const { rank, poolSize } = yardsAllowedRank(artifact, market, position, window, teamAbbr);
  return weeklyRankHeatTone(rank, poolSize);
}

/**
 * Proj Yds heat: presentation-ranking-only, never touches `projectedYards`
 * itself. Ranks each row's projected yards within its own market+position
 * pool -- Passing/QB against Passing/QB, Rushing/RB against Rushing/RB
 * (never against Rushing/QB or Rushing/WR), Receiving/WR against
 * Receiving/WR, etc. -- so differing raw-volume levels across positions
 * (e.g. a scrambling QB's rushing yards vs. a bellcow RB's) never bleed into
 * one misleading cross-position scale. Higher projected yards within the
 * pool is more favorable (gold/green); a low projection within its own
 * position group can still be favorable if its position pool runs low
 * overall, and vice versa -- this is a relative, presentation-only rank,
 * not an absolute yardage judgment.
 */
function projectedYardsRankPools(
  entries: readonly NflYardageReviewRow[],
): Map<string, { rank: number | null; poolSize: number }> {
  const pools = new Map<string, Array<{ rowKey: string; value: number }>>();
  for (const entry of entries) {
    const { row } = entry;
    if (row.projectedYards == null || !Number.isFinite(row.projectedYards)) continue;
    const poolKey = `${row.market}-${row.position}`;
    const rowKey = `${row.market}-${row.playerId}`;
    const list = pools.get(poolKey) ?? [];
    list.push({ rowKey, value: row.projectedYards });
    pools.set(poolKey, list);
  }

  const result = new Map<string, { rank: number | null; poolSize: number }>();
  for (const list of pools.values()) {
    // Descending by projected yards -- the highest projection in the pool is rank 1 (most favorable).
    list.sort((a, b) => b.value - a.value);
    let priorValue: number | null = null;
    let priorRank = 0;
    list.forEach(({ rowKey, value }, index) => {
      const rank = priorValue !== null && value === priorValue ? priorRank : index + 1;
      result.set(rowKey, { rank, poolSize: list.length });
      priorValue = value;
      priorRank = rank;
    });
  }
  return result;
}

/**
 * Builds a `rowKey -> tone` lookup (same `${market}-${playerId}` row-key
 * convention used throughout this page) for the Proj Yds column. Compute
 * once from the full unfiltered market entries so the comparison pool -- and
 * therefore each row's heat -- doesn't shift as position/band/line filters
 * are applied.
 */
export function buildProjectedYardsHeatByKey(entries: readonly NflYardageReviewRow[]): Map<string, WeeklyHeatTone> {
  const pools = projectedYardsRankPools(entries);
  const tones = new Map<string, WeeklyHeatTone>();
  for (const entry of entries) {
    const { row } = entry;
    const rowKey = `${row.market}-${row.playerId}`;
    const { rank, poolSize } = pools.get(rowKey) ?? { rank: null, poolSize: 0 };
    tones.set(rowKey, weeklyRankHeatTone(rank, poolSize));
  }
  return tones;
}

/** Opponent context enriched with the two yards-allowed heat tones the resolved cells alone can't derive. */
export type NflYardageOpponentContextWithHeat = NflYardageOpponentContext & {
  yardsAllowedSeasonTone: WeeklyHeatTone;
  yardsAllowedLast5Tone: WeeklyHeatTone;
};

export function withYardsAllowedHeat(
  context: NflYardageOpponentContext,
  artifact: ProductionAllowedArtifact | null,
  market: ProductionAllowedMarket,
  teamAbbr: string | undefined,
): NflYardageOpponentContextWithHeat {
  const position = context.productionAllowed.position;
  return {
    ...context,
    yardsAllowedSeasonTone: yardsAllowedHeatTone(artifact, market, position, "season", teamAbbr),
    yardsAllowedLast5Tone: yardsAllowedHeatTone(artifact, market, position, "last5", teamAbbr),
  };
}
