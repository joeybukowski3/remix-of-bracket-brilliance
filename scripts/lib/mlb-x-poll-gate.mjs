import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { selectConfirmedHrProps } from "./mlb-hr-x-selection-core.mjs";
import { buildConfirmationSnapshot, resolveHrRowFacts } from "./mlb-x-confirmation-snapshot.mjs";
import { getDuplicateStatePath, readPostReceipt } from "./mlb-x-daily-lock.mjs";
import { createMlbXPollPlan } from "./mlb-x-poll-plan.mjs";
import { ReadinessStatus, resolvePostingReadiness, WaitingReason } from "./mlb-x-readiness.mjs";
import {
  getEtSlateDate,
  isAtOrAfterEtClockTime,
  K_EARLIEST_POST_ET_HOUR,
  K_EARLIEST_POST_ET_MINUTE,
  SlatePhase,
} from "./mlb-x-slate-timing.mjs";

const PRODUCTION_HR_RAW_URL = "https://www.joeknowsball.com/data/mlb/hr-props-raw.json";
const HR_TARGET_TABLE_SIZE = 3;
const K_TARGET_TABLE_SIZE = 5;
// See post-mlb-hr-props-to-x.mjs: a single early-confirmed game must never
// alone satisfy readiness by raw headcount.
const HR_MIN_CONFIRMED_GAMES = 2;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

export function getPollReceiptState({ slateDate, hrStateDir, kStateDir, exists = existsSync, readReceipt = readPostReceipt }) {
  const hrReceiptPath = getDuplicateStatePath(`mlb-hr-props:${slateDate}`, hrStateDir);
  const kReceiptPath = getDuplicateStatePath(`mlb-k-props:${slateDate}`, kStateDir);
  const kReceipt = readReceipt(kReceiptPath);
  return {
    hrPosted: exists(hrReceiptPath),
    // K's main post and self-reply are one posting unit -- a receipt with a
    // main tweetId but no replyTweetId yet (a partial failure, or simply an
    // older receipt from before the self-reply feature existed) is NOT
    // "fully posted": the plan must keep launching post-k so the poster's
    // own reply-recovery path can finish the missing reply. Never re-posts
    // the main tweet either way -- see post-mlb-strikeout-props-to-x.mjs.
    kPosted: Boolean(kReceipt?.tweetId && kReceipt?.replyTweetId),
    // Distinct from kPosted=false-because-nothing-posted-yet: a reply-only
    // recovery must run regardless of normal market/timing readiness (a
    // pending reply doesn't depend on the slate being "ready" the way a
    // fresh post does), and must never be treated as a fresh posting
    // opportunity by resolveKPollReadiness's ordinary starter/lineup checks.
    kReplyPending: Boolean(kReceipt?.tweetId && !kReceipt?.replyTweetId),
    hrReceiptPath,
    kReceiptPath,
  };
}

