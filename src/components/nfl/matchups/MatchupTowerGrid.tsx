import { useRef } from "react";
import MatchupTowerMetricCard, { type MatchupTowerMetricPresentation } from "@/components/nfl/matchups/MatchupTowerMetricCard";
import { useSwipeOverflow } from "@/components/nfl/matchups/useSwipeOverflow";
import { cn } from "@/lib/utils";

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
  return (
    <div className={cn("matchup-rank-towers", className)}>
      {(title || subtitle || scaleLabel) && (
        <div className="matchup-viz-chart-heading">
          <div>{title && <h3>{title}</h3>}{subtitle && <p>{subtitle}</p>}</div>
          {scaleLabel && <span>{scaleLabel}</span>}
        </div>
      )}
      <div className="relative min-w-0">
        <div ref={viewportRef} className="matchup-rank-towers__viewport min-w-0 touch-pan-x snap-x snap-proximity overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="matchup-rank-towers__track">
            {metrics.map((metric) => <MatchupTowerMetricCard key={metric.id} metric={metric} active={metric.id === activeId} onActivate={onActivate ? () => onActivate(metric.id) : undefined} />)}
          </div>
        </div>
        {hasOverflow && <div aria-hidden className="matchup-viz-swipe-fade pointer-events-none absolute bottom-2 right-0 top-2 w-10" />}
      </div>
      {hasOverflow && <p className="matchup-viz-swipe-hint">Swipe to see more metrics</p>}
    </div>
  );
}
