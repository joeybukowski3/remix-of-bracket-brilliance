import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupPendingNote from "@/components/nfl/matchups/MatchupPendingNote";
import {
  compareToMarket,
  formatPoints,
  formatProjectedSpread,
  projectionBreakdown,
  type GameProjection,
} from "@/lib/nfl/projectionData";
import { formatMarketFavoriteSpread, type MarketCurrentGame } from "@/lib/nfl/marketData";

const NA = "N/A";

/**
 * One headline figure. Three of these sit side by side on a 375px screen, so
 * the value is sized to hold "SEA -3.4" on one line at the narrowest width.
 */
function HeadlineStat({
  label,
  value,
  help,
  emphasis = false,
  unavailable = false,
}: {
  label: string;
  value: string;
  /** Short definition; these three terms are not self-explanatory. */
  help: string;
  emphasis?: boolean;
  unavailable?: boolean;
}) {
  return (
    <div
      title={help}
      className={`rounded-lg border px-2 py-2 text-center sm:px-3 ${
        emphasis ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="text-[9px] font-bold uppercase leading-3 tracking-wide text-slate-500 sm:text-[10px]">
        {label}
      </p>
      <p
        className={`mt-1 text-[15px] font-bold leading-5 tabular-nums sm:text-lg ${
          unavailable ? "text-slate-400" : emphasis ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Model Analysis: the JKB projected spread, the market line beside it, and the
 * arithmetic that produced the projection.
 *
 * The market column is presented as a comparison only. The model never sees a
 * line, and backtesting did not show it beating the market, so the third
 * headline is labelled "Model vs Market" — a description of the gap — and not
 * an edge. No pick, best bet, value bet, confidence, win probability, expected
 * value or stake size is rendered anywhere in this section.
 */
export default function MatchupModelAnalysis({
  projection,
  market,
  awayTeamName,
  homeTeamName,
  modelVersion,
  loading,
  error,
}: {
  projection: GameProjection | null;
  market: MarketCurrentGame | null;
  awayTeamName: string;
  homeTeamName: string;
  modelVersion: string | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading || error || !projection) {
    return (
      <MatchupSection id="model-analysis">
        <p className="text-xs font-semibold text-slate-500">
          {loading
            ? "Loading the JKB projected spread…"
            : "The JKB projected spread is unavailable for this matchup. No figure is estimated in its place."}
        </p>
      </MatchupSection>
    );
  }

  const comparison = compareToMarket(projection, market);
  const breakdown = projectionBreakdown(projection);
  // Shared with the hero and the Spread & Market section so one line is never
  // stated three different ways on one page.
  const marketDisplay = formatMarketFavoriteSpread(market);
  const differenceDisplay =
    comparison?.difference == null ? NA : formatPoints(comparison.difference);

  return (
    <MatchupSection
      id="model-analysis"
      subtitle={`${awayTeamName} at ${homeTeamName} — Power Number difference from the canonical Current OVR board${
        projection.neutralSite ? ", neutral site" : ""
      }.`}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <HeadlineStat
          label="JKB Projected Spread"
          value={formatProjectedSpread(projection)}
          help="This model's own estimate of the final margin, from the two teams' Power Numbers (derived from the canonical Current OVR board). No market data is used to produce it."
          emphasis
        />
        <HeadlineStat
          label="Market Spread"
          value={marketDisplay}
          help="The currently published market line for this game, shown for comparison only."
          unavailable={marketDisplay === NA}
        />
        <HeadlineStat
          label="Model vs Market"
          value={differenceDisplay}
          help="How far this model sits from the market line, in points. A description of the gap — not an edge, a pick or a betting recommendation."
          unavailable={differenceDisplay === NA}
        />
      </div>

      {comparison?.difference != null && comparison.leansToward && (
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          The model sits{" "}
          <span className="font-bold tabular-nums text-slate-700">
            {Math.abs(comparison.difference).toFixed(1)}
          </span>{" "}
          points toward{" "}
          <span className="font-bold uppercase text-slate-700">{comparison.leansToward}</span> relative
          to the market line. This is a difference, not a recommendation.
        </p>
      )}

      <div className="mt-3 border-t border-slate-100 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          How the projection is built
        </p>
        <dl className="mt-1.5 divide-y divide-slate-100">
          {breakdown.map((row) => (
            <div key={row.label} className="py-1.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[11px] font-bold leading-4 text-slate-700 sm:text-xs">
                  {row.label}
                </dt>
                <dd className="shrink-0 text-[13px] font-bold leading-4 tabular-nums text-slate-900">
                  {row.value}
                </dd>
              </div>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500 sm:text-[11px]">{row.detail}</p>
            </div>
          ))}
        </dl>
      </div>

      <MatchupPendingNote>
        {modelVersion ?? "jkb-power-number-v1.0.0"} projects scoring margin from each team's Power
        Number — how many points better or worse than the current league-average NFL team it is,
        derived from the canonical Current OVR board — plus a fixed 2.0-point home-field adjustment.
        No sportsbook line, moneyline, total or ATS record is used as an input. Backtesting has not
        shown this model beating the market, so no pick, confidence level or bet sizing is offered.
      </MatchupPendingNote>
    </MatchupSection>
  );
}
