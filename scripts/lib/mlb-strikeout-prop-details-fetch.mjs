/**
 * Network layer for MLB strikeout prop row-detail data
 * (test/mlb-strikeout-prop-row-details).
 *
 * Free, unauthenticated MLB StatsAPI v1 only — no paid vendor, no new
 * external package. Follows the same fetchJsonWithRetry / runLimited /
 * injectable-fetchImpl approach already used by scripts/lib/mlb-bullpen-fetch.mjs
 * and scripts/lib/mlb-recent-activity.mjs, kept self-contained here so this
 * feature does not couple to the (unrelated) bullpen pipeline.
 *
 * Endpoints used:
 *   GET /teams?sportId=1&season={season}
 *   GET /people/{id}/stats?stats=gameLog&season={season}&group=pitching
 *   GET /schedule?sportId=1&teamId={teamId}&startDate=&endDate=&gameType=R
 *   GET /game/{gamePk}/boxscore
 */

const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 1;
const DEFAULT_CONCURRENCY = 6;
export { MLB_STATS_API };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedBackoffMs(attempt) {
  return Math.min(250 * 2 ** attempt, 2000);
}

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

/** Fetches all MLB teams for a season; returns [{ id, abbreviation, name }]. */
export async function fetchAllTeams(season, options = {}) {
  const json = await fetchJsonWithRetry(`${MLB_STATS_API}/teams?sportId=1&season=${season}`, options);
  return (json?.teams ?? []).map((team) => ({
    id: team?.id ?? null,
    abbreviation: team?.abbreviation ?? null,
    name: team?.name ?? null,
  }));
}

export function buildTeamAbbrById(teams) {
  return new Map(teams.filter((team) => team.id != null).map((team) => [team.id, team.abbreviation]));
}

export function buildTeamIdByAbbr(teams) {
  return new Map(teams.filter((team) => team.abbreviation).map((team) => [team.abbreviation, team.id]));
}

/**
 * Fetches a pitcher's starts (gamesStarted >= 1) strictly before
 * `beforeDate`, most recent first, limited to `limit`. Opponent teamId is
 * resolved to a site abbreviation via `teamAbbrById`. Returns [] (never
 * throws) on any fetch/parse failure — callers treat that as "unavailable"
 * and the generator logs a warning.
 */
export async function fetchPitcherRecentStarts(pitcherId, season, beforeDate, teamAbbrById, options = {}) {
  const limit = options.limit ?? 5;
  try {
    const json = await fetchJsonWithRetry(
      `${MLB_STATS_API}/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching`,
      options
    );
    const splits = json?.stats?.[0]?.splits ?? [];
    const starts = splits
      .filter((split) => (split?.stat?.gamesStarted ?? 0) >= 1 && split?.date && split.date < beforeDate)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
      .map((split) => ({
        date: split.date,
        opponentAbbr: teamAbbrById.get(split?.opponent?.id) ?? null,
        inningsPitched: split?.stat?.inningsPitched ?? null,
        strikeouts: split?.stat?.strikeOuts ?? null,
      }));
    return { starts, error: null };
  } catch (error) {
    return { starts: [], error };
  }
}

function isCompletedRegularSeasonGame(game) {
  const status = game?.status ?? {};
  // codedGameState "F" alone identifies a game that was actually completed.
  // abstractGameState "Final" is NOT sufficient on its own: MLB StatsAPI
  // marks postponed/suspended games as abstractGameState "Final" too (their
  // codedGameState is "D" and detailedState is "Postponed"/"Suspended"),
  // which would otherwise leak a not-actually-played game — with a made-up
  // future officialDate — into "recent completed games".
  return game?.gameType === "R" && status.codedGameState === "F";
}

/**
 * Fetches a team's completed games strictly before `beforeDate`, most
 * recent first, limited to `limit`. Returns [] (never throws) on failure.
 */
export async function fetchTeamRecentCompletedGames(teamId, beforeDate, options = {}) {
  const limit = options.limit ?? 5;
  const lookbackDays = options.lookbackDays ?? 30;
  const startDate = options.startDate ?? shiftDate(beforeDate, -lookbackDays);
  const endDate = shiftDate(beforeDate, -1);
  try {
    const json = await fetchJsonWithRetry(
      `${MLB_STATS_API}/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}&gameType=R`,
      options
    );
    const games = (json?.dates ?? []).flatMap((dateBlock) => dateBlock?.games ?? []).filter(isCompletedRegularSeasonGame);
    games.sort((a, b) => String(b.officialDate).localeCompare(String(a.officialDate)));
    return { games: games.slice(0, limit), error: null };
  } catch (error) {
    return { games: [], error };
  }
}

function shiftDate(dateStr, deltaDays) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

/** Shared cache-aware boxscore fetch: multiple opponent games can share a gamePk lookup across a run. */
export async function fetchBoxscoreCached(gamePk, cache, options = {}) {
  const key = String(gamePk);
  if (cache.has(key)) return cache.get(key);
  const promise = fetchJsonWithRetry(`${MLB_STATS_API}/game/${gamePk}/boxscore`, options)
    .then((boxscore) => ({ boxscore, error: null }))
    .catch((error) => ({ boxscore: null, error }));
  cache.set(key, promise);
  return promise;
}

/**
 * From one completed game's boxscore, derive (from `teamId`'s perspective):
 * the opposing team's abbreviation, the opposing starting pitcher (the
 * pitcher on that side with gamesStarted === 1), that starter's IP/Ks
 * against `teamId`, and `teamId`'s own total batting strikeouts in the
 * game. Any field that cannot be identified is null — this never throws.
 */
export function deriveOpponentGameSummary(boxscore, teamId, officialDate) {
  if (!boxscore?.teams) {
    return {
      date: officialDate ?? null,
      opponent: null,
      opposingStartingPitcher: null,
      opposingStarterInningsPitched: null,
      opposingStarterStrikeouts: null,
      teamTotalStrikeouts: null,
    };
  }
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

/**
 * For a team's last N completed games, derive the opponent-last-5-games
 * detail rows (boxscores are fetched through the shared `boxscoreCache` so
 * multiple prop rows facing the same team reuse the same lookups).
 */
export async function fetchOpponentLastFiveGamesDetail(teamId, games, boxscoreCache, options = {}) {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const rows = await runLimited(games, concurrency, async (game) => {
    const { boxscore, error } = await fetchBoxscoreCached(game.gamePk, boxscoreCache, options);
    if (error || !boxscore) {
      return {
        date: game.officialDate ?? null,
        opponent: null,
        opposingStartingPitcher: null,
        opposingStarterInningsPitched: null,
        opposingStarterStrikeouts: null,
        teamTotalStrikeouts: null,
      };
    }
    return deriveOpponentGameSummary(boxscore, teamId, game.officialDate);
  });
  return rows;
}

export { DEFAULT_CONCURRENCY };
