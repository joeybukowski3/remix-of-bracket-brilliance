import type { CfbTeam } from "@/data/cfb/types";
import { formatNullableNumber } from "@/lib/cfb/format";
import { higherIsBetterEdge, lowerIsBetterEdge } from "@/lib/cfb/comparison";
import CollegeFootballComparisonRow from "./CollegeFootballComparisonRow";

type Props = {
  away: Pick<CfbTeam, "shortName" | "stats">;
  home: Pick<CfbTeam, "shortName" | "stats">;
};

/**
 * Renders only once real 2026 box-score data exists (all fields null in Phase A).
 * The matchup page falls back to a compact placeholder while stats are null.
 */
export default function CollegeFootballSeasonStatsComparison({ away, home }: Props) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="overflow-hidden rounded-sm border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <div className="text-right">{away.shortName}</div>
          <div className="text-center">Offense</div>
          <div className="text-left">{home.shortName}</div>
        </div>
        <CollegeFootballComparisonRow
          label="PPG"
          awayValue={formatNullableNumber(away.stats.pointsPerGame)}
          homeValue={formatNullableNumber(home.stats.pointsPerGame)}
          edge={higherIsBetterEdge(away.stats.pointsPerGame, home.stats.pointsPerGame)}
        />
        <CollegeFootballComparisonRow
          label="Yards/Play"
          awayValue={formatNullableNumber(away.stats.yardsPerPlay)}
          homeValue={formatNullableNumber(home.stats.yardsPerPlay)}
          edge={higherIsBetterEdge(away.stats.yardsPerPlay, home.stats.yardsPerPlay)}
        />
        <CollegeFootballComparisonRow
          label="Rush Yds/G"
          awayValue={formatNullableNumber(away.stats.rushYardsPerGame, 0)}
          homeValue={formatNullableNumber(home.stats.rushYardsPerGame, 0)}
          edge={higherIsBetterEdge(away.stats.rushYardsPerGame, home.stats.rushYardsPerGame)}
        />
        <CollegeFootballComparisonRow
          label="Pass Yds/G"
          awayValue={formatNullableNumber(away.stats.passYardsPerGame, 0)}
          homeValue={formatNullableNumber(home.stats.passYardsPerGame, 0)}
          edge={higherIsBetterEdge(away.stats.passYardsPerGame, home.stats.passYardsPerGame)}
        />
      </div>

      <div className="overflow-hidden rounded-sm border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <div className="text-right">{away.shortName}</div>
          <div className="text-center">Defense</div>
          <div className="text-left">{home.shortName}</div>
        </div>
        <CollegeFootballComparisonRow
          label="PPG Allowed"
          awayValue={formatNullableNumber(away.stats.pointsAllowedPerGame)}
          homeValue={formatNullableNumber(home.stats.pointsAllowedPerGame)}
          edge={lowerIsBetterEdge(away.stats.pointsAllowedPerGame, home.stats.pointsAllowedPerGame)}
        />
        <CollegeFootballComparisonRow
          label="Yds/Play All."
          awayValue={formatNullableNumber(away.stats.yardsPerPlayAllowed)}
          homeValue={formatNullableNumber(home.stats.yardsPerPlayAllowed)}
          edge={lowerIsBetterEdge(away.stats.yardsPerPlayAllowed, home.stats.yardsPerPlayAllowed)}
        />
        <CollegeFootballComparisonRow
          label="Rush All./G"
          awayValue={formatNullableNumber(away.stats.rushYardsAllowedPerGame, 0)}
          homeValue={formatNullableNumber(home.stats.rushYardsAllowedPerGame, 0)}
          edge={lowerIsBetterEdge(away.stats.rushYardsAllowedPerGame, home.stats.rushYardsAllowedPerGame)}
        />
        <CollegeFootballComparisonRow
          label="Pass All./G"
          awayValue={formatNullableNumber(away.stats.passYardsAllowedPerGame, 0)}
          homeValue={formatNullableNumber(home.stats.passYardsAllowedPerGame, 0)}
          edge={lowerIsBetterEdge(away.stats.passYardsAllowedPerGame, home.stats.passYardsAllowedPerGame)}
        />
      </div>
    </div>
  );
}
