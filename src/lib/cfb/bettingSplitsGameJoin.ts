import {
  CFB_EXTERNAL_TEAM_MAPPINGS,
  getJkbTeamIdForCfbdName,
} from "../../data/cfb/externalTeamMapping";
import type { CfbGame } from "../../data/cfb/types";
import { joinNormalizedBettingSplit } from "../market/bettingSplitsGameJoin";
import type {
  BettingSplitGameJoinOptions,
  BettingSplitGameJoinResult,
  CanonicalBettingGame,
} from "../market/gameJoinTypes";
import type { NormalizedProviderBettingSplit } from "../market/providers/normalizedProviderBettingSplits";

function cfbKickoffUtc(game: CfbGame): string | null {
  if (game.time === null) return null;
  const timestamp = new Date(`${game.date}T${game.time}:00.000Z`);
  return Number.isNaN(timestamp.valueOf()) ? null : timestamp.toISOString();
}

function canonicalCfbGames(games: readonly CfbGame[]): CanonicalBettingGame[] {
  return games.map((game) => ({
    league: "cfb",
    season: game.season,
    week: game.week,
    jkbGameId: String(game.id),
    awayTeamId: game.awayTeamId,
    homeTeamId: game.homeTeamId,
    kickoffUtc: cfbKickoffUtc(game),
    neutralSite: game.neutralSite,
  }));
}

/** Pure CFB adapter: provider-neutral split -> stringified CFBD game ID -> WU1 snapshot. */
export function joinCfbBettingSplitToGame(
  input: NormalizedProviderBettingSplit,
  games: readonly CfbGame[],
  options: BettingSplitGameJoinOptions = {},
): BettingSplitGameJoinResult {
  const canonicalGames = canonicalCfbGames(games);
  const scheduleTeamIds = new Set(canonicalGames.flatMap((game) => [game.homeTeamId, game.awayTeamId]));
  const fbsTeamIds = new Set(CFB_EXTERNAL_TEAM_MAPPINGS.map((mapping) => mapping.jkbTeamId));
  const resolveTeam = (providerTeamId: string | null, providerTeamName: string | null): string | null => {
    if (providerTeamId !== null) {
      const mapped = (options.providerTeamIdentities ?? []).filter((identity) =>
        identity.league === "cfb" &&
        identity.provider === input.provider &&
        identity.providerTeamId === providerTeamId,
      );
      const targets = [...new Set(mapped.map((identity) => identity.jkbTeamId))];
      if (targets.length > 1) return null;
      if (targets.length === 1) return targets[0];
      if (fbsTeamIds.has(providerTeamId)) return providerTeamId;
      if (/^\d+$/.test(providerTeamId)) {
        const externalOpponentId = `cfbd:${providerTeamId}`;
        if (scheduleTeamIds.has(externalOpponentId)) return externalOpponentId;
      }
    }
    if (providerTeamName === null) return null;
    const controlledNameMatch = getJkbTeamIdForCfbdName(providerTeamName);
    return controlledNameMatch;
  };

  return joinNormalizedBettingSplit(input, "cfb", canonicalGames, resolveTeam, options);
}
