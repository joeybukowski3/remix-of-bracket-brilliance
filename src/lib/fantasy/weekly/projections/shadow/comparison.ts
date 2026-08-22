import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { WeeklyFantasyRankingArtifact } from "@/lib/fantasy/weekly/productionAuthority";
import type { WeeklyFantasyProjectionShadowArtifact } from "./artifactContract";

/**
 * Read-only comparison of the shadow Week 1 artifact against the CURRENT
 * canonical production weekly-ranking artifact. Never mutates or rewrites
 * the production artifact.
 */
export type RankMovementRow = {
  playerId: string; playerName: string; position: FantasyPosition;
  currentRank: number | null; shadowRank: number | null;
  absoluteMovement: number | null;
};

export type PositionComparison = {
  position: FantasyPosition;
  currentRowCount: number;
  shadowRowCount: number;
  identityOverlap: number;
  onlyInCurrent: number;
  onlyInShadow: number;
  topN: readonly RankMovementRow[];
  movedAtLeast5: readonly RankMovementRow[];
  movedAtLeast10: readonly RankMovementRow[];
};

const TOP_N: Readonly<Record<FantasyPosition, number>> = { QB: 12, RB: 24, WR: 36, TE: 12 };

export function compareShadowToCurrentRankings(
  current: WeeklyFantasyRankingArtifact,
  shadow: WeeklyFantasyProjectionShadowArtifact,
): Readonly<Record<FantasyPosition, PositionComparison>> {
  const result = {} as Record<FantasyPosition, PositionComparison>;
  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    const currentRows = current.rankings[position];
    const shadowRows = [...shadow.rows[position]].sort((a, b) => b.projectedFantasyPoints - a.projectedFantasyPoints || a.playerId.localeCompare(b.playerId));
    const currentRankById = new Map(currentRows.map((row) => [row.playerId, row.positionRank]));
    const shadowRankById = new Map(shadowRows.map((row, index) => [row.playerId, index + 1]));
    const allIds = new Set([...currentRankById.keys(), ...shadowRankById.keys()]);

    const rows: RankMovementRow[] = [...allIds].map((playerId) => {
      const currentRank = currentRankById.get(playerId) ?? null;
      const shadowRank = shadowRankById.get(playerId) ?? null;
      const playerName = currentRows.find((r) => r.playerId === playerId)?.playerName
        ?? shadowRows.find((r) => r.playerId === playerId)?.playerName ?? playerId;
      return {
        playerId, playerName, position,
        currentRank, shadowRank,
        absoluteMovement: currentRank != null && shadowRank != null ? Math.abs(currentRank - shadowRank) : null,
      };
    });

    const topN = shadowRows.slice(0, TOP_N[position]).map((row, index) => ({
      playerId: row.playerId, playerName: row.playerName, position,
      currentRank: currentRankById.get(row.playerId) ?? null, shadowRank: index + 1,
      absoluteMovement: currentRankById.get(row.playerId) != null ? Math.abs((currentRankById.get(row.playerId) as number) - (index + 1)) : null,
    }));

    result[position] = {
      position,
      currentRowCount: currentRows.length,
      shadowRowCount: shadowRows.length,
      identityOverlap: [...currentRankById.keys()].filter((id) => shadowRankById.has(id)).length,
      onlyInCurrent: [...currentRankById.keys()].filter((id) => !shadowRankById.has(id)).length,
      onlyInShadow: [...shadowRankById.keys()].filter((id) => !currentRankById.has(id)).length,
      topN,
      movedAtLeast5: rows.filter((row) => (row.absoluteMovement ?? 0) >= 5).sort((a, b) => (b.absoluteMovement ?? 0) - (a.absoluteMovement ?? 0)),
      movedAtLeast10: rows.filter((row) => (row.absoluteMovement ?? 0) >= 10).sort((a, b) => (b.absoluteMovement ?? 0) - (a.absoluteMovement ?? 0)),
    };
  }
  return result;
}
