import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { epaWindowId, formatEpa, type EpaArtifact } from "@/lib/nfl/epaData";
import { DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS } from "@/lib/nfl/matchupSampleWindow";
import {
  createSuccessRateResolver,
  formatSuccessRate,
  resolveSuccessPeriods,
  type SuccessRatesArtifact,
} from "@/lib/nfl/successRateData";
import {
  createTrenchResolver,
  formatTrenchValue,
  resolveTrenchPeriods,
  type TrenchMetricsArtifact,
} from "@/lib/nfl/trenchMetricsData";

export type NflMatchupEdgeComponent = {
  team: string;
  label: string;
  value: number;
  formattedValue: string;
  rank: number;
};

export type NflMatchupEdge = {
  /** Legacy normalized value retained for backward-compatible consumers. */
  score: number | null;
  /** Explicit 1-32 component ranks; rank 1 is best for both units. */
  offenseRank: number | null;
  defenseRank: number | null;
  /** defenseRank - offenseRank; positive is favorable for the offense. */
  rankDifference: number | null;
  offense: NflMatchupEdgeComponent | null;
  defense: NflMatchupEdgeComponent | null;
  source: string;
  sampleLabel: string;
};

export type NflOffenseMatchupEdges = {
  passProtectionEdge: NflMatchupEdge;
  runBlockingEdge: NflMatchupEdge;
  passEpaEdge: NflMatchupEdge;
  rushEpaEdge: NflMatchupEdge;
  passSuccessEdge: NflMatchupEdge;
  rushSuccessEdge: NflMatchupEdge;
};

export type FantasyMatchupEdges = {
  trenches: NflMatchupEdge;
  epa: NflMatchupEdge;
  success: NflMatchupEdge;
  mode: "pass" | "rush";
};

const TEAM_COUNT = 32;

function validRank(rank: number | null | undefined): rank is number {
  return Number.isInteger(rank) && (rank as number) >= 1 && (rank as number) <= TEAM_COUNT;
}

/** Plain rank comparison shared by every NFL matchup presentation. */
export function matchupRankDifference(
  offenseRank: number | null | undefined,
  defenseRank: number | null | undefined,
): number | null {
  if (!validRank(offenseRank) || !validRank(defenseRank)) return null;
  return defenseRank - offenseRank;
}

/** Rank-normalized unit comparison. Rank 1 is strong on both sides. */
export function matchupEdgeScore(offenseRank: number | null, defenseRank: number | null): number | null {
  const rankDifference = matchupRankDifference(offenseRank, defenseRank);
  return rankDifference == null ? null : (rankDifference / (TEAM_COUNT - 1)) * 100;
}

function edge(
  offense: NflMatchupEdgeComponent | null,
  defense: NflMatchupEdgeComponent | null,
  source: string,
  sampleLabel: string,
): NflMatchupEdge {
  const offenseRank = offense?.rank ?? null;
  const defenseRank = defense?.rank ?? null;
  return {
    score: matchupEdgeScore(offenseRank, defenseRank),
    offenseRank,
    defenseRank,
    rankDifference: matchupRankDifference(offenseRank, defenseRank),
    offense,
    defense,
    source,
    sampleLabel,
  };
}

