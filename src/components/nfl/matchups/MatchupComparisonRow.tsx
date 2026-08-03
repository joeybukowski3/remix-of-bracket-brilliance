import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import { rankCellClass } from "@/lib/nfl/rankTier";
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
  const isAway = side === "away";
  const unavailable = value.formattedValue === METRIC_NA;

  return (
    <div
      className={`flex flex-col gap-0.5 rounded px-1 py-0.5 ${neutral ? "" : rankCellClass(value.rank)} ${
        isAway ? "items-end text-right" : "items-start text-left"
      }`}
    >
      <span className="sr-only">
        {teamName} {metricLabel}:{" "}
      </span>
      <span
        className={`text-[13px] font-black leading-4 tabular-nums sm:text-sm ${
          unavailable ? "text-slate-400" : "text-slate-900"
        }`}
      >
        {value.formattedValue}
      </span>
      <MatchupRankBadge rank={value.rank} neutral={neutral} />
    </div>
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
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_4.25rem] items-center gap-1.5 border-b border-slate-100 py-1.5 last:border-0 sm:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] sm:gap-2">
      <ComparisonSide side="away" value={away} teamName={awayTeamName} metricLabel={metricLabel} neutral={neutral} />

      <div className="min-w-0 text-center" title={help}>
        {shortLabel && shortLabel !== metricLabel ? (
          <>
            <span className="block text-[10px] font-bold leading-3 text-slate-600 sm:hidden">
              {shortLabel}
            </span>
            <span className="hidden text-[11px] font-bold leading-4 text-slate-600 sm:block">
              {metricLabel}
            </span>
          </>
        ) : (
          <span className="block text-[10px] font-bold leading-3 text-slate-600 sm:text-[11px] sm:leading-4">
            {metricLabel}
          </span>
        )}
      </div>

      <ComparisonSide side="home" value={home} teamName={homeTeamName} metricLabel={metricLabel} neutral={neutral} />
    </div>
  );
}
