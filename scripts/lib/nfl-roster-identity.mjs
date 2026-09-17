/**
 * Strict provider-to-roster identity resolution for Phase 10B canonical NFL
 * yardage markets (and, later, the Anytime TD market -- see
 * nfl-anytime-td-selection.mjs).
 *
 * ParlayAPI supplies only a free-text player name plus the game's home/away
 * team full names -- no gsis id, no team abbreviation for the player. A
 * canonical market entry is only trustworthy if it resolves to a REAL,
 * unambiguous roster player via all of:
 *
 *   1. normalized name match against the current depth-chart roster
 *   2. the player's roster team is one of the two teams in this event
 *   3. the event's team pair matches an actual scheduled game -- and, when
 *      that team pair plays more than once in a season (a divisional
 *      rematch), the CORRECT one of those games (see `selectGameForPair`)
 *   4. the player's roster position is plausible for the market
 *      (see `MARKET_PLAUSIBLE_POSITIONS` in nfl-prop-line-selection.mjs)
 *
 * Name-only matching is never sufficient -- a normalized name with zero,
 * two, or more roster candidates surviving all four checks is unresolved,
 * not guessed at. Same discipline applies to game selection: an ambiguous
 * repeated-matchup with no way to disambiguate is unresolved, never guessed.
 */
import { normalizeNflPropName } from "./nfl-prop-name-normalizer.mjs";

/**
 * Confirmed provider/schedule full-name mismatches. games.json stores these
 * four franchises' `homeTeam`/`awayTeam` in a short city form ("LA Rams",
 * "LA Chargers", "NY Jets", "NY Giants"); ParlayAPI was observed sending the
 * standard full city name instead. Both forms must resolve to the same
 * abbreviation. This list is deliberately narrow -- confirmed collisions
 * only, not a general full-name normalizer.
 */
const TEAM_FULL_NAME_ALIASES = Object.freeze({
  "los angeles rams": "lar",
  "los angeles chargers": "lac",
  "new york jets": "nyj",
  "new york giants": "nyg",
});

/**
 * Canonical team-code normalization for depth-chart/roster source records.
 * Deliberately identical to the alias table in src/lib/nfl/identity/identity.ts's
 * `normalizeNflTeamAbbr` (and to its .mjs-side counterparts in
 * nfl-scoring-support-core.mjs and nfl-touchdown-context-core.mjs, kept
 * inline there for the same reason) -- JAC/JAX -> jax, LA/LAR -> lar,
 * WAS/WSH -> wsh, AZ/ARI -> ari, everything else lower-cased. Not imported
 * from the .ts identity module so this pure .mjs identity engine carries no
 * TypeScript build dependency at runtime, matching every other
 * scripts/lib/*-core.mjs.
 *
 * The nflverse depth-chart source encodes the Rams and Commanders as "LA"
 * and "WAS", while the schedule/game-identity side of this same module
 * (`buildGameIndex`, via games.json's homeAbbr/awayAbbr) canonicalizes them
 * as "lar"/"wsh". Without this normalization applied at roster-ingestion
 * time, a Rams or Commanders roster entry's `team` code never matches the
 * event's home/away abbreviation, and `resolvePlayerIdentity` fails every
 * such player with "no_roster_match_in_game" even though the game and
 * player both resolved correctly.
 */
const ROSTER_TEAM_ALIASES = Object.freeze({
  JAC: "jax",
  JAX: "jax",
  LA: "lar",
  LAR: "lar",
  WAS: "wsh",
  WSH: "wsh",
  AZ: "ari",
  ARI: "ari",
});

export function normalizeRosterTeamAbbr(value) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!code) return "";
  return ROSTER_TEAM_ALIASES[code] ?? code.toLowerCase();
}

