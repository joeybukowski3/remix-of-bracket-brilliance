import { formatMarketFavoriteSpread, formatTotal, type MarketCurrentGame } from "@/lib/nfl/marketData";
import { formatProjectedSpread, type GameProjection } from "@/lib/nfl/projectionData";
import { formatTeamPoints, type TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

/** Shown for any field with no canonical value; sources are never swapped silently. */
export const SUMMARY_STRIP_MISSING = "—";

export type MatchupSummaryStripValues = {
  vegasLine: string;
  jkbLine: string;
  vegasTotal: string;
  jkbTotal: string;
};

/** The shared formatters return "N/A" for missing input; the strip shows an em dash instead. */
function orMissing(formatted: string): string {
  return formatted === "N/A" ? SUMMARY_STRIP_MISSING : formatted;
}

/**
 * Display strings for the four-field strip. Pure formatting over the same
 * canonical helpers the matchup detail page uses (marketData, projectionData,
 * totalsProjectionData) — no projection or line math happens here.
 */
export function buildMatchupSummaryStripValues(
  market: MarketCurrentGame | null,
  projection: GameProjection | null,
  totalProjection: TeamTotalProjection | null
): MatchupSummaryStripValues {
  return {
    vegasLine: orMissing(formatMarketFavoriteSpread(market)),
    jkbLine: orMissing(formatProjectedSpread(projection)),
    vegasTotal: orMissing(formatTotal(market?.total)),
    jkbTotal: totalProjection ? orMissing(formatTeamPoints(totalProjection.projectedGameTotal)) : SUMMARY_STRIP_MISSING,
  };
}
