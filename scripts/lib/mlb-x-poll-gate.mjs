import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { selectConfirmedHrProps } from "./mlb-hr-x-selection-core.mjs";
import { buildConfirmationSnapshot, resolveHrRowFacts } from "./mlb-x-confirmation-snapshot.mjs";
import { getDuplicateStatePath } from "./mlb-x-daily-lock.mjs";
import { createMlbXPollPlan } from "./mlb-x-poll-plan.mjs";
import { ReadinessStatus, resolvePostingReadiness, WaitingReason } from "./mlb-x-readiness.mjs";
import { getEtSlateDate, SlatePhase } from "./mlb-x-slate-timing.mjs";

const PRODUCTION_HR_RAW_URL = "https://www.joeknowsball.com/data/mlb/hr-props-raw.json";
const HR_TARGET_TABLE_SIZE = 3;
const K_TARGET_TABLE_SIZE = 5;

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

export function getPollReceiptState({ slateDate, hrStateDir, kStateDir, exists = existsSync }) {
  const hrReceiptPath = getDuplicateStatePath(`mlb-hr-props:${slateDate}`, hrStateDir);
  const kReceiptPath = getDuplicateStatePath(`mlb-k-props:${slateDate}`, kStateDir);
  return {
    hrPosted: exists(hrReceiptPath),
    kPosted: exists(kReceiptPath),
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
  });
}

/**
 * Cheap K confirmation gate. The snapshot's listed probable pitchers are the
 * current starters; the heavy poster still re-scrapes valid markets and
 * revalidates starters/lineups immediately before posting.
 */
export function resolveKPollReadiness({ snapshot }) {
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
  return resolvePostingReadiness({
    timing: snapshot?.timing,
    confirmedCount,
    targetCount,
    maxTableSize: K_TARGET_TABLE_SIZE,
    confirmationSourceFailed: !snapshot?.ok,
    waitingReason,
  });
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
  const kReadiness = receipts.kPosted ? undefined : resolveKPollReadiness({ snapshot });

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
