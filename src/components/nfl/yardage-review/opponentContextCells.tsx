/**
 * Presentation-only cells for the opponent-defense context columns
 * (yards allowed, EPA allowed, Success Rate allowed, matchup edge). Reads a
 * pre-built `NflYardageOpponentContext` -- see
 * src/lib/nfl/props/review/opponentContext.ts for how each value is sourced.
 */
import { formatYardsAllowed } from "@/lib/nfl/productionAllowedData";
import type { NflYardageOpponentContext } from "@/lib/nfl/props/review/opponentContext";

const NA = <span className="text-slate-400">N/A</span>;

export function OppYardsAllowedCell({ context }: { context: NflYardageOpponentContext | undefined }) {
  if (!context) return NA;
  const { season, last5 } = context.productionAllowed;
  if (!season && !last5) return NA;
  return (
    <span className="inline-flex flex-col items-center leading-tight" title={`Opponent yards allowed to ${context.productionAllowed.position} -- 2025 season and final 5 2025 games`}>
      <span className="font-semibold text-slate-700">{formatYardsAllowed(season)}</span>
      <span className="text-[9px] font-normal text-slate-400">L5 {formatYardsAllowed(last5)}</span>
    </span>
  );
}

export function OppEpaAllowedCell({ context }: { context: NflYardageOpponentContext | undefined }) {
  if (!context?.epaEdge.defense) return NA;
  const { defense } = context.epaEdge;
  return (
    <span className="inline-flex flex-col items-center leading-tight" title="Opponent EPA allowed -- canonical nflverse/nflfastR authority">
      <span className="font-semibold text-slate-700">{defense.formattedValue}</span>
      <span className="text-[9px] font-normal text-slate-400">Rk {defense.rank}</span>
    </span>
  );
}

export function OppSuccessAllowedCell({ context }: { context: NflYardageOpponentContext | undefined }) {
  if (!context?.successEdge.defense) return NA;
  const { defense } = context.successEdge;
  return (
    <span className="inline-flex flex-col items-center leading-tight" title="Opponent Success Rate allowed -- canonical RBSDM authority">
      <span className="font-semibold text-slate-700">{defense.formattedValue}</span>
      <span className="text-[9px] font-normal text-slate-400">{context.successPeriodLabel}</span>
    </span>
  );
}

/** Rank-difference matchup edge (defenseRank - offenseRank); positive favors the offense. Same convention as src/lib/nfl/matchupEdges.ts. */
export function OppEdgeCell({ context }: { context: NflYardageOpponentContext | undefined }) {
  if (!context) return NA;
  // `epaEdge` is already the mode-correct edge (rush for rushing rows, pass otherwise) -- see buildYardageOpponentContext.
  const value = context.epaEdge.rankDifference;
  if (value == null) return NA;
  const favorable = value > 0;
  return (
    <span
      className={favorable ? "font-semibold text-emerald-700" : value < 0 ? "font-semibold text-red-700" : "text-slate-600"}
      title="Opponent EPA-defense rank minus offense rank; positive favors the offense -- canonical matchupEdges.ts convention"
    >
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}
