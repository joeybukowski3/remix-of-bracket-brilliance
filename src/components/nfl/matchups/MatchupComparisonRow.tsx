import MatchupValuePills from "@/components/nfl/matchups/MatchupValuePills";
import CompactMatchupMetricRow from "@/components/nfl/matchups/CompactMatchupMetricRow";
import {
  MATCHUP_METRIC_LABEL,
  MATCHUP_UNIT_ROW_GRID,
  MATCHUP_MARKET_ROW_GRID,
  MATCHUP_ROW_AWAY_CELL,
  MATCHUP_ROW_HOME_CELL,
  MATCHUP_ROW_LABEL_CELL,
} from "@/components/nfl/matchups/matchupTypography";
import {
  METRIC_NA,
  type ComparisonSideValue,
  type NflMetricDirection,
} from "@/lib/nfl/matchupMetrics";
import type { MetricComparison } from "@/lib/nfl/matchupCategoryAdvantage";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";

function ComparisonSide({
  side,
  value,
  teamName,
  metricLabel,
  neutral,
}: {
  side: "away" | "home";
  value: ComparisonSideValue;
  teamName: string;
  metricLabel: string;
  neutral: boolean;
}) {
  return (
    <MatchupValuePills
      side={side}
      formatted={value.formattedValue}
      rank={value.rank}
      unavailable={value.formattedValue === METRIC_NA}
      neutral={neutral}
      srText={`${teamName} ${metricLabel}: `}
    />
  );
}

/**
 * The analyzer's canonical comparison row: `away value/rank | metric | home value/rank`.
 *
 * Side columns are fixed-width so values stay aligned down the whole group
 * regardless of label length, and the metric label takes the remaining space
 * (wrapping rather than forcing horizontal scroll at 375px).
 *
 * `direction` comes from the metric catalogue. A "context-only" metric (play
 * mix, attempt volume) is rendered without quality-tier colouring so the UI
 * never implies that ranking first in pass attempts is good or bad.
 */
export default function MatchupComparisonRow({
  metricLabel,
  shortLabel,
  help,
  direction,
  away,
  home,
  awayTeamName,
  homeTeamName,
  winner = "not-comparable",
  advantageText,
  variant = "default",
}: {
  metricLabel: string;
  shortLabel?: string;
  help?: string;
  direction?: NflMetricDirection;
  away: ComparisonSideValue;
  home: ComparisonSideValue;
  awayTeamName: string;
  homeTeamName: string;
  /** Existing comparison authority when both columns are directly comparable. */
  winner?: MetricComparison;
  advantageText?: string;
  /**
   * "market" swaps in fixed side columns (matching `ComparisonHeader` and
   * `MatchupMarketRow`) and a tighter label-cell gutter. Market Profile's
   * value/rank pairs are wide enough that the default's `minmax(72px, 0.7fr)`
   * share columns let them spill past their own column once the section
   * narrows below ~1500px; fixed columns can't shrink past their content.
   */
  variant?: "default" | "market";
}) {
  const neutral = direction === "context-only";
  const isMobile = useIsCompactLayout("(max-width: 639px)");
  const rowGrid = variant === "market" ? MATCHUP_MARKET_ROW_GRID : MATCHUP_UNIT_ROW_GRID;
  const sidePaddingClassName = variant === "market" ? "px-1 sm:px-1" : "px-2 sm:px-4";
  const labelPaddingClassName = variant === "market" ? "px-1 sm:px-1" : "px-2 sm:px-5";
  return (
    <div className="matchup-comparison-row border-b border-slate-100 last:border-0">
      {isMobile ? (
      <CompactMatchupMetricRow
        label={shortLabel ?? metricLabel}
        away={{ formatted: away.formattedValue, rank: away.rank, accessibleName: awayTeamName }}
        home={{ formatted: home.formattedValue, rank: home.rank, accessibleName: homeTeamName }}
        winner={winner}
        advantageText={advantageText}
        help={help}
      />
      ) : (<>
      {/* Capped and centred so the rank pill stays beside the metric label
          however wide the viewport is, rather than drifting to the page edge. */}
      <div className={`matchup-comparison-row__grid grid ${rowGrid}`}>
        <div className={`py-2.5 ${sidePaddingClassName} ${MATCHUP_ROW_AWAY_CELL}`}>
          <ComparisonSide side="away" value={away} teamName={awayTeamName} metricLabel={metricLabel} neutral={neutral} />
        </div>

        {/* The metric name is the row's anchor between the two rank figures and
            carries the same size as them. */}
        <div className={`min-w-0 py-2.5 text-center ${labelPaddingClassName} ${MATCHUP_ROW_LABEL_CELL}`} title={help}>
          {shortLabel && shortLabel !== metricLabel ? (
            <>
              <span className={`block break-words sm:hidden ${MATCHUP_METRIC_LABEL}`}>{shortLabel}</span>
              <span className={`hidden break-words sm:block ${MATCHUP_METRIC_LABEL}`}>{metricLabel}</span>
            </>
          ) : (
            <span className={`block break-words ${MATCHUP_METRIC_LABEL}`}>{metricLabel}</span>
          )}
        </div>

        <div className={`py-2.5 ${sidePaddingClassName} ${MATCHUP_ROW_HOME_CELL}`}>
          <ComparisonSide side="home" value={home} teamName={homeTeamName} metricLabel={metricLabel} neutral={neutral} />
        </div>
      </div>
      </>)}
    </div>
  );
}
