import { cn } from "@/lib/utils";
import type { CfbComparisonEdge } from "@/lib/cfb/comparison";

type Props = {
  label: string;
  awayValue: string;
  homeValue: string;
  awayValueClassName?: string;
  homeValueClassName?: string;
  /** Which side has the edge for display only — not a bet recommendation. */
  edge?: CfbComparisonEdge;
  /** Compact muted national-rank badge, e.g. "#22". Omit (or null) to show no rank. */
  awayRank?: string | null;
  homeRank?: string | null;
};

export default function CollegeFootballComparisonRow({
  label,
  awayValue,
  homeValue,
  awayValueClassName,
  homeValueClassName,
  edge = "none",
  awayRank = null,
  homeRank = null,
}: Props) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs">
      <div
        className={cn(
          "text-right font-semibold tabular-nums",
          edge === "away" ? "text-emerald-800" : "text-slate-800",
          awayValueClassName && "justify-self-end rounded px-1.5 py-0.5",
          awayValueClassName,
        )}
      >
        {awayValue}
        {awayRank && (
          <span className="ml-1 text-[10px] font-normal tabular-nums text-slate-400">{awayRank}</span>
        )}
        {edge === "away" && (
          <span className="ml-1 text-[10px] font-medium text-emerald-600">●</span>
        )}
      </div>
      <div className="min-w-[7rem] text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={cn(
          "text-left font-semibold tabular-nums",
          edge === "home" ? "text-emerald-800" : "text-slate-800",
          homeValueClassName && "justify-self-start rounded px-1.5 py-0.5",
          homeValueClassName,
        )}
      >
        {edge === "home" && (
          <span className="mr-1 text-[10px] font-medium text-emerald-600">●</span>
        )}
        {homeValue}
        {homeRank && (
          <span className="ml-1 text-[10px] font-normal tabular-nums text-slate-400">{homeRank}</span>
        )}
      </div>
    </div>
  );
}
