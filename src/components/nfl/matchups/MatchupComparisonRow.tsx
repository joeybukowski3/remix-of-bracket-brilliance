import MatchupValuePills, {
  MATCHUP_METRIC_LABEL,
} from "@/components/nfl/matchups/MatchupValuePills";
import {
  METRIC_NA,
  type ComparisonSideValue,
  type NflMetricDirection,
} from "@/lib/nfl/matchupMetrics";

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
}: {
  metricLabel: string;
  shortLabel?: string;
  help?: string;
  direction?: NflMetricDirection;
  away: ComparisonSideValue;
  home: ComparisonSideValue;
  awayTeamName: string;
  homeTeamName: string;
}) {
  const neutral = direction === "context-only";
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_4.25rem] items-center gap-1.5 border-b border-slate-100 py-1 last:border-0 sm:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] sm:gap-2">
      <ComparisonSide side="away" value={away} teamName={awayTeamName} metricLabel={metricLabel} neutral={neutral} />

      {/* The metric name is the row's anchor between the two rank figures, so it
          is set at the same 15px weight as Statistical Comparison's label. */}
      <div className="min-w-0 text-center" title={help}>
        {shortLabel && shortLabel !== metricLabel ? (
          <>
            <span className={`block sm:hidden ${MATCHUP_METRIC_LABEL}`}>
              {shortLabel}
            </span>
            <span className={`hidden sm:block ${MATCHUP_METRIC_LABEL}`}>
              {metricLabel}
            </span>
          </>
        ) : (
          <span className={`block ${MATCHUP_METRIC_LABEL}`}>
            {metricLabel}
          </span>
        )}
      </div>

      <ComparisonSide side="home" value={home} teamName={homeTeamName} metricLabel={metricLabel} neutral={neutral} />
    </div>
  );
}
