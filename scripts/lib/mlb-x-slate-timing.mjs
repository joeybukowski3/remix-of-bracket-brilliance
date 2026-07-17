/**
 * mlb-x-slate-timing.mjs
 *
 * Single shared source of truth for "when should today's MLB X tables be
 * posted?" -- used by the HR and K posting-readiness poll (and available to
 * Numerology). Replaces the old fixed 1:45/1:50 PM ET backstop assumptions:
 * the posting window is driven by the day's *earliest scheduled first pitch*,
 * pulled live from the MLB StatsAPI schedule, not from a fixed clock time or
 * from odds rows on the page.
 *
 * DST-safety: every window boundary is computed in absolute epoch
 * milliseconds off each game's ISO-UTC `gameDate`. There is no wall-clock or
 * Eastern-offset arithmetic in the window math, so the result is identical
 * regardless of EST/EDT -- the only Eastern-specific value is the calendar
 * `slateDate` (today in America/New_York), which Intl handles correctly
 * across the DST boundary.
 *
 * Split into a pure core (computeSlateTiming / normalizeScheduleGames --
 * fully unit-testable with fixed `now` and canned schedule JSON) and a thin
 * async fetch wrapper (fetchSlateTiming) that hits StatsAPI. Mirrors the
 * core+fetch split used elsewhere in this repo (mlb-strikeout-prop-details-*,
 * mlb-ml-edge-core/mlb-ml-detail-fetch).
 */

const MS_PER_MINUTE = 60_000;

// Window boundaries, expressed as minutes *before* the earliest first pitch.
// Start polling ~3h out, prefer posting 60-90 min out, hard-stop 40 min out.
export const POLLING_LEAD_MINUTES = 180;
export const PREFERRED_WINDOW_START_MINUTES = 90;
export const PREFERRED_WINDOW_END_MINUTES = 60;
export const FINAL_CUTOFF_MINUTES = 40;

export const SlatePhase = {
  /** No games / no usable start times today -- nothing to post. */
  NO_GAMES: "NO_GAMES",
  /** Earlier than ~3h before first pitch -- too early, exit cleanly. */
  PRE_POLLING: "PRE_POLLING",
  /** ~3h to ~90m before first pitch -- poll; post as soon as enough confirmed. */
  POLLING: "POLLING",
  /** ~90m to ~60m before first pitch -- preferred posting window. */
  PREFERRED: "PREFERRED",
  /** ~60m to ~40m before first pitch -- last stretch; post best-available confirmed. */
  FINAL_CUTOFF: "FINAL_CUTOFF",
  /** At/after the ~40m cutoff (or first pitch already passed) -- stop waiting. */
  EXPIRED: "EXPIRED",
};

/** Detailed-state substrings that mean a game has no usable first pitch today. */
const EXCLUDED_STATE_SUBSTRINGS = ["postponed", "suspended", "cancel", "delayed start: ppd"];

function toEpochMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function getDetailedState(status) {
  if (!status) return "";
  if (typeof status === "string") return status.trim().toLowerCase();
  return String(status.detailedState ?? status.abstractGameState ?? "").trim().toLowerCase();
}

function getAbstractState(status) {
  if (!status || typeof status === "string") return "";
  return String(status.abstractGameState ?? "").trim().toLowerCase();
}

/** True when a game is postponed/suspended/cancelled -- it has no first pitch that anchors today's window. */
export function isGameExcluded(game) {
  const detailed = getDetailedState(game?.status);
  return EXCLUDED_STATE_SUBSTRINGS.some((needle) => detailed.includes(needle));
}

/** True when a game is already underway or finished (so its lineup is locked / players may already be batting). */
export function isGameStarted(game, nowMs) {
  const abstract = getAbstractState(game?.status);
  if (abstract === "live" || abstract === "final") return true;
  const detailed = getDetailedState(game?.status);
  if (detailed.includes("in progress") || detailed === "final" || detailed.includes("game over") || detailed.includes("completed")) {
    return true;
  }
  const startMs = toEpochMs(game?.gameDate);
  if (startMs != null && Number.isFinite(nowMs)) return nowMs >= startMs;
  return false;
}

/**
 * Normalizes a raw StatsAPI schedule payload (or an already-extracted games
 * array) into the minimal `{ gamePk, gameDate, status, matchup }[]` shape the
 * pure timing core consumes. Tolerates malformed/partial payloads by dropping
 * unusable entries rather than throwing.
 */
export function normalizeScheduleGames(scheduleJson) {
  let rawGames = [];
  if (Array.isArray(scheduleJson)) {
    rawGames = scheduleJson;
  } else if (Array.isArray(scheduleJson?.dates)) {
    rawGames = scheduleJson.dates.flatMap((d) => (Array.isArray(d?.games) ? d.games : []));
  } else if (Array.isArray(scheduleJson?.games)) {
    rawGames = scheduleJson.games;
  }

  return rawGames
    .filter((g) => g && typeof g === "object")
    .map((g) => ({
      gamePk: g.gamePk ?? g.gameKey ?? null,
      gameDate: typeof g.gameDate === "string" ? g.gameDate : null,
      status: g.status ?? null,
      matchup:
        g.matchup ??
        (g?.teams?.away?.team?.abbreviation && g?.teams?.home?.team?.abbreviation
          ? `${g.teams.away.team.abbreviation} @ ${g.teams.home.team.abbreviation}`
          : null),
    }));
}

function phaseForMinutesUntil(minutesUntil) {
  if (minutesUntil > POLLING_LEAD_MINUTES) return SlatePhase.PRE_POLLING;
  if (minutesUntil > PREFERRED_WINDOW_START_MINUTES) return SlatePhase.POLLING;
  if (minutesUntil > PREFERRED_WINDOW_END_MINUTES) return SlatePhase.PREFERRED;
  if (minutesUntil > FINAL_CUTOFF_MINUTES) return SlatePhase.FINAL_CUTOFF;
  return SlatePhase.EXPIRED;
}

