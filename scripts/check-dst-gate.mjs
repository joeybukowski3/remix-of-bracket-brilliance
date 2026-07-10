#!/usr/bin/env node
/**
 * Thin CLI bridge for workflow bash steps -- see scripts/lib/mlb-x-dst-gate.mjs
 * for the actual (unit-tested) decision logic. Exit 0 = DST match, proceed.
 * Exit 1 = SKIPPED_DST_MISMATCH, the workflow step must skip cleanly.
 *
 * Usage: DST_GATE_TARGET_ET_HOUR=13 DST_GATE_TARGET_ET_MINUTE=45 node scripts/check-dst-gate.mjs
 * Optional: DST_GATE_TOLERANCE_MINUTES (default 10)
 */
import process from "node:process";
import { formatEtClock, getCurrentEasternTime, resolveDstGateResult } from "./lib/mlb-x-dst-gate.mjs";

const targetHour = Number(process.env.DST_GATE_TARGET_ET_HOUR);
const targetMinute = Number(process.env.DST_GATE_TARGET_ET_MINUTE);
const toleranceMinutes = Number(process.env.DST_GATE_TOLERANCE_MINUTES || "10");

if (!Number.isFinite(targetHour) || !Number.isFinite(targetMinute)) {
  console.error("[dst-gate] Missing/invalid DST_GATE_TARGET_ET_HOUR / DST_GATE_TARGET_ET_MINUTE.");
  process.exit(2);
}

const nowEt = getCurrentEasternTime();
const targetEt = { hour: targetHour, minute: targetMinute };
const result = resolveDstGateResult(nowEt, targetEt, toleranceMinutes);
const nowLabel = formatEtClock(nowEt);
const targetLabel = formatEtClock(targetEt);

if (result.isDstMatch) {
  console.log(`[dst-gate] DST match confirmed: ${nowLabel} ET is within ${toleranceMinutes} minutes of the intended ${targetLabel} ET target (diff=${result.diffMinutes}m).`);
  process.exit(0);
} else {
  console.log(`[dst-gate] SKIPPED_DST_MISMATCH: fired at ${nowLabel} ET, ${result.diffMinutes} minutes from the intended ${targetLabel} ET target (tolerance ${toleranceMinutes}m). This is the non-matching season's paired UTC cron entry -- skipping cleanly before any screenshot/duplicate-lock/cache/X setup work.`);
  process.exit(1);
}
