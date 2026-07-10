/**
 * Every workflow with a DST-paired UTC `schedule:` backstop (HR, K,
 * Numerology) has two cron entries mapping to the same single intended
 * Eastern wall-clock time -- one is only ever correct during EDT, the
 * other only during EST. GitHub Actions has no concept of a timezone-
 * aware seasonal cron: BOTH entries fire, every day, year-round. Without
 * a runtime gate, the "wrong" season's entry would still reach
 * screenshot generation, duplicate-lock consumption, cache writes, and
 * X API setup.
 *
 * This resolves whether *this* firing's actual current Eastern time is
 * close enough to the single intended local target to be the real
 * occurrence (either because it's the correctly-aligned cron for the
 * current season, or a workflow_dispatch/workflow_run trigger that
 * doesn't need this check at all), or whether it's the other season's
 * phantom firing that should exit cleanly as SKIPPED_DST_MISMATCH before
 * any further work.
 *
 * One target time handles both seasons correctly without season-specific
 * branches: during EDT the EDT-aligned cron lands exactly on the target
 * and the EST-aligned cron lands exactly one hour off (and vice versa
 * during EST) -- so a single "is now within tolerance of the target"
 * check is sufficient and symmetric.
 */

export function getCurrentEasternTime(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return { hour, minute };
}

/**
 * @param {{hour:number,minute:number}} nowEt
 * @param {{hour:number,minute:number}} targetEt
 * @param {number} toleranceMinutes
 */
export function resolveDstGateResult(nowEt, targetEt, toleranceMinutes = 10) {
  const nowMinuteOfDay = nowEt.hour * 60 + nowEt.minute;
  const targetMinuteOfDay = targetEt.hour * 60 + targetEt.minute;
  const diffMinutes = Math.abs(nowMinuteOfDay - targetMinuteOfDay);
  return {
    isDstMatch: diffMinutes <= toleranceMinutes,
    diffMinutes,
    nowEt,
    targetEt,
    toleranceMinutes,
  };
}

export function formatEtClock({ hour, minute }) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
