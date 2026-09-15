import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import type { NflMatchup } from "@/lib/nfl/matchups";

type ContextMetric = Pick<MatchupDisplayMetric, "key" | "label" | "away" | "home">;

function ContextValue({ side, team, metric, identityLabel }: {
  side: "away" | "home";
  team: NflMatchup["away"];
  metric: MatchupDisplayMetric["away"];
  identityLabel: string;
}) {
  return (
    <div className="matchup-context-metric__value">
      <span className="matchup-context-metric__team">
        <NflTeamCrest team={team} side={side} size={18} />
        {identityLabel}
      </span>
      <strong>{metric.formatted}</strong>
      <small>{metric.rank == null ? "Unranked" : `League rank #${metric.rank}`}</small>
    </div>
  );
}

/** Neutral rendering for facts where league position is not good/bad. */
export default function MatchupContextMetricGrid({ metrics, matchup, headingId, awayIdentityLabel, homeIdentityLabel }: {
  metrics: readonly ContextMetric[];
  matchup: NflMatchup;
  headingId: string;
  awayIdentityLabel?: string;
  homeIdentityLabel?: string;
}) {
  if (metrics.length === 0) return null;
  return (
    <section className="matchup-context-metrics" aria-labelledby={headingId}>
      <div className="matchup-context-metrics__heading">
        <h4 id={headingId}>Context only</h4>
        <p>League position is shown without better/worse semantics.</p>
      </div>
      <div className="matchup-context-metrics__grid">
        {metrics.map((metric) => (
          <article key={metric.key} className="matchup-context-metric" data-context-only-metric>
            <div className="matchup-context-metric__label">
              <strong>{metric.label}</strong>
              <span>Context only</span>
            </div>
            <div className="matchup-context-metric__values">
              <ContextValue side="away" team={matchup.away} metric={metric.away} identityLabel={awayIdentityLabel ?? matchup.away.abbr.toUpperCase()} />
              <span aria-hidden>vs</span>
              <ContextValue side="home" team={matchup.home} metric={metric.home} identityLabel={homeIdentityLabel ?? matchup.home.abbr.toUpperCase()} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
