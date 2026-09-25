import { formatMarketFavoriteSpread, formatTotal, type MarketCurrentGame } from "@/lib/nfl/marketData";
import { formatProjectedSpread, marketHomeMargin, type GameProjection } from "@/lib/nfl/projectionData";
import { formatTeamPoints, type TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

/** Shown for any field with no canonical value; sources are never swapped silently. */
export const SUMMARY_STRIP_MISSING = "—";

export type MatchupSummaryStripValues = {
  vegasLine: string;
  jkbLine: string;
  vegasTotal: string;
  jkbTotal: string;
};

export type SummaryComparison = {
  kind: "higher" | "lower" | "dog" | "aligned" | "pickem" | "unavailable";
  /** Difference from the market in points, oriented toward its favorite for a line. */
  delta: number | null;
};

// Both displayed projections are rounded to tenths. Differences that round to
// zero at that precision do not warrant a directional signal.
const aligned = (difference: number) => Math.abs(difference) < 0.05;

export function compareSummaryLine(
  market: MarketCurrentGame | null,
  projection: GameProjection | null
): SummaryComparison {
  const marketMargin = marketHomeMargin(market);
  const modelMargin = projection?.projectedHomeMargin;
  if (marketMargin == null || modelMargin == null || !Number.isFinite(modelMargin)) {
    return { kind: "unavailable", delta: null };
  }
  if (marketMargin === 0) return { kind: "pickem", delta: null };

  const delta = Math.sign(marketMargin) * (modelMargin - marketMargin);
  if (aligned(delta)) return { kind: "aligned", delta: 0 };
  if (Math.sign(modelMargin) === -Math.sign(marketMargin)) return { kind: "dog", delta };
  return { kind: delta > 0 ? "higher" : "lower", delta };
}

export function compareSummaryTotal(
  market: MarketCurrentGame | null,
  totalProjection: TeamTotalProjection | null
): SummaryComparison {
  const marketTotal = market?.total;
  const modelTotal = totalProjection?.projectedGameTotal;
  if (marketTotal == null || modelTotal == null || !Number.isFinite(marketTotal) || !Number.isFinite(modelTotal)) {
    return { kind: "unavailable", delta: null };
  }
  const delta = modelTotal - marketTotal;
  if (aligned(delta)) return { kind: "aligned", delta: 0 };
  return { kind: delta > 0 ? "higher" : "lower", delta };
}

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
