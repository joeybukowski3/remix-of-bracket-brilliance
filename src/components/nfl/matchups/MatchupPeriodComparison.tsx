import MatchupSectionCard from "@/components/nfl/matchups/MatchupSectionCard";
import MatchupComparisonTeamHeader from "@/components/nfl/matchups/MatchupComparisonTeamHeader";
import MatchupMetricTable, {
  type MatchupMetricTableRow,
} from "@/components/nfl/matchups/MatchupMetricTable";
import type { MatchupSuccessRateSource } from "@/components/nfl/matchups/matchupDisplayMetrics";
import { classifyMetricComparison } from "@/lib/nfl/matchupCategoryAdvantage";
import { getMetricDef } from "@/lib/nfl/matchupMetrics";
import type { NflMatchup } from "@/lib/nfl/matchups";
import {
  SUCCESS_PERIOD_LABELS,
  SUCCESS_RATE_METRIC_KEYS,
  formatSuccessRate,
} from "@/lib/nfl/successRateData";

/**
 * Success rate by period.
 *
 * The analyzer's only genuine multi-period comparison, which is why it lives
 * inside Team Comparison rather than behind a Trends tab: no home/away splits
 * and no week-indexed series exist in any artifact.
 *
 * Which periods appear is decided once per matchup by `resolveSuccessPeriods()`
 * and both teams always move together — a comparison where one side showed Last
 * 5 and the other Last 8 would not be a comparison.
 *
 * Presentation is the shared `MatchupMetricTable` — the same bordered table the
 * Statistical Comparison and Overview snapshot use — one titled group per
 * metric, one row per visible period. RBSDM publishes a rank per split, so team
 * cells show the league rank when it exists and fall back to the raw percentage
 * when a split is unranked (never a fabricated position). The Edge keeps the
 * existing raw percentage-point gap. Nothing here scrolls sideways.
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

  const groups = SUCCESS_RATE_METRIC_KEYS.map((key) => {
    const def = getMetricDef(key);
    const label = def?.label ?? key;
    const direction = def?.direction ?? "context-only";

    const rows: MatchupMetricTableRow[] = periods.map((period) => {
      const awayValue = successRate.resolve(away.abbr, key, period);
      const homeValue = successRate.resolve(home.abbr, key, period);
      return {
        key: `${key}-${period}`,
        label: SUCCESS_PERIOD_LABELS[period].label,
        shortLabel: SUCCESS_PERIOD_LABELS[period].short,
        help: def?.help,
        direction,
        away: {
          value: awayValue?.pct ?? null,
          rank: awayValue?.rank ?? null,
          formatted: formatSuccessRate(awayValue),
        },
        home: {
          value: homeValue?.pct ?? null,
          rank: homeValue?.rank ?? null,
          formatted: formatSuccessRate(homeValue),
        },
        comparison: classifyMetricComparison({
          key,
          direction,
          awayValue: awayValue?.pct ?? null,
          homeValue: homeValue?.pct ?? null,
        }),
      };
    });

    return { key, label, help: def?.help, rows };
  });

  return (
    <MatchupSectionCard
      eyebrow="Over time"
      title="Success Rate by Period"
      titleId="success-periods-heading"
      subtitle={note}
      bodyClassName="px-0 py-0 sm:px-0"
    >
      <div className="space-y-2 px-3 py-3 sm:px-4">
        <MatchupComparisonTeamHeader matchup={matchup} />

        {groups.map((group) => (
          <div key={group.key} className="matchup-metric-table-group">
            <div className="matchup-metric-table-group__head">
              <span className="matchup-metric-table-group__title" title={group.help}>
                {group.label}
              </span>
            </div>
            <MatchupMetricTable
              variant="detail"
              metrics={group.rows}
              matchup={matchup}
              caption={`${group.label} by period for ${away.teamName} and ${home.teamName}`}
            />
          </div>
        ))}
      </div>

      <p className="border-t border-slate-100 px-3 py-2 text-[11px] leading-4 text-slate-600 sm:px-4">
        Periods switch together for both teams once each has six completed current-season games, so
        the two sides are always drawn from comparable windows.
      </p>
    </MatchupSectionCard>
  );
}