export function buildNflOffenseMatchupEdges(input: {
  team: string;
  opponent: string;
  teamCompletedGames: number;
  opponentCompletedGames: number;
  trench: TrenchMetricsArtifact | null;
  epa: EpaArtifact | null;
  success: SuccessRatesArtifact | null;
}): NflOffenseMatchupEdges {
  const team = input.team.toLowerCase();
  const opponent = input.opponent.toLowerCase();

  const trenchPeriods = resolveTrenchPeriods(input.teamCompletedGames, input.opponentCompletedGames);
  const trenchPeriod = trenchPeriods[0];
  const trenchResolve = createTrenchResolver(input.trench);
  const trenchPair = (offenseKey: string, offenseLabel: string, defenseKey: string, defenseLabel: string) => {
    const offenseValue = trenchResolve(team, offenseKey, trenchPeriod);
    const defenseValue = trenchResolve(opponent, defenseKey, trenchPeriod);
    return edge(
      offenseValue ? { team, label: offenseLabel, value: offenseValue.valuePct, formattedValue: formatTrenchValue(offenseValue), rank: offenseValue.espnRank } : null,
      defenseValue ? { team: opponent, label: defenseLabel, value: defenseValue.valuePct, formattedValue: formatTrenchValue(defenseValue), rank: defenseValue.espnRank } : null,
      input.trench?.attribution ?? "ESPN Analytics / NFL Next Gen Stats",
      trenchPeriod === "2025-season" ? "2025 season" : "2026 season to date",
    );
  };

  const epaWindow = input.epa?.windows?.[epaWindowId(DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS)];
  const epaPair = (offenseKey: string, offenseLabel: string, defenseKey: string, defenseLabel: string) => {
    const offenseTuple = epaWindow?.teams?.[team]?.metrics?.[offenseKey];
    const defenseTuple = epaWindow?.teams?.[opponent]?.metrics?.[defenseKey];
    const offenseValue = offenseTuple?.[0];
    const defenseValue = defenseTuple?.[0];
    return edge(
      offenseValue != null && Number.isFinite(offenseValue) && validRank(offenseTuple?.[1])
        ? { team, label: offenseLabel, value: offenseValue, formattedValue: formatEpa(offenseValue), rank: offenseTuple![1]! }
        : null,
      defenseValue != null && Number.isFinite(defenseValue) && validRank(defenseTuple?.[1])
        ? { team: opponent, label: defenseLabel, value: defenseValue, formattedValue: formatEpa(defenseValue), rank: defenseTuple![1]! }
        : null,
      input.epa?.attribution ?? "nflverse / nflfastR",
      "rolling eight-game season blend",
    );
  };

  const successPeriods = resolveSuccessPeriods(input.teamCompletedGames, input.opponentCompletedGames);
  const successPeriod = successPeriods[0];
  const successResolve = createSuccessRateResolver(input.success);
  const successPair = (offenseKey: string, offenseLabel: string, defenseKey: string, defenseLabel: string) => {
    const offenseValue = successResolve(team, offenseKey, successPeriod);
    const defenseValue = successResolve(opponent, defenseKey, successPeriod);
    return edge(
      offenseValue && validRank(offenseValue.rank)
        ? { team, label: offenseLabel, value: offenseValue.pct, formattedValue: formatSuccessRate(offenseValue), rank: offenseValue.rank }
        : null,
      defenseValue && validRank(defenseValue.rank)
        ? { team: opponent, label: defenseLabel, value: defenseValue.pct, formattedValue: formatSuccessRate(defenseValue), rank: defenseValue.rank }
        : null,
      input.success?._meta?.attribution ?? "RBSDM / Ben Baldwin",
      successPeriod === "2025-last8" ? "2025 last eight" : successPeriod === "2026-last5" ? "2026 last five" : "2026 season to date",
    );
  };

  return {
    passProtectionEdge: trenchPair("off.passBlockWinRate", "Team Pass Block", "def.passRushWinRate", "Opponent Pass Rush"),
    runBlockingEdge: trenchPair("off.runBlockWinRate", "Team Run Block", "def.runStopWinRate", "Opponent Run Stop"),
    passEpaEdge: epaPair("off.epaPerPass", "Team Pass EPA", "def.epaPerPassAllowed", "Opponent Pass Defense EPA"),
    rushEpaEdge: epaPair("off.epaPerRush", "Team Rush EPA", "def.epaPerRushAllowed", "Opponent Rush Defense EPA"),
    passSuccessEdge: successPair("off.passSuccessRate", "Team Pass Success Rate", "def.passSuccessRateAllowed", "Opponent Pass Defense Success Rate"),
    rushSuccessEdge: successPair("off.rushSuccessRate", "Team Rush Success Rate", "def.rushSuccessRateAllowed", "Opponent Rush Defense Success Rate"),
  };
}

export function selectFantasyMatchupEdges(position: FantasyPosition, edges: NflOffenseMatchupEdges): FantasyMatchupEdges {
  if (position === "RB") {
    return { trenches: edges.runBlockingEdge, epa: edges.rushEpaEdge, success: edges.rushSuccessEdge, mode: "rush" };
  }
  return { trenches: edges.passProtectionEdge, epa: edges.passEpaEdge, success: edges.passSuccessEdge, mode: "pass" };
}
