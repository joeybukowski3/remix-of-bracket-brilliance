import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { CfbComparisonEdge } from "@/lib/cfb/comparison";
import CollegeFootballStrongerBadge from "./CollegeFootballStrongerBadge";

type Props = {
  label: string;
  awayValue: string;
  homeValue: string;
  /** Which side has the edge for display only — not a bet recommendation. */
  edge?: CfbComparisonEdge;
  /** Compact muted national-rank badge, e.g. "#22". Omit (or null) to show no rank. */
  awayRank?: string | null;
  homeRank?: string | null;
  /** Optional metric glyph shown in the center icon tile. */
  icon?: ComponentType<{ className?: string }>;
  /** 0-100 relative-magnitude bar fill for each side, mirrored around the center icon. */
  awayBarPercent?: number;
  homeBarPercent?: number;
  /** Team primary colors — bars and the stronger-side badge always use the real team color. */
  awayColor?: string;
  homeColor?: string;
};

export default function CollegeFootballComparisonRow({
  label,
  awayValue,
  homeValue,
  edge = "none",
  awayRank = null,
  homeRank = null,
  icon: Icon,
  awayBarPercent = 0,
  homeBarPercent = 0,
  awayColor = "#64748b",
  homeColor = "#64748b",
}: Props) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr_2.5rem_1fr_3.25rem] items-center gap-1.5 border-t border-slate-100 px-2.5 py-2 text-xs sm:gap-2 sm:px-3">
      <div
        className={cn(
          "flex flex-col items-end text-right font-bold tabular-nums",
          edge === "away" ? "text-slate-900" : "text-slate-600",
        )}
      >
        <span>{awayValue}</span>
        {awayRank && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-slate-500">
            {awayRank}
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-1">
        <CollegeFootballStrongerBadge
          show={edge === "away"}
          color={awayColor}
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-white"
        />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="ml-auto h-full rounded-full transition-[width]"
            style={{ width: `${awayBarPercent}%`, background: awayColor }}
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        {Icon && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
            <Icon className="h-3 w-3" />
          </span>
        )}
        <span className="text-center text-[8.5px] font-bold uppercase leading-tight tracking-wide text-slate-500 sm:text-[9.5px]">
          {label}
        </span>
      </div>
      <div className="flex items-center justify-start gap-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${homeBarPercent}%`, background: homeColor }}
          />
        </div>
        <CollegeFootballStrongerBadge
          show={edge === "home"}
          color={homeColor}
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-white"
        />
      </div>
      <div
        className={cn(
          "flex flex-col items-start text-left font-bold tabular-nums",
          edge === "home" ? "text-slate-900" : "text-slate-600",
        )}
      >
        <span>{homeValue}</span>
        {homeRank && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-slate-500">
            {homeRank}
          </span>
        )}
      </div>
    </div>
  );
}
