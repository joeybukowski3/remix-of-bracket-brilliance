import type { CfbTeam } from "@/data/cfb/types";
import { formatNullableNumber, formatRank } from "@/lib/cfb/format";
import { higherIsBetterEdge, lowerIsBetterEdge, type CfbComparisonEdge } from "@/lib/cfb/comparison";
import {
  getCfbDefenseBarWidthPercent,
  getCfbOffenseBarWidthPercent,
  getCfbPowerBarWidthPercent,
} from "@/lib/cfb/ratingPresentation";
import { cn } from "@/lib/utils";

type Props = {
  away: Pick<CfbTeam, "shortName" | "primaryColor" | "ratings">;
  home: Pick<CfbTeam, "shortName" | "primaryColor" | "ratings">;
};

function StrongerMarker({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span aria-hidden="true" className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
  );
}

function BarRow({
  label,
  awayValue,
  homeValue,
  awayPercent,
  homePercent,
  awayColor,
  homeColor,
  edge,
}: {
  label: string;
  awayValue: string;
  homeValue: string;
  awayPercent: number;
  homePercent: number;
  awayColor: string;
  homeColor: string;
  edge: CfbComparisonEdge;
}) {
  return (
    <div className="border-t border-slate-100 px-3 py-2">
      <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-xs">
        <div
          className={cn(
            "flex items-center justify-end font-bold tabular-nums",
            edge === "away" ? "text-slate-900" : "text-slate-600",
          )}
        >
          {awayValue}
          <StrongerMarker show={edge === "away"} />
        </div>
        <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div
          className={cn(
            "flex items-center justify-start font-bold tabular-nums",
            edge === "home" ? "text-slate-900" : "text-slate-600",
          )}
        >
          <StrongerMarker show={edge === "home"} />
          {homeValue}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="ml-auto h-full rounded-full transition-[width]"
            style={{ width: `${awayPercent}%`, background: awayColor }}
          />
        </div>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${homePercent}%`, background: homeColor }}
          />
        </div>
      </div>
    </div>
  );
}

function RankRow({
  label,
  awayValue,
  homeValue,
  edge,
}: {
  label: string;
  awayValue: string;
  homeValue: string;
  edge: CfbComparisonEdge;
}) {
  return (
    <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 border-t border-slate-100 px-3 py-2 text-xs">
      <div
        className={cn(
          "flex items-center justify-end font-semibold tabular-nums",
          edge === "away" ? "text-slate-900" : "text-slate-600",
        )}
      >
        {awayValue}
        <StrongerMarker show={edge === "away"} />
      </div>
      <div className="text-center text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={cn(
          "flex items-center justify-start font-semibold tabular-nums",
          edge === "home" ? "text-slate-900" : "text-slate-600",
        )}
      >
        <StrongerMarker show={edge === "home"} />
        {homeValue}
      </div>
    </div>
  );
}

export default function CollegeFootballPowerComparison({ away, home }: Props) {
  const awayRatings = away.ratings;
  const homeRatings = home.ratings;

  return (
    <div className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="grid grid-cols-[3rem_1fr_3rem] gap-2 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        <div className="truncate text-right">{away.shortName}</div>
        <div className="text-center">JKB Power Comparison</div>
        <div className="truncate text-left">{home.shortName}</div>
      </div>

      <BarRow
        label="Power"
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
        awayValue={formatRank(awayRatings.sosPlayedRank)}
        homeValue={formatRank(homeRatings.sosPlayedRank)}
        edge={lowerIsBetterEdge(awayRatings.sosPlayedRank, homeRatings.sosPlayedRank)}
      />
      <RankRow
        label="SOS Remaining"
        awayValue={formatRank(awayRatings.sosRemainingRank)}
        homeValue={formatRank(homeRatings.sosRemainingRank)}
        edge={lowerIsBetterEdge(awayRatings.sosRemainingRank, homeRatings.sosRemainingRank)}
      />

      <p className="border-t border-slate-100 px-3 py-2 text-[10px] leading-4 text-slate-500">
        Comparison markers indicate the stronger side only — not a betting recommendation.
      </p>
    </div>
  );
}
