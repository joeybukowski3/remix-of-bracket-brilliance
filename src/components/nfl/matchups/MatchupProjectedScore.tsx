import { formatTotal, type MarketCurrentGame } from "@/lib/nfl/marketData";
import {
  compareTotalToMarket,
  formatTeamPoints,
  formatTotalDifference,
  formatTotalIndicatorLabel,
  totalIndicatorToneClasses,
  type TeamTotalProjection,
} from "@/lib/nfl/totalsProjectionData";

/**
 * JKB Projected Total — a combined-points model-vs-market comparison card.
 *
 * Individual team-level projected scores (jkb-nfl-total-ridge-v1.0.0's
 * per-team homeExpectedPoints/awayExpectedPoints) are intentionally NOT
 * rendered here: the JKB spread (Power Rating margin model) and the JKB total
 * (this scoring model) are separate models that do not algebraically
 * reconcile, and showing per-team points next to the authoritative spread
 * could imply a different winner than the spread projects. Only the combined
 * total — which carries no implied winner — is shown, alongside the market
 * total, the difference, and a descriptive magnitude-aware lean indicator
 * (Slight/Moderate/Strong Lean Over/Under, or EVEN). This is a descriptive
 * comparison, never a bet, pick, edge, EV, confidence or recommendation.
 */
export default function MatchupProjectedScore({
  totalProjection,
  market,
  loading,
}: {
  totalProjection: TeamTotalProjection | null;
  market: MarketCurrentGame | null;
  loading: boolean;
}) {
  if (!totalProjection) {
    return (
      <div className="matchup-projected-score matchup-projected-score--unavailable">
        <div className="matchup-projected-score__label">JKB Projected Total</div>
        <p className="matchup-projected-score__unavailable-copy">
          {loading ? "Loading JKB projection…" : "JKB projection unavailable"}
        </p>
      </div>
    );
  }

  const comparison = compareTotalToMarket(totalProjection, market);
  const marketTotalValue = comparison?.vegasTotal != null ? formatTotal(comparison.vegasTotal) : "N/A";
  const differenceValue = comparison?.difference != null ? formatTotalDifference(comparison.difference) : "N/A";
  const indicator = comparison?.indicator ?? null;

  return (
    <div className="matchup-projected-score">
      <div className="matchup-projected-score__total">
        <span className="matchup-projected-score__total-label">JKB Projected Total</span>
        <span className="matchup-projected-score__total-value tabular-nums">
          {formatTeamPoints(totalProjection.projectedGameTotal)}
        </span>
      </div>

      <div className="matchup-projected-score__vs-market">
        <div className="matchup-projected-score__vs-market-row">
          <span>Market Total</span>
          <span className="tabular-nums">{marketTotalValue}</span>
        </div>
        <div className="matchup-projected-score__vs-market-row">
          <span>Difference</span>
          <span className="tabular-nums">{differenceValue}</span>
        </div>
        <div className="matchup-projected-score__vs-market-row matchup-projected-score__vs-market-row--diff">
          <span>Indicator</span>
          <span className={`matchup-projected-score__indicator ${totalIndicatorToneClasses(indicator)}`}>
            {formatTotalIndicatorLabel(indicator)}
          </span>
        </div>
      </div>

      <p className="matchup-projected-score__disclaimer">
        JKB total is this scoring model&rsquo;s combined projected points — a separate model from the JKB spread above; the two are not reconciled.
      </p>
    </div>
  );
}
