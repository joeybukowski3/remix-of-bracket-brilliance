import {
  CFB_STATS_PREVIOUS_SEASON_BY_TEAM,
  CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM,
  CFB_STATS_RANKS_BY_TEAM,
} from "@/data/cfb";
import type { CfbRankedStatMetric } from "@/lib/cfb/seasonStats/rankSeasonStats";
import { computeCompetitionRanks } from "@/lib/cfb/seasonStats/rankSeasonStats";
import { formatNullablePercent } from "@/lib/cfb/format";
import type { CfbTeam } from "@/data/cfb/types";

export type RatingsView = "power" | "offense" | "defense" | "passing" | "rushing" | "situational";
export type RatingsDisplay = "values" | "ranks";

export type RatingsExplorerContext = {
  allTeamsCount: number;
  statsSeason: 2025 | 2026;
  offenseRanks: ReadonlyMap<string, number>;
  defenseRanks: ReadonlyMap<string, number>;
};

export type RatingsMetric = {
  key: string;
  label: string;
  shortLabel: string;
  valueLabel?: string;
  heat: boolean;
  format: (value: number | null) => string;
  readValue: (team: CfbTeam, context: RatingsExplorerContext) => number | null;
  readRank: (team: CfbTeam, context: RatingsExplorerContext) => number | null;
};

export type RatingsViewDefinition = {
  id: RatingsView;
  label: string;
  metrics: readonly RatingsMetric[];
  usesSeasonStats: boolean;
};

const number = (digits = 1) => (value: number | null) => value == null ? "—" : value.toFixed(digits);
const pct = (value: number | null) => formatNullablePercent(value, 1);
const officialRank = (value: number | null) => value == null ? "—" : `#${value}`;

function statMetric(
  key: CfbRankedStatMetric,
  label: string,
  shortLabel: string,
  format: (value: number | null) => string,
): RatingsMetric {
  return {
    key,
    label,
    shortLabel,
    heat: true,
    format,
    readValue: (team, context) => context.statsSeason === 2026
      ? team.stats[key]
      : CFB_STATS_PREVIOUS_SEASON_BY_TEAM[team.id]?.[key] ?? null,
    readRank: (team, context) => context.statsSeason === 2026
      ? CFB_STATS_RANKS_BY_TEAM[team.id]?.[key] ?? null
      : CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM[team.id]?.[key] ?? null,
  };
}

