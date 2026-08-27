/**
 * Yardage Props Review "Last 10" history assembly (player game log + team
 * defense game log). Presentation-history ONLY -- reads canonical, already-
 * committed authorities and reshapes them; never recomputes projectedYards,
 * Matchup Score, EPA, or Success Rate, and never feeds any hit-rate back
 * into the model.
 *
 * Canonical sources composed here:
 *   - Schedule/results: public/data/nfl/<season>/{games,results}.json
 *     (scripts/lib/nfl-schedules-results-core.mjs) -- date, home/away, final
 *     score, winner.
 *   - Actual player-week stats: data/nfl/nflverse/stats-player-week
 *     (nflverse `stats_player_week`) -- completions/attempts, rush attempts,
 *     targets/receptions, TDs/INTs, actual yards.
 *   - Pregame rolling EPA rank: scripts/lib/nfl-epa-week-rank-core.mjs, over
 *     the same canonical nflverse `epa_team_game` cache the frozen
 *     Season/Last-5 EPA artifact uses -- windowed per-game instead of
 *     season/last5 (see that module's header for the exact methodology).
 *   - Pregame rolling yards allowed: scripts/lib/nfl-yardage-rolling-core.mjs,
 *     over the same `stats_player_week` cache the frozen Season/Last-5
 *     production-allowed artifact uses -- windowed per-game instead.
 *   - Historical prop lines: data/nfl/props/market-archive/
 *     nfl-yardage-market-archive.jsonl via
 *     scripts/lib/nfl-yardage-historical-line-core.mjs (final approved
 *     pre-kickoff observation only; pre-archive games resolve to `null`,
 *     never backfilled/estimated).
 *
 * Every "Opp Def Rank" / "Opp Off Rank" / "Opp Yds Allow Avg" value is
 * computed using ONLY games strictly before the historical game in
 * question -- see nfl-epa-week-rank-core.mjs and nfl-yardage-rolling-core.mjs
 * for the exact trailing-window definitions. A team/player with no prior
 * games at that point in history resolves to `null`, never a fabricated
 * rank-1 or league-average value.
 */
import { buildPregameRollingEpa, rankTeamsAt } from "./nfl-epa-week-rank-core.mjs";
import {
  buildTrailingPregameAverage,
  buildYardsAllowedPerGame,
  buildPlayerYardsPerGame,
  statRowMatchesPosition,
} from "./nfl-yardage-rolling-core.mjs";
import { indexArchiveByTarget, resolveFinalPreKickoffLineFromIndex } from "./nfl-yardage-historical-line-core.mjs";

export const MAX_HISTORY_GAMES = 10;

/** Production-allowed-style position slices per market, mirroring `nfl-production-allowed-core.mjs`. */
export const HISTORY_MARKET_POSITIONS = {
  passing: ["QB"],
  rushing: ["ALL", "RB"],
  receiving: ["WR", "TE", "RB"],
};

/**
 * The stats_player_week cache and the yardage market archive use different
 * playerId conventions -- bare gsis id ("00-0023459") in the stats cache,
 * "gsis:"-prefixed ("gsis:00-0023459") in the archive and the projection
 * artifact. Every archive lookup must go through this so a bare-id stat row
 * can still resolve its historical line.
 */
function toGsisId(bareId) {
  return `gsis:${bareId}`;
}

