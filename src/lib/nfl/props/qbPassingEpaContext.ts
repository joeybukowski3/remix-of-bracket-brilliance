import { gameJoinKey, type NflGameJoinRecord } from "./historicalOutcomes";

/**
 * Team-level pass-EPA context for Phase 4 (own-team and opponent-allowed).
 * Reads the already-committed, already-approved `epa-team-game` compact
 * cache (nflfastR `epa`, never recomputed -- see `nfl-epa-core.mjs`). No
 * QB-level EPA exists in this repo (would require the same
 * `passer_player_id` PBP attribution gap documented in Phase 3's target
 * decision), so this is team-level context only, not a QB efficiency
 * feature -- kept in its own "opponentPassDefense"/context role, never
 * relabelled as QB skill.
 *
 * Deliberately a small, standalone window-selection implementation rather
 * than generalizing `teamPlayVolume.ts`'s typed functions onto a second
 * record shape -- a bounded amount of duplication, chosen over a riskier
 * generic refactor of already-approved Phase 2 code.
 */
export type NflTeamEpaGameRecord = {
  gameId: string;
  season: number;
  week: number;
  team: string;
  opponent: string;
  passEpa: number;
  passPlays: number;
};

export type NflTeamEpaGameLogEntry = NflTeamEpaGameRecord & { gameDateUtc: string };

export function buildTeamEpaGameLog(
  records: readonly NflTeamEpaGameRecord[],
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
): NflTeamEpaGameLogEntry[] {
  return records.map((record) => {
    const join = gameJoinIndex.get(gameJoinKey(record.season, record.week, record.team));
    if (!join) {
      throw new Error(`No schedule entry for ${record.team} season ${record.season} week ${record.week} (EPA context).`);
    }
    return { ...record, gameDateUtc: join.gameDateUtc };
  });
}

export function selectPriorEpaGamesInSeason(
  log: readonly NflTeamEpaGameLogEntry[], team: string, season: number, beforeDateUtc: string,
): NflTeamEpaGameLogEntry[] {
  return log
    .filter((e) => e.team === team && e.season === season && e.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
}

export function selectPriorEpaGamesAsOpponent(
  log: readonly NflTeamEpaGameLogEntry[], team: string, season: number, beforeDateUtc: string,
): NflTeamEpaGameLogEntry[] {
  return log
    .filter((e) => e.opponent === team && e.season === season && e.gameDateUtc < beforeDateUtc)
    .sort((a, b) => a.gameDateUtc.localeCompare(b.gameDateUtc));
}

export function selectPriorSeasonEpaGames(
  log: readonly NflTeamEpaGameLogEntry[], team: string, priorSeason: number,
): NflTeamEpaGameLogEntry[] {
  return log.filter((e) => e.team === team && e.season === priorSeason);
}

export function selectPriorSeasonEpaGamesAsOpponent(
  log: readonly NflTeamEpaGameLogEntry[], team: string, priorSeason: number,
): NflTeamEpaGameLogEntry[] {
  return log.filter((e) => e.opponent === team && e.season === priorSeason);
}

export function sumEpaWindow(games: readonly NflTeamEpaGameRecord[]): { gamesIncluded: number; passEpaPerPlay: number | null } {
  if (games.length === 0) return { gamesIncluded: 0, passEpaPerPlay: null };
  let epa = 0;
  let plays = 0;
  for (const g of games) {
    epa += g.passEpa;
    plays += g.passPlays;
  }
  return { gamesIncluded: games.length, passEpaPerPlay: plays > 0 ? epa / plays : null };
}
