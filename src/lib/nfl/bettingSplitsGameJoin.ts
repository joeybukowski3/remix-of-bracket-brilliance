import type { NormalizedProviderBettingSplit } from "../market/providers/normalizedProviderBettingSplits";
import { joinNormalizedBettingSplit } from "../market/bettingSplitsGameJoin";
import type {
  BettingSplitGameJoinOptions,
  BettingSplitGameJoinResult,
  CanonicalBettingGame,
} from "../market/gameJoinTypes";
import { normalizeNflTeamAbbr } from "./identity/identity";
import type { CanonicalNflTeam, NflGameRecord } from "./standings";

export type NflBettingSplitGameJoinOptions = BettingSplitGameJoinOptions & {
  canonicalTeams?: readonly CanonicalNflTeam[];
};

function canonicalNflGames(games: readonly NflGameRecord[]): CanonicalBettingGame[] {
  return games.map((game) => ({
    league: "nfl",
    season: game.season,
    week: game.week,
    jkbGameId: game.gameId,
    awayTeamId: normalizeNflTeamAbbr(game.awayAbbr) ?? game.awayAbbr,
    homeTeamId: normalizeNflTeamAbbr(game.homeAbbr) ?? game.homeAbbr,
    kickoffUtc: game.dateUtc,
    neutralSite: game.neutralSite,
  }));
}

/** Pure NFL adapter: provider-neutral split -> nflverse game identity -> WU1 snapshot. */
export function joinNflBettingSplitToGame(
  input: NormalizedProviderBettingSplit,
  games: readonly NflGameRecord[],
  options: NflBettingSplitGameJoinOptions = {},
): BettingSplitGameJoinResult {
  const canonicalGames = canonicalNflGames(games);
  const teams = options.canonicalTeams ?? [];
  const exactCatalogValue = (value: string): string | null => {
    const normalized = value.trim().toLowerCase();
    const team = teams.find((candidate) =>
      [candidate.id, candidate.abbr, candidate.nflverseAbbr, candidate.name, candidate.fullName, candidate.shortName]
        .some((field) => field.trim().toLowerCase() === normalized),
    );
    return team ? normalizeNflTeamAbbr(team.abbr) : null;
  };
  const normalizeScheduleTeam = (value: string): string | null => {
    const fromCatalog = exactCatalogValue(value);
    if (fromCatalog) return fromCatalog;
    return /^[a-z]{2,3}$/i.test(value.trim()) ? normalizeNflTeamAbbr(value) : null;
  };
  const resolveTeam = (providerTeamId: string | null, providerTeamName: string | null): string | null => {
    if (providerTeamId !== null) {
      const mapped = (options.providerTeamIdentities ?? []).filter((identity) =>
        identity.league === "nfl" &&
        identity.provider === input.provider &&
        identity.providerTeamId === providerTeamId,
      );
      const targets = [...new Set(mapped.map((identity) => identity.jkbTeamId))];
      if (targets.length > 1) return null;
      if (targets.length === 1) return normalizeScheduleTeam(targets[0]);
      const direct = normalizeScheduleTeam(providerTeamId);
      if (direct !== null) return direct;
      return null;
    }
    return providerTeamName === null ? null : normalizeScheduleTeam(providerTeamName);
  };

  return joinNormalizedBettingSplit(input, "nfl", canonicalGames, resolveTeam, options);
}
