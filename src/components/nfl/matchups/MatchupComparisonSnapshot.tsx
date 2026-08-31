import { MATCHUP_CATEGORIES, type MatchupCategoryId } from "@/lib/nfl/matchupCategoryAdvantage";
import type { MatchupDisplayMetric, MatchupDisplaySide } from "@/components/nfl/matchups/matchupDisplayMetrics";
import { formatRankOrdinal } from "@/components/nfl/matchups/rankOrdinal";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { formatMetricDifference } from "@/components/nfl/matchups/matchupVisualMath";
import type { NflMatchup } from "@/lib/nfl/matchups";

const SPLIT_TABLE_CATEGORIES = new Set<MatchupCategoryId>(["passing", "rushing"]);

function valueWithRank(value: MatchupDisplaySide) {
  const rank = formatRankOrdinal(value.rank);
  return rank ? `${value.formatted} · ${rank}` : value.formatted;
}

function ValueCell({ metric, side }: { metric: MatchupDisplayMetric; side: "away" | "home" }) {
  const winning = metric.comparison === side;
  const losing = (metric.comparison === "away" || metric.comparison === "home") && !winning;
  return (
    <span className={`matchup-snapshot__value${winning ? " is-winner" : ""}${losing ? " is-weaker" : ""}`}>
      {valueWithRank(metric[side])}
    </span>
  );
}

function EdgeCell({ metric, matchup }: { metric: MatchupDisplayMetric; matchup: NflMatchup }) {
  const side = metric.comparison === "away" ? "away" : metric.comparison === "home" ? "home" : null;
  const team = side ? matchup[side] : null;
  const difference = formatMetricDifference(metric);
  if (!team || !side) return <span className="matchup-snapshot__edge is-neutral">{metric.comparison === "tie" ? "EVEN" : "N/A"}</span>;
  return (
    <span className={`matchup-snapshot__edge matchup-snapshot__edge--${side}`}>
      <NflTeamCrest team={team} side={side} size={16} />
      <b>{team.abbr.toUpperCase()}</b>
      {difference && <small>{difference}</small>}
    </span>
  );
}

function MetricTable({
  metrics,
  matchup,
  caption,
}: {
  metrics: MatchupDisplayMetric[];
  matchup: NflMatchup;
  caption: string;
}) {
  return (
    <table>
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col className="matchup-snapshot__metric-column" />
        <col className="matchup-snapshot__value-column" />
        <col className="matchup-snapshot__value-column" />
        <col className="matchup-snapshot__edge-column" />
      </colgroup>
      <thead><tr>
        <th scope="col">Metric</th>
        <th scope="col">{matchup.away.abbr.toUpperCase()}</th>
        <th scope="col">{matchup.home.abbr.toUpperCase()}</th>
        <th scope="col">Edge</th>
      </tr></thead>
      <tbody>
        {metrics.map((metric) => (
          <tr key={metric.key}>
            <th scope="row" title={metric.help}>{metric.shortLabel ?? metric.label}</th>
            <td><ValueCell metric={metric} side="away" /></td>
            <td><ValueCell metric={metric} side="home" /></td>
            <td><EdgeCell metric={metric} matchup={matchup} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

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
            <section
              key={category.id}
              className={`matchup-snapshot__block matchup-snapshot__block--${category.id}`}
              aria-labelledby={`snapshot-${category.id}`}
            >
              <h3 id={`snapshot-${category.id}`}>{category.label}</h3>
              <div className={`matchup-snapshot__tables${chunks.length > 1 ? " is-split" : ""}`}>
                {chunks.map((chunk, index) => (
                  <MetricTable
                    key={`${category.id}-${index}`}
                    metrics={chunk}
                    matchup={matchup}
                    caption={`${category.label} metrics for ${matchup.away.teamName} and ${matchup.home.teamName}, part ${index + 1}`}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
