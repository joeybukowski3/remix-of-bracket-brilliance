import type { WeeklyFantasyProjectionProductionArtifact } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import type { WeeklyRankingRow } from "@/lib/fantasy/weeklyRankings";
import { WEEKLY_RANKING_POSITIONS } from "@/lib/fantasy/weeklyRankings";
import type { WeeklyDashboardPosition } from "@/lib/nfl/weeklyDashboard";

function opponentLabel(homeAway: "home" | "away" | "neutral", opponent: string): string {
  const prefix = homeAway === "home" ? "vs" : homeAway === "away" ? "@" : "N";
  return `${prefix} ${opponent.toUpperCase()}`;
}

/**
 * Adapts the canonical PRODUCTION `projectedFantasyPoints` artifact to the
 * row shape the dashboard builder already consumes, so the NFL Command
 * Center's Top Picks module reads the exact same model authority and rank as
 * the full weekly rankings page -- never a separately computed sort. `rank`
 * and `projectedPpg` are copied directly from the artifact's own
 * `positionRank` / `projectedFantasyPoints`; nothing here re-derives either.
 */
export function fantasyRowsFromArtifact(
  rows: WeeklyFantasyProjectionProductionArtifact["rows"] | null,
): Partial<Record<WeeklyDashboardPosition, readonly WeeklyRankingRow[]>> | undefined {
  if (!rows) return undefined;
  return Object.fromEntries(
    WEEKLY_RANKING_POSITIONS.map((position) => [
      position,
      rows[position].map((row): WeeklyRankingRow => ({
        key: row.playerId,
        rank: row.positionRank,
        player: row.playerName,
        position,
        teamAbbr: row.team,
        projectedPpg: row.projectedFantasyPoints,
        opponent: null,
        opponentLabel: opponentLabel(row.homeAway, row.opponent),
        fpa: null,
        grade: null,
        stats: [],
      })),
    ]),
  );
}