/**
 * @param {readonly {gameId:string, week:number, homeTeam:string, awayTeam:string, homeAbbr:string, awayAbbr:string}[]} games
 * @returns {{ teamNameToAbbr: Map<string,string>, gameByTeamPair: Map<string, object[]> }}
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
    // A team pair may play more than once in a season (divisional rematch) --
    // every scheduled game for the pair is retained, never overwritten.
    const pairKey = [homeAbbr, awayAbbr].sort().join("|");
    const bucket = gameByTeamPair.get(pairKey);
    if (bucket) bucket.push(game);
    else gameByTeamPair.set(pairKey, [game]);
  }
  // Aliases are additive only -- they never override a name already resolved
  // from the schedule's own homeTeam/awayTeam text.
  for (const [fullName, abbr] of Object.entries(TEAM_FULL_NAME_ALIASES)) {
    if (!teamNameToAbbr.has(fullName)) teamNameToAbbr.set(fullName, abbr);
  }
  return { teamNameToAbbr, gameByTeamPair };
}

/**
 * Picks the correct game among one or more scheduled games sharing the same
 * team pair (a divisional rematch). Never last-write-wins, never "earliest
 * game universally" -- see module header.
 *
 * Order of preference:
 *   1. `targetWeek`, when given and it identifies exactly one candidate.
 *   2. Deterministic nearest-upcoming-by-kickoff: among candidates whose
 *      status is "scheduled" (falls back to all candidates if none are),
 *      the one with the earliest `dateUtc` -- this is stable across a
 *      season because a completed earlier meeting drops out of contention
 *      once it is no longer "scheduled".
 *
 * Fails closed (`ambiguous: true`, no game returned) when `targetWeek`
 * matches more than one candidate, or the nearest-upcoming tier still has a
 * genuine tie (identical `dateUtc`) -- both are situations with no
 * remaining basis to choose safely.
 *
 * @param {readonly object[]} candidates
 * @param {{ targetWeek?: number | null }} [options]
 */
export function selectGameForPair(candidates, { targetWeek } = {}) {
  if (candidates.length === 1) return { game: candidates[0], ambiguous: false };
  if (candidates.length === 0) return { game: null, ambiguous: false };

  if (targetWeek != null) {
    const weekMatches = candidates.filter((game) => game.week === targetWeek);
    if (weekMatches.length === 1) return { game: weekMatches[0], ambiguous: false };
    if (weekMatches.length > 1) return { game: null, ambiguous: true };
    // No candidate in the target week -- fall through to nearest-upcoming.
  }

  const scheduled = candidates.filter((game) => game.status === "scheduled" && game.dateUtc);
  const pool = scheduled.length > 0 ? scheduled : candidates;
  const sorted = pool.slice().sort((a, b) => new Date(a.dateUtc ?? 0).getTime() - new Date(b.dateUtc ?? 0).getTime());
  const nearest = sorted[0];
  const tiedWithNearest = sorted.filter((game) => game.dateUtc === nearest.dateUtc);
  if (tiedWithNearest.length > 1) return { game: null, ambiguous: true };
  return { game: nearest, ambiguous: false };
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
    // Roster-source team codes are normalized here, at the single shared
    // ingestion boundary both fetch scripts already use, so every caller
    // gets the fix without a feature-specific patch -- see
    // `normalizeRosterTeamAbbr` above for the LA/WAS root cause.
    const bucket = index.get(key) ?? [];
    bucket.push({ ...entry, team: normalizeRosterTeamAbbr(entry.team) });
    index.set(key, bucket);
  }
  return index;
}

/**
 * @param {{ providerName: string, homeTeamFullName: string, awayTeamFullName: string, canonicalMarket: string, targetWeek?: number | null }} query
 * @param {{ rosterIndex: ReturnType<typeof buildRosterNameIndex>, gameIndex: ReturnType<typeof buildGameIndex>, marketPlausiblePositions: Record<string, readonly string[]> }} context
 */
export function resolvePlayerIdentity(
  { providerName, homeTeamFullName, awayTeamFullName, canonicalMarket, targetWeek = null },
  { rosterIndex, gameIndex, marketPlausiblePositions },
) {
  const homeAbbr = gameIndex.teamNameToAbbr.get(String(homeTeamFullName ?? "").trim().toLowerCase()) ?? null;
  const awayAbbr = gameIndex.teamNameToAbbr.get(String(awayTeamFullName ?? "").trim().toLowerCase()) ?? null;
  if (!homeAbbr || !awayAbbr) {
    return { resolved: false, reason: "unresolved_game_teams", homeAbbr, awayAbbr };
  }

  const pairKey = [homeAbbr, awayAbbr].sort().join("|");
  const candidates = gameIndex.gameByTeamPair.get(pairKey) ?? [];
  if (candidates.length === 0) {
    return { resolved: false, reason: "game_not_in_schedule", homeAbbr, awayAbbr };
  }

  const { game, ambiguous } = selectGameForPair(candidates, { targetWeek });
  if (ambiguous || !game) {
    return {
      resolved: false,
      reason: "ambiguous_repeated_matchup",
      homeAbbr,
      awayAbbr,
      candidateGameIds: candidates.map((candidateGame) => candidateGame.gameId),
    };
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