export async function loadProductionHrRaw({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl(PRODUCTION_HR_RAW_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`HR data HTTP ${response.status}`);
  return response.json();
}

export function resolveHrPollReadiness({ raw, snapshot, slateDate }) {
  const rawDate = normalizeText(raw?.date);
  const batters = Array.isArray(raw?.batters) ? raw.batters.map(normalizeHrBatter).filter(Boolean) : [];
  const selection = selectConfirmedHrProps({
    batters: rawDate && rawDate !== slateDate ? [] : batters,
    isGameStarted: (row) => resolveHrRowFacts(snapshot, row).gameStarted,
    liveConfirm: (row) => resolveHrRowFacts(snapshot, row).liveConfirmed,
    maxTableSize: HR_TARGET_TABLE_SIZE,
  });
  return resolvePostingReadiness({
    timing: snapshot.timing,
    confirmedCount: selection.confirmedCount,
    targetCount: HR_TARGET_TABLE_SIZE,
    maxTableSize: HR_TARGET_TABLE_SIZE,
    projectedExcludedCount: selection.projectedExcludedCount,
    confirmationSourceFailed: !snapshot.ok,
    confirmedGameCount: selection.confirmedGameCount,
    minConfirmedGames: HR_MIN_CONFIRMED_GAMES,
    confirmedRowsWithoutGameIdentity: selection.confirmedRowsWithoutGameIdentity,
  });
}

/**
 * Cheap K confirmation gate. The snapshot's listed probable pitchers are the
 * current starters; the heavy poster still re-scrapes valid markets and
 * revalidates starters/lineups (plus the full value-play eligibility --
 * IP>3.0, non-zero edge, side-specific odds) immediately before posting.
 *
 * `now` is required to enforce K's 11:00 AM ET earliest-post floor
 * (K_EARLIEST_POST_ET_HOUR/MINUTE) -- defaults to the current time so
 * existing callers/tests that don't care about the guard keep working, but
 * every real caller should pass the same `now` used to build `snapshot`.
 */
export function resolveKPollReadiness({ snapshot, now = new Date() }) {
  const starters = [];
  for (const game of snapshot?.games ?? []) {
    if (game.started || game.excluded) continue;
    for (const side of ["away", "home"]) {
      const starter = game[`${side}Starter`];
      if (!starter?.id && !normalizeText(starter?.name)) continue;
      const opposingSide = side === "away" ? "home" : "away";
      starters.push({ opposingLineupConfirmed: Boolean(game[`${opposingSide}Lineup`]?.confirmed) });
    }
  }

  const atCutoff = Boolean(snapshot?.timing?.isFinalCutoff);
  const confirmedCount = atCutoff ? starters.length : starters.filter((starter) => starter.opposingLineupConfirmed).length;
  const waitingReason = starters.length > confirmedCount ? WaitingReason.OPPOSING_LINEUP : WaitingReason.VALID_MARKETS;
  const targetCount = snapshot?.timing?.phase === SlatePhase.POLLING ? 3 : 1;
  const earliestPostGuardPassed = isAtOrAfterEtClockTime(now, K_EARLIEST_POST_ET_HOUR, K_EARLIEST_POST_ET_MINUTE);
  const readiness = resolvePostingReadiness({
    timing: snapshot?.timing,
    confirmedCount,
    targetCount,
    maxTableSize: K_TARGET_TABLE_SIZE,
    confirmationSourceFailed: !snapshot?.ok,
    waitingReason,
    earliestPostGuardPassed,
  });
  // Echoed for logging (plan-mlb-x-posts.mjs) -- resolvePostingReadiness
  // itself only encodes the pass/fail via finalStatus, not the raw guard
  // input, so callers that want to log "guard passed: true/false" directly
  // (independent of whatever else determined finalStatus) can read it here.
  return { ...readiness, earliestPostGuardPassed };
}

function failedReadiness() {
  return { ready: false, finalStatus: ReadinessStatus.FAILED_CONFIRMATION_SOURCE };
}

export async function createSharedMlbXPollPlan({
  now = new Date(),
  hrStateDir,
  kStateDir,
  exists = existsSync,
  buildSnapshot = buildConfirmationSnapshot,
  loadHrRaw = loadProductionHrRaw,
  fetchImpl = fetch,
} = {}) {
  const slateDate = getEtSlateDate(now);
  const receipts = getPollReceiptState({ slateDate, hrStateDir, kStateDir, exists });

  if (receipts.hrPosted && receipts.kPosted) {
    return {
      plan: createMlbXPollPlan({ slateDate, hrPosted: true, kPosted: true }),
      snapshot: null,
      receipts,
    };
  }

  const snapshot = await buildSnapshot({ date: slateDate, now, fetchImpl });
  let hrReadiness;
  if (!receipts.hrPosted) {
    try {
      const raw = await loadHrRaw({ fetchImpl });
      hrReadiness = resolveHrPollReadiness({ raw, snapshot, slateDate });
    } catch {
      hrReadiness = failedReadiness();
    }
  }
  let kReadiness;
  if (!receipts.kPosted) {
    // A pending reply must get a chance to send regardless of normal
    // market/timing conditions -- e.g. after the final cutoff, when a fresh
    // post would correctly no longer be ready, a reply to an ALREADY-posted
    // tweet is still fully appropriate and safe. Bypasses resolveKPollReadiness
    // entirely for this case rather than risking it computing not-ready and
    // leaving the reply stuck forever once the market window has closed.
    kReadiness = receipts.kReplyPending
      ? { ready: true, finalStatus: ReadinessStatus.READY_REPLY_RECOVERY, selectedCount: 0 }
      : resolveKPollReadiness({ snapshot, now });
  }

  return {
    plan: createMlbXPollPlan({
      slateDate,
      hrPosted: receipts.hrPosted,
      kPosted: receipts.kPosted,
      hrReadiness,
      kReadiness,
    }),
    snapshot,
    receipts,
  };
}

export function readJsonFile(filePath) {
  return JSON.parse(readFileSync(path.resolve(filePath), "utf8"));
}
