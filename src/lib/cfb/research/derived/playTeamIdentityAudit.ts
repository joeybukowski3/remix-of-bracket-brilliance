import { normalizeCfbdTeamName } from "../../../../data/cfb/externalTeamMapping";
import type { CfbdResearchGameRaw, CfbdResearchPlayRaw } from "../types";
import type { PlayTeamIdentityAuditRow, PlayTeamIdentityStatus, SeasonPlayTeamIdentityReport } from "./types";

type GameNames = { homeId: string; homeTeam: string; awayId: string; awayTeam: string };

function buildGameLookup(games: readonly CfbdResearchGameRaw[]): Map<string, GameNames> {
  const lookup = new Map<string, GameNames>();
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
 * Independent re-derivation of the offense/defense identity match used by
 * normalizePlays.ts — deliberately not calling that module, so this QA
 * check cross-verifies the resolution logic rather than trusting it.
 */
function auditPlay(play: CfbdResearchPlayRaw, game: GameNames | undefined): PlayTeamIdentityStatus {
  if (!game) return "unresolved";
  const home = normalizeCfbdTeamName(game.homeTeam);
  const away = normalizeCfbdTeamName(game.awayTeam);
  if (home === away) return "ambiguous"; // degenerate game record — cannot disambiguate any play in it

  const offense = normalizeCfbdTeamName(play.offense);
  const defense = normalizeCfbdTeamName(play.defense);
  const offenseSide = offense === home ? "home" : offense === away ? "away" : null;
  const defenseSide = defense === home ? "home" : defense === away ? "away" : null;

  if (offenseSide === null || defenseSide === null) return "unresolved";
  if (offenseSide === defenseSide) return "invalid_pairing";
  return "resolved";
}

export function auditPlayTeamIdentity(
  plays: readonly CfbdResearchPlayRaw[],
  games: readonly CfbdResearchGameRaw[],
): PlayTeamIdentityAuditRow[] {
  const gameLookup = buildGameLookup(games);
  return plays.map((play) => ({
    gameId: String(play.gameId),
    playId: play.id,
    status: auditPlay(play, gameLookup.get(String(play.gameId))),
  }));
}

/**
 * Counts (gameId, rawOffenseOrDefenseName) pairs that resolved to more than
 * one distinct external id within the same game — should always be zero
 * given resolution is a pure function of (name, game), but is checked
 * directly rather than assumed.
 */
export function countInconsistentMappings(
  plays: readonly CfbdResearchPlayRaw[],
  games: readonly CfbdResearchGameRaw[],
): number {
  const gameLookup = buildGameLookup(games);
  const seen = new Map<string, Set<string>>();
  for (const play of plays) {
    const game = gameLookup.get(String(play.gameId));
    if (!game) continue;
    for (const [rawName, side] of [
      [play.offense, "offense"],
      [play.defense, "defense"],
    ] as const) {
      const normalized = normalizeCfbdTeamName(rawName);
      const home = normalizeCfbdTeamName(game.homeTeam);
      const away = normalizeCfbdTeamName(game.awayTeam);
      const resolvedId = normalized === home ? game.homeId : normalized === away ? game.awayId : null;
      if (resolvedId === null) continue;
      const key = `${play.gameId}:${normalized}:${side}`;
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key)!.add(resolvedId);
    }
  }
  let inconsistent = 0;
  for (const ids of seen.values()) {
    if (ids.size > 1) inconsistent += 1;
  }
  return inconsistent;
}

export function buildSeasonPlayTeamIdentityReport(
  season: number,
  rows: readonly PlayTeamIdentityAuditRow[],
  inconsistentMappingCount: number,
): SeasonPlayTeamIdentityReport {
  const resolvedPlays = rows.filter((r) => r.status === "resolved").length;
  const unresolvedPlays = rows.filter((r) => r.status === "unresolved").length;
  const ambiguousPlays = rows.filter((r) => r.status === "ambiguous").length;
  const invalidPairingPlays = rows.filter((r) => r.status === "invalid_pairing").length;
  const totalPlays = rows.length;
  return {
    season,
    totalPlays,
    resolvedPlays,
    unresolvedPlays,
    ambiguousPlays,
    invalidPairingPlays,
    inconsistentMappingCount,
    resolutionPct: totalPlays === 0 ? 0 : Math.round((resolvedPlays / totalPlays) * 10_000) / 100,
  };
}
