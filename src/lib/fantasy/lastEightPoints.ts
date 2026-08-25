import type { FantasyPosition } from "@/lib/fantasy/rankings";

export type LastEightEligibleGame = {
  season: number;
  week: number;
  seasonType: string;
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  fantasyPoints: number;
  externalIds?: {
    gsis: string;
    pfr: string | null;
    espn: string | null;
  };
};

export type LastEightPointsRank = {
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  totalPoints: number;
  sampleSize: number;
  games: readonly { season: number; week: number; fantasyPoints: number }[];
  rank: number;
  poolSize: number;
  externalIds?: LastEightEligibleGame["externalIds"];
};

const SUPPORTED_POSITIONS = new Set<FantasyPosition>(["QB", "RB", "WR", "TE"]);
const ELIGIBLE_SEASON = 2025;

/**
 * Builds positional ranks from each player's last eight available 2025
 * regular-season game rows. The rank basis is TOTAL points, never PPG. Equal
 * totals share a competition rank; canonical player ID makes every sort
 * deterministic.
 */
export function buildLastEightPointsRanks(
  games: readonly LastEightEligibleGame[],
): readonly LastEightPointsRank[] {
  const byPlayer = new Map<string, LastEightEligibleGame[]>();

  for (const game of games) {
    if (
      game.seasonType.toUpperCase() !== "REG" ||
      game.season !== ELIGIBLE_SEASON ||
      !game.playerId ||
      !SUPPORTED_POSITIONS.has(game.position) ||
      !Number.isInteger(game.season) ||
      !Number.isInteger(game.week) ||
      !Number.isFinite(game.fantasyPoints)
    ) {
      continue;
    }
    const prior = byPlayer.get(game.playerId) ?? [];
    prior.push(game);
    byPlayer.set(game.playerId, prior);
  }

  const summaries = [...byPlayer.values()].map((playerGames) => {
    const ordered = [...playerGames].sort(
      (a, b) => b.week - a.week || a.playerId.localeCompare(b.playerId),
    );
    const eligible = ordered.slice(0, 8);
    const identity = eligible[0];
    return {
      playerId: identity.playerId,
      playerName: identity.playerName,
      position: identity.position,
      totalPoints: eligible.reduce((sum, game) => sum + game.fantasyPoints, 0),
      sampleSize: eligible.length,
      games: eligible.map((game) => ({
        season: game.season,
        week: game.week,
        fantasyPoints: game.fantasyPoints,
      })),
      externalIds: identity.externalIds,
    };
  });

  const ranked: LastEightPointsRank[] = [];
  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    const pool = summaries
      .filter((summary) => summary.position === position)
      .sort(
        (a, b) =>
          b.totalPoints - a.totalPoints ||
          a.playerId.localeCompare(b.playerId),
      );
    let priorTotal: number | null = null;
    let priorRank = 0;
    pool.forEach((summary, index) => {
      const rank = priorTotal !== null && summary.totalPoints === priorTotal
        ? priorRank
        : index + 1;
      priorTotal = summary.totalPoints;
      priorRank = rank;
      ranked.push({ ...summary, rank, poolSize: pool.length });
    });
  }

  return ranked.sort(
    (a, b) =>
      a.position.localeCompare(b.position) ||
      a.rank - b.rank ||
      a.playerId.localeCompare(b.playerId),
  );
}
