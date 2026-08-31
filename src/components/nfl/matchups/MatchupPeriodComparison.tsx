import MatchupSectionCard from "@/components/nfl/matchups/MatchupSectionCard";
import CompactMatchupMetricRow from "@/components/nfl/matchups/CompactMatchupMetricRow";
import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import {
  describeMetricAdvantage,
  type MatchupSuccessRateSource,
} from "@/components/nfl/matchups/matchupDisplayMetrics";
import { classifyMetricComparison } from "@/lib/nfl/matchupCategoryAdvantage";
import { getMetricDef } from "@/lib/nfl/matchupMetrics";
import type { NflMatchup } from "@/lib/nfl/matchups";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import {
  SUCCESS_PERIOD_LABELS,
  SUCCESS_RATE_METRIC_KEYS,
  formatSuccessRate,
  type SuccessMetricValue,
} from "@/lib/nfl/successRateData";

function ValueCell({ value }: { value: SuccessMetricValue | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`text-[13px] font-bold tabular-nums ${
          value ? "text-slate-900" : "text-slate-600"
        }`}
      >
        {formatSuccessRate(value)}
      </span>
      <MatchupRankBadge rank={value?.rank ?? null} />
    </span>
  );
}

/**
 * Success rate by period.
 *
 * This is the analyzer's only genuine multi-period comparison, which is why it
 * lives inside Team Comparison rather than behind a Trends tab: no home/away
 * splits and no week-indexed series exist in any artifact, so a Trends tab
 * would have had one real occupant and would have implied several more.
 *
 * Which periods appear is decided once per matchup by `resolveSuccessPeriods()`
 * and both teams always move together — a comparison where one side showed Last
 * 5 and the other Last 8 would not be a comparison.
 *
 * Two presentations of the same values: a real table where the width exists,
 * and one expandable metric block at a time below `sm`, each period labelled
 * with the two teams paired underneath it. Every value stays reachable by
 * vertical scrolling; nothing here scrolls sideways.
 */
export default function MatchupPeriodComparison({
  matchup,
  successRate,
  note,
}: {
  matchup: NflMatchup;
  successRate: MatchupSuccessRateSource;
  note: string;
}) {
  const isMobile = useIsCompactLayout("(max-width: 639px)");
  const { away, home } = matchup;
  const periods = successRate.periods;
  const rows = SUCCESS_RATE_METRIC_KEYS.map((key) => ({
    key,
    label: getMetricDef(key)?.label ?? key,
    shortLabel: getMetricDef(key)?.shortLabel,
    away: periods.map((period) => successRate.resolve(away.abbr, key, period)),
    home: periods.map((period) => successRate.resolve(home.abbr, key, period)),
  }));

  return (
    <MatchupSectionCard
      eyebrow="Over time"
      title="Success Rate by Period"
      titleId="success-periods-heading"
      subtitle={note}
      bodyClassName="px-0 py-0 sm:px-0"
    >

      {!isMobile ? (
      <div className="px-3 py-3 sm:px-4">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Published success rates for {away.teamName} and {home.teamName} across each visible
            period.
          </caption>
          <thead>
            <tr className="border-b border-slate-200 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-600">
              <th scope="col" className="py-1.5 pr-2">
                Metric
              </th>
              {periods.map((period) => (
                <th key={`away-${period}`} scope="col" className="py-1.5 pr-2 text-right">
                  {away.abbr.toUpperCase()} {SUCCESS_PERIOD_LABELS[period].short}
                </th>
              ))}
              {periods.map((period) => (
                <th key={`home-${period}`} scope="col" className="py-1.5 pr-2 text-right">
                  {home.abbr.toUpperCase()} {SUCCESS_PERIOD_LABELS[period].short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-slate-100 last:border-0">
                <th
                  scope="row"
                  className="py-1.5 pr-2 text-[11px] font-semibold text-slate-700"
                >
                  {row.label}
                </th>
                {row.away.map((value, index) => (
                  <td key={`away-${periods[index]}`} className="py-1.5 pr-2 text-right">
                    <ValueCell value={value} />
                  </td>
                ))}
                {row.home.map((value, index) => (
                  <td key={`home-${periods[index]}`} className="py-1.5 pr-2 text-right">
                    <ValueCell value={value} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (<>

      {/* Dense phone sheet: one directly comparable row per metric and period. */}
      <div className="divide-y divide-slate-200">
        {rows.flatMap((row) => periods.map((period, index) => {
          const awayValue = row.away[index];
          const homeValue = row.home[index];
          const direction = getMetricDef(row.key)?.direction ?? "context-only";
          const comparison = classifyMetricComparison({
            key: row.key,
            direction,
            awayValue: awayValue?.pct ?? null,
            homeValue: homeValue?.pct ?? null,
          });
          return (
            <CompactMatchupMetricRow
              key={`${row.key}-${period}`}
              label={row.shortLabel ?? row.label}
              sublabel={SUCCESS_PERIOD_LABELS[period].short}
              away={{
                formatted: formatSuccessRate(awayValue),
                rank: awayValue?.rank ?? null,
                accessibleName: away.teamName,
              }}
              home={{
                formatted: formatSuccessRate(homeValue),
                rank: homeValue?.rank ?? null,
                accessibleName: home.teamName,
              }}
              winner={comparison}
              advantageText={describeMetricAdvantage(comparison, away.abbr, home.abbr)}
            />
          );
        }))}
      </div>
      </>)}

      <p className="border-t border-slate-100 px-3 py-2 text-[11px] leading-4 text-slate-600 sm:px-4">
        Periods switch together for both teams once each has six completed current-season games, so
        the two sides are always drawn from comparable windows.
      </p>
    </MatchupSectionCard>
  );
}
