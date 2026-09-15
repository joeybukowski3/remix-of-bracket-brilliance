import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";
import { cn } from "@/lib/utils";

/**
 * Tap/click detail for one metric — shared by Rank Towers and Signature
 * Profile. Rendered in normal document flow beneath the chart rather than as
 * a floating tooltip, so it can never escape the viewport on mobile.
 */
export default function MatchupVisualMetricDetail({
  metric,
  away,
  home,
  className,
}: {
  metric: MatchupVisualMetric;
  away: NflMatchupTeam;
  home: NflMatchupTeam;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px]",
        className
      )}
    >
      <div className="mb-1.5 font-bold text-slate-900">{metric.label}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {away.teamName}
          </div>
          <div className="tabular-nums text-slate-900">{metric.away.formatted}</div>
          <div className="text-[11px] text-slate-600">
            {metric.away.rank != null ? `Rank ${metric.away.rank} of 32` : "Rank N/A"}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {home.teamName}
          </div>
          <div className="tabular-nums text-slate-900">{metric.home.formatted}</div>
          <div className="text-[11px] text-slate-600">
            {metric.home.rank != null ? `Rank ${metric.home.rank} of 32` : "Rank N/A"}
          </div>
        </div>
      </div>
      <div className="mt-1.5 text-[11px] text-slate-600">
        {metric.rankGap != null
          ? `Rank differential: ${metric.rankGap} ${metric.rankGap === 1 ? "spot" : "spots"}`
          : "Rank differential: N/A — at least one team is unranked for this metric"}
      </div>
    </div>
  );
}
