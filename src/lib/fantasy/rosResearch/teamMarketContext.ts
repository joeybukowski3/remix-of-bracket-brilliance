/**
 * ROS projection authority -- Phase 2.3 / 2.5 team and remaining-schedule
 * scoring environment (shadow research inputs). Reuses the already-approved
 * implied-team-total derivation (`weekly/impliedTeamTotals.ts`) against the
 * committed market snapshot. A single weekly implied total is never treated
 * as season-long authority: every team gets the full list of games with
 * available market data plus an explicit coverage fraction, never a single
 * collapsed "current" number.
 */
import { deriveImpliedTeamTotals } from "@/lib/fantasy/weekly/impliedTeamTotals";
import { normalizeNflTeamAbbr } from "@/lib/fantasy/weekly/identity";

export const ROS_TEAM_MARKET_CONTEXT_SCHEMA_VERSION = "ros-team-market-context-v1" as const;

export type TeamMarketSourceGame = {
  gameId: string;
  week: number;
  homeAbbr: string;
  awayAbbr: string;
  neutralSite: boolean;
  spread: { home: number | null; away: number | null };
  total: number | null;
};

export type TeamGameEnvironment = {
  gameId: string;
  week: number;
  opponent: string;
  homeAway: "home" | "away";
  impliedTeamTotal: number | null;
};

export type TeamMarketContext = {
  team: string;
  scheduledGames: number;
  games: TeamGameEnvironment[];
  coverage: { gamesWithMarketData: number; gamesScheduled: number; fraction: number };
};

export type TeamMarketContextResult = {
  teams: TeamMarketContext[];
  counts: {
    totalTeams: number;
    totalScheduledGames: number;
    totalGamesWithMarketData: number;
    overallFraction: number;
  };
};

export function buildTeamMarketContext(
  games: readonly TeamMarketSourceGame[],
  teams: readonly string[],
  provenance: { source: string; generatedAt: string },
): TeamMarketContextResult {
  const normalizedTeams = [...new Set(teams.map((team) => normalizeNflTeamAbbr(team)).filter((team): team is string => Boolean(team)))].sort();

  const teamContexts: TeamMarketContext[] = normalizedTeams.map((team) => {
    const teamGames = games.filter((game) => {
      const home = normalizeNflTeamAbbr(game.homeAbbr);
      const away = normalizeNflTeamAbbr(game.awayAbbr);
      return home === team || away === team;
    });

    const rows: TeamGameEnvironment[] = teamGames.map((game) => {
      const home = normalizeNflTeamAbbr(game.homeAbbr);
      const isHome = home === team;
      const opponent = isHome ? normalizeNflTeamAbbr(game.awayAbbr) ?? game.awayAbbr : home ?? game.homeAbbr;
      const implied = deriveImpliedTeamTotals(
        { spread: game.spread, total: game.total, neutralSite: game.neutralSite },
        { source: provenance.source, generatedAt: provenance.generatedAt, perRowTimestampAvailable: false },
      );
      const impliedTeamTotal = implied ? (isHome ? implied.home : implied.away) : null;
      return { gameId: game.gameId, week: game.week, opponent, homeAway: isHome ? "home" : "away", impliedTeamTotal };
    }).sort((a, b) => a.week - b.week);

    const gamesWithMarketData = rows.filter((row) => row.impliedTeamTotal !== null).length;
    return {
      team,
      scheduledGames: rows.length,
      games: rows,
      coverage: { gamesWithMarketData, gamesScheduled: rows.length, fraction: rows.length ? gamesWithMarketData / rows.length : 0 },
    };
  });

  const totalScheduledGames = teamContexts.reduce((sum, team) => sum + team.scheduledGames, 0);
  const totalGamesWithMarketData = teamContexts.reduce((sum, team) => sum + team.coverage.gamesWithMarketData, 0);

  return {
    teams: teamContexts,
    counts: {
      totalTeams: teamContexts.length,
      totalScheduledGames,
      totalGamesWithMarketData,
      overallFraction: totalScheduledGames ? totalGamesWithMarketData / totalScheduledGames : 0,
    },
  };
}
