import type { ComponentType } from "react";
import { BarChart3, Shield, Swords, Users, Zap } from "lucide-react";
import type { CfbTeam } from "@/data/cfb/types";
import { formatNullableNumber, formatRank } from "@/lib/cfb/format";
import { higherIsBetterEdge, lowerIsBetterEdge, type CfbComparisonEdge } from "@/lib/cfb/comparison";
import { getCfbSharedBarSplit } from "@/lib/cfb/ratingPresentation";
import { cn } from "@/lib/utils";
import CollegeFootballStrongerBadge from "./CollegeFootballStrongerBadge";

type Props = {
  away: Pick<CfbTeam, "shortName" | "abbreviation" | "primaryColor" | "ratings">;
  home: Pick<CfbTeam, "shortName" | "abbreviation" | "primaryColor" | "ratings">;
};

/**
 * Tasteful per-metric accent so the icon row reads as a categorized legend
 * (Power / Offense / Defense / SOS) rather than a wall of identical gray
 * glyphs. Colors are metric-category based, not team-based — team identity
 * is already carried by the bars and value colors.
 */
const METRIC_ICON_CLASSES = {
  power: "border-violet-200 bg-violet-50 text-violet-600",
  offense: "border-orange-200 bg-orange-50 text-orange-600",
  defense: "border-sky-200 bg-sky-50 text-sky-600",
  sosPlayed: "border-teal-200 bg-teal-50 text-teal-600",
  sosRemaining: "border-amber-200 bg-amber-50 text-amber-600",
} as const;

type MetricCategory = keyof typeof METRIC_ICON_CLASSES;

function MetricIcon({
  icon: Icon,
  category,
}: {
  icon: ComponentType<{ className?: string }>;
  category: MetricCategory;
}) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm",
        METRIC_ICON_CLASSES[category],
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * Single shared horizontal bar per metric: away's share fills from the left,
 * home's share fills from the right, meeting in the middle — so relative
 * strength reads at a glance instead of comparing two separate bars. The
 * split is computed directly from each side's raw rating value via
 * getCfbSharedBarSplit — never from two independently clamped/rescaled
 * display widths, which would distort the visual ratio.
 */
function BarRow({
  label,
  icon,
  category,
  awayValue,
  homeValue,
  awayRating,
  homeRating,
  awayColor,
  homeColor,
  edge,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  category: MetricCategory;
  awayValue: string;
  homeValue: string;
  awayRating: number | null | undefined;
  homeRating: number | null | undefined;
  awayColor: string;
  homeColor: string;
  edge: CfbComparisonEdge;
}) {
  const { awayShare, homeShare } = getCfbSharedBarSplit(awayRating, homeRating);

  return (
    <div className="border-t border-slate-200 px-3 py-3 sm:px-4">
      <div className="mb-2 flex items-center justify-center gap-1.5">
        <MetricIcon icon={icon} category={category} />
        <span className="text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-500 sm:text-[11px]">
          {label}
        </span>
      </div>
      <div className="grid grid-cols-[3.25rem_1fr_3.25rem] items-center gap-2 sm:gap-3">
        <div
          className={cn(
            "flex items-center justify-end gap-1 text-right text-sm font-black tabular-nums sm:text-base",
            edge === "away" ? "text-slate-900" : "text-slate-500",
          )}
        >
          <CollegeFootballStrongerBadge show={edge === "away"} color={awayColor} />
          {awayValue}
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
          <div className="h-full transition-[width]" style={{ width: `${awayShare}%`, background: awayColor }} />
          <div className="h-full transition-[width]" style={{ width: `${homeShare}%`, background: homeColor }} />
        </div>
        <div
          className={cn(
            "flex items-center justify-start gap-1 text-left text-sm font-black tabular-nums sm:text-base",
            edge === "home" ? "text-slate-900" : "text-slate-500",
          )}
        >
          {homeValue}
          <CollegeFootballStrongerBadge show={edge === "home"} color={homeColor} />
        </div>
      </div>
    </div>
  );
}

function RankRow({
  label,
  icon,
  category,
  awayValue,
  homeValue,
  awayColor,
  homeColor,
  edge,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  category: MetricCategory;
  awayValue: string;
  homeValue: string;
  awayColor: string;
  homeColor: string;
  edge: CfbComparisonEdge;
}) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr_2.75rem_1fr_3.25rem] items-center gap-2 border-t border-slate-200 px-3 py-2.5 sm:gap-3 sm:px-4">
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
        <MetricIcon icon={icon} category={category} />
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
    <div className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4">
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
        category="power"
        awayValue={formatNullableNumber(awayRatings.jkbPowerRating)}
        homeValue={formatNullableNumber(homeRatings.jkbPowerRating)}
        awayRating={awayRatings.jkbPowerRating}
        homeRating={homeRatings.jkbPowerRating}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={higherIsBetterEdge(awayRatings.jkbPowerRating, homeRatings.jkbPowerRating)}
      />
      <BarRow
        label="Offense"
        icon={Swords}
        category="offense"
        awayValue={formatNullableNumber(awayRatings.offensiveRating)}
        homeValue={formatNullableNumber(homeRatings.offensiveRating)}
        awayRating={awayRatings.offensiveRating}
        homeRating={homeRatings.offensiveRating}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={higherIsBetterEdge(awayRatings.offensiveRating, homeRatings.offensiveRating)}
      />
      <BarRow
        label="Defense"
        icon={Shield}
        category="defense"
        awayValue={formatNullableNumber(awayRatings.defensiveRating)}
        homeValue={formatNullableNumber(homeRatings.defensiveRating)}
        awayRating={awayRatings.defensiveRating}
        homeRating={homeRatings.defensiveRating}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={higherIsBetterEdge(awayRatings.defensiveRating, homeRatings.defensiveRating)}
      />
      <RankRow
        label="SOS Played"
        icon={Users}
        category="sosPlayed"
        awayValue={formatRank(awayRatings.sosPlayedRank)}
        homeValue={formatRank(homeRatings.sosPlayedRank)}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={lowerIsBetterEdge(awayRatings.sosPlayedRank, homeRatings.sosPlayedRank)}
      />
      <RankRow
        label="SOS Remaining"
        icon={BarChart3}
        category="sosRemaining"
        awayValue={formatRank(awayRatings.sosRemainingRank)}
        homeValue={formatRank(homeRatings.sosRemainingRank)}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={lowerIsBetterEdge(awayRatings.sosRemainingRank, homeRatings.sosRemainingRank)}
      />

      <p className="border-t border-slate-200 px-3 py-2 text-[10px] leading-4 text-slate-500 sm:px-4">
        Comparison indicators show which team has the statistical edge — not a betting recommendation.
      </p>
    </div>
  );
}
