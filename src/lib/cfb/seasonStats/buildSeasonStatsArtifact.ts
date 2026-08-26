import type { CfbSeasonStats } from "../../../data/cfb/types";
import { CFB_TEAM_METADATA } from "../../../data/cfb/teamMetadata";
import { getJkbTeamIdForCfbdName } from "../../../data/cfb/externalTeamMapping";
import { extractGameTeamStatLine, type CfbdRawTeamStatEntry } from "./parseGameTeamStats";
import { aggregateTeamSeasonStats, type CfbTeamGameStatRow } from "./aggregateSeasonStats";
import {
  computeCompetitionRanks,
  CFB_SEASON_STAT_RANK_DIRECTIONS,
  type CfbRankedStatMetric,
} from "./rankSeasonStats";

/** Minimal shape this module needs from the raw CFBD /games cache. */
export type CfbdRawGame = {
  id: number;
  season: number;
  completed: boolean;
  homeId: number;
  homeTeam: string;
  homeClassification?: string | null;
  awayId: number;
  awayTeam: string;
  awayClassification?: string | null;
};

/** Minimal shape this module needs from the raw CFBD /games/teams cache. */
export type CfbdRawGameTeamStats = {
  id: number;
  teams: Array<{
    teamId: number;
    team: string;
    homeAway: "home" | "away";
    points?: number | null;
    stats: CfbdRawTeamStatEntry[];
  }>;
};

export type CfbSeasonStatsArtifact = {
  schemaVersion: "jkb-cfb-season-stats-v1";
  season: number;
  source: "cfbd:/games/teams";
  /** ISO timestamp of this build run — never a fabricated source publication date. */
  generatedAt: string;
  gamesPlayed: number;
  teams: Array<{
    teamId: string;
    stats: CfbSeasonStats;
    ranks: Partial<Record<CfbRankedStatMetric, number>>;
  }>;
  diagnostics: {
    totalRawGames: number;
    completedGames: number;
    skippedGames: Array<{ gameId: string; reason: string }>;
    teamsWithGames: number;
    teamsWithZeroGames: number;
  };
};

export type CfbSeasonStatsBuildResult =
  | { ok: true; artifact: CfbSeasonStatsArtifact }
  | { ok: false; errors: string[] };

const CANONICAL_TEAM_IDS = CFB_TEAM_METADATA.map((team) => team.id).sort();

function resolveTeamId(cfbdId: number, cfbdName: string, byCfbdId: ReadonlyMap<number, string>): string | null {
  return byCfbdId.get(cfbdId) ?? getJkbTeamIdForCfbdName(cfbdName);
}

/**
 * Builds one season's normalized, ranked stats artifact from raw CFBD
 * caches. Pure and synchronous — no network calls, no filesystem access; the
 * caller (scripts/cfb-build-season-stats.ts) owns I/O and last-known-good
 * handling.
 *
 * Inclusion policy: every COMPLETED game for a canonical FBS team counts
 * toward that team's season totals, regardless of the opponent's
 * classification (FBS or FCS). This matches the existing V1/V1.1 ratings
 * pipeline's convention (src/lib/cfb/pipeline/normalizeCfbd.ts
 * buildPreseasonModelInputs -> summarizePriorRows, which does not exclude
 * FCS opponents from a team's own season summary) and matches how fans
 * expect "season stats" to read — a team's PPG includes its FCS games.
 * Postseason games are included too (game-team-stats is season-scoped, not
 * regular-season-only, and a team's bowl/playoff performance is part of
 * its season).
 */
