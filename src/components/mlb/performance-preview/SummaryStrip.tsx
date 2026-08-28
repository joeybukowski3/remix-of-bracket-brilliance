import { cn } from "@/lib/utils";
import type { SummaryMetric } from "@/lib/mlb/performancePreviewTrackers/summaryMetric";

const TONE_CLASSES: Record<NonNullable<SummaryMetric["tone"]>, string> = {
  positive: "text-emerald-400",
  negative: "text-rose-400",
  neutral: "text-slate-100",
};

/**
 * One compact horizontal strip -- deliberately not a StatTile grid of cards.
 * Every metric here is computed by the caller from the SAME filtered record
 * array the result table renders, never from an all-time summary JSON.
 */
export default function SummaryStrip({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <div className="flex flex-wrap items-stretch divide-x divide-slate-700 overflow-hidden rounded-lg bg-slate-800">
      {metrics.map((metric) => (
        <div key={metric.label} className="flex min-w-[84px] flex-1 flex-col items-center justify-center px-2 py-1.5">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{metric.label}</div>
          <div className={cn("text-sm font-black tabular-nums", TONE_CLASSES[metric.tone ?? "neutral"])}>{metric.value}</div>
        </div>
      ))}
    </div>
  );
}
