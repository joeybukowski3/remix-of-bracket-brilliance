/**
 * Opponent-defense / team-matchup context for the NFL Yardage Props Review
 * table. Data integration and presentation ONLY -- reads three existing
 * shared NFL authorities and reshapes them for display. No metric is
 * recomputed here:
 *
 *   - EPA allowed + Success Rate allowed + the rank-difference "edge" all
 *     come from `buildNflOffenseMatchupEdges` (src/lib/nfl/matchupEdges.ts),
 *     which itself composes the canonical EPA authority
 *     (src/lib/nfl/epaData.ts) and canonical Success Rate authority
 *     (src/lib/nfl/successRateData.ts). This module never touches those two
 *     artifacts directly -- going through matchupEdges keeps this page byte-
 *     identical with however the shared matchup UI presents the same edge.
 *   - Opponent yards-allowed comes from the new shared factual artifact,
 *     src/lib/nfl/productionAllowedData.ts (literal yardage allowed -- never
 *     Fantasy Points Allowed).
 *
 * Week 1 2026 has zero completed 2026 games for every team, so
 * `teamCompletedGames`/`opponentCompletedGames` are always passed as 0 --
 * exactly matchupEdges' own preseason behavior, not a special case invented
 * here. Success Rate therefore always resolves to the canonical 2025 Last 8
 * period; callers must label it as such, never "2025 Season".
 */
import { buildNflOffenseMatchupEdges, type NflMatchupEdge } from "@/lib/nfl/matchupEdges";
import type { EpaArtifact } from "@/lib/nfl/epaData";
import { resolveSuccessPeriods, type SuccessRatesArtifact } from "@/lib/nfl/successRateData";
import {
  resolveProductionAllowed,
  type ProductionAllowedArtifact,
  type ProductionAllowedCell,
} from "@/lib/nfl/productionAllowedData";
import type { NflProjectionMarket } from "../types/projectionOutput";
import type { NflPropPosition } from "../types/identity";

export type NflYardageOpponentMode = "pass" | "rush";

export type NflYardageProductionAllowed = {
  /** The production-allowed position slice actually used, e.g. "QB", "RB", "ALL", "WR", "TE". */
  position: string;
  season: ProductionAllowedCell | null;
  last5: ProductionAllowedCell | null;
};

export type NflYardageOpponentContext = {
  mode: NflYardageOpponentMode;
  productionAllowed: NflYardageProductionAllowed;
  /** Opponent's allowed EPA (value/rank) for the active mode; from matchupEdges' `.defense` component. */
  epaEdge: NflMatchupEdge;
  /** Opponent's allowed Success Rate (value/rank) for the active mode; from matchupEdges' `.defense` component. */
  successEdge: NflMatchupEdge;
  /** Compact period label for the success value, e.g. "2025 L8". Always 2025 L8 for Week 1 2026. */
  successPeriodLabel: string;
};

const SUCCESS_PERIOD_SHORT_LABEL: Record<string, string> = {
  "2025-last8": "2025 L8",
  "2026-season": "2026 Szn",
  "2026-last5": "2026 L5",
};

function productionAllowedPosition(market: NflProjectionMarket, position: NflPropPosition): string {
  if (market === "passing") return "QB";
  if (market === "rushing") return position === "RB" ? "RB" : "ALL";
  return position; // receiving: WR | TE | RB, position-specific, no team-wide fallback.
}

export function buildYardageOpponentContext(params: {
  team: string;
  opponent: string;
  market: NflProjectionMarket;
  position: NflPropPosition;
  epa: EpaArtifact | null;
  success: SuccessRatesArtifact | null;
  productionAllowed: ProductionAllowedArtifact | null;
  /** Site canonical abbr (lowercase, e.g. "lar") -> nflverse abbr (uppercase, e.g. "LA"). */
  abbrToNflverseAbbr: ReadonlyMap<string, string>;
}): NflYardageOpponentContext {
  const mode: NflYardageOpponentMode = params.market === "rushing" ? "rush" : "pass";

  // Week 1 2026: zero completed 2026 games for every team -- matchupEdges'
  // own preseason behavior, not a special case invented here.
  const edges = buildNflOffenseMatchupEdges({
    team: params.team,
    opponent: params.opponent,
    teamCompletedGames: 0,
    opponentCompletedGames: 0,
    trench: null,
    epa: params.epa,
    success: params.success,
  });

  const epaEdge = mode === "rush" ? edges.rushEpaEdge : edges.passEpaEdge;
  const successEdge = mode === "rush" ? edges.rushSuccessEdge : edges.passSuccessEdge;

  const successPeriod = resolveSuccessPeriods(0, 0)[0];
  const successPeriodLabel = SUCCESS_PERIOD_SHORT_LABEL[successPeriod] ?? successPeriod;

  const positionSlice = productionAllowedPosition(params.market, params.position);
  const nflverseOpponent = params.abbrToNflverseAbbr.get(params.opponent);
  const productionAllowed: NflYardageProductionAllowed = {
    position: positionSlice,
    season: resolveProductionAllowed(params.productionAllowed, nflverseOpponent, params.market, positionSlice, "season"),
    last5: resolveProductionAllowed(params.productionAllowed, nflverseOpponent, params.market, positionSlice, "last5"),
  };

  return { mode, productionAllowed, epaEdge, successEdge, successPeriodLabel };
}
