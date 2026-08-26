import type { ComponentType } from "react";
import { BarChart3, Shield, Swords, Users, Zap } from "lucide-react";
import type { CfbTeam } from "@/data/cfb/types";
import { formatNullableNumber, formatRank } from "@/lib/cfb/format";
import { higherIsBetterEdge, lowerIsBetterEdge, type CfbComparisonEdge } from "@/lib/cfb/comparison";
import {
  getCfbDefenseBarWidthPercent,
  getCfbOffenseBarWidthPercent,
  getCfbPowerBarWidthPercent,
} from "@/lib/cfb/ratingPresentation";
import { cn } from "@/lib/utils";
import CollegeFootballStrongerBadge from "./CollegeFootballStrongerBadge";

type Props = {
  away: Pick<CfbTeam, "shortName" | "abbreviation" | "primaryColor" | "ratings">;
  home: Pick<CfbTeam, "shortName" | "abbreviation" | "primaryColor" | "ratings">;
};

function MetricIcon({ icon: Icon }: { icon: ComponentType<{ className?: string }> }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm">
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function BarRow({
  label,
  icon,
  awayValue,
  homeValue,
  awayPercent,
  homePercent,
  awayColor,
  homeColor,
  edge,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  awayValue: string;
  homeValue: string;
  awayPercent: number;
  homePercent: number;
  awayColor: string;
  homeColor: string;
  edge: CfbComparisonEdge;
}) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr_2.75rem_1fr_3.25rem] items-center gap-2 border-t border-slate-100 px-3 py-3 sm:gap-3 sm:px-4">
      <div
        className={cn(
          "text-right text-sm font-black tabular-nums sm:text-base",
          edge === "away" ? "text-slate-900" : "text-slate-500",
        )}
      >
        {awayValue}
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <CollegeFootballStrongerBadge show={edge === "away"} color={awayColor} />
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="ml-auto h-full rounded-full transition-[width]"
            style={{ width: `${awayPercent}%`, background: awayColor }}
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <MetricIcon icon={icon} />
        <span className="text-center text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-500 sm:text-[10px]">
          {label}
        </span>
      </div>
      <div className="flex items-center justify-start gap-1.5">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${homePercent}%`, background: homeColor }}
          />
        </div>
        <CollegeFootballStrongerBadge show={edge === "home"} color={homeColor} />
      </div>
      <div
        className={cn(
          "text-left text-sm font-black tabular-nums sm:text-base",
          edge === "home" ? "text-slate-900" : "text-slate-500",
        )}
      >
        {homeValue}
      </div>
    </div>
  );
}

function RankRow({
  label,
  icon,
  awayValue,
  homeValue,
  awayColor,
  homeColor,
  edge,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  awayValue: string;
  homeValue: string;
  awayColor: string;
  homeColor: string;
  edge: CfbComparisonEdge;
}) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr_2.75rem_1fr_3.25rem] items-center gap-2 border-t border-slate-100 px-3 py-2.5 sm:gap-3 sm:px-4">
      <div
        className={cn(
          "text-right text-sm font-bold tabular-nums",
          edge === "away" ? "text-slate-900" : "text-slate-500",
        )}
      >
        {awayValue}
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <CollegeFootballStrongerBadge show={edge === "away"} color={awayColor} />
      </div>
      <div className="flex flex-col items-center gap-1">
        <MetricIcon icon={icon} />
        <span className="text-center text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-500 sm:text-[10px]">
          {label}
        </span>
      </div>
      <div className="flex items-center justify-start gap-1.5">
        <CollegeFootballStrongerBadge show={edge === "home"} color={homeColor} />
      </div>
      <div
        className={cn(
          "text-left text-sm font-bold tabular-nums",
          edge === "home" ? "text-slate-900" : "text-slate-500",
        )}
      >
        {homeValue}
      </div>
    </div>
  );
}

export default function CollegeFootballPowerComparison({ away, home }: Props) {
  const awayRatings = away.ratings;
  const homeRatings = home.ratings;

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: away.primaryColor }}>
          {away.shortName}
        </span>
        <div className="flex items-center gap-2 text-[9px] font-semibold text-slate-500 sm:gap-3 sm:text-[10px]">
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: away.primaryColor }} />
            {away.abbreviation}
            <span className="hidden sm:inline">&nbsp;Advantage</span>
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: home.primaryColor }} />
            {home.abbreviation}
            <span className="hidden sm:inline">&nbsp;Advantage</span>
          </span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: home.primaryColor }}>
          {home.shortName}
        </span>
      </div>

      <BarRow
        label="Power"
        icon={Zap}
        awayValue={formatNullableNumber(awayRatings.jkbPowerRating)}
        homeValue={formatNullableNumber(homeRatings.jkbPowerRating)}
        awayPercent={getCfbPowerBarWidthPercent(awayRatings.jkbPowerRating)}
        homePercent={getCfbPowerBarWidthPercent(homeRatings.jkbPowerRating)}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={higherIsBetterEdge(awayRatings.jkbPowerRating, homeRatings.jkbPowerRating)}
      />
      <BarRow
        label="Offense"
        icon={Swords}
        awayValue={formatNullableNumber(awayRatings.offensiveRating)}
        homeValue={formatNullableNumber(homeRatings.offensiveRating)}
        awayPercent={getCfbOffenseBarWidthPercent(awayRatings.offensiveRating)}
        homePercent={getCfbOffenseBarWidthPercent(homeRatings.offensiveRating)}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={higherIsBetterEdge(awayRatings.offensiveRating, homeRatings.offensiveRating)}
      />
      <BarRow
        label="Defense"
        icon={Shield}
        awayValue={formatNullableNumber(awayRatings.defensiveRating)}
        homeValue={formatNullableNumber(homeRatings.defensiveRating)}
        awayPercent={getCfbDefenseBarWidthPercent(awayRatings.defensiveRating)}
        homePercent={getCfbDefenseBarWidthPercent(homeRatings.defensiveRating)}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={higherIsBetterEdge(awayRatings.defensiveRating, homeRatings.defensiveRating)}
      />
      <RankRow
        label="SOS Played"
        icon={Users}
        awayValue={formatRank(awayRatings.sosPlayedRank)}
        homeValue={formatRank(homeRatings.sosPlayedRank)}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={lowerIsBetterEdge(awayRatings.sosPlayedRank, homeRatings.sosPlayedRank)}
      />
      <RankRow
        label="SOS Remaining"
        icon={BarChart3}
        awayValue={formatRank(awayRatings.sosRemainingRank)}
        homeValue={formatRank(homeRatings.sosRemainingRank)}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={lowerIsBetterEdge(awayRatings.sosRemainingRank, homeRatings.sosRemainingRank)}
      />

      <p className="border-t border-slate-100 px-3 py-2 text-[10px] leading-4 text-slate-500 sm:px-4">
        Comparison indicators show which team has the statistical edge — not a betting recommendation.
      </p>
    </div>
  );
}
