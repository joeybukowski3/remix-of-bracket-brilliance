import type { ComponentType } from "react";
import type { CfbComparisonEdge } from "@/lib/cfb/comparison";
import { cn } from "@/lib/utils";
import CollegeFootballStrongerBadge from "./CollegeFootballStrongerBadge";

type Props = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Pre-composed border/bg/text classes for the icon tile, e.g. "border-orange-200 bg-orange-50 text-orange-600". */
  iconClassName: string;
  awayValue: string;
  homeValue: string;
  /** Optional compact national-rank badge, e.g. "#22". Omit (or null) to show no rank. */
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
 * Unified shared-bar row: one full horizontal track per metric, away's share
 * filling from the left and home's from the right, meeting in the middle.
 * Used identically by Power Comparison and Season Stats so both sections
 * read as one visual system rather than two different bar languages.
 */
export default function CollegeFootballSharedBarRow({
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
    <div className="border-t border-slate-200 px-3 py-3 sm:px-4">
      <div className="mb-2 flex items-center justify-center gap-1.5">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm",
            iconClassName,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-500 sm:text-[11px]">
          {label}
        </span>
      </div>
      <div className="grid grid-cols-[3.25rem_1fr_3.25rem] items-center gap-2 sm:gap-3">
        <div
          className={cn(
            "flex flex-col items-end gap-0.5 text-right",
            edge === "away" ? "text-slate-900" : "text-slate-500",
          )}
        >
          <span className="flex items-center justify-end gap-1 text-sm font-black tabular-nums sm:text-base">
            <CollegeFootballStrongerBadge show={edge === "away"} color={awayColor} />
            {awayValue}
          </span>
          {awayRank && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-slate-500">
              {awayRank}
            </span>
          )}
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
          <div className="h-full transition-[width]" style={{ width: `${awayShare}%`, background: awayColor }} />
          <div className="h-full transition-[width]" style={{ width: `${homeShare}%`, background: homeColor }} />
        </div>
        <div
          className={cn(
            "flex flex-col items-start gap-0.5 text-left",
            edge === "home" ? "text-slate-900" : "text-slate-500",
          )}
        >
          <span className="flex items-center justify-start gap-1 text-sm font-black tabular-nums sm:text-base">
            {homeValue}
            <CollegeFootballStrongerBadge show={edge === "home"} color={homeColor} />
          </span>
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
