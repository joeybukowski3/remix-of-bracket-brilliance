#!/usr/bin/env node
/**
 * check-mlb-x-posting-readiness.mjs
 *
 * Polling gate for the MLB X posters. Each ~15-minute attempt runs this to
 * decide, from LIVE data, whether to post now, keep waiting, or skip cleanly:
 *
 *   1. fetch the live confirmation snapshot (schedule = earliest first pitch +
 *      current starters + game status; boxscores = official batting orders)
 *   2. run the content-type's confirmed-selection core over today's data
 *   3. combine with the slate-timing phase into one readiness result
 *
 * Prints machine-readable `key=value` lines (also appended to $GITHUB_OUTPUT
 * when present) and exits:
 *   0  → READY (workflow should post)
 *   20 → clean WAIT/SKIP (workflow should not post, not a failure)
 *   1  → FAILED_CONFIRMATION_SOURCE or a real error (fail the run)
 *
 * It is the runtime source of truth for timing -- never a cron comment. It
 * never posts and never consumes the daily lock. Currently wired for HR
 * (--content=hr), which reads everything it needs from hr-props-raw.json;
 * K/Numerology share the same modules and can adopt this gate next.
 *
 * Usage: node scripts/check-mlb-x-posting-readiness.mjs --content=hr [--data-source=production|github|local]
 */
import { appendFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildConfirmationSnapshot, resolveHrRowFacts } from "./lib/mlb-x-confirmation-snapshot.mjs";
import { selectConfirmedHrProps } from "./lib/mlb-hr-x-selection-core.mjs";
import { resolvePostingReadiness, ReadinessStatus } from "./lib/mlb-x-readiness.mjs";
import { fetchSlateTiming, getEtSlateDate, SlatePhase } from "./lib/mlb-x-slate-timing.mjs";

const ROOT = process.cwd();
const PRODUCTION_BASE_URL = "https://www.joeknowsball.com/data/mlb";
const GITHUB_BASE_URL = "https://raw.githubusercontent.com/joeybukowski3/remix-of-bracket-brilliance/main/public/data/mlb";
const HR_TARGET_TABLE_SIZE = 3;

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hrRawLocation(source) {
  if (source === "github") return `${GITHUB_BASE_URL}/hr-props-raw.json`;
  if (source === "local") return path.join(ROOT, "public", "data", "mlb", "hr-props-raw.json");
  return `${PRODUCTION_BASE_URL}/hr-props-raw.json`;
}

