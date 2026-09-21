import { useRef, type CSSProperties } from "react";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import {
  resolveTowerComparisonColors,
  towerColorText,
  type MatchupTowerMetricPresentation,
  type MatchupTowerSidePresentation,
} from "@/components/nfl/matchups/matchupTowerPresentation";
import { useSwipeOverflow } from "@/components/nfl/matchups/useSwipeOverflow";
import { cn } from "@/lib/utils";

const TICKS = [1, 8, 16, 24, 32] as const;
/** Charts with at most this many metric groups share the viewport width on narrow screens instead of scrolling. */
const FIT_METRIC_MAX = 6;

function RankTower({ side, metric, crestSide }: {
  side: MatchupTowerSidePresentation;
  metric: MatchupTowerMetricPresentation;
  crestSide: "away" | "home";
}) {
  const metricName = [metric.pairingLabel, metric.label, metric.contextLabel].filter(Boolean).join(" — ");
  const description = `${metricName} — ${side.accessibleIdentityLabel ?? side.team.teamName} — ${side.rank == null ? "rank unavailable" : `rank ${side.rank} of 32`} — value ${side.formatted}`;
  const style = {
    "--tower-team-color": side.color,
    "--tower-team-ink": towerColorText(side.color),
    "--tower-height": `${side.heightPercent ?? 0}%`,
  } as CSSProperties;
  return (
    <div className="matchup-unified-chart__team" style={style} role="img" aria-label={description} tabIndex={0} title={description}>
      <div className="matchup-unified-chart__bar-zone">
        {side.heightPercent == null ? (
          <div className="matchup-unified-chart__missing" data-rank-tower>—</div>
        ) : (
          <>
            <span className="matchup-rank-towers__rank" data-rank-badge>#{side.rank}</span>
            <div className="matchup-unified-chart__bar-rail" data-rank-tower>
              <div className="matchup-rank-towers__bar-fill" style={{ height: `${side.heightPercent}%` }} />
            </div>
          </>
        )}
      </div>
      <span className="matchup-unified-chart__identity">
        <NflTeamCrest team={side.team} side={crestSide} size={16} className="rank-tower-team-crest" />
        <span className="matchup-unified-chart__identity-label">{side.identityLabel}</span>
      </span>
      <span className="matchup-unified-chart__value">{side.formatted}</span>
    </div>
  );
}

/** One rank plot for any already-resolved collection of two-sided metrics. */
export default function MatchupTowerGrid({ metrics, title, subtitle, scaleLabel = "1 is best · 32 is worst", activeId, onActivate, className }: {
  metrics: readonly MatchupTowerMetricPresentation[];
  title?: string;
  subtitle?: string;
  scaleLabel?: string;
  activeId?: string | null;
  onActivate?: (id: string) => void;
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const hasOverflow = useSwipeOverflow(viewportRef, [metrics.length]);
  const first = metrics[0];
  const colors = first
    ? resolveTowerComparisonColors({
        awayTeam: first.away.team,
        homeTeam: first.home.team,
        awayPrimary: first.away.color,
        homePrimary: first.home.color,
      })
    : null;
  const displaySide = (side: MatchupTowerSidePresentation, teamSide: "away" | "home") => ({
    ...side,
    color: colors?.[teamSide] ?? side.color,
  });
  return (
    <section className={cn("matchup-rank-towers matchup-unified-chart", className)} data-chart-surface="light" data-metric-count={metrics.length} data-fit={metrics.length <= FIT_METRIC_MAX || undefined} data-away-uses-alternate={colors?.awayUsesAlternate || undefined} aria-label={title ?? "Unified rank comparison"}>
      <div className="matchup-viz-chart-heading">
        <div>{title && <h3>{title}</h3>}{subtitle && <p>{subtitle}</p>}</div>
        <span>{scaleLabel}</span>
      </div>
      {first && colors && <div className="matchup-unified-chart__legend" aria-label="Team order: away then home">
        <span style={{ "--tower-legend-color": colors.away } as CSSProperties}><span className="matchup-unified-chart__legend-swatch" aria-hidden /><NflTeamCrest team={first.away.team} side="away" size={18} />{first.away.team.abbr.toUpperCase()} <small>Away</small></span>
        <span style={{ "--tower-legend-color": colors.home } as CSSProperties}><span className="matchup-unified-chart__legend-swatch" aria-hidden /><NflTeamCrest team={first.home.team} side="home" size={18} />{first.home.team.abbr.toUpperCase()} <small>Home</small></span>
      </div>}
      <div className="matchup-unified-chart__frame">
        <div className="matchup-unified-chart__axis" aria-hidden>
          {TICKS.map((rank) => <span key={rank} style={{ top: `${((rank - 1) / 31) * 100}%` }}>{rank}</span>)}
        </div>
        <div ref={viewportRef} className="matchup-unified-chart__viewport" tabIndex={0} aria-label="Rank metrics; scroll horizontally to see more on narrow screens">
          <div className="matchup-unified-chart__track">
            <div className="matchup-unified-chart__grid" aria-hidden>{TICKS.map((rank) => <span key={rank} style={{ top: `${((rank - 1) / 31) * 100}%` }} />)}</div>
            {metrics.map((metric) => (
              <div className="matchup-unified-chart__group" key={metric.id} data-rank-tower-group data-active={metric.id === activeId || undefined}>
                <div className="matchup-unified-chart__pair">
                  <RankTower side={displaySide(metric.away, "away")} metric={metric} crestSide="away" />
                  <RankTower side={displaySide(metric.home, "home")} metric={metric} crestSide="home" />
                </div>
                <div className="matchup-unified-chart__caption">
                  {onActivate ? <button type="button" onClick={() => onActivate(metric.id)} aria-pressed={metric.id === activeId} aria-label={`Details for ${metric.label}${metric.contextLabel ? `, ${metric.contextLabel}` : ""}`}>{metric.shortLabel ?? metric.label}</button> : <span>{metric.shortLabel ?? metric.label}</span>}
                  {metric.contextLabel && <small className="matchup-rank-towers__context">{metric.contextLabel}</small>}
                  {metric.badge && <small className="matchup-unified-chart__advantage" style={{ "--tower-badge-color": metric.badge.color.toLowerCase() === first?.away.color.toLowerCase() ? colors?.away : metric.badge.color.toLowerCase() === first?.home.color.toLowerCase() ? colors?.home : metric.badge.color } as CSSProperties}>{metric.badge.label}</small>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {hasOverflow && <p className="matchup-viz-swipe-hint">Swipe to see more metrics</p>}
    </section>
  );
}
