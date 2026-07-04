export const WORKLOAD_FETCH_VERSION = "mlb-k-workload-fetch-v1";

export function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getTodayEt(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function inferSeason(dateText = getTodayEt()) {
  const year = Number(String(dateText).slice(0, 4));
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJsonWithRetry(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  maxAttempts = 3,
} = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return {
        ok: true,
        status: response.status,
        json: await response.json(),
        error: null,
        attempts: attempt,
      };
    } catch (error) {
      clearTimeout(timer);
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < maxAttempts) await sleep(attempt * 250);
    }
  }

  return {
    ok: false,
    status: null,
    json: null,
    error: lastError ?? `Request failed: ${url}`,
    attempts: maxAttempts,
  };
}

function parseInnings(value) {
  if (value === null || value === undefined || value === "") return null;
  const [wholeText, partialText = "0"] = String(value).split(".");
  const whole = Number(wholeText);
  const partial = Number(partialText);
  if (!Number.isFinite(whole) || !Number.isFinite(partial) || partial < 0 || partial > 2) return null;
  return whole + partial / 3;
}

function normalizeAppearance(split, season) {
  const stat = split?.stat ?? {};
  const gamesStarted = toFiniteNumber(stat.gamesStarted, 0);
  if (gamesStarted < 1) return null;

  return {
    season,
    date: String(split?.date ?? "").slice(0, 10) || null,
    opponent: split?.opponent?.name ?? null,
    pitches: toFiniteNumber(stat.numberOfPitches ?? stat.pitchesThrown),
    battersFaced: toFiniteNumber(stat.battersFaced),
    strikeouts: toFiniteNumber(stat.strikeOuts ?? stat.strikeouts, 0),
    walks: toFiniteNumber(stat.baseOnBalls ?? stat.walks, 0),
    inningsPitched: parseInnings(stat.inningsPitched),
    earnedRuns: toFiniteNumber(stat.earnedRuns, 0),
    hits: toFiniteNumber(stat.hits, 0),
    homeRuns: toFiniteNumber(stat.homeRuns, 0),
  };
}

async function fetchSeasonGameLog(pitcherId, season, options) {
  const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=gameLog&season=${season}&group=pitching`;
  const response = await fetchJsonWithRetry(url, options);
  if (!response.ok) return { ok: false, error: response.error, starts: [], url };

  const splits = response.json?.stats?.flatMap((block) => block?.splits ?? []) ?? [];
  const starts = splits
    .map((split) => normalizeAppearance(split, season))
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return { ok: true, error: null, starts, url };
}

export async function fetchPitcherWorkloadData(pitcherId, {
  season = new Date().getFullYear(),
  targetDate = getTodayEt(),
  limit = 6,
  includePreviousSeasonFallback = true,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  maxAttempts = 3,
} = {}) {
  const id = toFiniteNumber(pitcherId);
  if (id == null) throw new Error("pitcherId is required");

  const options = { fetchImpl, timeoutMs, maxAttempts };
  const current = await fetchSeasonGameLog(id, season, options);
  let allStarterAppearances = current.starts;
  let usedPreviousSeasonFallback = false;
  const requests = [current.url];
  const warnings = [];

  if (!current.ok) warnings.push("CURRENT_SEASON_GAME_LOG_UNAVAILABLE");

  if (includePreviousSeasonFallback && allStarterAppearances.length < limit) {
    const previous = await fetchSeasonGameLog(id, season - 1, options);
    requests.push(previous.url);
    if (previous.ok && previous.starts.length) {
      allStarterAppearances = [...previous.starts, ...allStarterAppearances];
      usedPreviousSeasonFallback = true;
    } else if (!previous.ok) {
      warnings.push("PREVIOUS_SEASON_GAME_LOG_UNAVAILABLE");
    }
  }

  const target = String(targetDate).slice(0, 10);
  const eligible = allStarterAppearances.filter((start) => !start.date || start.date <= target);
  const starts = eligible.slice(-Math.max(1, Math.trunc(limit)));
  const latestStartDate = starts.at(-1)?.date ?? null;
  const daysSinceLastStart = latestStartDate
    ? Math.max(0, Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${latestStartDate}T12:00:00Z`)) / 86_400_000))
    : null;

  const usable = starts.filter((start) => Number.isFinite(start.pitches) && Number.isFinite(start.battersFaced));
  const completenessScore = Math.min(1, usable.length / Math.max(3, limit));

  return {
    ok: current.ok || starts.length > 0,
    pitcherId: id,
    season,
    targetDate: target,
    starts,
    allStarterAppearances: eligible,
    excludedStarterAppearances: [],
    completeness: {
      score: Number(completenessScore.toFixed(3)),
      grade: completenessScore >= 0.85 ? "A" : completenessScore >= 0.65 ? "B" : completenessScore >= 0.4 ? "C" : "D",
      flags: starts.length ? [] : ["NO_STARTS_AVAILABLE"],
      warnings,
      latestStartDate,
      latestAppearanceDate: latestStartDate,
      daysSinceLastStart,
      reliefAppearanceSinceLastStart: false,
      counts: {
        allAppearances: eligible.length,
        starterAppearances: eligible.length,
        usableStarterAppearances: usable.length,
        returnedStarts: starts.length,
      },
    },
    source: {
      version: WORKLOAD_FETCH_VERSION,
      primary: "mlb_stats_api_game_log",
      requests,
      usedPreviousSeasonFallback,
    },
    error: current.ok ? null : current.error,
  };
}

export default fetchPitcherWorkloadData;
