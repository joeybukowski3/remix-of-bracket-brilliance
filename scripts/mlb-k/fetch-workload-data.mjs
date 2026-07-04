export const WORKLOAD_FETCH_VERSION = "mlb-k-workload-fetch-v2";

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

  return {
    season,
    date: String(split?.date ?? "").slice(0, 10) || null,
    opponent: split?.opponent?.name ?? null,
    isStart: gamesStarted >= 1,
    gamesStarted,
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
  if (!response.ok) return { ok: false, error: response.error, appearances: [], starts: [], url };

  const splits = response.json?.stats?.flatMap((block) => block?.splits ?? []) ?? [];
  const appearances = splits
    .map((split) => normalizeAppearance(split, season))
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const starts = appearances.filter((appearance) => appearance.isStart);

  return { ok: true, error: null, appearances, starts, url };
}

function looksLikeReliever(appearances, starts) {
  if (appearances.length < 3) return false;
  const reliefAppearances = appearances.length - starts.length;
  return starts.length <= 1 && reliefAppearances / appearances.length >= 0.7;
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
  let allAppearances = current.appearances;
  let allStarterAppearances = current.starts;
  let usedPreviousSeasonFallback = false;
  const requests = [current.url];
  const warnings = [];

  if (!current.ok) warnings.push("CURRENT_SEASON_GAME_LOG_UNAVAILABLE");

  const currentRelieverProfile = looksLikeReliever(current.appearances, current.starts);
  if (includePreviousSeasonFallback && !currentRelieverProfile && allStarterAppearances.length < limit) {
    const previous = await fetchSeasonGameLog(id, season - 1, options);
    requests.push(previous.url);
    if (previous.ok && previous.appearances.length) {
      allAppearances = [...previous.appearances, ...allAppearances];
      allStarterAppearances = [...previous.starts, ...allStarterAppearances];
      usedPreviousSeasonFallback = true;
    } else if (!previous.ok) {
      warnings.push("PREVIOUS_SEASON_GAME_LOG_UNAVAILABLE");
    }
  }

  const target = String(targetDate).slice(0, 10);
  const currentEligibleAppearances = current.appearances.filter((appearance) => !appearance.date || appearance.date <= target);
  const eligibleAppearances = allAppearances.filter((appearance) => !appearance.date || appearance.date <= target);
  const eligibleStarts = allStarterAppearances.filter((start) => !start.date || start.date <= target);
  const starts = eligibleStarts.slice(-Math.max(1, Math.trunc(limit)));
  const recentAppearances = eligibleAppearances.slice(-Math.max(8, Math.trunc(limit)));

  const currentStarterAppearances = currentEligibleAppearances.filter((appearance) => appearance.isStart);
  const currentReliefAppearances = currentEligibleAppearances.filter((appearance) => !appearance.isStart);
  const currentLooksLikeReliever = looksLikeReliever(currentEligibleAppearances, currentStarterAppearances);
  const samplesForCompleteness = currentLooksLikeReliever ? recentAppearances : starts;

  const latestStartDate = starts.at(-1)?.date ?? null;
  const latestAppearanceDate = recentAppearances.at(-1)?.date ?? latestStartDate;
  const daysSinceLastStart = latestStartDate
    ? Math.max(0, Math.round((Date.parse(`${target}T12:00:00Z`) - Date.parse(`${latestStartDate}T12:00:00Z`)) / 86_400_000))
    : null;
  const reliefAppearanceSinceLastStart = Boolean(
    latestStartDate
    && recentAppearances.some((appearance) => !appearance.isStart && appearance.date && appearance.date > latestStartDate),
  );

  const usable = samplesForCompleteness.filter((appearance) => Number.isFinite(appearance.pitches) && Number.isFinite(appearance.battersFaced));
  const completenessScore = Math.min(1, usable.length / Math.max(3, currentLooksLikeReliever ? 5 : limit));
  const flags = [];
  if (currentLooksLikeReliever) flags.push("RELIEVER_PROFILE");
  else if (!starts.length) flags.push("NO_STARTS_AVAILABLE");

  return {
    ok: current.ok || starts.length > 0 || recentAppearances.length > 0,
    pitcherId: id,
    season,
    targetDate: target,
    starts,
    recentAppearances,
    allAppearances: eligibleAppearances,
    allStarterAppearances: eligibleStarts,
    excludedStarterAppearances: [],
    completeness: {
      score: Number(completenessScore.toFixed(3)),
      grade: completenessScore >= 0.85 ? "A" : completenessScore >= 0.65 ? "B" : completenessScore >= 0.4 ? "C" : "D",
      flags,
      warnings,
      latestStartDate,
      latestAppearanceDate,
      daysSinceLastStart,
      reliefAppearanceSinceLastStart,
      counts: {
        allAppearances: eligibleAppearances.length,
        starterAppearances: eligibleStarts.length,
        reliefAppearances: eligibleAppearances.filter((appearance) => !appearance.isStart).length,
        currentSeasonAppearances: currentEligibleAppearances.length,
        currentSeasonStarterAppearances: currentStarterAppearances.length,
        currentSeasonReliefAppearances: currentReliefAppearances.length,
        usableStarterAppearances: starts.filter((start) => Number.isFinite(start.pitches) && Number.isFinite(start.battersFaced)).length,
        usableRecentAppearances: usable.length,
        returnedStarts: starts.length,
        returnedRecentAppearances: recentAppearances.length,
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
