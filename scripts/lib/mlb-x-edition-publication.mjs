/**
 * Edition-scoped publication: frozen-plan transport, primary/reply state, and
 * the recovery flow.
 *
 * The primary X post and the optional self-reply are separate outcomes. An
 * edition is published the moment the primary post succeeds and its id is
 * persisted -- a reply failure must never erase that, and must never cause the
 * primary to be posted a second time.
 *
 * Every piece of state here carries market, slate date and edition, so a
 * morning post with a missing reply cannot make the confirmed edition skip its
 * own primary, adopt the morning post id, or overwrite the morning recovery
 * record.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildEditionReceiptKey } from "./mlb-x-edition-receipts.mjs";
import { PLAN_VERSION, planFileName, validatePlan } from "./mlb-x-edition-plan.mjs";

export const ReplyStatus = Object.freeze({
  NOT_REQUESTED: "NOT_REQUESTED",
  PENDING: "PENDING",
  POSTED: "POSTED",
  FAILED_RETRYABLE: "FAILED_RETRYABLE",
  FAILED_FINAL: "FAILED_FINAL",
});

export const PublicationStep = Object.freeze({
  FULL_PUBLICATION: "FULL_PUBLICATION",
  REPLY_RECOVERY_ONLY: "REPLY_RECOVERY_ONLY",
  ALREADY_COMPLETE: "ALREADY_COMPLETE",
});

export const PlanLoadError = Object.freeze({
  PLAN_MISSING: "PLAN_MISSING",
  PLAN_UNREADABLE: "PLAN_UNREADABLE",
});

// ─── Frozen-plan transport ───────────────────────────────────────────────────

/**
 * Loads the one plan a poster job is entitled to run.
 *
 * There is deliberately no fallback to the poster's own selection path: a
 * missing or invalid plan is a CONFIGURATION_ERROR, because silently
 * reselecting would publish a card nobody planned and would reintroduce the
 * planner/poster divergence this whole design removes.
 */
export function loadPlanForTarget({ directory, market, edition, slateDate }) {
  const planPath = path.join(directory, planFileName(market, edition));
  if (!existsSync(planPath)) {
    return { ok: false, error: PlanLoadError.PLAN_MISSING, planPath, plan: null, detail: null };
  }
  let plan;
  try {
    plan = JSON.parse(readFileSync(planPath, "utf8"));
  } catch (error) {
    return { ok: false, error: PlanLoadError.PLAN_UNREADABLE, planPath, plan: null, detail: error instanceof Error ? error.message : String(error) };
  }
  const validation = validatePlan(plan, { market, edition, ...(slateDate ? { slateDate } : {}) });
  if (!validation.valid) {
    return { ok: false, error: validation.reason, planPath, plan, detail: validation.detail };
  }
  return { ok: true, error: null, planPath, plan, detail: null };
}

// ─── Primary + reply receipt state ───────────────────────────────────────────

export function getPublicationStatePath(receiptKey, stateDir) {
  return path.join(stateDir, `${receiptKey}.json`);
}

