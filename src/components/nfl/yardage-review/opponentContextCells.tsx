/**
 * Presentation-only cells for the opponent-defense context columns
 * (yards allowed, EPA allowed, Success Rate allowed, matchup edge). Reads a
 * pre-built `NflYardageOpponentContext` -- see
 * src/lib/nfl/props/review/opponentContext.ts for how each value is sourced.
 */
import { formatYardsAllowed } from "@/lib/nfl/productionAllowedData";
import type { NflYardageOpponentContext } from "@/lib/nfl/props/review/opponentContext";
import {
  edgeHeatTone,
  opponentDefenseRankHeatTone,
  weeklyHeatClass,
  weeklyHeatStyle,
  type NflYardageOpponentContextWithHeat,
} from "@/lib/nfl/props/review/yardageHeat";
import { cn } from "@/lib/utils";

const NA = <span className="text-slate-400">N/A</span>;

/** Shared subtle tinted-cell treatment -- background/border come from the heat tone, sizing/radius stay compact and consistent. */
const HEAT_CELL_CLASS = "inline-flex min-w-[2.5rem] items-center justify-center rounded px-1.5 py-0.5";

/** Shared rank-direction disclosure for the EPA/Success rank-primary cells and their column headers. */
export const OPP_DEFENSE_RANK_DIRECTION_HINT =
  "Rank 1 = strongest defense (fewest yards/EPA/success allowed). Higher rank = weaker defense, more favorable for the offense.";

export function OppYardsAllowedSeasonCell({ context }: { context: NflYardageOpponentContextWithHeat | undefined }) {
  if (!context?.productionAllowed.season) return NA;
  const tone = context.yardsAllowedSeasonTone;
  return (
    <span
      className={cn(HEAT_CELL_CLASS, weeklyHeatClass(tone), "font-semibold")}
      style={weeklyHeatStyle(tone)}
      title={`Opponent yards allowed to ${context.productionAllowed.position} -- 2025 season`}
    >
      {formatYardsAllowed(context.productionAllowed.season)}
    </span>
  );
}

export function OppYardsAllowedL5Cell({ context }: { context: NflYardageOpponentContextWithHeat | undefined }) {
  if (!context?.productionAllowed.last5) return NA;
  const tone = context.yardsAllowedLast5Tone;
  return (
    <span
      className={cn(HEAT_CELL_CLASS, weeklyHeatClass(tone), "font-semibold")}
      style={weeklyHeatStyle(tone)}
      title={`Opponent yards allowed to ${context.productionAllowed.position} -- final 5 applicable 2025 games`}
    >
      {formatYardsAllowed(context.productionAllowed.last5)}
    </span>
  );
}

export function OppEpaAllowedCell({ context }: { context: NflYardageOpponentContext | undefined }) {
  if (!context?.epaEdge.defense) return NA;
  const { defense } = context.epaEdge;
  const tone = opponentDefenseRankHeatTone(defense.rank);
  return (
    <span
      className={cn(HEAT_CELL_CLASS, weeklyHeatClass(tone), "flex-col leading-tight")}
      style={weeklyHeatStyle(tone)}
      title={`Opponent EPA allowed -- canonical nflverse/nflfastR authority. ${OPP_DEFENSE_RANK_DIRECTION_HINT}`}
    >
      <span className="text-sm font-bold">{defense.rank}</span>
      <span className="text-[9px] font-normal opacity-80">{defense.formattedValue}</span>
    </span>
  );
}

export function OppSuccessAllowedCell({ context }: { context: NflYardageOpponentContext | undefined }) {
  if (!context?.successEdge.defense) return NA;
  const { defense } = context.successEdge;
  const tone = opponentDefenseRankHeatTone(defense.rank);
  return (
    <span
      className={cn(HEAT_CELL_CLASS, weeklyHeatClass(tone), "flex-col leading-tight")}
      style={weeklyHeatStyle(tone)}
      title={`Opponent Success Rate allowed -- canonical RBSDM authority. ${OPP_DEFENSE_RANK_DIRECTION_HINT}`}
    >
      <span className="text-sm font-bold">{defense.rank}</span>
      <span className="text-[9px] font-normal opacity-80">
        {defense.formattedValue} · {context.successPeriodLabel}
      </span>
    </span>
  );
}

/** Rank-difference matchup edge (defenseRank - offenseRank); positive favors the offense. Same convention as src/lib/nfl/matchupEdges.ts. */
export function OppEdgeCell({ context }: { context: NflYardageOpponentContext | undefined }) {
  if (!context) return NA;
  // `epaEdge` is already the mode-correct edge (rush for rushing rows, pass otherwise) -- see buildYardageOpponentContext.
  const value = context.epaEdge.rankDifference;
  if (value == null) return NA;
  const tone = edgeHeatTone(value);
  return (
    <span
      className={cn(HEAT_CELL_CLASS, weeklyHeatClass(tone), "font-semibold")}
      style={weeklyHeatStyle(tone)}
      title="Team Edge: opponent EPA-defense rank minus offense rank; positive favors the offense -- canonical matchupEdges.ts convention"
    >
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}
