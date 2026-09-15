import { useRef, useState, type CSSProperties } from "react";
import MatchupVisualMetricDetail from "@/components/nfl/matchups/MatchupVisualMetricDetail";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { useSwipeOverflow } from "@/components/nfl/matchups/useSwipeOverflow";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

/** Tuned as a featured comparison graphic while preserving the internal swipe model on narrow viewports. */
const MIN_GROUP_WIDTH = 164;
const MIN_BAR_PERCENT = 8;
const TEAM_CREST_SIZE = 18;
/** Only call out an advantage chip once the gap is a meaningful fraction of the league. */
const ADVANTAGE_CHIP_RANK_THRESHOLD = 8;

function goodnessFraction(percentile: number | null): number | null {
  if (percentile == null) return null;
  return 1 - percentile;
}

function RankLabel({ rank, color }: { rank: number | null; color: string }) {
  return (
    <span
      className="matchup-rank-towers__rank"
      style={{ "--tower-team-color": color } as CSSProperties}
      data-rank-badge
    >
      {rank == null ? "N/A" : `#${rank}`}
    </span>
  );
}

/** A full-height dark track keeps a short (bad-rank) tower legible as a measured result, not empty space. */
function Bar({ percentile, color }: { percentile: number | null; color: string }) {
  const fraction = goodnessFraction(percentile);
  if (fraction == null) {
    return (
      <div
        className="matchup-rank-towers__bar-rail is-missing"
        aria-hidden
        data-rank-tower
      />
    );
  }
  const height = Math.max(MIN_BAR_PERCENT, fraction * 100);
  return (
    <div
      className="matchup-rank-towers__bar-rail"
      aria-hidden
      data-rank-tower
    >
      <div
        className="matchup-rank-towers__bar-fill"
        style={{ height: `${height}%`, "--tower-team-color": color } as CSSProperties}
      />
    </div>
  );
}

function AdvantageChip({ metric, away, home }: { metric: MatchupVisualMetric; away: NflMatchupTeam; home: NflMatchupTeam }) {
  if (metric.rankGap == null || metric.rankGap < ADVANTAGE_CHIP_RANK_THRESHOLD) return null;
  if (metric.leader !== "away" && metric.leader !== "home") return null;
  const abbr = metric.leader === "away" ? away.abbr : home.abbr;
  const color = metric.leader === "away" ? away.color : home.color;
  return (
    <span
      className="matchup-rank-towers__advantage"
      style={{ "--tower-leader-color": color ?? "var(--matchup-viz-accent)" } as CSSProperties}
    >
      {abbr.toUpperCase()} +{metric.rankGap}
    </span>
  );
}

function TowerGroup({
  metric,
  away,
  home,
  awayColor,
  homeColor,
  isActive,
  onToggle,
}: {
  metric: MatchupVisualMetric;
  away: NflMatchupTeam;
  home: NflMatchupTeam;
  awayColor: string;
  homeColor: string;
  isActive: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isActive}
      aria-label={`${metric.label}: ${away.teamName} ${metric.away.formatted}, ${home.teamName} ${metric.home.formatted}`}
      className={cn(
        "matchup-rank-towers__card shrink-0 snap-center",
        isActive && "is-active"
      )}
      style={{ "--tower-card-min-width": `${MIN_GROUP_WIDTH}px` } as CSSProperties}
      data-rank-tower-group
    >
      <div className="matchup-rank-towers__card-header">
        <span className="matchup-rank-towers__metric-label">{metric.shortLabel}</span>
        <AdvantageChip metric={metric} away={away} home={home} />
      </div>

      <div className="matchup-rank-towers__plot">
        <span aria-hidden className="matchup-rank-towers__gridline is-top" />
        <span aria-hidden className="matchup-rank-towers__gridline is-middle" />
        <div className="matchup-rank-towers__pair">
          <div className="matchup-rank-towers__team-stack">
            <RankLabel rank={metric.away.rank} color={awayColor} />
            <Bar percentile={metric.away.percentile} color={awayColor} />
            <span className="matchup-rank-towers__team-id">
              <NflTeamCrest
                team={away}
                side="away"
                size={TEAM_CREST_SIZE}
                className="rank-tower-team-crest"
              />
              <span>{away.abbr.toUpperCase()}</span>
            </span>
          </div>
          <div className="matchup-rank-towers__team-stack">
            <RankLabel rank={metric.home.rank} color={homeColor} />
            <Bar percentile={metric.home.percentile} color={homeColor} />
            <span className="matchup-rank-towers__team-id">
              <NflTeamCrest
                team={home}
                side="home"
                size={TEAM_CREST_SIZE}
                className="rank-tower-team-crest"
              />
              <span>{home.abbr.toUpperCase()}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="matchup-rank-towers__values">
        <span>{metric.away.formatted}</span>
        <span aria-hidden>vs</span>
        <span>{metric.home.formatted}</span>
      </div>
    </button>
  );
}

/**
 * Rank Towers — the default Team Comparison chart. Two team-coloured vertical
 * bars per metric, height driven by league-rank percentile (rank 1 tallest).
 * Scrolls horizontally inside its own track only; the page never gains
 * horizontal overflow from this chart.
 */
export default function MatchupRankTowers({
  metrics,
  away,
  home,
  awayColor,
  homeColor,
}: {
  metrics: readonly MatchupVisualMetric[];
  away: NflMatchupTeam;
  home: NflMatchupTeam;
  awayColor: string;
  homeColor: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const hasOverflow = useSwipeOverflow(trackRef, [metrics.length]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeMetric = metrics.find((m) => m.id === activeId) ?? null;

  return (
    <div className="matchup-rank-towers">
      <div className="matchup-viz-chart-heading">
        <div>
          <h3>Rank Towers</h3>
          <p>Selected {metrics.length === 1 ? "metric" : "metrics"} · league rank comparison</p>
        </div>
        <span>1 is best · 32 is worst</span>
      </div>
      <div className="relative min-w-0">
        <div
          ref={trackRef}
          className="matchup-rank-towers__viewport min-w-0 touch-pan-x snap-x snap-proximity overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="matchup-rank-towers__track">
            {metrics.map((metric) => (
              <TowerGroup
                key={metric.id}
                metric={metric}
                away={away}
                home={home}
                awayColor={awayColor}
                homeColor={homeColor}
                isActive={metric.id === activeId}
                onToggle={() => setActiveId((prev) => (prev === metric.id ? null : metric.id))}
              />
            ))}
          </div>
        </div>
        {hasOverflow && (
          <div
            aria-hidden
            className="matchup-viz-swipe-fade pointer-events-none absolute bottom-2 right-0 top-2 w-10"
          />
        )}
      </div>
      {hasOverflow && (
        <p className="matchup-viz-swipe-hint">Swipe to see more metrics</p>
      )}
      {activeMetric && (
        <MatchupVisualMetricDetail metric={activeMetric} away={away} home={home} className="mt-2" />
      )}
    </div>
  );
}
