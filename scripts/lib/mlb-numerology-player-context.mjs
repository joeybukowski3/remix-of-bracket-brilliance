/**
 * Extra per-player context for the numerology email: last 5 game batting
 * lines and season stats. Both come from the free, unauthenticated MLB
 * Stats API (statsapi.mlb.com) -- the same source already used elsewhere
 * in this repo (mlb-recent-activity.mjs, the HR props pipeline).
 *
 * The numerology card's `recentActivity.gameLog` already carries real
 * gamePks/dates for a player's last games (used for the activity-window
 * check), but only plate-appearance/at-bat counts -- no hits/HR/TB/RBI or
 * opponent. This module fetches those already-known games' boxscores to
 * fill in the rest, and separately fetches each player's season hitting
 * line. Every network call fails soft (never throws past this module) so
 * a lookup failure degrades to "unavailable" for that one player/game
 * instead of breaking email generation.
 */

const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 1;

async function fetchJsonWithRetry(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`Failed request: ${url}`);
}

async function runLimited(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function next() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

function toNumberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Batting-average-style stats (".276") come back as strings from MLB Stats API; keep as-is for display, trimmed and null-safe. */
function toRateStringOrNull(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

export async function fetchAllTeams(season, options = {}) {
  const url = `${MLB_STATS_API}/teams?sportId=1&season=${season}`;
  const payload = await fetchJsonWithRetry(url, options);
  return (payload?.teams ?? []).map((team) => ({ id: team.id, abbreviation: team.abbreviation, name: team.name }));
}

export function buildTeamIdByAbbr(teams) {
  const map = new Map();
  for (const team of teams ?? []) {
    if (team?.abbreviation && team?.id != null) map.set(String(team.abbreviation).toUpperCase(), team.id);
  }
  return map;
}

export async function fetchBoxscoreCached(gamePk, cache, options = {}) {
  const key = String(gamePk);
  if (!cache.has(key)) {
    cache.set(
      key,
      fetchJsonWithRetry(`${MLB_STATS_API}/game/${key}/boxscore`, options).catch((error) => ({ __error: error }))
    );
  }
  const result = await cache.get(key);
  if (result && result.__error) throw result.__error;
  return result;
}

function findPlayerBattingLine(teamBox, playerId) {
  const player = teamBox?.players?.[`ID${playerId}`];
  const batting = player?.stats?.batting;
  if (!batting) return null;
  return {
    atBats: toNumberOrNull(batting.atBats) ?? 0,
    hits: toNumberOrNull(batting.hits) ?? 0,
    homeRuns: toNumberOrNull(batting.homeRuns) ?? 0,
    totalBases: toNumberOrNull(batting.totalBases) ?? 0,
    rbi: toNumberOrNull(batting.rbi) ?? 0,
  };
}

/** Resolves which boxscore side is the player's own team (by numeric team id) and returns their line plus that game's opponent abbreviation. */
export function deriveGameBattingLine(boxscore, playerId, playerTeamId) {
  const home = boxscore?.teams?.home;
  const away = boxscore?.teams?.away;
  if (!home || !away || playerTeamId == null) return null;

  let own = null;
  let opponent = null;
  if (Number(home?.team?.id) === Number(playerTeamId)) {
    own = home;
    opponent = away;
  } else if (Number(away?.team?.id) === Number(playerTeamId)) {
    own = away;
    opponent = home;
  } else {
    return null;
  }

  const line = findPlayerBattingLine(own, playerId);
  if (!line) return null;
  return { ...line, opponent: opponent?.team?.abbreviation ?? null };
}

/**
 * Fetches box scores for a player's already-known recent gamePks (from
 * recentActivity.gameLog, newest first) and derives real batting lines.
 * Never throws -- a per-game failure just omits that game rather than
 * failing the whole player.
 */
export async function fetchLastFiveGamesForPlayer({ playerId, teamId, gameLog, boxscoreCache, limit = 5, options = {} }) {
  const entries = Array.isArray(gameLog) ? gameLog.slice(0, limit) : [];
  if (!entries.length || playerId == null || teamId == null) {
    return { games: [], available: false };
  }

  const results = await runLimited(entries, options.concurrency ?? 5, async (entry) => {
    try {
      const boxscore = await fetchBoxscoreCached(entry.gamePk, boxscoreCache, options);
      const line = deriveGameBattingLine(boxscore, playerId, teamId);
      return line ? { date: entry.date, ...line } : null;
    } catch {
      return null;
    }
  });

  const games = results.filter((game) => game != null);
  return { games, available: games.length > 0 };
}

/** Season hitting line for one player. Returns null (not zeros) on any failure or missing data -- callers must render "unavailable", never fabricate a zero line. */
export async function fetchPlayerSeasonStats(playerId, season, options = {}) {
  if (playerId == null) return null;
  try {
    const url = `${MLB_STATS_API}/people/${playerId}/stats?stats=season&group=hitting&season=${season}`;
    const payload = await fetchJsonWithRetry(url, options);
    const stat = payload?.stats?.[0]?.splits?.[0]?.stat;
    if (!stat) return null;
    return {
      avg: toRateStringOrNull(stat.avg),
      obp: toRateStringOrNull(stat.obp),
      slg: toRateStringOrNull(stat.slg),
      ops: toRateStringOrNull(stat.ops),
      homeRuns: toNumberOrNull(stat.homeRuns),
      rbi: toNumberOrNull(stat.rbi),
      atBats: toNumberOrNull(stat.atBats),
      plateAppearances: toNumberOrNull(stat.plateAppearances),
    };
  } catch {
    return null;
  }
}

function uniquePlaysByPlayer(card) {
  const plays = [card.topPlay, ...(card.allQualifiedPlaysOver50 ?? [])].filter(Boolean);
  const byPlayerId = new Map();
  for (const play of plays) {
    const key = play.playerId ?? play.player;
    if (key == null || byPlayerId.has(key)) continue;
    byPlayerId.set(key, play);
  }
  return Array.from(byPlayerId.values());
}

/**
 * Fetches lastFiveGames + seasonStats for every distinct player appearing
 * in the card (topPlay and/or allQualifiedPlaysOver50 -- these can be
 * separate copies of the same underlying play, so lookups are deduped and
 * cached by playerId before being applied to both). Returns a new card
 * object; never mutates the input. A lookup failure for one player never
 * blocks the others or the overall card.
 */
export async function enrichCardPlaysWithContext(card, options = {}) {
  const season = options.season ?? String(card.date).slice(0, 4);
  const fetchOptions = { fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs, retries: options.retries };

  let teamIdByAbbr = new Map();
  try {
    const teams = await fetchAllTeams(season, fetchOptions);
    teamIdByAbbr = buildTeamIdByAbbr(teams);
  } catch {
    teamIdByAbbr = new Map();
  }

  const boxscoreCache = new Map();
  const contextByPlayerId = new Map();

  await runLimited(uniquePlaysByPlayer(card), options.concurrency ?? 6, async (play) => {
    const teamId = teamIdByAbbr.get(String(play.team ?? "").toUpperCase()) ?? null;
    const gameLog = play?.recentActivity?.gameLog ?? [];

    const [lastFiveGames, seasonStats] = await Promise.all([
      fetchLastFiveGamesForPlayer({
        playerId: play.playerId,
        teamId,
        gameLog,
        boxscoreCache,
        options: fetchOptions,
      }),
      fetchPlayerSeasonStats(play.playerId, season, fetchOptions),
    ]);

    contextByPlayerId.set(play.playerId ?? play.player, { lastFiveGames, seasonStats });
  });

  const applyContext = (play) => {
    if (!play) return play;
    const context = contextByPlayerId.get(play.playerId ?? play.player);
    return {
      ...play,
      lastFiveGames: context?.lastFiveGames ?? { games: [], available: false },
      seasonStats: context?.seasonStats ?? null,
    };
  };

  return {
    ...card,
    topPlay: applyContext(card.topPlay),
    allQualifiedPlaysOver50: (card.allQualifiedPlaysOver50 ?? []).map(applyContext),
  };
}
