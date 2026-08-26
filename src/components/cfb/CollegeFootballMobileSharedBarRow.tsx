import type { ComponentType } from "react";
import type { CfbComparisonEdge } from "@/lib/cfb/comparison";
import { cn } from "@/lib/utils";
import CollegeFootballSplitBar from "./CollegeFootballSplitBar";
import CollegeFootballStrongerBadge from "./CollegeFootballStrongerBadge";

type Props = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Pre-composed border/bg/text classes for the icon tile, e.g. "border-orange-200 bg-orange-50 text-orange-600". */
  iconClassName: string;
  awayValue: string;
  homeValue: string;
  awayRank?: string | null;
  homeRank?: string | null;
  /** 0-100 shares that must sum to 100 — from getCfbSharedBarSplit, never from independently clamped widths. */
  awayShare: number;
  homeShare: number;
  awayColor: string;
  homeColor: string;
  edge: CfbComparisonEdge;
};

/**
 * Mobile presentation of the shared comparison row: centered icon + metric
 * label, then a left-value / split-bar / right-value row, with national
 * ranks stacked directly under each value. Same edge/share inputs as the
 * desktop CollegeFootballSharedBarRow — only the visual layout differs.
 */
export default function CollegeFootballMobileSharedBarRow({
  label,
  icon: Icon,
  iconClassName,
  awayValue,
  homeValue,
  awayRank = null,
  homeRank = null,
  awayShare,
  homeShare,
  awayColor,
  homeColor,
  edge,
}: Props) {
  return (
    <div
      data-testid="cfb-mobile-shared-bar-row"
      className="flex flex-col items-center gap-2 border-t border-slate-200 px-3 py-[18px]"
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border shadow-sm",
            iconClassName,
          )}
        >
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-500">{label}</span>
      </div>

      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div
          className={cn(
            "flex items-center justify-end gap-1 text-right text-xl font-black tabular-nums",
            edge === "away" ? "text-slate-900" : "text-slate-400",
          )}
        >
          <CollegeFootballStrongerBadge show={edge === "away"} color={awayColor} />
          {awayValue}
        </div>
        <CollegeFootballSplitBar
          awayShare={awayShare}
          homeShare={homeShare}
          awayColor={awayColor}
          homeColor={homeColor}
          className="w-[160px]"
        />
        <div
          className={cn(
            "flex items-center justify-start gap-1 text-left text-xl font-black tabular-nums",
            edge === "home" ? "text-slate-900" : "text-slate-400",
          )}
        >
          {homeValue}
          <CollegeFootballStrongerBadge show={edge === "home"} color={homeColor} />
        </div>
      </div>

      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="text-right">
          {awayRank && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-slate-500">
              {awayRank}
            </span>
          )}
        </div>
        <span className="w-[160px]" aria-hidden="true" />
        <div className="text-left">
          {homeRank && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-slate-500">
              {homeRank}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
