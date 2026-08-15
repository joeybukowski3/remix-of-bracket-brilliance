import { useState } from "react";
import MatchupSectionCard from "@/components/nfl/matchups/MatchupSectionCard";
import MatchupCollapsibleGroup from "@/components/nfl/matchups/MatchupCollapsibleGroup";
import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import type { MatchupSuccessRateSource } from "@/components/nfl/matchups/matchupDisplayMetrics";
import { getMetricDef } from "@/lib/nfl/matchupMetrics";
import type { NflMatchup } from "@/lib/nfl/matchups";
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
  const { away, home } = matchup;
  const periods = successRate.periods;
  const [openMetric, setOpenMetric] = useState<string | null>(SUCCESS_RATE_METRIC_KEYS[0] ?? null);

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

      {/* Table where the width exists. */}
      <div className="hidden px-3 py-3 sm:block sm:px-4">
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

      {/* One metric at a time below `sm`, both teams paired under each period. */}
      <div className="sm:hidden">
        {rows.map((row) => (
          <MatchupCollapsibleGroup
            key={row.key}
            id={`success-period-${row.key.replace(/\./g, "-")}`}
            triggerId={`success-period-${row.key.replace(/\./g, "-")}-trigger`}
            title={row.label}
            meta={`${periods.length} period${periods.length === 1 ? "" : "s"}`}
            open={openMetric === row.key}
            onToggle={() => setOpenMetric((current) => (current === row.key ? null : row.key))}
          >
            <div className="space-y-2">
              {periods.map((period, index) => (
                <div key={period} className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">
                    {SUCCESS_PERIOD_LABELS[period].label}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 border-b border-slate-200 pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                      {away.abbr.toUpperCase()}
                    </span>
                    <ValueCell value={row.away[index]} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                      {home.abbr.toUpperCase()}
                    </span>
                    <ValueCell value={row.home[index]} />
                  </div>
                </div>
              ))}
            </div>
          </MatchupCollapsibleGroup>
        ))}
      </div>

      <p className="border-t border-slate-100 px-3 py-2 text-[11px] leading-4 text-slate-600 sm:px-4">
        Periods switch together for both teams once each has six completed current-season games, so
        the two sides are always drawn from comparable windows.
      </p>
    </MatchupSectionCard>
  );
}
