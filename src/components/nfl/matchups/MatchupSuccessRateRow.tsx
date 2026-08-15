import MatchupValuePills from "@/components/nfl/matchups/MatchupValuePills";
import {
  MATCHUP_METRIC_LABEL,
  MATCHUP_PERIOD_CAPTION,
  MATCHUP_UNIT_ROW_GRID,
  MATCHUP_ROW_AWAY_CELL,
  MATCHUP_ROW_HOME_CELL,
  MATCHUP_ROW_LABEL_CELL,
} from "@/components/nfl/matchups/matchupTypography";
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

      {periods.map((period) => {
        const labels = SUCCESS_PERIOD_LABELS[period];
        return (
          <div key={period} className={MATCHUP_UNIT_ROW_GRID}>
            <div className={`px-2 py-2 sm:px-4 ${MATCHUP_ROW_AWAY_CELL}`}>
              <PeriodSide
                side="away"
                value={awayValues[period] ?? null}
                teamName={awayTeamName}
                metricLabel={metricLabel}
                periodLabel={labels.label}
              />
            </div>
            <span className={`px-2 py-1 text-center sm:px-4 ${MATCHUP_PERIOD_CAPTION} ${MATCHUP_ROW_LABEL_CELL}`}>
              <span className="sm:hidden">{labels.short}</span>
              <span className="hidden sm:inline">{labels.label}</span>
            </span>
            <div className={`px-2 py-2 sm:px-4 ${MATCHUP_ROW_HOME_CELL}`}>
              <PeriodSide
                side="home"
                value={homeValues[period] ?? null}
                teamName={homeTeamName}
                metricLabel={metricLabel}
                periodLabel={labels.label}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
