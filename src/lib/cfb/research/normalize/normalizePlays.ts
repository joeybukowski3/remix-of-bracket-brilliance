import {
  getJkbTeamIdForCfbdName,
  normalizeCfbdTeamName,
} from "../../../../data/cfb/externalTeamMapping";
import type { CfbdResearchGameRaw, CfbdResearchPlayRaw, CfbResearchPlay } from "../types";

type GameNameLookup = {
  homeId: string;
  homeTeam: string;
  awayId: string;
  awayTeam: string;
};

function buildGameLookup(games: readonly CfbdResearchGameRaw[]): Map<string, GameNameLookup> {
  const lookup = new Map<string, GameNameLookup>();
  for (const game of games) {
    lookup.set(String(game.id), {
      homeId: String(game.homeId),
      homeTeam: game.homeTeam,
      awayId: String(game.awayId),
      awayTeam: game.awayTeam,
    });
  }
  return lookup;
}

/**
 * CFBD's /plays response carries no numeric team id — only offense/defense
 * name strings. Resolve the numeric external id by matching the play's
 * side name against the parent game's home/away team name (normalized the
 * same way externalTeamMapping folds CFBD names, since exact string casing
 * can differ). Returns null (never fabricated) when neither side matches.
 */
function resolveExternalId(sideName: string, game: GameNameLookup | undefined): string | null {
  if (!game) return null;
  const folded = normalizeCfbdTeamName(sideName);
  if (folded === normalizeCfbdTeamName(game.homeTeam)) return game.homeId;
  if (folded === normalizeCfbdTeamName(game.awayTeam)) return game.awayId;
  return null;
}

export function normalizeResearchPlays(
  plays: readonly CfbdResearchPlayRaw[],
  games: readonly CfbdResearchGameRaw[],
  season: number,
  week: number,
): CfbResearchPlay[] {
  const gameLookup = buildGameLookup(games);
  return plays.map((play): CfbResearchPlay => {
    const game = gameLookup.get(String(play.gameId));
    const offenseExternalId = resolveExternalId(play.offense, game);
    const defenseExternalId = resolveExternalId(play.defense, game);
    return {
      playId: play.id,
      gameId: String(play.gameId),
      driveId: play.driveId != null ? String(play.driveId) : null,
      season,
      week,
      offenseExternalId,
      defenseExternalId,
      offenseTeamId: getJkbTeamIdForCfbdName(play.offense),
      defenseTeamId: getJkbTeamIdForCfbdName(play.defense),
      offenseName: play.offense,
      defenseName: play.defense,
      period: play.period ?? null,
      clockMinutes: play.clock?.minutes ?? null,
      clockSeconds: play.clock?.seconds ?? null,
      down: play.down ?? null,
      distance: play.distance ?? null,
      yardLine: play.yardline ?? null,
      yardsToGoal: play.yardsToGoal ?? null,
      yardsGained: play.yardsGained ?? null,
      offenseScore: play.offenseScore ?? null,
      defenseScore: play.defenseScore ?? null,
      rawPlayType: play.playType ?? null,
      providerPpa: typeof play.ppa === "number" && Number.isFinite(play.ppa) ? play.ppa : null,
      providerSuccess: null,
      providerGarbageTime: null,
      providerScoringFlag: play.scoring ?? null,
    };
  });
}