async function loadJson(location, source) {
  if (source === "local") {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync(location, "utf8"));
  }
  const response = await fetch(location, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${location}: HTTP ${response.status}`);
  return response.json();
}

function normalizeHrBatter(value) {
  const player = normalizeText(value?.player);
  const team = normalizeText(value?.team).toUpperCase();
  if (!player || !team) return null;
  return {
    player,
    playerId: value?.playerId ?? null,
    gameId: value?.gameId ?? null,
    team,
    opponent: normalizeText(value?.opponent).toUpperCase(),
    hrScore: toFiniteNumber(value?.hrScore),
    hrScoreRank: toFiniteNumber(value?.hrScoreRank),
    lineupStatus: value?.lineupStatus ?? "unknown",
    battingOrder: value?.battingOrder ?? null,
  };
}

function emit(outputs) {
  const lines = Object.entries(outputs).map(([k, v]) => `${k}=${v}`);
  for (const line of lines) console.log(`[x-readiness] ${line}`);
  const ghOut = process.env.GITHUB_OUTPUT;
  if (ghOut) {
    try {
      appendFileSync(ghOut, `${lines.join("\n")}\n`);
    } catch {
      /* not fatal */
    }
  }
}

function exitForStatus(finalStatus, ready) {
  if (ready) return 0;
  if (finalStatus === ReadinessStatus.FAILED_CONFIRMATION_SOURCE) return 1;
  return 20; // clean wait/skip
}

async function runHr({ source, now, fetchImpl }) {
  const slateDate = getEtSlateDate(now);
  const raw = await loadJson(hrRawLocation(source), source);
  const rawDate = normalizeText(raw?.date);
  const batters = Array.isArray(raw?.batters) ? raw.batters.map(normalizeHrBatter).filter(Boolean) : [];

  const snapshot = await buildConfirmationSnapshot({ date: slateDate, now, fetchImpl });

  // Stale generated data (wrong slate) is treated as no confirmed selections,
  // never posted against.
  const dateMismatch = rawDate && rawDate !== slateDate;

  const selection = selectConfirmedHrProps({
    batters: dateMismatch ? [] : batters,
    isGameStarted: (row) => resolveHrRowFacts(snapshot, row).gameStarted,
    liveConfirm: (row) => resolveHrRowFacts(snapshot, row).liveConfirmed,
    maxTableSize: HR_TARGET_TABLE_SIZE,
  });

  const readiness = resolvePostingReadiness({
    timing: snapshot.timing,
    confirmedCount: selection.confirmedCount,
    targetCount: HR_TARGET_TABLE_SIZE,
    maxTableSize: HR_TARGET_TABLE_SIZE,
    projectedExcludedCount: selection.projectedExcludedCount,
    confirmationSourceFailed: !snapshot.ok,
  });

  emit({
    content: "hr",
    slateDate,
    rawSlateDate: rawDate || "missing",
    snapshotOk: snapshot.ok,
    snapshotAsOf: snapshot.asOf,
    phase: readiness.phase,
    minutesUntilFirstPitch: readiness.minutesUntilFirstPitch ?? "n/a",
    confirmedCount: selection.confirmedCount,
    projectedExcludedCount: selection.projectedExcludedCount,
    selectedCount: readiness.selectedCount,
    finalStatus: readiness.finalStatus,
    ready: readiness.ready,
  });

  return exitForStatus(readiness.finalStatus, readiness.ready);
}

/**
 * Timing-only window gate for content types whose confirmed-selection artifact
 * is not yet wired through this CLI (K, Numerology). Uses ONLY the live
 * schedule to gate on the earliest-first-pitch posting window -- a DST-safe
 * replacement for the old fixed-clock backstops. READY inside the posting
 * window; clean wait before it / skip once expired, all games started, or no
 * games; fail closed if the schedule can't be read.
 */
async function runTimingGate({ label, now, fetchImpl }) {
  const timing = await fetchSlateTiming({ now, fetchImpl });
  let finalStatus;
  let ready = false;
  if (timing.error) finalStatus = ReadinessStatus.FAILED_CONFIRMATION_SOURCE;
  else if (!timing.hasGames) finalStatus = ReadinessStatus.SKIPPED_NO_GAMES;
  else if (timing.allGamesStarted) finalStatus = ReadinessStatus.SKIPPED_ALL_GAMES_STARTED;
  else if (timing.phase === SlatePhase.PRE_POLLING) finalStatus = ReadinessStatus.WAITING_FOR_POLLING_WINDOW;
  else if (timing.isExpired) finalStatus = ReadinessStatus.SKIPPED_AFTER_CUTOFF;
  else {
    finalStatus = ReadinessStatus.READY_CONFIRMED_SELECTIONS;
    ready = true;
  }

  emit({
    content: label,
    slateDate: timing.slateDate,
    phase: timing.phase,
    minutesUntilFirstPitch: timing.minutesUntilFirstPitch ?? "n/a",
    isFinalCutoff: timing.isFinalCutoff,
    finalStatus,
    ready,
  });
  return exitForStatus(finalStatus, ready);
}

async function main() {
  const content = getArg("content", "hr").toLowerCase();
  const source = getArg("data-source", "production").toLowerCase();
  const now = new Date();

  if (content === "hr") {
    process.exitCode = await runHr({ source, now, fetchImpl: fetch });
    return;
  }
  if (content === "k" || content === "numerology" || content === "timing") {
    process.exitCode = await runTimingGate({ label: content, now, fetchImpl: fetch });
    return;
  }
  console.error(`[x-readiness] Unsupported --content=${content}. Supported: hr, k, numerology, timing.`);
  process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(`[x-readiness] ${error instanceof Error ? error.message : error}`);
  emit({ finalStatus: "FAILED_CONFIRMATION_SOURCE", ready: false });
  process.exitCode = 1;
}
