/**
 * mlb-bullpen-fetch.mjs
 *
 * Network layer for the bullpen data pipeline. Fetches active rosters,
 * per-pitcher season pitching stats, and recent schedule/boxscore data
 * from the MLB StatsAPI, with the same concurrency-limit / timeout /
 * bounded-retry approach already used in mlb-recent-activity.mjs.
 *
 * Every exported fetch function accepts an injectable `fetchImpl` so
 * tests can run with zero live network calls.
 *
 * Endpoints used (all public, unauthenticated MLB StatsAPI v1):
 *   GET /teams?sportId=1&season={season}
 *   GET /teams/{teamId}/roster?rosterType=active&season={season}
 *   GET /people/{id}/stats?stats=season&season={season}&group=pitching
 *   GET /schedule?sportId=1&teamId={teamId}&startDate=&endDate=&gameType=R
 *   GET /game/{gamePk}/boxscore
 */

const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
export { MLB_STATS_API };

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 1;
const DEFAULT_CONCURRENCY = 6;

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
      if (attempt < retries) await sleep(boundedBackoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`Failed request: ${url}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedBackoffMs(attempt) {
  return Math.min(250 * 2 ** attempt, 2000);
}

export async function runLimited(items, concurrency, worker) {
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

/**
 * Fetches all MLB teams for a season (used to resolve teamId/teamAbbr pairs).
 */
export async function fetchAllTeams(season, options = {}) {
  const json = await fetchJsonWithRetry(`${MLB_STATS_API}/teams?sportId=1&season=${season}`, options);
  return json?.teams ?? [];
}

/**
 * Fetches a team's active roster and returns just the pitchers, in the
 * shape expected by mlb-bullpen-classification.mjs's buildRelieverPool.
 */
export async function fetchTeamRosterPitchers(teamId, season, options = {}) {
  const json = await fetchJsonWithRetry(
    `${MLB_STATS_API}/teams/${teamId}/roster?rosterType=active&season=${season}`,
    options
  );
  const roster = json?.roster ?? [];
  return roster
    .filter((entry) => entry?.position?.abbreviation === "P")
    .map((entry) => ({ pitcherId: entry?.person?.id, fullName: entry?.person?.fullName }));
}

function toPitchingSeasonStat(json) {
  const stat = json?.stats?.[0]?.splits?.[0]?.stat;
  if (!stat) return null;
  return {
    gamesStarted: stat.gamesStarted ?? null,
    gamesPlayed: stat.gamesPlayed ?? null,
    inningsPitched: stat.inningsPitched ?? null,
    earnedRuns: stat.earnedRuns ?? null,
    homeRuns: stat.homeRuns ?? null,
    strikeOuts: stat.strikeOuts ?? null,
    baseOnBalls: stat.baseOnBalls ?? null,
    hits: stat.hits ?? null,
  };
}

/**
 * Fetches season pitching stats for a list of pitcher IDs with bounded
 * concurrency. Individual failures are captured per-pitcher rather than
 * failing the whole batch.
 *
 * @returns {{ statsByPitcherId: Map<number, object>, failedPitcherIds: number[] }}
 */
export async function fetchSeasonPitchingStatsForPitchers(pitcherIds, season, options = {}) {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const entries = await runLimited(pitcherIds, concurrency, async (pitcherId) => {
    try {
      const json = await fetchJsonWithRetry(
        `${MLB_STATS_API}/people/${pitcherId}/stats?stats=season&season=${season}&group=pitching`,
        options
      );
      return { pitcherId, stat: toPitchingSeasonStat(json), error: null };
    } catch (error) {
      return { pitcherId, stat: null, error };
    }
  });
  const statsByPitcherId = new Map();
  const failedPitcherIds = [];
  for (const entry of entries) {
    if (entry.stat) statsByPitcherId.set(entry.pitcherId, entry.stat);
    else failedPitcherIds.push(entry.pitcherId);
  }
  return { statsByPitcherId, failedPitcherIds };
}

function isCompletedRegularSeasonGame(game) {
  const status = game?.status ?? {};
  return game?.gameType === "R" && (status.codedGameState === "F" || status.abstractGameState === "Final");
}

/**
 * Fetches a team's completed games within [startDate, endDate] (inclusive,
 * "YYYY-MM-DD") and, for each, the boxscore appearance data for every
 * reliever-pool pitcher who appeared -- already normalized into the flat
 * RelieverAppearance shape consumed by mlb-bullpen-workload.mjs.
 *
 * @param {number} teamId
 * @param {Set<number>} relieverPitcherIds
 * @param {{ startDate: string, endDate: string }} window
 */
export async function fetchRecentRelieverAppearances(teamId, relieverPitcherIds, window, options = {}) {
  const { startDate, endDate } = window;
  const scheduleUrl = `${MLB_STATS_API}/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}&gameType=R`;
  const schedule = await fetchJsonWithRetry(scheduleUrl, options);
  const games = (schedule?.dates ?? []).flatMap((dateBlock) => dateBlock?.games ?? []).filter(isCompletedRegularSeasonGame);

  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const boxscoreEntries = await runLimited(games, concurrency, async (game) => {
    try {
      const boxscore = await fetchJsonWithRetry(`${MLB_STATS_API}/game/${game.gamePk}/boxscore`, options);
      return { game, boxscore, error: null };
    } catch (error) {
      return { game, boxscore: null, error };
    }
  });

  const appearances = [];
  const failedGamePks = [];
  for (const { game, boxscore, error } of boxscoreEntries) {
    if (!boxscore) {
      if (error) failedGamePks.push(game.gamePk);
      continue;
    }
    const side = boxscore?.teams?.home?.team?.id === teamId ? boxscore?.teams?.home : boxscore?.teams?.away;
    for (const [key, player] of Object.entries(side?.players ?? {})) {
      const pitcherId = resolvePlayerId(key, player);
      if (!pitcherId || !relieverPitcherIds.has(pitcherId)) continue;
      const pitching = player?.stats?.pitching;
      if (!pitching || pitching.gamesPlayed === 0) continue;
      appearances.push({
        pitcherId,
        officialDate: game.officialDate,
        gamePk: String(game.gamePk),
        outs: Number.isFinite(Number(pitching.outs)) ? Number(pitching.outs) : null,
        numberOfPitches: Number.isFinite(Number(pitching.numberOfPitches)) ? Number(pitching.numberOfPitches) : null,
        doubleHeader: game.doubleHeader ?? "N",
      });
    }
  }
  return { appearances, failedGamePks };
}

function resolvePlayerId(key, player) {
  const personId = Number(player?.person?.id);
  if (Number.isFinite(personId) && personId > 0) return personId;
  const keyId = Number(String(key).replace(/^ID/, ""));
  return Number.isFinite(keyId) && keyId > 0 ? keyId : null;
}
