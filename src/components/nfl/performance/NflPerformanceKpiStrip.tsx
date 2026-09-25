import { cn } from "@/lib/utils";

export type NflKpiItem = {
  key: string;
  label: string;
  value: string;
  hint?: string;
};

/**
 * Compact KPI row shared by Overview cards, Totals and Props tabs. Values
 * arrive pre-formatted (see lib/nfl/performance/format.ts) so this component
 * never decides what "no graded results" looks like -- it just lays out
 * whatever string it is given.
 */
export default function NflPerformanceKpiStrip({
  items,
  className,
  compact = false,
}: {
  items: readonly NflKpiItem[];
  className?: string;
  /** Secondary "model quality" styling: smaller values, no shadow. */
  compact?: boolean;
}) {
  return (
    <dl className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {items.map((item) => (
        <div key={item.key} className={cn("rounded-lg border border-slate-200 bg-white", compact ? "px-2.5 py-1" : "px-3 py-2 shadow-sm")} title={item.hint}>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</dt>
          <dd className={cn("mt-0.5 font-bold tabular-nums text-slate-900", compact ? "text-sm" : "text-lg")}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