/**
 * Pure timing decision. Given today's games and a `now`, returns the stable
 * machine-readable slate-timing result documented in the PR.
 *
 * @param {{ games: Array<object>, now?: Date|number, slateDate?: string }} params
 */
export function computeSlateTiming({ games = [], now = new Date(), slateDate = "" } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);

  const usableGames = games.filter((g) => !isGameExcluded(g) && toEpochMs(g?.gameDate) != null);
  const startTimes = usableGames.map((g) => toEpochMs(g.gameDate)).filter((ms) => ms != null);

  const base = {
    slateDate,
    gameCount: games.length,
    usableGameCount: usableGames.length,
    earliestGameTime: null,
    pollingStartsAt: null,
    preferredWindowStartsAt: null,
    preferredWindowEndsAt: null,
    finalCutoffAt: null,
    minutesUntilFirstPitch: null,
    allGamesStarted: false,
    hasGames: usableGames.length > 0,
    phase: SlatePhase.NO_GAMES,
    isPollingOrLater: false,
    isPostingWindow: false,
    isPreferredWindow: false,
    isFinalCutoff: false,
    isExpired: false,
  };

  if (!startTimes.length) return base;

  const earliestMs = Math.min(...startTimes);
  const allGamesStarted = usableGames.every((g) => isGameStarted(g, nowMs));
  const minutesUntilFirstPitch = Math.round((earliestMs - nowMs) / MS_PER_MINUTE);
  const phase = phaseForMinutesUntil(minutesUntilFirstPitch);

  const isFinalCutoff = phase === SlatePhase.FINAL_CUTOFF;
  const isPreferredWindow = phase === SlatePhase.PREFERRED;
  const isPostingWindow =
    phase === SlatePhase.POLLING || phase === SlatePhase.PREFERRED || phase === SlatePhase.FINAL_CUTOFF;

  return {
    ...base,
    earliestGameTime: new Date(earliestMs).toISOString(),
    pollingStartsAt: new Date(earliestMs - POLLING_LEAD_MINUTES * MS_PER_MINUTE).toISOString(),
    preferredWindowStartsAt: new Date(earliestMs - PREFERRED_WINDOW_START_MINUTES * MS_PER_MINUTE).toISOString(),
    preferredWindowEndsAt: new Date(earliestMs - PREFERRED_WINDOW_END_MINUTES * MS_PER_MINUTE).toISOString(),
    finalCutoffAt: new Date(earliestMs - FINAL_CUTOFF_MINUTES * MS_PER_MINUTE).toISOString(),
    minutesUntilFirstPitch,
    allGamesStarted,
    hasGames: true,
    phase,
    isPollingOrLater: isPostingWindow || phase === SlatePhase.EXPIRED,
    isPostingWindow,
    isPreferredWindow,
    isFinalCutoff,
    isExpired: phase === SlatePhase.EXPIRED,
  };
}

/** Today's slate date (calendar day in America/New_York), DST-safe via Intl. */
export function getEtSlateDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now instanceof Date ? now : new Date(now));
}

/**
 * Current wall-clock time in America/New_York, as minutes since midnight.
 * DST-safe via Intl (no manual EST/EDT offset arithmetic) -- used for
 * content types with a fixed daily earliest-post clock time (currently K's
 * ~11:00 AM ET floor) layered on top of the first-pitch-relative window
 * above, rather than a hardcoded UTC cron hour.
 */
export function getEtMinutesSinceMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now instanceof Date ? now : new Date(now));
  // hour12:false can format midnight as "24" in some environments; normalize.
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** True once the America/New_York wall clock has reached hour:minute today (DST-safe). */
export function isAtOrAfterEtClockTime(now, hour, minute) {
  return getEtMinutesSinceMidnight(now) >= hour * 60 + minute;
}

// K-only: 11:00 AM ET is the opening of the K posting window (not a fixed
// publication guarantee) -- posting still waits on the phase/final-cutoff
// window above this floor. HR/Numerology are entirely unaffected; they
// never pass earliestPostGuardPassed to resolvePostingReadiness. Shared
// here (rather than defined once in the poller and once in the poster)
// so both call sites can never drift out of sync with each other.
export const K_EARLIEST_POST_ET_HOUR = 11;
export const K_EARLIEST_POST_ET_MINUTE = 0;

const STATS_API_SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule";

/**
 * Live slate timing off the MLB StatsAPI schedule. Thin wrapper -- all the
 * decision logic lives in the pure core above. `fetchImpl` is injectable for
 * tests. Fetch/parse failures return a NO_GAMES-shaped result flagged with
 * `error`, so callers fail closed (never post) rather than throwing.
 *
 * @param {{ now?: Date, date?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function fetchSlateTiming({ now = new Date(), date, fetchImpl = fetch } = {}) {
  const slateDate = date || getEtSlateDate(now);
  const url = `${STATS_API_SCHEDULE_URL}?sportId=1&date=${slateDate}&hydrate=team,linescore`;
  try {
    const response = await fetchImpl(url, { headers: { "User-Agent": "joeknowsball-x-slate-timing" } });
    if (!response.ok) {
      return { ...computeSlateTiming({ games: [], now, slateDate }), error: `schedule HTTP ${response.status}` };
    }
    const json = await response.json();
    const games = normalizeScheduleGames(json);
    return computeSlateTiming({ games, now, slateDate });
  } catch (error) {
    return {
      ...computeSlateTiming({ games: [], now, slateDate }),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
