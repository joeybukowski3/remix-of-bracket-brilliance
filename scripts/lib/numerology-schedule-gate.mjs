
/**
 * numerology-schedule-gate.mjs
 *
 * Scheduling and duplicate-run gate logic for the twice-daily MLB Numerology workflow.
 *
 * Phase 1 — Morning:     4:44 AM America/New_York with delayed-delivery retry window
 * Phase 2 — Lineup:      First active game start − 2 hours, once lineups are confirmed
 *
 * All slate-date and time decisions use America/New_York.
 * No external API calls; accepts injected schedule data and current timestamps.
 */

/** Active game statuses — anything else is treated as postponed/cancelled */
const ACTIVE_STATUSES = new Set([
  "Scheduled", "Pre-Game", "Warmup", "Delayed Start",
  "In Progress", "Manager Challenge", "Delayed", "Suspended",
]);

/**
 * Return today's date string in ET (YYYY-MM-DD).
 * @param {Date} [now]
 */
export function getEtDateString(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Return current ET hour and minute as { hour, minute }.
 * @param {Date} [now]
 */
export function getEtHourMinute(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = parts.find(p => p.type === "hour");
  const m = parts.find(p => p.type === "minute");
  return { hour: parseInt(h?.value ?? "0", 10), minute: parseInt(m?.value ?? "0", 10) };
}

/**
 * Whether the morning run is allowed right now.
 *
 * Target: 4:44 AM ET. GitHub Actions scheduled crons are best-effort, so the
 * gate remains open until 6:14 AM ET for delayed or retry deliveries. It never
 * opens before 4:44 AM ET. The once-per-day completion guard prevents duplicate
 * production generations after a successful run.
 *
 * @param {Date} now
 * @param {{ morningGeneratedAt?: string|null, date?: string }} existingOutput
 * @param {string} etDateToday
 */
export function isMorningRunAllowed(now, existingOutput, etDateToday) {
  if (existingOutput?.date === etDateToday && existingOutput?.morningGeneratedAt) {
    return { allowed: false, reason: `Morning already completed for ${etDateToday}` };
  }

  const { hour, minute } = getEtHourMinute(now);
  const minuteOfDay = hour * 60 + minute;
  const TARGET = 4 * 60 + 44;
  const LATE_TOLERANCE = 90;

  if (minuteOfDay < TARGET || minuteOfDay > TARGET + LATE_TOLERANCE) {
    return {
      allowed: false,
      reason: `Not in 4:44 ET morning window (current ET ${hour}:${String(minute).padStart(2, "0")})`,
    };
  }

  return { allowed: true, reason: "Within 4:44 ET morning window" };
}

/**
 * Find the earliest active game start time from a raw MLB Stats API schedule response.
 *
 * @param {object} scheduleData
 * @param {string} etDateToday
 * @returns {{ firstGameStart: Date|null, targetTime: Date|null }}
 */
export function computeLineupTargetTime(scheduleData, etDateToday) {
  const games = scheduleData?.dates?.[0]?.games ?? [];

  const activeTimes = games
    .filter(g => {
      const status = g?.status?.detailedState ?? g?.status?.abstractGameState ?? "";
      const isInactive = ["Postponed", "Cancelled", "Suspended", "Final", "Game Over", "Completed Early"].includes(status);
      return !isInactive;
    })
    .map(g => g.gameDate)
    .filter(Boolean)
    .map(d => new Date(d))
    .filter(d => !isNaN(d.getTime()));

  if (activeTimes.length === 0) {
    return { firstGameStart: null, targetTime: null };
  }

  activeTimes.sort((a, b) => a - b);
  const firstGameStart = activeTimes[0];
  const targetTime = new Date(firstGameStart.getTime() - 2 * 60 * 60 * 1000);

  return { firstGameStart, targetTime };
}

/**
 * Whether the lineup-confirmed run is allowed right now.
 *
 * @param {Date} now
 * @param {Date|null} targetTime
 * @param {boolean} lineupsConfirmed
 * @param {{ lineupConfirmedGeneratedAt?: string|null, date?: string }} existingOutput
 * @param {string} etDateToday
 */
export function isLineupRunAllowed(now, targetTime, lineupsConfirmed, existingOutput, etDateToday) {
  if (!targetTime) {
    return { allowed: false, reason: "No active MLB games for current ET date" };
  }

  if (existingOutput?.date === etDateToday && existingOutput?.lineupConfirmedGeneratedAt) {
    return { allowed: false, reason: `Lineup-confirmed already completed for ${etDateToday}` };
  }

  if (now < targetTime) {
    const minsUntil = Math.round((targetTime - now) / 60000);
    return { allowed: false, reason: `Target time not reached — ${minsUntil} min until first-game-minus-2h` };
  }

  if (!lineupsConfirmed) {
    return { allowed: false, reason: "Lineups not yet confirmed" };
  }

  return { allowed: true, reason: "At/past target time and lineups confirmed" };
}

/**
 * Whether enough confirmed lineup players are present.
 * @param {Array<{battingOrder?: number|null}>} scheduleRoster
 */
export function areLineupsConfirmed(scheduleRoster) {
  if (!Array.isArray(scheduleRoster) || scheduleRoster.length === 0) return false;
  const confirmed = scheduleRoster.filter(r => r.battingOrder != null && r.battingOrder > 0);
  return confirmed.length >= 9;
}

/**
 * Evaluate the correct run mode given the dispatch input and current state.
 * @param {"auto"|"morning"|"lineup-confirmed"|"force-refresh"} phase
 * @param {Date} now
 * @param {object|null} existingOutput
 * @param {object|null} scheduleData
 * @param {Array} scheduleRoster
 * @returns {{ run: boolean, updatePhase: string, reason: string }}
 */
export function evaluateGate(phase, now, existingOutput, scheduleData, scheduleRoster) {
  const etDateToday = getEtDateString(now);

  if (phase === "force-refresh") {
    return { run: true, updatePhase: "force-refresh", reason: "Manual force-refresh requested" };
  }

  const { targetTime } = scheduleData
    ? computeLineupTargetTime(scheduleData, etDateToday)
    : { targetTime: null };

  const lineupsConfirmed = areLineupsConfirmed(scheduleRoster);

  if (phase === "morning") {
    const check = isMorningRunAllowed(now, existingOutput, etDateToday);
    if (!check.allowed) return { run: false, updatePhase: "morning", reason: check.reason };
    return { run: true, updatePhase: "morning", reason: check.reason };
  }

  if (phase === "lineup-confirmed") {
    const check = isLineupRunAllowed(now, targetTime, lineupsConfirmed, existingOutput, etDateToday);
    if (!check.allowed) return { run: false, updatePhase: "lineup-confirmed", reason: check.reason };
    return { run: true, updatePhase: "lineup-confirmed", reason: check.reason };
  }

  const morningCheck = isMorningRunAllowed(now, existingOutput, etDateToday);
  if (morningCheck.allowed) {
    return { run: true, updatePhase: "morning", reason: morningCheck.reason };
  }

  const lineupCheck = isLineupRunAllowed(now, targetTime, lineupsConfirmed, existingOutput, etDateToday);
  if (lineupCheck.allowed) {
    return { run: true, updatePhase: "lineup-confirmed", reason: lineupCheck.reason };
  }

  return {
    run: false,
    updatePhase: "auto",
    reason: `Morning: ${morningCheck.reason}; Lineup: ${lineupCheck.reason}`,
  };
}
