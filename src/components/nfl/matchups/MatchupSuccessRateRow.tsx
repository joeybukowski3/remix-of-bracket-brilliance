import MatchupValuePills from "@/components/nfl/matchups/MatchupValuePills";
import {
  SUCCESS_PERIOD_LABELS,
  formatSuccessRate,
  type SuccessMetricValue,
  type SuccessPeriodKey,
} from "@/lib/nfl/successRateData";

export type SuccessPeriodValues = Partial<Record<SuccessPeriodKey, SuccessMetricValue | null>>;

/**
 * One team's value for one period.
 *
 * Stacked value-over-rank, matching the conventional comparison rows this row
 * is interleaved with. It previously went inline from `sm` up and pinned itself
 * to the outer edge, so a success-rate row read as a different kind of table
 * from the EPA row directly above it.
 */
function PeriodSide({
  side,
  value,
  teamName,
  metricLabel,
  periodLabel,
}: {
  side: "away" | "home";
  value: SuccessMetricValue | null;
  teamName: string;
  metricLabel: string;
  periodLabel: string;
}) {
  return (
    <MatchupValuePills
      side={side}
      formatted={formatSuccessRate(value)}
      rank={value?.rank ?? null}
      unavailable={!value}
      srText={`${teamName} ${metricLabel} ${periodLabel}: `}
    />
  );
}

/**
 * Success-rate comparison row: one metric label, then one aligned line per
 * visible period.
 *
 * Periods are shown separately and never combined — RBSDM publishes the
 * finished rate without the eligible-play denominator, so the two season ranges
 * cannot be merged exactly. Which periods appear is decided once per matchup by
 * resolveSuccessPeriods().
 *
 * Layout reuses the analyzer's three-column grid so away/home orientation and
 * value alignment match every other comparison row, and no fourth column is
 * introduced that would overflow at 375px.
 */
export default function MatchupSuccessRateRow({
  metricLabel,
  shortLabel,
  help,
  periods,
  awayValues,
  homeValues,
  awayTeamName,
  homeTeamName,
}: {
  metricLabel: string;
  shortLabel?: string;
  help?: string;
  periods: readonly SuccessPeriodKey[];
  awayValues: SuccessPeriodValues;
  homeValues: SuccessPeriodValues;
  awayTeamName: string;
  homeTeamName: string;
}) {
  return (
    <div className="border-b border-slate-100 py-1.5 last:border-0">
      <div className="mb-0.5 text-center" title={help}>
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

      {periods.map((period) => {
        const labels = SUCCESS_PERIOD_LABELS[period];
        return (
          <div
            key={period}
            className="grid grid-cols-[4.25rem_minmax(0,1fr)_4.25rem] items-center gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] sm:gap-2"
          >
            <PeriodSide
              side="away"
              value={awayValues[period] ?? null}
              teamName={awayTeamName}
              metricLabel={metricLabel}
              periodLabel={labels.label}
            />
            <span className="text-center text-[9px] font-bold uppercase tracking-wide text-slate-600">
              <span className="sm:hidden">{labels.short}</span>
              <span className="hidden sm:inline">{labels.label}</span>
            </span>
            <PeriodSide
              side="home"
              value={homeValues[period] ?? null}
              teamName={homeTeamName}
              metricLabel={metricLabel}
              periodLabel={labels.label}
            />
          </div>
        );
      })}
    </div>
  );
}
