/**
 * numerology-schedule-gate.mjs
 *
 * Scheduling and duplicate-run gate logic for the twice-daily MLB Numerology workflow.
 *
 * Phase 1 — Morning:     4:44 AM America/New_York with delayed-delivery retry window
 * Phase 2 — Lineup:      First active game start − 2 hours, once lineups are confirmed
 * Catch-up — If the saved slate date is stale, auto mode advances it immediately.
 *
 * All slate-date and time decisions use America/New_York.
 * No external API calls; accepts injected schedule data and current timestamps.
 */

const ACTIVE_STATUSES = new Set([
  "Scheduled", "Pre-Game", "Warmup", "Delayed Start",
  "In Progress", "Manager Challenge", "Delayed", "Suspended",
]);

export function getEtDateString(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

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

export function areLineupsConfirmed(scheduleRoster) {
  if (!Array.isArray(scheduleRoster) || scheduleRoster.length === 0) return false;
  const confirmed = scheduleRoster.filter(r => r.battingOrder != null && r.battingOrder > 0);
  return confirmed.length >= 9;
}

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

  // Auto mode must never leave yesterday's slate published just because GitHub
  // missed the nominal 4:44 delivery window. A stale or missing date is allowed
  // to run immediately as a morning catch-up. Once the date advances, the normal
  // once-per-day guards prevent duplicate work.
  if (!existingOutput?.date || existingOutput.date !== etDateToday) {
    return {
      run: true,
      updatePhase: "morning",
      reason: `Catch-up required: existing slate ${existingOutput?.date ?? "missing"}, current ET date ${etDateToday}`,
    };
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
