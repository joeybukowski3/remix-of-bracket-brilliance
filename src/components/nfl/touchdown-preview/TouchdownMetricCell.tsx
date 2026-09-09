import { getPercentileTier } from "@/lib/shared/jkbHeat";
import { cn } from "@/lib/utils";

export default function TouchdownMetricCell({ value, percentile, format = (v) => v.toFixed(2), prominent = false, rank, poolSize }: {
  value: number | null; percentile: number | null; format?: (value: number) => string; prominent?: boolean; rank?: number | null; poolSize?: number;
}) {
  if (value == null || !Number.isFinite(value)) return <span className="text-slate-400" title="Unavailable from current source data">N/A</span>;
  const tier = getPercentileTier(percentile, "higherBetter");
  const style = tier ? { backgroundColor: tier.style.backgroundColor, color: tier.style.color, boxShadow: tier.style.border.replace("1px solid ", "inset 0 0 0 1px ") } : undefined;
  return <span className={cn("inline-flex min-w-[3.25rem] items-center justify-center rounded px-1.5 py-0.5 tabular-nums", prominent ? "text-sm font-extrabold" : "font-semibold")} style={style}>
    {format(value)}{rank && poolSize ? <span className="ml-1 text-[9px] font-medium opacity-75">#{rank}</span> : null}
  </span>;
}
