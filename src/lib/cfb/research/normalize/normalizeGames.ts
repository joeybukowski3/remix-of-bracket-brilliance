import { getJkbTeamIdForCfbdName } from "../../../../data/cfb/externalTeamMapping";
import type { CfbdResearchGameRaw, CfbResearchGame, CfbResearchGameType } from "../types";

/**
 * Mirrors src/lib/cfb/pipeline/normalizeCfbd.ts's private classifyGame —
 * duplicated rather than imported/exported-and-shared because the
 * production classifier is intentionally private to that module and this
 * Work Unit avoids risky production refactors (see Stage 6 instructions).
 * Keep in sync manually if CFBD's `notes`/`playoff` conventions change.
 */
export function classifyResearchGame(game: CfbdResearchGameRaw): CfbResearchGameType {
  const note = (game.notes ?? "").toLowerCase();
  if (game.playoff != null || /college football playoff|cfp|national championship/.test(note)) {
    return "playoff";
  }
  if (/\bchampionship(?: game)?\b/.test(note)) return "conference_championship";
  if (game.seasonType.endsWith("regular")) return "regular";
  if (/\bbowl\b/.test(note)) return "bowl";
  return "other_postseason";
}

export function normalizeResearchGames(games: readonly CfbdResearchGameRaw[]): CfbResearchGame[] {
  return games.map((game) => ({
    gameId: String(game.id),
    season: game.season,
    week: game.week,
    seasonType: game.seasonType,
    kickoffUtc: game.startTimeTBD ? null : game.startDate,
    homeExternalId: String(game.homeId),
    awayExternalId: String(game.awayId),
    homeTeamId: getJkbTeamIdForCfbdName(game.homeTeam),
    awayTeamId: getJkbTeamIdForCfbdName(game.awayTeam),
    homeConference: game.homeConference ?? null,
    awayConference: game.awayConference ?? null,
    homeClassification: game.homeClassification ?? null,
    awayClassification: game.awayClassification ?? null,
    neutralSite: game.neutralSite,
    homeScore: game.homePoints ?? null,
    awayScore: game.awayPoints ?? null,
    status: game.completed ? "final" : "scheduled",
    gameType: classifyResearchGame(game),
  }));
}