export const RATINGS_VIEW_DEFINITIONS: readonly RatingsViewDefinition[] = [
  {
    id: "power",
    label: "Power Ratings",
    usesSeasonStats: false,
    metrics: [
      {
        key: "apRank",
        label: "AP Rank",
        shortLabel: "AP",
        valueLabel: "Official poll",
        heat: false,
        format: officialRank,
        readValue: (team) => team.ratings.apRank,
        readRank: () => null,
      },
      {
        key: "jkbPowerRating",
        label: "JKB Power",
        shortLabel: "JKB Power",
        heat: true,
        format: number(1),
        readValue: (team) => team.ratings.jkbPowerRating,
        readRank: (team) => team.ratings.jkbRank,
      },
      {
        key: "offensiveRating",
        label: "Offense",
        shortLabel: "Offense",
        heat: true,
        format: number(1),
        readValue: (team) => team.ratings.offensiveRating,
        readRank: (team, context) => context.offenseRanks.get(team.id) ?? null,
      },
      {
        key: "defensiveRating",
        label: "Defense",
        shortLabel: "Defense",
        heat: true,
        format: number(1),
        readValue: (team) => team.ratings.defensiveRating,
        readRank: (team, context) => context.defenseRanks.get(team.id) ?? null,
      },
      {
        key: "sosRemainingRating",
        label: "Remaining SOS",
        shortLabel: "SOS Rem",
        heat: true,
        format: number(1),
        readValue: (team) => team.ratings.sosRemainingRating,
        readRank: (team) => team.ratings.sosRemainingRank,
      },
    ],
  },
  {
    id: "offense",
    label: "Offense",
    usesSeasonStats: true,
    metrics: [
      statMetric("pointsPerGame", "Points / Game", "PPG", number(1)),
      statMetric("yardsPerPlay", "Yards / Play", "YPP", number(2)),
      statMetric("pointsPerPlay", "Points / Play", "Pts/Play", number(3)),
      statMetric("thirdDownPct", "3rd Down", "3D%", pct),
    ],
  },
  {
    id: "defense",
    label: "Defense",
    usesSeasonStats: true,
    metrics: [
      statMetric("pointsAllowedPerGame", "Points Allowed / Game", "PA/G", number(1)),
      statMetric("yardsPerPlayAllowed", "Yards / Play Allowed", "YPP A", number(2)),
      statMetric("opponentPointsPerPlay", "Opponent Points / Play", "Opp P/P", number(3)),
      statMetric("opponentThirdDownPct", "Opponent 3rd Down", "Opp 3D%", pct),
    ],
  },
  {
    id: "passing",
    label: "Passing",
    usesSeasonStats: true,
    metrics: [
      statMetric("passYardsPerGame", "Pass Yards / Game", "Pass Yds", number(1)),
      statMetric("yardsPerPass", "Yards / Pass", "YPA", number(2)),
      statMetric("completionPct", "Completion Rate", "Comp%", pct),
      statMetric("passYardsAllowedPerGame", "Pass Yards Allowed", "Pass Def", number(1)),
    ],
  },
  {
    id: "rushing",
    label: "Rushing",
    usesSeasonStats: true,
    metrics: [
      statMetric("rushYardsPerGame", "Rush Yards / Game", "Rush Yds", number(1)),
      statMetric("yardsPerRush", "Yards / Rush", "YPC", number(2)),
      statMetric("rushYardsAllowedPerGame", "Rush Yards Allowed", "Rush Def", number(1)),
      statMetric("yardsPerRushAllowed", "Yards / Rush Allowed", "YPC A", number(2)),
    ],
  },
  {
    id: "situational",
    label: "Situational",
    usesSeasonStats: true,
    metrics: [
      statMetric("thirdDownPct", "3rd Down Offense", "3D Off", pct),
      statMetric("opponentThirdDownPct", "3rd Down Defense", "3D Def", pct),
      statMetric("pointsPerPlay", "Points / Play", "Pts/Play", number(3)),
      statMetric("opponentPointsPerPlay", "Opponent Points / Play", "Opp P/P", number(3)),
    ],
  },
] as const;

export function getRatingsViewDefinition(view: RatingsView): RatingsViewDefinition {
  return RATINGS_VIEW_DEFINITIONS.find((definition) => definition.id === view) ?? RATINGS_VIEW_DEFINITIONS[0];
}

export function createRatingsExplorerContext(
  allTeams: readonly CfbTeam[],
  statsSeason: 2025 | 2026,
): RatingsExplorerContext {
  const rank = (key: "offensiveRating" | "defensiveRating") => computeCompetitionRanks(
    allTeams.map((team) => ({ teamId: team.id, value: team.ratings[key] })),
    "higher-is-better",
  );
  return {
    allTeamsCount: allTeams.length,
    statsSeason,
    offenseRanks: rank("offensiveRating"),
    defenseRanks: rank("defensiveRating"),
  };
}

export function getRatingsHeatClass(rank: number | null, fieldSize: number): string {
  if (rank == null) return "bg-slate-50 text-slate-500";
  const percentile = rank / Math.max(fieldSize, 1);
  if (percentile <= 0.1) return "bg-emerald-700 text-white";
  if (percentile <= 0.25) return "bg-emerald-100 text-emerald-950";
  if (percentile <= 0.5) return "bg-lime-50 text-lime-950";
  if (percentile <= 0.75) return "bg-amber-50 text-amber-950";
  if (percentile <= 0.9) return "bg-orange-100 text-orange-950";
  return "bg-rose-200 text-rose-950";
}
