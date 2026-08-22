import type { WeeklyFantasyRankingArtifact } from "@/lib/fantasy/weekly/productionAuthority";
import type { WeeklyRankingRow } from "@/lib/fantasy/weeklyRankings";
import { WEEKLY_RANKING_POSITIONS } from "@/lib/fantasy/weeklyRankings";
import type { WeeklyDashboardPosition } from "@/lib/nfl/weeklyDashboard";

function opponentLabel(homeAway: "home" | "away" | "neutral", opponent: string): string {
  const prefix = homeAway === "home" ? "vs" : homeAway === "away" ? "@" : "N";
  return `${prefix} ${opponent.toUpperCase()}`;
}

/**
 * Adapts the canonical weekly fantasy ranking artifact to the row shape the
 * dashboard builder already consumes, so the NFL Command Center's Top Picks
 * module reads the exact same ranking authority as the full rankings page
 * instead of a separately computed sort.
 */
export function fantasyRowsFromArtifact(
  rankings: WeeklyFantasyRankingArtifact["rankings"] | null,
): Partial<Record<WeeklyDashboardPosition, readonly WeeklyRankingRow[]>> | undefined {
  if (!rankings) return undefined;
  return Object.fromEntries(
    WEEKLY_RANKING_POSITIONS.map((position) => [
      position,
      rankings[position].map((row): WeeklyRankingRow => ({
        key: row.playerId,
        rank: row.positionRank,
        player: row.playerName,
        position,
        teamAbbr: row.team,
        projectedPpg: row.baselineValue,
        opponent: null,
        opponentLabel: opponentLabel(row.homeAway, row.opponent),
        fpa: null,
        grade: null,
        stats: [],
      })),
    ]),
  );
}
