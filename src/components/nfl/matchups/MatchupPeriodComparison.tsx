import MatchupSectionCard from "@/components/nfl/matchups/MatchupSectionCard";
import NflHeadToHeadMetricRow from "@/components/nfl/matchups/NflHeadToHeadMetricRow";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
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
 * Away/home identity for the comparison rows below — the same quiet one-line
 * header the Statistical Comparison accordions use, so both surfaces read with
 * one comparison language.
 */
function ComparisonSideHeader({ matchup }: { matchup: NflMatchup }) {
  return (
    <div className="mx-auto grid w-full grid-cols-[3.75rem_minmax(0,1fr)_3.75rem] items-center gap-x-2 border-b border-slate-200 px-3 pb-1.5 pt-3 sm:max-w-[760px] sm:grid-cols-[5rem_minmax(0,1fr)_5rem] sm:gap-x-4 sm:px-4">
      <span className="flex items-center justify-end gap-1">
        <NflTeamCrest team={matchup.away} side="away" size={16} />
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
          {matchup.away.abbr.toUpperCase()}
        </span>
      </span>
      <span aria-hidden className="text-center text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">
        Advantage
      </span>
      <span className="flex items-center justify-start gap-1">
        <NflTeamCrest team={matchup.home} side="home" size={16} />
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
          {matchup.home.abbr.toUpperCase()}
        </span>
      </span>
    </div>
  );
}

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
 * Every paired stat renders through the shared `NflHeadToHeadMetricRow`, one row
 * per metric and visible period, with the period carried in the row's context
 * sub-label. Nothing here scrolls sideways.
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
  const rows = SUCCESS_RATE_METRIC_KEYS.map((key) => {
    const def = getMetricDef(key);
    return {
      key,
      label: def?.label ?? key,
      shortLabel: def?.shortLabel,
      help: def?.help,
      direction: def?.direction ?? "context-only",
      away: periods.map((period) => successRate.resolve(away.abbr, key, period)),
      home: periods.map((period) => successRate.resolve(home.abbr, key, period)),
    };
  });

  return (
    <MatchupSectionCard
      eyebrow="Over time"
      title="Success Rate by Period"
      titleId="success-periods-heading"
      subtitle={note}
      bodyClassName="px-0 py-0 sm:px-0"
    >
      <ComparisonSideHeader matchup={matchup} />

      <div>
        {rows.flatMap((row) =>
          periods.map((period, index) => {
            const awayValue = row.away[index];
            const homeValue = row.home[index];
            const higherIsBetter =
              row.direction === "higher-is-better"
                ? true
                : row.direction === "lower-is-better"
                  ? false
                  : null;
            const comparison = classifyMetricComparison({
              key: row.key,
              direction: row.direction,
              awayValue: awayValue?.pct ?? null,
              homeValue: homeValue?.pct ?? null,
            });
            return (
              <NflHeadToHeadMetricRow
                key={`${row.key}-${period}`}
                label={row.label}
                shortLabel={row.shortLabel}
                contextLabel={SUCCESS_PERIOD_LABELS[period].short}
                help={row.help}
                leftValue={formatSuccessRate(awayValue)}
                rightValue={formatSuccessRate(homeValue)}
                leftRank={awayValue?.rank ?? null}
                rightRank={homeValue?.rank ?? null}
                leftRawValue={awayValue?.pct ?? null}
                rightRawValue={homeValue?.pct ?? null}
                higherIsBetter={higherIsBetter}
                comparison={comparison}
                leftTeamName={away.teamName}
                rightTeamName={home.teamName}
                leftTeamAbbr={away.abbr}
                rightTeamAbbr={home.abbr}
              />
            );
          })
        )}
      </div>

      <p className="border-t border-slate-100 px-3 py-2 text-[11px] leading-4 text-slate-600 sm:px-4">
        Periods switch together for both teams once each has six completed current-season games, so
        the two sides are always drawn from comparable windows.
      </p>
    </MatchupSectionCard>
  );
}