function positionSliceForMarket(market, playerPosition) {
  if (market === "passing") return "QB";
  if (market === "rushing") return playerPosition === "RB" ? "RB" : "ALL";
  return playerPosition; // receiving: WR | TE | RB
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize one season's raw stats_player_week CSV rows into the shape
 * every rolling/aggregation helper in this module expects. Regular season
 * only (`season_type === "REG"`), matching the frozen production-allowed
 * artifact's own scope.
 */
export function normalizeHistoryStatRows(rows, season) {
  const out = [];
  for (const row of rows) {
    if (Number(row.season) !== season) continue;
    if (row.season_type !== "REG") continue;
    const week = Number(row.week);
    if (!row.player_id || !row.opponent_team || !Number.isInteger(week) || week < 1) continue;
    out.push({
      season,
      week,
      playerId: row.player_id,
      playerName: row.player_display_name || row.player_name || row.player_id,
      position: row.position,
      team: row.recent_team,
      opponentTeam: row.opponent_team,
      completions: Number(row.completions) || 0,
      attempts: Number(row.attempts) || 0,
      passingYards: Number(row.passing_yards) || 0,
      passingTds: Number(row.passing_tds) || 0,
      interceptions: Number(row.interceptions) || 0,
      carries: Number(row.carries) || 0,
      rushingYards: Number(row.rushing_yards) || 0,
      rushingTds: Number(row.rushing_tds) || 0,
      receptions: Number(row.receptions) || 0,
      targets: Number(row.targets) || 0,
      receivingYards: Number(row.receiving_yards) || 0,
      receivingTds: Number(row.receiving_tds) || 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Game lookup (schedule/results, keyed by nflverse team abbr for CSV joins)
// ---------------------------------------------------------------------------

/**
 * @param {ReadonlyArray<{gameId:string, season:number, week:number, dateUtc:string|null, homeAbbr:string, awayAbbr:string}>} games - canonical (lowercase) abbrs, from games.json.
 * @param {ReadonlyArray<{gameId:string, homeAbbr:string, awayAbbr:string, homeScore:number, awayScore:number, winner:string}>} results - canonical abbrs, from results.json.
 * @param {ReadonlyMap<string,string>} canonicalToNflverseAbbr - canonical lowercase abbr -> nflverse uppercase code.
 * @returns {Map<string, object>} key `${nflverseAbbr}|${season}|${week}` -> per-team game record.
 */
export function buildGameLookup(games, results, canonicalToNflverseAbbr) {
  const resultsByGameId = new Map(results.map((r) => [r.gameId, r]));
  const lookup = new Map();

  const record = (game, teamAbbr, opponentAbbr, teamNflverse, opponentNflverse, homeAway) => {
    const result = resultsByGameId.get(game.gameId) ?? null;
    const teamScore = result ? (homeAway === "home" ? result.homeScore : result.awayScore) : null;
    const oppScore = result ? (homeAway === "home" ? result.awayScore : result.homeScore) : null;
    const gameResult = !result ? null : result.winner === "TIE" ? "T" : result.winner === teamAbbr ? "W" : "L";
    lookup.set(`${teamNflverse}|${game.season}|${game.week}`, {
      gameId: game.gameId,
      season: game.season,
      week: game.week,
      dateUtc: game.dateUtc,
      homeAway,
      opponentAbbr,
      opponentNflverseAbbr: opponentNflverse,
      teamScore,
      oppScore,
      result: gameResult,
    });
  };

  for (const game of games) {
    const homeNflverse = canonicalToNflverseAbbr.get(game.homeAbbr);
    const awayNflverse = canonicalToNflverseAbbr.get(game.awayAbbr);
    if (!homeNflverse || !awayNflverse) continue;
    record(game, game.homeAbbr, game.awayAbbr, homeNflverse, awayNflverse, "home");
    record(game, game.awayAbbr, game.homeAbbr, awayNflverse, homeNflverse, "away");
  }
  return lookup;
}

// ---------------------------------------------------------------------------
// Rolling indexes (built once, reused for every player/team lookup)
// ---------------------------------------------------------------------------

/**
 * Build every rolling index this module needs from normalized stat rows +
 * epa rows, once, for reuse across every player/team-defense game log.
 */
export function buildHistoryRollingIndexes(normalizedStatRows, epaRows) {
  const epaRollingIndex = buildPregameRollingEpa(epaRows);

  const yardsAllowedRolling = {};
  for (const [market, positions] of Object.entries(HISTORY_MARKET_POSITIONS)) {
    yardsAllowedRolling[market] = {};
    for (const position of positions) {
      const perGame = buildYardsAllowedPerGame(normalizedStatRows, market, position);
      yardsAllowedRolling[market][position] = buildTrailingPregameAverage(perGame);
    }
  }

  const playerRollingByMarket = {};
  for (const market of Object.keys(HISTORY_MARKET_POSITIONS)) {
    const perGame = buildPlayerYardsPerGame(normalizedStatRows, market);
    playerRollingByMarket[market] = buildTrailingPregameAverage(perGame);
  }

  return { epaRollingIndex, yardsAllowedRolling, playerRollingByMarket };
}

/**
 * Pool size is however many teams had a resolvable pregame rank at that same
 * chronological cutoff -- not always 32 (early-season weeks have fewer teams
 * with 1+ trailing games), so it travels with the rank for the heat scale to
 * bucket against, rather than assuming a fixed 32-team pool.
 */
function defRank(epaRollingIndex, season, week, nflverseAbbr) {
  const ranks = rankTeamsAt(epaRollingIndex, season, week, "defense");
  return { rank: ranks.get(nflverseAbbr) ?? null, poolSize: ranks.size };
}
function offRank(epaRollingIndex, season, week, nflverseAbbr) {
  const ranks = rankTeamsAt(epaRollingIndex, season, week, "offense");
  return { rank: ranks.get(nflverseAbbr) ?? null, poolSize: ranks.size };
}

function statBlockFor(market, row) {
  if (market === "passing") {
    return { completions: row.completions, attempts: row.attempts, passingTds: row.passingTds, interceptions: row.interceptions };
  }
  if (market === "rushing") {
    return { rushAttempts: row.carries, rushTds: row.rushingTds };
  }
  return { targets: row.targets, receptions: row.receptions, recTds: row.receivingTds };
}

// ---------------------------------------------------------------------------
// Player Last-10 game log
// ---------------------------------------------------------------------------

/**
 * Build one player's Last-10 game log for one market, most recent game
 * first, capped at {@link MAX_HISTORY_GAMES}.
 *
 * @param {object} params
 * @param {string} params.playerId
 * @param {string} params.market
 * @param {string} params.playerPosition
 * @param {ReadonlyArray} params.playerStatRows - this player's own normalized rows, any market (filtered internally by playerId only).
 * @param {Map} params.gameLookup
 * @param {object} params.rollingIndexes - from {@link buildHistoryRollingIndexes}.
 * @param {Map} params.archiveIndex - from `indexArchiveByTarget`.
 * @param {string} params.canonicalMarketKey - "passingYards" | "rushingYards" | "receivingYards".
 */
export function buildPlayerLast10(params) {
  const { playerId, market, playerPosition, playerStatRows, gameLookup, rollingIndexes, archiveIndex, canonicalMarketKey } = params;
  const position = positionSliceForMarket(market, playerPosition);

  const own = playerStatRows
    .filter((r) => r.playerId === playerId)
    .filter((r) => market !== "passing" || r.attempts > 0)
    .filter((r) => market !== "rushing" || r.carries > 0)
    .filter((r) => market !== "receiving" || r.targets > 0 || r.receptions > 0)
    .sort((a, b) => b.season - a.season || b.week - a.week)
    .slice(0, MAX_HISTORY_GAMES);

  return own.map((row) => {
    const lookupKey = `${row.team}|${row.season}|${row.week}`;
    const game = gameLookup.get(lookupKey) ?? null;
    const oppYdsAllow = rollingIndexes.yardsAllowedRolling[market][position]?.get(`${row.opponentTeam}|${row.season}|${row.week}`) ?? null;
    const { rank: oppDefRank, poolSize: oppDefRankPoolSize } = defRank(rollingIndexes.epaRollingIndex, row.season, row.week, row.opponentTeam);

    const vegasLine = game
      ? resolveFinalPreKickoffLineFromIndex(archiveIndex, {
          playerId: toGsisId(playerId),
          canonicalMarket: canonicalMarketKey,
          gameId: game.gameId,
          kickoffIso: game.dateUtc,
        })
      : null;

    return {
      gameId: game?.gameId ?? null,
      season: row.season,
      week: row.week,
      dateUtc: game?.dateUtc ?? null,
      opponentAbbr: game?.opponentAbbr ?? null,
      homeAway: game?.homeAway ?? null,
      oppDefRank,
      oppDefRankPoolSize: oppDefRank != null ? oppDefRankPoolSize : null,
      oppYdsAllowAvg: oppYdsAllow?.avg ?? null,
      stat: statBlockFor(market, row),
      actualYards: market === "passing" ? row.passingYards : market === "rushing" ? row.rushingYards : row.receivingYards,
      gameScore: game ? { result: game.result, teamScore: game.teamScore, oppScore: game.oppScore } : null,
      vegasLine: vegasLine?.point ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Opponent (team defense) Last-10 game log
// ---------------------------------------------------------------------------

/**
 * Build the current opponent's Last-10 defensive game log for one
 * market/position, most recent game first. For each historical game, the
 * "opposing player" is the opposing offense's leader at the requested
 * position by the primary volume stat for that market (attempts for
 * passing, carries for rushing, targets for receiving) -- documented,
 * deterministic tie-break, never an arbitrary/random player.
 *
 * @param {object} params
 * @param {string} params.defenseTeamNflverseAbbr
 * @param {string} params.market
 * @param {string} params.position
 * @param {ReadonlyArray} params.allStatRows - every normalized stat row (all players/teams), used to find the opposing leader per game.
 * @param {Map} params.gameLookup
 * @param {object} params.rollingIndexes
 * @param {Map} params.archiveIndex
 * @param {string} params.canonicalMarketKey
 */
export function buildOpponentLast10(params) {
  const { defenseTeamNflverseAbbr, market, position, allStatRows, gameLookup, rollingIndexes, archiveIndex, canonicalMarketKey } = params;

  const volumeStat = market === "passing" ? "attempts" : market === "rushing" ? "carries" : "targets";
  const rowsAgainstDefense = allStatRows.filter(
    (r) => r.opponentTeam === defenseTeamNflverseAbbr && statRowMatchesPosition(market, position, r.position),
  );

  const byGame = new Map(); // `${season}|${week}` -> leader row
  for (const row of rowsAgainstDefense) {
    const key = `${row.season}|${row.week}`;
    const current = byGame.get(key);
    if (!current || row[volumeStat] > current[volumeStat]) byGame.set(key, row);
  }

  const games = [...byGame.values()].sort((a, b) => b.season - a.season || b.week - a.week).slice(0, MAX_HISTORY_GAMES);

  return games.map((leaderRow) => {
    const lookupKey = `${defenseTeamNflverseAbbr}|${leaderRow.season}|${leaderRow.week}`;
    const game = gameLookup.get(lookupKey) ?? null;
    const { rank: oppOffRank, poolSize: oppOffRankPoolSize } = offRank(rollingIndexes.epaRollingIndex, leaderRow.season, leaderRow.week, leaderRow.team);
    const oppPlayerYpg = rollingIndexes.playerRollingByMarket[market]?.get(`${leaderRow.playerId}|${leaderRow.season}|${leaderRow.week}`) ?? null;

    const vegasLine = game
      ? resolveFinalPreKickoffLineFromIndex(archiveIndex, {
          playerId: toGsisId(leaderRow.playerId),
          canonicalMarket: canonicalMarketKey,
          gameId: game.gameId,
          kickoffIso: game.dateUtc,
        })
      : null;

    return {
      gameId: game?.gameId ?? null,
      season: leaderRow.season,
      week: leaderRow.week,
      dateUtc: game?.dateUtc ?? null,
      opponentPlayerId: leaderRow.playerId,
      opponentPlayerName: leaderRow.playerName,
      homeAway: game?.homeAway ?? null,
      oppOffRank,
      oppOffRankPoolSize: oppOffRank != null ? oppOffRankPoolSize : null,
      oppPlayerYpg: oppPlayerYpg?.avg ?? null,
      stat: statBlockFor(market, leaderRow),
      yardsAllowed: market === "passing" ? leaderRow.passingYards : market === "rushing" ? leaderRow.rushingYards : leaderRow.receivingYards,
      gameScore: game ? { result: game.result, teamScore: game.teamScore, oppScore: game.oppScore } : null,
      vegasLine: vegasLine?.point ?? null,
    };
  });
}

export { indexArchiveByTarget };
