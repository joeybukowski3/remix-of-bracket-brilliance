/** MLB StatsAPI network layer for strikeout prop detail data. */
const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 1;
const DEFAULT_CONCURRENCY = 6;
export { MLB_STATS_API };

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function boundedBackoffMs(attempt) { return Math.min(250 * 2 ** attempt, 2000); }

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

export async function fetchAllTeams(season, options = {}) {
  const json = await fetchJsonWithRetry(`${MLB_STATS_API}/teams?sportId=1&season=${season}`, options);
  return (json?.teams ?? []).map((team) => ({ id: team?.id ?? null, abbreviation: team?.abbreviation ?? null, name: team?.name ?? null }));
}

export function buildTeamAbbrById(teams) {
  return new Map(teams.filter((team) => team.id != null).map((team) => [team.id, team.abbreviation]));
}

export function buildTeamIdByAbbr(teams) {
  return new Map(teams.filter((team) => team.abbreviation).map((team) => [team.abbreviation, team.id]));
}

function toFiniteNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitGamePk(split) {
  return toFiniteNumber(split?.game?.gamePk ?? split?.game?.pk ?? split?.gamePk);
}

function splitIsHome(split) {
  if (typeof split?.isHome === "boolean") return split.isHome;
  if (typeof split?.home === "boolean") return split.home;
  const value = split?.isHome ?? split?.homeAway ?? split?.game?.homeAway;
  if (value === "home" || value === "H") return true;
  if (value === "away" || value === "A") return false;
  return null;
}

export function normalizePitcherGameLogSplit(split, season, teamAbbrById) {
  const stat = split?.stat ?? {};
  const gamesStarted = toFiniteNumber(stat.gamesStarted);
  const opponentId = toFiniteNumber(split?.opponent?.id);
  const isHome = splitIsHome(split);
  return {
    gamePk: splitGamePk(split),
    season: toFiniteNumber(split?.season ?? season),
    date: typeof split?.date === "string" ? split.date.slice(0, 10) : null,
    opponentId,
    opponentAbbr: opponentId == null ? null : teamAbbrById.get(opponentId) ?? null,
    isHome,
    site: isHome === true ? "home" : isHome === false ? "away" : null,
    inningsPitched: stat.inningsPitched == null ? null : String(stat.inningsPitched),
    strikeouts: toFiniteNumber(stat.strikeOuts ?? stat.strikeouts),
    hitsAllowed: toFiniteNumber(stat.hits),
    pitchCount: toFiniteNumber(stat.numberOfPitches ?? stat.pitchesThrown),
    battersFaced: toFiniteNumber(stat.battersFaced),
    gamesStarted,
  };
}

/** Fetches the complete current-season starter log strictly before beforeDate. */
export async function fetchPitcherSeasonStarts(pitcherId, season, beforeDate, teamAbbrById, options = {}) {
  const url = `${MLB_STATS_API}/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching`;
  try {
    const json = await fetchJsonWithRetry(url, options);
    const splits = json?.stats?.flatMap((block) => block?.splits ?? []) ?? [];
    const starts = splits
      .map((split) => normalizePitcherGameLogSplit(split, season, teamAbbrById))
      .filter((row) => (row.gamesStarted ?? 0) >= 1 && row.date && row.date < beforeDate)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { starts, error: null, url };
  } catch (error) {
    return { starts: [], error, url };
  }
}

/**
 * Backward-compatible main-branch interface: returns the five most recent
 * starts by default and keeps the original compact row shape.
 */
export async function fetchPitcherRecentStarts(pitcherId, season, beforeDate, teamAbbrById, options = {}) {
  const limit = options.limit ?? 5;
  const result = await fetchPitcherSeasonStarts(pitcherId, season, beforeDate, teamAbbrById, options);
  return {
    ...result,
    starts: result.starts.slice(0, limit).map((start) => ({
      date: start.date,
      opponentAbbr: start.opponentAbbr,
      inningsPitched: start.inningsPitched,
      strikeouts: start.strikeouts,
    })),
  };
}

function isCompletedRegularSeasonGame(game) {
  return game?.gameType === "R" && game?.status?.codedGameState === "F";
}

function shiftDate(dateStr, deltaDays) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export async function fetchTeamRecentCompletedGames(teamId, beforeDate, options = {}) {
  const limit = options.limit ?? 5;
  const lookbackDays = options.lookbackDays ?? 30;
  const startDate = options.startDate ?? shiftDate(beforeDate, -lookbackDays);
  const endDate = shiftDate(beforeDate, -1);
  try {
    const json = await fetchJsonWithRetry(`${MLB_STATS_API}/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}&gameType=R`, options);
    const games = (json?.dates ?? []).flatMap((dateBlock) => dateBlock?.games ?? []).filter(isCompletedRegularSeasonGame);
    games.sort((a, b) => String(b.officialDate).localeCompare(String(a.officialDate)));
    return { games: games.slice(0, limit), error: null };
  } catch (error) {
    return { games: [], error };
  }
}

export async function fetchBoxscoreCached(gamePk, cache, options = {}) {
  const key = String(gamePk);
  if (cache.has(key)) return cache.get(key);
  const promise = fetchJsonWithRetry(`${MLB_STATS_API}/game/${gamePk}/boxscore`, options)
    .then((boxscore) => ({ boxscore, error: null }))
    .catch((error) => ({ boxscore: null, error }));
  cache.set(key, promise);
  return promise;
}

export function deriveOpponentGameSummary(boxscore, teamId, officialDate) {
  if (!boxscore?.teams) return { date: officialDate ?? null, opponent: null, opposingStartingPitcher: null, opposingStarterInningsPitched: null, opposingStarterStrikeouts: null, teamTotalStrikeouts: null };
  const isHomeTeam = boxscore.teams.home?.team?.id === teamId;
  const own = isHomeTeam ? boxscore.teams.home : boxscore.teams.away;
  const opposing = isHomeTeam ? boxscore.teams.away : boxscore.teams.home;
  let opposingStartingPitcher = null;
  let opposingStarterInningsPitched = null;
  let opposingStarterStrikeouts = null;
  for (const player of Object.values(opposing?.players ?? {})) {
    const pitching = player?.stats?.pitching;
    if (pitching?.gamesStarted === 1) {
      opposingStartingPitcher = player?.person?.fullName ?? null;
      opposingStarterInningsPitched = pitching.inningsPitched ?? null;
      opposingStarterStrikeouts = pitching.strikeOuts ?? null;
      break;
    }
  }
  return {
    date: officialDate ?? null,
    opponent: opposing?.team?.abbreviation ?? null,
    opposingStartingPitcher,
    opposingStarterInningsPitched,
    opposingStarterStrikeouts,
    teamTotalStrikeouts: own?.teamStats?.batting?.strikeOuts ?? null,
  };
}

export async function fetchOpponentLastFiveGamesDetail(teamId, games, boxscoreCache, options = {}) {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  return runLimited(games, concurrency, async (game) => {
    const { boxscore, error } = await fetchBoxscoreCached(game.gamePk, boxscoreCache, options);
    if (error || !boxscore) return { date: game.officialDate ?? null, opponent: null, opposingStartingPitcher: null, opposingStarterInningsPitched: null, opposingStarterStrikeouts: null, teamTotalStrikeouts: null };
    return deriveOpponentGameSummary(boxscore, teamId, game.officialDate);
  });
}

export { DEFAULT_CONCURRENCY };
