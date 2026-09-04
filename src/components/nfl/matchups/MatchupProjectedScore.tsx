import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { formatTotal, type MarketCurrentGame } from "@/lib/nfl/marketData";
import type { NflMatchup } from "@/lib/nfl/matchups";
import {
  compareTotalToMarket,
  formatTeamPoints,
  formatTotalDifference,
  type TeamTotalProjection,
} from "@/lib/nfl/totalsProjectionData";

/**
 * Compact JKB projected-score strip: each team's projected points plus the
 * combined JKB Projected Total, with an optional Vegas-total comparison row
 * when the page already has a priced market total for this game.
 *
 * These are JKB model outputs (jkb-nfl-total-ridge-v1.0.0), not Vegas
 * implied team totals — every label says "JKB" explicitly, and the two
 * figures are never blended into one number. Missing data renders a plain
 * "JKB projection unavailable" line rather than a fabricated 0.0.
 */
export default function MatchupProjectedScore({
  matchup,
  totalProjection,
  market,
  loading,
}: {
  matchup: NflMatchup;
  totalProjection: TeamTotalProjection | null;
  market: MarketCurrentGame | null;
  loading: boolean;
}) {
  const { away, home } = matchup;

  if (!totalProjection) {
    return (
      <div className="matchup-projected-score matchup-projected-score--unavailable">
        <div className="matchup-projected-score__label">JKB Projected Score</div>
        <p className="matchup-projected-score__unavailable-copy">
          {loading ? "Loading JKB projection…" : "JKB projection unavailable"}
        </p>
      </div>
    );
  }

  const comparison = compareTotalToMarket(totalProjection, market);
  const showComparison = comparison != null && comparison.vegasTotal != null;

  return (
    <div className="matchup-projected-score">
      <div className="matchup-projected-score__label">JKB Projected Score</div>

      <div className="matchup-projected-score__teams">
        <div className="matchup-projected-score__team matchup-projected-score__team--away">
          <NflTeamCrest team={away} side="away" size={26} />
          <span className="matchup-projected-score__team-abbr">{away.abbr.toUpperCase()}</span>
          <span className="matchup-projected-score__team-pts tabular-nums">
            {formatTeamPoints(totalProjection.awayExpectedPoints)}
          </span>
        </div>
        <div className="matchup-projected-score__team matchup-projected-score__team--home">
          <NflTeamCrest team={home} side="home" size={26} />
          <span className="matchup-projected-score__team-abbr">{home.abbr.toUpperCase()}</span>
          <span className="matchup-projected-score__team-pts tabular-nums">
            {formatTeamPoints(totalProjection.homeExpectedPoints)}
          </span>
        </div>
      </div>

      <div className="matchup-projected-score__total">
        <span className="matchup-projected-score__total-label">JKB Projected Total</span>
        <span className="matchup-projected-score__total-value tabular-nums">
          {formatTeamPoints(totalProjection.projectedGameTotal)}
        </span>
      </div>

      {showComparison && (
        <div className="matchup-projected-score__vs-market">
          <div className="matchup-projected-score__vs-market-row">
            <span>Vegas Total</span>
            <span className="tabular-nums">{formatTotal(comparison.vegasTotal)}</span>
          </div>
          <div className="matchup-projected-score__vs-market-row">
            <span>JKB Total</span>
            <span className="tabular-nums">{formatTeamPoints(comparison.jkbTotal)}</span>
          </div>
          <div className="matchup-projected-score__vs-market-row matchup-projected-score__vs-market-row--diff">
            <span>JKB Difference</span>
            <span className="tabular-nums">
              {formatTotalDifference(comparison.difference)}
              {comparison.lean && comparison.lean !== "NEUTRAL" && (
                <span className="matchup-projected-score__lean"> · {comparison.lean}</span>
              )}
            </span>
          </div>
        </div>
      )}

      <p className="matchup-projected-score__disclaimer">
        JKB model projection — not a Vegas implied team total.
      </p>
    </div>
  );
}
