import { useRef, useState } from "react";
import MatchupVisualMetricDetail from "@/components/nfl/matchups/MatchupVisualMetricDetail";
import { useSwipeOverflow } from "@/components/nfl/matchups/useSwipeOverflow";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import { NFL_RANK_TIER_UNKNOWN, rankBadgeClass } from "@/lib/nfl/rankTier";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

/** Initial target — tune per the 390/430px responsive pass if bars or labels read cramped. */
const MIN_GROUP_WIDTH = 76;
const MAX_BAR_HEIGHT = 108;
const MIN_BAR_HEIGHT = 10;
/** Fixed height for a missing rank — never scaled by goodness, so "no data" cannot read as "worst". */
const PLACEHOLDER_BAR_HEIGHT = 22;
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
        "inline-flex h-4 min-w-[18px] items-center justify-center rounded border px-0.5 text-[8px] font-bold tabular-nums",
        rank == null ? NFL_RANK_TIER_UNKNOWN.badge : rankBadgeClass(rank)
      )}
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
      <div className="flex w-3 items-end sm:w-3.5" style={{ height: MAX_BAR_HEIGHT }} aria-hidden>
        <div
          className="w-full rounded-t border border-dashed border-slate-300 bg-slate-50"
          style={{ height: PLACEHOLDER_BAR_HEIGHT }}
        />
      </div>
    );
  }
  const height = Math.max(MIN_BAR_HEIGHT, Math.round(fraction * MAX_BAR_HEIGHT));
  return (
    <div
      className="flex w-3 items-end rounded-t bg-slate-200/70 ring-1 ring-inset ring-slate-200 sm:w-3.5"
      style={{ height: MAX_BAR_HEIGHT }}
      aria-hidden
    >
      <div className="w-full rounded-t" style={{ height, backgroundColor: color }} />
    </div>
  );
}

function AdvantageChip({ metric, away, home }: { metric: MatchupVisualMetric; away: NflMatchupTeam; home: NflMatchupTeam }) {
  if (metric.rankGap == null || metric.rankGap < ADVANTAGE_CHIP_RANK_THRESHOLD) return null;
  if (metric.leader !== "away" && metric.leader !== "home") return null;
  const abbr = metric.leader === "away" ? away.abbr : home.abbr;
  return (
    <div className="mt-1 whitespace-nowrap rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-700 shadow-sm">
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
        "flex shrink-0 flex-col items-center rounded-md px-1 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
        isActive ? "bg-emerald-50" : "hover:bg-slate-50"
      )}
      style={{ width: MIN_GROUP_WIDTH }}
    >
      <div className="flex items-end gap-1">
        <div className="flex flex-col items-center gap-0.5">
          <RankLabel rank={metric.away.rank} />
          <Bar percentile={metric.away.percentile} color={awayColor} />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <RankLabel rank={metric.home.rank} />
          <Bar percentile={metric.home.percentile} color={homeColor} />
        </div>
      </div>
      <AdvantageChip metric={metric} away={away} home={home} />
      <div className="mt-1 line-clamp-2 h-6 w-full text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.02em] text-slate-600">
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
        <div ref={trackRef} className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-end gap-1.5 px-1 py-1">
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
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent"
          />
        )}
      </div>
      {hasOverflow && (
        <p className="mt-1 px-1 text-[10px] font-medium text-slate-500">Swipe to see more metrics</p>
      )}
      {activeMetric && (
        <MatchupVisualMetricDetail metric={activeMetric} away={away} home={home} className="mt-2" />
      )}
    </div>
  );
}
