import type { ComponentType } from "react";
import { BarChart3, Shield, Swords, Users, Zap } from "lucide-react";
import type { CfbTeam } from "@/data/cfb/types";
import { formatNullableNumber, formatRank } from "@/lib/cfb/format";
import { higherIsBetterEdge, lowerIsBetterEdge, type CfbComparisonEdge } from "@/lib/cfb/comparison";
import { getCfbSharedBarSplit } from "@/lib/cfb/ratingPresentation";
import { cn } from "@/lib/utils";
import CollegeFootballStrongerBadge from "./CollegeFootballStrongerBadge";
import CollegeFootballSharedBarRow from "./CollegeFootballSharedBarRow";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";

type Props = {
  away: Pick<CfbTeam, "name" | "shortName" | "abbreviation" | "primaryColor" | "logo" | "ratings">;
  home: Pick<CfbTeam, "name" | "shortName" | "abbreviation" | "primaryColor" | "logo" | "ratings">;
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
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <CollegeFootballTeamLogo
            name={away.name}
            logo={away.logo}
            abbreviation={away.abbreviation}
            primaryColor={away.primaryColor}
            size="lg"
          />
          <span
            className="truncate text-sm font-black uppercase tracking-wide sm:text-base"
            style={{ color: away.primaryColor }}
          >
            {away.shortName}
          </span>
        </div>
        <span className="hidden shrink-0 text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:inline">
          Advantage
        </span>
        <div className="flex min-w-0 flex-row-reverse items-center gap-2 text-right">
          <CollegeFootballTeamLogo
            name={home.name}
            logo={home.logo}
            abbreviation={home.abbreviation}
            primaryColor={home.primaryColor}
            size="lg"
          />
          <span
            className="truncate text-sm font-black uppercase tracking-wide sm:text-base"
            style={{ color: home.primaryColor }}
          >
            {home.shortName}
          </span>
        </div>
      </div>

      <CollegeFootballSharedBarRow
        label="Power"
        icon={Zap}
        iconClassName={METRIC_ICON_CLASSES.power}
        awayValue={formatNullableNumber(awayRatings.jkbPowerRating)}
        homeValue={formatNullableNumber(homeRatings.jkbPowerRating)}
        {...getCfbSharedBarSplit(awayRatings.jkbPowerRating, homeRatings.jkbPowerRating)}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={higherIsBetterEdge(awayRatings.jkbPowerRating, homeRatings.jkbPowerRating)}
      />
      <CollegeFootballSharedBarRow
        label="Offense"
        icon={Swords}
        iconClassName={METRIC_ICON_CLASSES.offense}
        awayValue={formatNullableNumber(awayRatings.offensiveRating)}
        homeValue={formatNullableNumber(homeRatings.offensiveRating)}
        {...getCfbSharedBarSplit(awayRatings.offensiveRating, homeRatings.offensiveRating)}
        awayColor={away.primaryColor}
        homeColor={home.primaryColor}
        edge={higherIsBetterEdge(awayRatings.offensiveRating, homeRatings.offensiveRating)}
      />
      <CollegeFootballSharedBarRow
        label="Defense"
        icon={Shield}
        iconClassName={METRIC_ICON_CLASSES.defense}
        awayValue={formatNullableNumber(awayRatings.defensiveRating)}
        homeValue={formatNullableNumber(homeRatings.defensiveRating)}
        {...getCfbSharedBarSplit(awayRatings.defensiveRating, homeRatings.defensiveRating)}
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
