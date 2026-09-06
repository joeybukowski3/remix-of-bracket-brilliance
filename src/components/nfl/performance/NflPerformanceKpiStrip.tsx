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
export default function NflPerformanceKpiStrip({ items, className }: { items: readonly NflKpiItem[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {items.map((item) => (
        <div key={item.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm" title={item.hint}>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
