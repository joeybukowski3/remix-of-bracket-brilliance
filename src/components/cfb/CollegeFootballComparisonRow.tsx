import { cn } from "@/lib/utils";

type Props = {
  label: string;
  awayValue: string;
  homeValue: string;
  /** Which side has the edge for display only — not a bet recommendation. */
  edge?: "away" | "home" | "even" | "none";
};

export default function CollegeFootballComparisonRow({
  label,
  awayValue,
  homeValue,
  edge = "none",
}: Props) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs">
      <div
        className={cn(
          "text-right font-semibold tabular-nums",
          edge === "away" ? "text-emerald-800" : "text-slate-800",
        )}
      >
        {awayValue}
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
        )}
      >
        {edge === "home" && (
          <span className="mr-1 text-[10px] font-medium text-emerald-600">●</span>
        )}
        {homeValue}
      </div>
    </div>
  );
}

/** Higher is better edge helper. */
export function higherIsBetterEdge(
  away: number | null | undefined,
  home: number | null | undefined,
): "away" | "home" | "even" | "none" {
  if (away == null || home == null || Number.isNaN(away) || Number.isNaN(home)) {
    return "none";
  }
  if (away === home) return "even";
  return away > home ? "away" : "home";
}

/** Lower is better (e.g. rank, points allowed). */
export function lowerIsBetterEdge(
  away: number | null | undefined,
  home: number | null | undefined,
): "away" | "home" | "even" | "none" {
  if (away == null || home == null || Number.isNaN(away) || Number.isNaN(home)) {
    return "none";
  }
  if (away === home) return "even";
  return away < home ? "away" : "home";
}
