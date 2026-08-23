import { normalizeNflTeamAbbr } from "@/lib/fantasy/weekly/identity";
import { resolveProductionProjectionIdentity, type ProductionIdentitySourceRow } from "@/lib/fantasy/weekly/productionIdentity";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

/**
 * Phase 3 Week 1 2026 SHADOW player-universe builder. Deliberately reuses the
 * SAME identity-resolution primitive (`resolveProductionProjectionIdentity`)
 * and the same three current-2026 sources (ROS consensus, nflverse players,
 * nflverse weekly roster) as the production weekly-rankings generator
 * (`scripts/generate-fantasy-weekly-rankings.ts`) so shadow and production
 * agree on who a player is -- but this module is net-new, read-only with
 * respect to those sources, and never imports or calls the production
 * generator/authority code. It builds ONLY pregame-known identity/schedule
 * facts (never Week 1 stats, snaps, or roster changes discovered after
 * kickoff).
 */

const SUPPORTED_POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];

export type Week1RosterSourceRow = {
  gsis_id: string; pfr_id: string; full_name: string; position: string; team: string; status: string;
  week: string; game_type: string;
};
export type Week1PlayerSourceRow = {
  gsis_id: string; pfr_id: string; display_name: string; position: string; team_abbr: string; status: string;
};
export type Week1ParSourceRow = {
  Player: string; Team: string; Position: string; "2026 Projected PPG": number;
  "Source ID": string; "Consensus Position Rank": number;
};
export type Week1ScheduleGame = {
  gameId: string; season: number; week: number; seasonType: string;
  homeAbbr: string; awayAbbr: string; neutralSite: boolean;
};

export type Week1ShadowCandidate = {
  playerKey: string;
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  team: string;
  opponent: string;
  homeAway: "home" | "away" | "neutral";
  rosProjectedPpg: number;
  rosConsensusRank: number;
};

export type Week1UnresolvedCandidate = {
  playerKey: string;
  playerName: string;
  position: FantasyPosition;
  reason: string;
};

export type Week1UniverseResult = {
  resolved: readonly Week1ShadowCandidate[];
  unresolved: readonly Week1UnresolvedCandidate[];
  duplicateGsisIds: readonly string[];
};

export function buildWeek1ShadowUniverse(input: {
  season: number;
  week: number;
  par: readonly Week1ParSourceRow[];
  players: readonly Week1PlayerSourceRow[];
  roster: readonly Week1RosterSourceRow[];
  games: readonly Week1ScheduleGame[];
}): Week1UniverseResult {
  const identityPlayers: ProductionIdentitySourceRow[] = input.players.map((row) => ({
    gsisId: row.gsis_id || null, pfrId: row.pfr_id || null, playerName: row.display_name,
    position: row.position, team: row.team_abbr || null, status: row.status || null,
  }));
  const rosterRows = input.roster.filter(
    (row) => Number(row.week) === input.week && String(row.game_type).toUpperCase() === "REG",
  );
  const identityRoster: ProductionIdentitySourceRow[] = rosterRows.map((row) => ({
    gsisId: row.gsis_id || null, pfrId: row.pfr_id || null, playerName: row.full_name,
    position: row.position, team: row.team || null, status: row.status || null,
  }));

  const weekGames = input.games.filter(
    (game) => game.season === input.season && game.week === input.week && game.seasonType === "REG",
  );
  const gamesByTeam = new Map<string, Week1ScheduleGame>();
  for (const game of weekGames) {
    gamesByTeam.set(game.homeAbbr, game);
    gamesByTeam.set(game.awayAbbr, game);
  }

  const resolved: Week1ShadowCandidate[] = [];
  const unresolved: Week1UnresolvedCandidate[] = [];
  const seenGsis = new Map<string, number>();

  for (const row of input.par) {
    const position = row.Position as FantasyPosition;
    if (!SUPPORTED_POSITIONS.includes(position)) continue;
    const playerKey = `pfr:${row["Source ID"]}`;

    const resolution = resolveProductionProjectionIdentity({
      projection: { sourceId: row["Source ID"], playerName: row.Player, position, team: row.Team },
      rosterRows: identityRoster, playerRows: identityPlayers,
    });
    const weeklyRoster = resolution.roster
      ? rosterRows.find((candidate) =>
          String(candidate.gsis_id || "") === String(resolution.roster?.gsisId || "") &&
          candidate.full_name === resolution.roster?.playerName && candidate.position === resolution.roster?.position &&
          normalizeNflTeamAbbr(candidate.team) === normalizeNflTeamAbbr(resolution.roster?.team))
      : undefined;

    const gsis = String(resolution.gsisId || "");
    const playerId = gsis ? `gsis:${gsis}` : null;
    const team = normalizeNflTeamAbbr(weeklyRoster?.team);
    const game = team ? gamesByTeam.get(team) : undefined;

    if (!resolution.resolved || !playerId || !weeklyRoster || !team) {
      unresolved.push({ playerKey, playerName: row.Player, position, reason: resolution.failureReason ?? "unresolved identity" });
      continue;
    }
    if (!game) {
      unresolved.push({ playerKey, playerName: row.Player, position, reason: `no Week ${input.week} ${input.season} schedule game found for team "${team}"` });
      continue;
    }

    const opponent = game.homeAbbr === team ? game.awayAbbr : game.homeAbbr;
    const homeAway: Week1ShadowCandidate["homeAway"] = game.neutralSite ? "neutral" : game.homeAbbr === team ? "home" : "away";

    seenGsis.set(gsis, (seenGsis.get(gsis) ?? 0) + 1);
    resolved.push({
      playerKey, playerId, playerName: row.Player, position, team, opponent, homeAway,
      rosProjectedPpg: row["2026 Projected PPG"], rosConsensusRank: row["Consensus Position Rank"],
    });
  }

  const duplicateGsisIds = [...seenGsis.entries()].filter(([, count]) => count > 1).map(([gsisId]) => gsisId).sort();
  return { resolved, unresolved, duplicateGsisIds };
}
