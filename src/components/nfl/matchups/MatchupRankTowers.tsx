import { useRef, useState } from "react";
import MatchupVisualMetricDetail from "@/components/nfl/matchups/MatchupVisualMetricDetail";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { useSwipeOverflow } from "@/components/nfl/matchups/useSwipeOverflow";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import { NFL_RANK_TIER_UNKNOWN, rankBadgeClass } from "@/lib/nfl/rankTier";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

/** Tuned as a featured comparison graphic while preserving the internal swipe model on narrow viewports. */
const MIN_GROUP_WIDTH = 104;
const MAX_BAR_HEIGHT = 172;
const MIN_BAR_HEIGHT = 14;
const TEAM_CREST_SIZE = 18;
/** Only call out an advantage chip once the gap is a meaningful fraction of the league. */
const ADVANTAGE_CHIP_RANK_THRESHOLD = 8;

function goodnessFraction(percentile: number | null): number | null {
  if (percentile == null) return null;
  return 1 - percentile;
}

function RankLabel({ rank }: { rank: number | null }) {
  return (
    <span
      className={cn(
        "inline-flex h-[19px] min-w-[22px] items-center justify-center rounded border px-1 text-[10px] font-extrabold leading-none tabular-nums shadow-sm",
        rank == null ? NFL_RANK_TIER_UNKNOWN.badge : rankBadgeClass(rank)
      )}
      data-rank-badge
    >
      {rank ?? "N/A"}
    </span>
  );
}

/** A full-height light track behind every bar, so a short (bad-rank) bar still reads as "a short bar inside a rail" rather than as empty space. */
function Bar({ percentile, color }: { percentile: number | null; color: string }) {
  const fraction = goodnessFraction(percentile);
  if (fraction == null) {
    return (
      <div
        className="w-[18px] rounded-t-md border border-dashed border-slate-300 bg-slate-50/70 sm:w-5"
        style={{ height: MAX_BAR_HEIGHT }}
        aria-hidden
        data-rank-tower
      />
    );
  }
  const height = Math.max(MIN_BAR_HEIGHT, Math.round(fraction * MAX_BAR_HEIGHT));
  return (
    <div
      className="flex w-[18px] items-end rounded-t-md bg-slate-200/80 ring-1 ring-inset ring-slate-300/70 sm:w-5"
      style={{ height: MAX_BAR_HEIGHT }}
      aria-hidden
      data-rank-tower
    >
      <div
        className="w-full rounded-t-md shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
        style={{ height, backgroundColor: color }}
      />
    </div>
  );
}

function AdvantageChip({ metric, away, home }: { metric: MatchupVisualMetric; away: NflMatchupTeam; home: NflMatchupTeam }) {
  if (metric.rankGap == null || metric.rankGap < ADVANTAGE_CHIP_RANK_THRESHOLD) return null;
  if (metric.leader !== "away" && metric.leader !== "home") return null;
  const abbr = metric.leader === "away" ? away.abbr : home.abbr;
  return (
    <div className="whitespace-nowrap rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-[0.06em] text-slate-700 shadow-sm">
      {abbr.toUpperCase()} +{metric.rankGap}
    </div>
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
        "flex shrink-0 snap-center flex-col items-center rounded-lg px-1 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
        isActive
          ? "bg-emerald-50/80 ring-1 ring-inset ring-emerald-200"
          : "hover:bg-slate-100/70"
      )}
      style={{ width: MIN_GROUP_WIDTH }}
      data-rank-tower-group
    >
      <div className="relative flex items-end gap-2.5">
        <span aria-hidden className="absolute bottom-0 left-1/2 h-px w-[68px] -translate-x-1/2 bg-slate-300" />
        <div className="relative flex flex-col items-center gap-1">
          <NflTeamCrest
            team={away}
            side="away"
            size={TEAM_CREST_SIZE}
            className="rank-tower-team-crest"
          />
          <RankLabel rank={metric.away.rank} />
          <Bar percentile={metric.away.percentile} color={awayColor} />
        </div>
        <div className="relative flex flex-col items-center gap-1">
          <NflTeamCrest
            team={home}
            side="home"
            size={TEAM_CREST_SIZE}
            className="rank-tower-team-crest"
          />
          <RankLabel rank={metric.home.rank} />
          <Bar percentile={metric.home.percentile} color={homeColor} />
        </div>
      </div>
      <div className="mt-2 flex h-5 items-center justify-center">
        <AdvantageChip metric={metric} away={away} home={home} />
      </div>
      <div className="mt-2 line-clamp-3 h-9 w-full text-center text-[10px] font-bold uppercase leading-[1.1] tracking-[0.035em] text-slate-700">
        {metric.shortLabel}
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
      <div className="relative min-w-0">
        <div
          ref={trackRef}
          className="min-w-0 touch-pan-x snap-x snap-proximity overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex w-max min-w-full items-end justify-center gap-3 px-3 py-4 sm:gap-4 sm:px-4 sm:py-5">
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
            className="pointer-events-none absolute inset-y-3 right-0 w-10 bg-gradient-to-l from-white to-transparent"
          />
        )}
      </div>
      {hasOverflow && (
        <p className="px-3 pb-1 text-[11px] font-medium text-slate-500">Swipe to see more metrics</p>
      )}
      {activeMetric && (
        <MatchupVisualMetricDetail metric={activeMetric} away={away} home={home} className="mt-2" />
      )}
    </div>
  );
}
