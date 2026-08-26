import { formatNullableNumber, formatNullablePercent } from "@/lib/cfb/format";
import { higherIsBetterEdge, lowerIsBetterEdge } from "@/lib/cfb/comparison";
import { CFB_SEASON_STAT_RANK_DIRECTIONS, type CfbRankedStatMetric } from "@/lib/cfb/seasonStats/rankSeasonStats";
import type { CfbMatchupSeasonStatsContext } from "@/lib/cfb/seasonStatsPresentation";
import CollegeFootballComparisonRow from "./CollegeFootballComparisonRow";

type Props = {
  awayShortName: string;
  homeShortName: string;
  context: CfbMatchupSeasonStatsContext;
};

type SeasonStatRow = {
  key: CfbRankedStatMetric;
  label: string;
  format: (value: number | null) => string;
};

const OFFENSE_ROWS: SeasonStatRow[] = [
  { key: "pointsPerGame", label: "Points/Game", format: (v) => formatNullableNumber(v, 1) },
  { key: "yardsPerPlay", label: "Yards/Play", format: (v) => formatNullableNumber(v, 1) },
  { key: "pointsPerPlay", label: "Points/Play", format: (v) => formatNullableNumber(v, 2) },
  { key: "thirdDownPct", label: "3rd Down %", format: (v) => formatNullablePercent(v, 1) },
  { key: "completionPct", label: "Completion %", format: (v) => formatNullablePercent(v, 1) },
  { key: "yardsPerRush", label: "Rush Yards/Att", format: (v) => formatNullableNumber(v, 2) },
  { key: "yardsPerPass", label: "Pass Yards/Att", format: (v) => formatNullableNumber(v, 2) },
];

const DEFENSE_ROWS: SeasonStatRow[] = [
  { key: "pointsAllowedPerGame", label: "Opp Points/Game", format: (v) => formatNullableNumber(v, 1) },
  { key: "yardsPerPlayAllowed", label: "Opp Yards/Play", format: (v) => formatNullableNumber(v, 1) },
  { key: "opponentPointsPerPlay", label: "Opp Points/Play", format: (v) => formatNullableNumber(v, 2) },
  { key: "opponentThirdDownPct", label: "Opp 3rd Down %", format: (v) => formatNullablePercent(v, 1) },
  { key: "opponentCompletionPct", label: "Opp Completion %", format: (v) => formatNullablePercent(v, 1) },
  { key: "yardsPerRushAllowed", label: "Opp Rush Yards/Att", format: (v) => formatNullableNumber(v, 2) },
  { key: "yardsPerPassAllowed", label: "Opp Pass Yards/Att", format: (v) => formatNullableNumber(v, 2) },
];

function rankBadge(rank: number | undefined): string | null {
  return rank == null ? null : `#${rank}`;
}

/**
 * Renders one coherent season's stats (see selectMatchupSeasonStatsContext) —
 * never a mix of two seasons. Ranks come from the generated artifact
 * (context.awayRanks/homeRanks); this component never computes a rank
 * itself. Edge highlighting is display-only — never a betting/model signal.
 */
export default function CollegeFootballSeasonStatsComparison({ awayShortName, homeShortName, context }: Props) {
  const { away, home, awayRanks, homeRanks } = context;

  function renderSection(title: string, rows: SeasonStatRow[]) {
    return (
      <div className="overflow-hidden rounded-sm border border-slate-200 bg-white">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <div className="text-right">{awayShortName}</div>
          <div className="text-center">{title}</div>
          <div className="text-left">{homeShortName}</div>
        </div>
        {rows.map((row) => {
          const direction = CFB_SEASON_STAT_RANK_DIRECTIONS[row.key];
          const edge =
            direction === "higher-is-better"
              ? higherIsBetterEdge(away[row.key], home[row.key])
              : lowerIsBetterEdge(away[row.key], home[row.key]);
          return (
            <CollegeFootballComparisonRow
              key={row.key}
              label={row.label}
              awayValue={row.format(away[row.key])}
              homeValue={row.format(home[row.key])}
              awayRank={away[row.key] != null ? rankBadge(awayRanks[row.key]) : null}
              homeRank={home[row.key] != null ? rankBadge(homeRanks[row.key]) : null}
              edge={edge}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {renderSection("Offense", OFFENSE_ROWS)}
      {renderSection("Defense", DEFENSE_ROWS)}
    </div>
  );
}
