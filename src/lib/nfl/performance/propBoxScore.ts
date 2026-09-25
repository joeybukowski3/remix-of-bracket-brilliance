import { playerHistoryKey, type NflYardageHistoryArtifact, type NflYardagePlayerHistoryGame } from "@/lib/nfl/props/types/yardageHistory";
import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";
import type { PropsPerformanceRow } from "@/types/nfl/performance";

const HISTORY_MARKET: Record<PropsPerformanceRow["market"], NflProjectionMarket> = {
  passing_yards: "passing",
  rushing_yards: "rushing",
  receiving_yards: "receiving",
};

/** Exact read-only join. The graded performance row remains the authority for actual yards. */
export function findPropBoxScore(row: PropsPerformanceRow, history: NflYardageHistoryArtifact | null): NflYardagePlayerHistoryGame | null {
  if (!history || history.season !== row.season) return null;
  const player = history.players[playerHistoryKey(row.player_id, HISTORY_MARKET[row.market])];
  return player?.games.find((game) => game.gameId === row.game_id && game.season === row.season && game.week === row.week && game.actualYards === row.actual) ?? null;
}
