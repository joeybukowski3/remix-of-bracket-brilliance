import type { ComponentType } from "react";
import type { CfbComparisonEdge } from "@/lib/cfb/comparison";
import { cn } from "@/lib/utils";
import CollegeFootballStrongerBadge from "./CollegeFootballStrongerBadge";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";

/** Minimal identity needed to render the winning-side logo accent marker. */
type BarTeamIdentity = {
  name: string;
  logo?: string | null;
  abbreviation?: string;
};

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
  /**
   * Optional team identity for the bar-junction logo accent marker. When both
   * are provided, only the side matching `edge` renders its logo — a compact
   * marker at the seam, never both sides on one row.
   */
  awayTeam?: BarTeamIdentity;
  homeTeam?: BarTeamIdentity;
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
  awayTeam,
  homeTeam,
}: Props) {
  const winningTeam = edge === "away" ? awayTeam : edge === "home" ? homeTeam : null;
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
        <div className="relative flex h-3 items-center">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
            <div className="h-full transition-[width]" style={{ width: `${awayShare}%`, background: awayColor }} />
            <div className="h-full transition-[width]" style={{ width: `${homeShare}%`, background: homeColor }} />
          </div>
          {winningTeam && (
            <div
              className="pointer-events-none absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${awayShare}%` }}
            >
              <CollegeFootballTeamLogo
                name={winningTeam.name}
                logo={winningTeam.logo}
                abbreviation={winningTeam.abbreviation}
                primaryColor={edge === "away" ? awayColor : homeColor}
                size="sm"
                className="h-4 w-4 rounded-full ring-2 ring-white shadow-sm"
              />
            </div>
          )}
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
