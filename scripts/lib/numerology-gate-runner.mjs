#!/usr/bin/env node
/**
 * numerology-gate-runner.mjs
 *
 * Evaluates whether the MLB Numerology generator should run right now.
 * Writes "run=true|false", "phase=...", and "reason=..." to GITHUB_OUTPUT
 * (or stdout when GITHUB_OUTPUT is not set, for local testing).
 *
 * Usage:
 *   node scripts/lib/numerology-gate-runner.mjs --phase auto
 *   node scripts/lib/numerology-gate-runner.mjs --phase morning
 *   node scripts/lib/numerology-gate-runner.mjs --phase lineup-confirmed
 *   node scripts/lib/numerology-gate-runner.mjs --phase force-refresh
 */

import { existsSync, readFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateGate,
  getEtDateString,
  computeLineupTargetTime,
  areLineupsConfirmed,
} from "./numerology-schedule-gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DAILY_OUTPUT = path.join(ROOT, "public", "data", "mlb", "numerology-daily.json");
const TIMEOUT_MS = 15000;

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const phaseArg = (() => {
  const i = args.indexOf("--phase");
  return i >= 0 ? args[i + 1] : "auto";
})();

// ── Write GitHub Actions output ───────────────────────────────────────────────
function writeOutput(key, value) {
  const ghOut = process.env.GITHUB_OUTPUT;
  if (ghOut) {
    appendFileSync(ghOut, `${key}=${value}\n`);
  } else {
    // Local: write to stdout so callers can eval
    console.log(`${key}=${value}`);
  }
}

// ── Fetch schedule with timeout ───────────────────────────────────────────────
async function fetchSchedule(etDate) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${etDate}&hydrate=lineups`;
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const now = new Date();
  const etDate = getEtDateString(now);

  // Load existing daily output for duplicate-run prevention
  let existingOutput = null;
  if (existsSync(DAILY_OUTPUT)) {
    try { existingOutput = JSON.parse(readFileSync(DAILY_OUTPUT, "utf8")); } catch { /* ignore */ }
  }

  // Fetch live schedule for lineup gate (cheap — only lineup hydration)
  let scheduleData = null;
  let scheduleRoster = [];
  try {
    scheduleData = await fetchSchedule(etDate);
    const games = scheduleData?.dates?.[0]?.games ?? [];
    for (const g of games) {
      for (const p of [...(g.lineups?.awayPlayers ?? []), ...(g.lineups?.homePlayers ?? [])]) {
        if (p.id) {
          const raw = p.battingOrder ? parseInt(String(p.battingOrder).trim(), 10) : null;
          scheduleRoster.push({ id: p.id, battingOrder: Number.isFinite(raw) ? raw : null });
        }
      }
    }
    const { firstGameStart, targetTime } = computeLineupTargetTime(scheduleData, etDate);
    console.error(`[gate] etDate=${etDate} phase=${phaseArg} firstGame=${firstGameStart?.toISOString() ?? "none"} target=${targetTime?.toISOString() ?? "none"} rosterSize=${scheduleRoster.length}`);
  } catch (e) {
    console.error(`[gate] Schedule fetch failed: ${e.message} — lineup gate will be closed`);
  }

  const result = evaluateGate(phaseArg, now, existingOutput, scheduleData, scheduleRoster);

  console.error(`[gate] run=${result.run} updatePhase=${result.updatePhase} reason=${result.reason}`);

  writeOutput("run", String(result.run));
  writeOutput("phase", result.updatePhase);
  // Sanitize reason for GitHub Output (no newlines)
  writeOutput("reason", result.reason.replace(/\n/g, " ").slice(0, 200));

  process.exit(0);
})().catch(err => {
  console.error("[gate] Fatal:", err.message);
  // Fail safe — don't block the workflow, just don't run
  writeOutput("run", "false");
  writeOutput("phase", "auto");
  writeOutput("reason", `Gate error: ${err.message}`.slice(0, 200));
  process.exit(0);
});
