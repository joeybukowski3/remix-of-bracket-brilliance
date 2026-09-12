import { MATCHUP_CATEGORIES, type MatchupCategoryId } from "@/lib/nfl/matchupCategoryAdvantage";
import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import MatchupComparisonCard from "@/components/nfl/matchups/MatchupComparisonCard";
import type { NflMatchup } from "@/lib/nfl/matchups";

const SPLIT_TABLE_CATEGORIES = new Set<MatchupCategoryId>(["passing", "rushing"]);

/**
 * Overview → Team Comparison Snapshot.
 *
 * A compact bento of every registry category, each laid out with the shared
 * `MatchupMetricTable` — the same table the Team Comparison tab expands at
 * `variant="detail"`. Team cells show league rank only; the Edge column and its
 * EVEN / N/A handling are unchanged.
 */
export default function MatchupComparisonSnapshot({ matchup, categoryMetrics }: {
  matchup: NflMatchup;
  categoryMetrics?: Partial<Record<MatchupCategoryId, MatchupDisplayMetric[]>>;
}) {
  return (
    <section className="matchup-snapshot" aria-labelledby="matchup-snapshot-heading">
      <h2 id="matchup-snapshot-heading">Team Comparison Snapshot</h2>
      <div className="matchup-snapshot__grid">
        {MATCHUP_CATEGORIES.map((category) => {
          const metrics = categoryMetrics?.[category.id] ?? [];
          const shouldSplit = SPLIT_TABLE_CATEGORIES.has(category.id) && metrics.length > 8;
          const midpoint = shouldSplit ? Math.ceil(metrics.length / 2) : metrics.length;
          const chunks = shouldSplit ? [metrics.slice(0, midpoint), metrics.slice(midpoint)] : [metrics];
          return (
            <MatchupComparisonCard
              key={category.id}
              title={category.label}
              titleId={`snapshot-${category.id}`}
              matchup={matchup}
              metrics={chunks}
              caption={`${category.label} metrics for ${matchup.away.teamName} and ${matchup.home.teamName}`}
              className={`matchup-snapshot__block matchup-snapshot__block--${category.id}`}
            />
          );
        })}
      </div>
    </section>
  );
}
