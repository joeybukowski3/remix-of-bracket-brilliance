/**
 * Team Schedules page data layer.
 *
 * Derives one team's full-season schedule from the existing generated
 * schedule (public/data/nfl/<season>/games.json, via useNflSeasonData) and the
 * normalized guide/power-rating source (getNflSeasonGuide) — the same two
 * sources buildWeekMatchups joins for the Weekly Matchups pages.
 *
 * No new schedule, identity, or rating data is created here. Records, current
 * ratings and projections are looked up by the consuming page from the same
 * canonical hooks every other NFL surface reads (deriveStandings,
 * useNflCurrentRating2026, useNflMatchupProjections) and passed in.
 *
 * Named teamScheduleView (not teamSchedule) to avoid colliding with the
 * pre-existing src/lib/nfl/teamSchedule.ts ESPN-schedule normalizer used by
 * the team dashboard (NflScheduleGameCard / NflScheduleSection) — a
 * completely different data source with no relation to this page.
 */

import { buildMatchupFromGame } from "@/lib/nfl/matchups";
import type { NflGameRecord } from "@/lib/nfl/standings";
import type { NflSeasonGuide, NflGuideTeamNormalized } from "@/lib/nfl/guideData";

export type TeamScheduleLocation = "HOME" | "AWAY" | "NEUTRAL";

export type TeamScheduleRow = {
  gameId: string;
  week: number;
  seasonType: string;
  kickoffUtc: string | null;
  status: "final" | "scheduled";
  /** HOME/AWAY relative to the selected team; NEUTRAL when nflverse's own location column says so. */
  location: TeamScheduleLocation;
  opponent: NflGuideTeamNormalized;
  /** Deterministic slug for the existing /nfl/matchups/:gameSlug route. */
  matchupSlug: string;
};

/**
 * Full regular-season schedule for one team, chronologically ordered.
 * Games whose teams cannot be resolved against the guide are skipped (same
 * malformed-row policy as buildWeekMatchups) rather than rendered blank.
 */
export function buildTeamSchedule(
  teamAbbr: string,
  games: NflGameRecord[],
  guide: NflSeasonGuide
): TeamScheduleRow[] {
  const teamGames = games
    .filter(
      (game) =>
        game.seasonType === "REG" && (game.homeAbbr === teamAbbr || game.awayAbbr === teamAbbr)
    )
    .sort((a, b) => a.week - b.week || a.gameId.localeCompare(b.gameId));

  const rows: TeamScheduleRow[] = [];
  for (const game of teamGames) {
    const matchup = buildMatchupFromGame(game, guide);
    if (!matchup) {
      if (import.meta.env?.DEV) {
        console.warn(`[teamScheduleView] skipped ${game.gameId}: unresolved team (${game.awayAbbr} @ ${game.homeAbbr})`);
      }
      continue;
    }
    const isHome = game.homeAbbr === teamAbbr;
    const opponent = isHome ? matchup.away : matchup.home;
    const location: TeamScheduleLocation = game.neutralSite ? "NEUTRAL" : isHome ? "HOME" : "AWAY";

    rows.push({
      gameId: game.gameId,
      week: game.week,
      seasonType: game.seasonType,
      kickoffUtc: game.dateUtc,
      status: game.status,
      location,
      opponent,
      matchupSlug: matchup.slug,
    });
  }
  return rows;
}
