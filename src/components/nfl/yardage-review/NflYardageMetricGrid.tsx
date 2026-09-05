/**
 * Compact row-by-row metric grid -- one bordered block, alternating row
 * tint, label left / value+rank right. Pure presentation over an already-
 * built `NflYardageMetricGridRow[]` (metricGridView.ts); every value and
 * rank here is already computed elsewhere -- nothing is recomputed or
 * invented. Reused for both the Player Stats and Opponent Stats tabs.
 */
import { cn } from "@/lib/utils";
import type { NflYardageMetricGridRow } from "@/lib/nfl/props/review/metricGridView";
import { formatRankOrdinal } from "@/components/nfl/matchups/rankOrdinal";

export default function NflYardageMetricGrid({ rows }: { rows: readonly NflYardageMetricGridRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      {rows.map((metric, index) => {
        const ordinal = formatRankOrdinal(metric.rank);
        return (
          <div
            key={metric.key}
            className={cn(
              "flex items-baseline justify-between gap-2 px-2 py-1.5 text-[11px]",
              index % 2 === 1 && "bg-slate-50",
              index > 0 && "border-t border-slate-100",
            )}
          >
            <span className="font-medium text-slate-600">{metric.label}</span>
            <span className="tabular-nums text-slate-900">
              <span className="font-semibold">{metric.value}</span>
              {ordinal && (
                <span className="ml-1 text-[10px] font-normal text-slate-500" title={metric.rankTitle}>
                  ({ordinal})
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
