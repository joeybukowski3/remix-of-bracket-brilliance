/**
 * Shared, day-scoped duplicate-post lock used by the HR, K, and Numerology
 * X posters (post-mlb-hr-props-to-x.mjs, post-mlb-strikeout-props-to-x.mjs,
 * post-mlb-numerology-to-x.mjs). One key per slate date, deliberately NOT
 * tied to a content fingerprint -- a fingerprint-keyed gate lets the same
 * slate post more than once in a day whenever a legitimate intraday data
 * refresh (odds update, confirmed starter, re-ranked scores) changes the
 * fingerprint. Confirmed in production 2026-07-10: HR posted three times
 * in one day because of exactly this. Content fingerprints are still
 * computed by each poster and stored in the receipt for audit/debugging,
 * they just aren't the gate anymore.
 *
 * Side-effect-free except for the two functions that touch disk
 * (existsSync/mkdirSync/writeFileSync), which is why this stays a plain
 * Node module rather than importing fs at the top of the main CLI script
 * -- keeps it importable/testable without triggering the script's own
 * main() (which runs immediately at module load in each poster script).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function slugifyKey(value) {
  return String(value ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function getDuplicateStatePath(key, stateDir) {
  return path.join(stateDir, `${slugifyKey(key)}.json`);
}

/**
 * Gates on the daily posting key only, and never throws -- a real
 * duplicate is a clean skip (exit 0, finalStatus=SKIPPED_ALREADY_POSTED_
 * TODAY), not a failed step. allowOverride must only ever be true for an
 * explicit, reviewed workflow_dispatch override -- see
 * getForceRepostOverride.
 */
export function checkDailyPostingLock(dailyPostingKey, stateDir, { allowOverride = false } = {}) {
  const statePath = getDuplicateStatePath(dailyPostingKey, stateDir);
  const alreadyPosted = existsSync(statePath);
  if (alreadyPosted && !allowOverride) {
    return { blocked: true, statePath };
  }
  return { blocked: false, statePath, overrodeExistingLock: alreadyPosted && allowOverride };
}

export function savePostReceipt(statePath, receipt) {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(receipt, null, 2)}\n`);
}

/**
 * Only ever true for an explicit, reviewed workflow_dispatch override --
 * never a scheduled or workflow_run trigger. Re-checked against
 * eventName (not just trusted from the raw env var) so a misconfigured
 * workflow can't accidentally forward the flag on an automated trigger.
 */
export function getForceRepostOverride(eventName, overrideEnvValue) {
  if (eventName !== "workflow_dispatch") return false;
  return overrideEnvValue === "true";
}
