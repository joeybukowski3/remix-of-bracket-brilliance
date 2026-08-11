import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import { rankCellClass } from "@/lib/nfl/rankTier";
import { MARKET_PERIOD_LABELS, type MarketPeriodKey } from "@/lib/nfl/marketData";
import { METRIC_NA, type NflMatchupMetricValue } from "@/lib/nfl/matchupMetrics";

export type MarketPeriodValues = Partial<Record<MarketPeriodKey, NflMatchupMetricValue | null>>;

/**
 * One team's value for one period.
 *
 * Stacked below `sm` and inline from `sm` up, matching the success-rate row: an
 * inline "12-5-0 #3" does not fit the analyzer's 4.25rem side column and would
 * break alignment with neighbouring rows if forced.
 */
function PeriodSide({
  side,
  value,
  teamName,
  metricLabel,
  periodLabel,
}: {
  side: "away" | "home";
  value: NflMatchupMetricValue | null;
  teamName: string;
  metricLabel: string;
  periodLabel: string;
}) {
  const isAway = side === "away";
  const text = value?.formattedValue ?? METRIC_NA;
  const unavailable = !value || text === METRIC_NA;

  return (
    <div
      className={`flex flex-col gap-0.5 rounded px-1 py-0.5 sm:flex-row sm:items-center sm:gap-1 ${rankCellClass(
        value?.rank ?? null
      )} ${isAway ? "items-end text-right sm:justify-end" : "items-start text-left sm:justify-start"}`}
    >
      <span className="sr-only">
        {teamName} {metricLabel} {periodLabel}:{" "}
      </span>
      <span
        className={`text-[12px] font-bold leading-4 tabular-nums sm:text-[13px] ${
          unavailable ? "text-slate-600" : "text-slate-900"
        }`}
      >
        {text}
      </span>
      {/* Only ATS differential and point differential are ranked. Rendering an
          empty "—" chip on the five context-only record rows would double the
          height of a section that already shows eight metrics across two
          periods, for no information. */}
      {value?.rank != null && <MatchupRankBadge rank={value.rank} />}
    </div>
  );
}

/**
 * Market-profile comparison row: one metric label, then one aligned line per
 * visible period.
 *
 * Periods are shown separately and never blended. Game-level historical lines
 * are exact, so a 2025+2026 combined record would be computable — it is
 * deliberately not produced, because a single number spanning two seasons
 * would hide which season it came from.
 */
export default function MatchupMarketRow({
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
  periods: readonly MarketPeriodKey[];
  awayValues: MarketPeriodValues;
  homeValues: MarketPeriodValues;
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
        const labels = MARKET_PERIOD_LABELS[period];
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