function writeAtomic(targetPath, value) {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const temp = `${targetPath}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, targetPath);
}

export function readPublicationState(receiptKey, stateDir) {
  const statePath = getPublicationStatePath(receiptKey, stateDir);
  if (!existsSync(statePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8"));
    // Cross-edition contamination guard: a record that names a different
    // edition is not this edition's state, whatever file it was found in.
    if (parsed?.receiptKey && parsed.receiptKey !== receiptKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasPrimaryPost(state) {
  return Boolean(state && typeof state.primaryPostId === "string" && state.primaryPostId.trim());
}

/** Reply work is finished when it succeeded, was never wanted, or gave up. */
export function isReplyComplete(state) {
  const status = state?.replyStatus ?? ReplyStatus.NOT_REQUESTED;
  return status === ReplyStatus.POSTED || status === ReplyStatus.NOT_REQUESTED || status === ReplyStatus.FAILED_FINAL;
}

/**
 * Persisted BEFORE any reply is attempted. If the process dies between the
 * primary post and the reply, the next run finds this record and enters
 * reply-only recovery instead of creating a duplicate primary.
 */
export function savePrimaryPost({ receiptKey, stateDir, primaryPostId, market, slateDate, edition, languageMode = null, replyRequested = false, at = new Date().toISOString(), extra = {} }) {
  const id = String(primaryPostId ?? "").trim();
  if (!id) throw new Error("Refusing to persist a primary post without a confirmed post id from the X API.");
  const state = {
    receiptKey, market, slateDate, edition,
    outcome: "POSTED",
    postId: id,          // consumed by isPostedReceipt
    primaryPostId: id,
    primaryPostedAt: at,
    languageMode,
    replyStatus: replyRequested ? ReplyStatus.PENDING : ReplyStatus.NOT_REQUESTED,
    replyPostId: null,
    replyAttemptedAt: null,
    replyFailureReason: null,
    ...extra,
  };
  writeAtomic(getPublicationStatePath(receiptKey, stateDir), state);
  return state;
}

/** Updates ONLY reply fields. The primary post id is never touched. */
export function saveReplyOutcome({ receiptKey, stateDir, replyStatus, replyPostId = null, replyFailureReason = null, at = new Date().toISOString() }) {
  const existing = readPublicationState(receiptKey, stateDir);
  if (!hasPrimaryPost(existing)) {
    throw new Error(`Refusing to record a reply for ${receiptKey}: no primary post is recorded.`);
  }
  if (!Object.values(ReplyStatus).includes(replyStatus)) {
    throw new Error(`Unknown reply status "${replyStatus}".`);
  }
  const state = {
    ...existing,
    replyStatus,
    replyPostId: replyPostId ? String(replyPostId).trim() : existing.replyPostId ?? null,
    replyAttemptedAt: at,
    replyFailureReason: replyStatus === ReplyStatus.POSTED ? null : replyFailureReason ?? existing.replyFailureReason ?? null,
  };
  writeAtomic(getPublicationStatePath(receiptKey, stateDir), state);
  return state;
}

/**
 * What this run should do, given what is already on disk for THIS edition.
 *
 * Called while holding the edition lease, so the state it reads is the state
 * that matters.
 */
export function resolvePublicationStep({ receiptKey, stateDir }) {
  const state = readPublicationState(receiptKey, stateDir);
  if (!hasPrimaryPost(state)) {
    return { step: PublicationStep.FULL_PUBLICATION, state, primaryPostId: null };
  }
  if (!isReplyComplete(state)) {
    // Primary already exists: never post another one.
    return { step: PublicationStep.REPLY_RECOVERY_ONLY, state, primaryPostId: state.primaryPostId };
  }
  return { step: PublicationStep.ALREADY_COMPLETE, state, primaryPostId: state.primaryPostId };
}

// ─── Row identity consistency ────────────────────────────────────────────────

/**
 * Stable identity for one selected row, used to prove the plan, the caption and
 * the rendered graphic all describe the same players.
 */
export function rowIdentity(row) {
  const player = String(row?.player ?? row?.pitcher ?? "").trim().toLowerCase();
  const game = row?.gameId ?? row?.gameKey ?? "";
  return `${player}@${game}`;
}

export function rowIdentities(rows) {
  return (rows ?? []).map(rowIdentity);
}

/**
 * Blocks a post whose caption or graphic drifted from the frozen plan.
 *
 * Order-insensitive but multiset-exact: a duplicated or dropped row is a
 * mismatch even when the set of names matches.
 */
export function assertRowConsistency({ planRows, captionRows, renderedRows }) {
  const plan = rowIdentities(planRows).sort();
  const caption = rowIdentities(captionRows).sort();
  const rendered = rowIdentities(renderedRows).sort();

  const mismatches = [];
  if (caption.length !== plan.length || caption.some((id, i) => id !== plan[i])) {
    mismatches.push(`caption rows differ from plan rows (plan=${plan.length}, caption=${caption.length})`);
  }
  if (rendered.length !== plan.length || rendered.some((id, i) => id !== plan[i])) {
    mismatches.push(`rendered rows differ from plan rows (plan=${plan.length}, rendered=${rendered.length})`);
  }
  return { consistent: mismatches.length === 0, mismatches, planIdentities: plan };
}

export { PLAN_VERSION, buildEditionReceiptKey };
