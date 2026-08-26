/**
 * Strict provider-to-roster identity resolution for Phase 10B canonical NFL
 * yardage markets.
 *
 * ParlayAPI supplies only a free-text player name plus the game's home/away
 * team full names -- no gsis id, no team abbreviation for the player. A
 * canonical market entry is only trustworthy if it resolves to a REAL,
 * unambiguous roster player via all of:
 *
 *   1. normalized name match against the current depth-chart roster
 *   2. the player's roster team is one of the two teams in this event
 *   3. the event's team pair matches an actual scheduled game
 *   4. the player's roster position is plausible for the market
 *      (see `MARKET_PLAUSIBLE_POSITIONS` in nfl-prop-line-selection.mjs)
 *
 * Name-only matching is never sufficient -- a normalized name with zero,
 * two, or more roster candidates surviving all four checks is unresolved,
 * not guessed at.
 */
import { normalizeNflPropName } from "./nfl-prop-name-normalizer.mjs";

/**
 * @param {readonly {gameId:string, week:number, homeTeam:string, awayTeam:string, homeAbbr:string, awayAbbr:string}[]} games
 * @returns {{ teamNameToAbbr: Map<string,string>, gameByTeamPair: Map<string, object> }}
 */
export function buildGameIndex(games) {
  const teamNameToAbbr = new Map();
  const gameByTeamPair = new Map();
  for (const game of Array.isArray(games) ? games : []) {
    const homeAbbr = String(game.homeAbbr ?? "").toLowerCase();
    const awayAbbr = String(game.awayAbbr ?? "").toLowerCase();
    if (!homeAbbr || !awayAbbr) continue;
    if (game.homeTeam) teamNameToAbbr.set(String(game.homeTeam).trim().toLowerCase(), homeAbbr);
    if (game.awayTeam) teamNameToAbbr.set(String(game.awayTeam).trim().toLowerCase(), awayAbbr);
    const pairKey = [homeAbbr, awayAbbr].sort().join("|");
    gameByTeamPair.set(pairKey, game);
  }
  return { teamNameToAbbr, gameByTeamPair };
}

/**
 * @param {readonly {team:string, position:string, playerId:string, playerName:string}[]} depthChartEntries
 * @returns {Map<string, {team:string, position:string, playerId:string, playerName:string}[]>}
 */
export function buildRosterNameIndex(depthChartEntries) {
  const index = new Map();
  for (const entry of Array.isArray(depthChartEntries) ? depthChartEntries : []) {
    const key = normalizeNflPropName(entry.playerName);
    if (!key) continue;
    const bucket = index.get(key) ?? [];
    bucket.push(entry);
    index.set(key, bucket);
  }
  return index;
}

/**
 * @param {{ providerName: string, homeTeamFullName: string, awayTeamFullName: string, canonicalMarket: string }} query
 * @param {{ rosterIndex: ReturnType<typeof buildRosterNameIndex>, gameIndex: ReturnType<typeof buildGameIndex>, marketPlausiblePositions: Record<string, readonly string[]> }} context
 */
export function resolvePlayerIdentity(
  { providerName, homeTeamFullName, awayTeamFullName, canonicalMarket },
  { rosterIndex, gameIndex, marketPlausiblePositions },
) {
  const homeAbbr = gameIndex.teamNameToAbbr.get(String(homeTeamFullName ?? "").trim().toLowerCase()) ?? null;
  const awayAbbr = gameIndex.teamNameToAbbr.get(String(awayTeamFullName ?? "").trim().toLowerCase()) ?? null;
  if (!homeAbbr || !awayAbbr) {
    return { resolved: false, reason: "unresolved_game_teams", homeAbbr, awayAbbr };
  }

  const pairKey = [homeAbbr, awayAbbr].sort().join("|");
  const game = gameIndex.gameByTeamPair.get(pairKey) ?? null;
  if (!game) {
    return { resolved: false, reason: "game_not_in_schedule", homeAbbr, awayAbbr };
  }

  const normalizedName = normalizeNflPropName(providerName);
  const nameCandidates = rosterIndex.get(normalizedName) ?? [];
  const inGameCandidates = nameCandidates.filter((c) => c.team === homeAbbr || c.team === awayAbbr);
  if (inGameCandidates.length === 0) {
    return { resolved: false, reason: "no_roster_match_in_game", homeAbbr, awayAbbr, game };
  }

  const plausiblePositions = marketPlausiblePositions[canonicalMarket] ?? [];
  const positionCandidates = inGameCandidates.filter((c) => plausiblePositions.includes(c.position));
  if (positionCandidates.length === 0) {
    return {
      resolved: false,
      reason: "position_mismatch",
      homeAbbr,
      awayAbbr,
      game,
      observedPositions: [...new Set(inGameCandidates.map((c) => c.position))],
    };
  }

  if (positionCandidates.length > 1) {
    return {
      resolved: false,
      reason: "ambiguous_multiple_roster_matches",
      homeAbbr,
      awayAbbr,
      game,
      candidateTeams: [...new Set(positionCandidates.map((c) => c.team))],
    };
  }

  const candidate = positionCandidates[0];
  const opponent = candidate.team === homeAbbr ? awayAbbr : homeAbbr;
  return {
    resolved: true,
    identity: {
      playerId: candidate.playerId,
      playerName: candidate.playerName,
      position: candidate.position,
      team: candidate.team,
      opponent,
      gameId: game.gameId,
      week: game.week,
    },
  };
}