export function buildSeasonStatsArtifact(options: {
  season: number;
  games: readonly CfbdRawGame[];
  gameTeamStats: readonly CfbdRawGameTeamStats[];
  generatedAt: string;
}): CfbSeasonStatsBuildResult {
  const { season, games, gameTeamStats, generatedAt } = options;
  const errors: string[] = [];

  const seasonMismatches = games.filter((game) => game.season !== season);
  if (seasonMismatches.length > 0) {
    return {
      ok: false,
      errors: [
        `season mismatch: expected all games to be season ${season}, found ${seasonMismatches.length} row(s) with a different season (fail closed)`,
      ],
    };
  }

  const byCfbdId = new Map<number, string>();
  for (const game of games) {
    const homeId = getJkbTeamIdForCfbdName(game.homeTeam);
    const awayId = getJkbTeamIdForCfbdName(game.awayTeam);
    if (homeId) byCfbdId.set(game.homeId, homeId);
    if (awayId) byCfbdId.set(game.awayId, awayId);
  }

  const gameById = new Map(games.map((game) => [game.id, game]));
  const rowsByTeam = new Map<string, CfbTeamGameStatRow[]>();
  const skippedGames: Array<{ gameId: string; reason: string }> = [];
  let completedGames = 0;

  for (const statsGame of gameTeamStats) {
    const game = gameById.get(statsGame.id);
    if (!game) {
      skippedGames.push({ gameId: String(statsGame.id), reason: "no matching row in raw /games cache" });
      continue;
    }
    if (!game.completed) continue; // not yet played — silently excluded, not an error
    if (statsGame.teams.length !== 2) {
      skippedGames.push({
        gameId: String(statsGame.id),
        reason: `expected 2 team rows, found ${statsGame.teams.length}`,
      });
      continue;
    }
    completedGames += 1;

    const [rowA, rowB] = statsGame.teams;
    for (const [teamRow, opponentRow] of [
      [rowA, rowB],
      [rowB, rowA],
    ] as const) {
      const teamId = resolveTeamId(teamRow.teamId, teamRow.team, byCfbdId);
      if (teamId === null) continue; // non-FBS/unmapped team — not part of the 138-team artifact
      if (!CANONICAL_TEAM_IDS.includes(teamId)) continue;

      const row: CfbTeamGameStatRow = {
        gameId: String(statsGame.id),
        teamId,
        points: teamRow.points ?? null,
        opponentPoints: opponentRow.points ?? null,
        own: extractGameTeamStatLine(teamRow.stats),
        opponent: extractGameTeamStatLine(opponentRow.stats),
      };
      const existing = rowsByTeam.get(teamId);
      if (existing) existing.push(row);
      else rowsByTeam.set(teamId, [row]);
    }
  }

  const teamStats = CANONICAL_TEAM_IDS.map((teamId) =>
    aggregateTeamSeasonStats(teamId, rowsByTeam.get(teamId) ?? []),
  );

  // Coverage invariant: every canonical FBS team must have a row (possibly
  // all-null with gamesPlayed: 0), no duplicates, deterministic order.
  const seen = new Set<string>();
  for (const stats of teamStats) {
    if (seen.has(stats.teamId)) errors.push(`duplicate team id in artifact: ${stats.teamId}`);
    seen.add(stats.teamId);
  }
  if (teamStats.length !== CANONICAL_TEAM_IDS.length) {
    errors.push(
      `expected ${CANONICAL_TEAM_IDS.length} teams, produced ${teamStats.length} — refusing to publish`,
    );
  }
  if (errors.length > 0) return { ok: false, errors };

  const ranksByTeam = new Map<string, Partial<Record<CfbRankedStatMetric, number>>>(
    CANONICAL_TEAM_IDS.map((teamId) => [teamId, {}]),
  );
  for (const metric of Object.keys(CFB_SEASON_STAT_RANK_DIRECTIONS) as CfbRankedStatMetric[]) {
    const direction = CFB_SEASON_STAT_RANK_DIRECTIONS[metric];
    const entries = teamStats.map((stats) => ({ teamId: stats.teamId, value: stats[metric] }));
    const ranks = computeCompetitionRanks(entries, direction);
    for (const [teamId, rank] of ranks) {
      const bucket = ranksByTeam.get(teamId);
      if (bucket) bucket[metric] = rank;
    }
  }

  const teamsWithGames = teamStats.filter((stats) => stats.gamesPlayed > 0).length;

  return {
    ok: true,
    artifact: {
      schemaVersion: "jkb-cfb-season-stats-v1",
      season,
      source: "cfbd:/games/teams",
      generatedAt,
      gamesPlayed: completedGames,
      teams: teamStats.map((stats) => ({
        teamId: stats.teamId,
        stats,
        ranks: ranksByTeam.get(stats.teamId) ?? {},
      })),
      diagnostics: {
        totalRawGames: games.length,
        completedGames,
        skippedGames,
        teamsWithGames,
        teamsWithZeroGames: teamStats.length - teamsWithGames,
      },
    },
  };
}
