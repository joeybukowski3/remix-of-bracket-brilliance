const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 1;
const ACTIVITY_SOURCE = "mlb_stats_api_boxscore";

function dateFromParts(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid date: ${dateStr}`);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, delta) {
  const date = dateFromParts(dateStr);
  date.setUTCDate(date.getUTCDate() + delta);
  return formatDate(date);
}

export function getRecentActivityWindow(slateDate, lookbackDays = 4) {
  return {
    startDate: addDays(slateDate, -lookbackDays),
    endDate: addDays(slateDate, -1),
    lookbackDays,
  };
}

export function isCompletedRegularSeasonGame(game, startDate, endDate) {
  const officialDate = game?.officialDate;
  if (!officialDate || officialDate < startDate || officialDate > endDate) return false;
  if (game?.gameType !== "R") return false;
  const status = game?.status ?? {};
  return (
    status.codedGameState === "F" ||
    status.abstractGameState === "Final" ||
    status.detailedState === "Final"
  );
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function playerIdFromBoxscoreKey(key, player) {
  const personId = Number(player?.person?.id);
  if (Number.isFinite(personId) && personId > 0) return personId;
  const keyId = Number(String(key).replace(/^ID/, ""));
  return Number.isFinite(keyId) && keyId > 0 ? keyId : null;
}

function collectTeamBattingActivity(teamBox, gameDate, activityByPlayerId) {
  for (const [key, player] of Object.entries(teamBox?.players ?? {})) {
    const playerId = playerIdFromBoxscoreKey(key, player);
    if (!playerId) continue;
    const batting = player?.stats?.batting ?? {};
    const plateAppearances = toNumber(batting.plateAppearances);
    const atBats = toNumber(batting.atBats);
    const current = activityByPlayerId.get(playerId) ?? {
      latestGameDate: null,
      gamesChecked: 0,
      plateAppearances: 0,
      atBats: 0,
    };
    current.gamesChecked += 1;
    current.plateAppearances += plateAppearances;
    current.atBats += atBats;
    if ((plateAppearances > 0 || atBats > 0) && (!current.latestGameDate || gameDate > current.latestGameDate)) {
      current.latestGameDate = gameDate;
    }
    activityByPlayerId.set(playerId, current);
  }
}

export function aggregateRecentActivityFromBoxscores(games, boxscores, options = {}) {
  const { slateDate, lookbackDays = 4, checkedAt = new Date().toISOString() } = options;
  const { startDate, endDate } = getRecentActivityWindow(slateDate, lookbackDays);
  const activityByPlayerId = new Map();
  const completedGames = games.filter((game) => isCompletedRegularSeasonGame(game, startDate, endDate));

  for (const game of completedGames) {
    const boxscore = boxscores.get(String(game.gamePk));
    if (!boxscore) continue;
    collectTeamBattingActivity(boxscore?.teams?.away, game.officialDate, activityByPlayerId);
    collectTeamBattingActivity(boxscore?.teams?.home, game.officialDate, activityByPlayerId);
  }

  return {
    activityByPlayerId,
    completedGames,
    checkedAt,
    lookbackDays,
    source: ACTIVITY_SOURCE,
  };
}

function defaultActivityResult({ active, reason, checkedAt, lookbackDays, source, activity }) {
  return {
    active,
    reason,
    latestGameDate: activity?.latestGameDate ?? null,
    gamesChecked: activity?.gamesChecked ?? 0,
    plateAppearances: activity?.plateAppearances ?? 0,
    atBats: activity?.atBats ?? 0,
    checkedAt,
    lookbackDays,
    source,
  };
}

export function buildRecentActivityResults(candidates, aggregate, options = {}) {
  const checkedAt = aggregate.checkedAt ?? options.checkedAt ?? new Date().toISOString();
  const lookbackDays = aggregate.lookbackDays ?? options.lookbackDays ?? 4;
  const source = aggregate.source ?? ACTIVITY_SOURCE;
  const failedPlayerIds = new Set((options.failedPlayerIds ?? []).map(Number));
  const anyLookupFailed = Boolean(options.anyLookupFailed);
  const resultsByKey = new Map();
  const lookupCountByPlayerId = new Map();

  for (const candidate of candidates) {
    const key = candidate.key;
    const playerId = Number(candidate.playerId);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      resultsByKey.set(key, defaultActivityResult({
        active: false,
        reason: "unresolved_player_id",
        checkedAt,
        lookbackDays,
        source,
      }));
      continue;
    }

    lookupCountByPlayerId.set(playerId, (lookupCountByPlayerId.get(playerId) ?? 0) + 1);
    const activity = aggregate.activityByPlayerId.get(playerId);
    if (activity && (activity.plateAppearances > 0 || activity.atBats > 0)) {
      resultsByKey.set(key, defaultActivityResult({
        active: true,
        reason: "recorded_plate_appearance",
        checkedAt,
        lookbackDays,
        source,
        activity,
      }));
      continue;
    }

    resultsByKey.set(key, defaultActivityResult({
      active: false,
      reason: anyLookupFailed || failedPlayerIds.has(playerId) ? "activity_lookup_failed" : "no_recent_plate_appearance",
      checkedAt,
      lookbackDays,
      source,
      activity,
    }));
  }

  return { resultsByKey, lookupCountByPlayerId };
}

export function dedupeCandidatesByKey(candidates) {
  const byKey = new Map();
  for (const candidate of candidates) {
    if (!candidate?.key || byKey.has(candidate.key)) continue;
    byKey.set(candidate.key, candidate);
  }
  return [...byKey.values()];
}

export function filterCollectionByRecentActivity(players, options) {
  const { keyForPlayer, resultsByKey, annotatePlayer = (player, result) => ({ ...player, recentActivity: result }) } = options;
  const seen = new Set();
  const output = [];
  for (const player of players ?? []) {
    const key = keyForPlayer(player);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const result = resultsByKey.get(key);
    if (!result?.active) continue;
    output.push(annotatePlayer(player, result));
  }
  return output;
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

export async function fetchRecentActivityAggregate(slateDate, options = {}) {
  const lookbackDays = options.lookbackDays ?? 4;
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const { startDate, endDate } = getRecentActivityWindow(slateDate, lookbackDays);
  const fetchOptions = {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
  };
  const scheduleUrl = `${MLB_STATS_API}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}&gameType=R`;
  const schedule = await fetchJsonWithRetry(scheduleUrl, fetchOptions);
  const games = (schedule?.dates ?? []).flatMap((dateBlock) => dateBlock?.games ?? []);
  const completedGames = games.filter((game) => isCompletedRegularSeasonGame(game, startDate, endDate));
  const boxscoreEntries = await runLimited(
    completedGames,
    options.concurrency ?? 8,
    async (game) => {
      try {
        const url = `${MLB_STATS_API}/game/${game.gamePk}/boxscore`;
        return { gamePk: String(game.gamePk), boxscore: await fetchJsonWithRetry(url, fetchOptions), error: null };
      } catch (error) {
        return { gamePk: String(game.gamePk), boxscore: null, error };
      }
    },
  );

  const boxscores = new Map();
  const failedGamePks = [];
  for (const entry of boxscoreEntries) {
    if (entry?.boxscore) boxscores.set(entry.gamePk, entry.boxscore);
    else if (entry?.gamePk) failedGamePks.push(entry.gamePk);
  }

  const aggregate = aggregateRecentActivityFromBoxscores(completedGames, boxscores, {
    slateDate,
    lookbackDays,
    checkedAt,
  });

  return {
    ...aggregate,
    failedGamePks,
    anyLookupFailed: failedGamePks.length > 0,
    startDate,
    endDate,
  };
}

export function summarizeActivityResults(resultsByKey) {
  const counts = {};
  let activeCount = 0;
  for (const result of resultsByKey.values()) {
    counts[result.reason] = (counts[result.reason] ?? 0) + 1;
    if (result.active) activeCount += 1;
  }
  return {
    activeCount,
    excludedCount: resultsByKey.size - activeCount,
    exclusionReasons: Object.entries(counts)
      .filter(([reason]) => reason !== "recorded_plate_appearance")
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
  };
}

export { ACTIVITY_SOURCE };
