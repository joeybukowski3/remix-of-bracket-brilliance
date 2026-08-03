import MatchupComparisonRow from "@/components/nfl/matchups/MatchupComparisonRow";
import {
  toSideValue,
  type NflMatchupMetricDef,
  type NflMatchupMetricResolver,
} from "@/lib/nfl/matchupMetrics";
import type { NflMatchup } from "@/lib/nfl/matchups";

/** Sticky-free column header naming each side of the comparison. */
export function ComparisonHeader({ matchup }: { matchup: NflMatchup }) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_4.25rem] items-end gap-1.5 border-b border-slate-200 pb-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem] sm:gap-2">
      <div className="truncate text-right text-[10px] font-black uppercase tracking-wide text-slate-500">
        <span className="sm:hidden">{matchup.away.abbr.toUpperCase()}</span>
        <span className="hidden sm:inline">{matchup.away.teamName}</span>
      </div>
      <div className="text-center text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
        Metric
      </div>
      <div className="truncate text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
        <span className="sm:hidden">{matchup.home.abbr.toUpperCase()}</span>
        <span className="hidden sm:inline">{matchup.home.teamName}</span>
      </div>
    </div>
  );
}

/**
 * Renders one metric group as a stack of comparison rows.
 *
 * Values come from the injected resolver; a `null` result renders "N/A". No
 * component in this tree can synthesise a value, which is what keeps the
 * Phase 1 placeholder sections honest.
 */
export default function MatchupComparisonGroup({
  matchup,
  metrics,
  resolver,
  showHeader = true,
}: {
  matchup: NflMatchup;
  metrics: readonly NflMatchupMetricDef[];
  resolver: NflMatchupMetricResolver;
  showHeader?: boolean;
}) {
  return (
    <div>
      {showHeader && <ComparisonHeader matchup={matchup} />}
      <div>
        {metrics.map((metric) => (
          <MatchupComparisonRow
            key={metric.key}
            metricLabel={metric.label}
            shortLabel={metric.shortLabel}
            help={metric.help}
            direction={metric.direction}
            away={toSideValue(resolver(matchup.away.slug, metric.key))}
            home={toSideValue(resolver(matchup.home.slug, metric.key))}
            awayTeamName={matchup.away.teamName}
            homeTeamName={matchup.home.teamName}
          />
        ))}
      </div>
    </div>
  );
}
