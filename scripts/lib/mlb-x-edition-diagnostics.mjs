/**
 * Bounded, edition-scoped diagnostic records on automation/mlb-x-state.
 *
 * Separate from the publication receipt in every sense: a different path
 * (mlb-x/{date}/diagnostics/{market}-{edition}.json vs
 * mlb-x/{date}/{market}-{edition}.json), a different write function
 * (createGitStateStore's writeDiagnostic, never writeReceipt), and a
 * structurally distinct payload shape with no postId field at all -- so a
 * diagnostic write can never be mistaken for, or accidentally satisfy,
 * isPostedReceipt.
 *
 * Only the fixed allowlist below may ever be persisted. Anything outside it --
 * most importantly a posted-shaped outcome like POSTED, FALLBACK_POSTED,
 * ALREADY_POSTED or REPLY_RECOVERED -- is refused. Publication has exactly
 * one path to durable state (the receipt); this module is not it.
 */
import { TECHNICAL_MISS_STATUSES } from "./mlb-x-edition-audit.mjs";
import { buildEditionReceiptKey } from "./mlb-x-edition-receipts.mjs";

export const DIAGNOSTIC_VERSION = 1;

/** The only outcomes a diagnostic may ever record. */
export const DIAGNOSTIC_OUTCOMES = Object.freeze([
  "IMAGE_FAILED",
  "X_API_FAILED",
  "CONFIGURATION_ERROR",
  "ROW_MISMATCH",
  "STATE_PERSISTENCE_FAILED",
  "WAITING_FOR_SELECTED_LINEUPS",
  "NO_VALID_PICKS",
  "INVALID_SLATE",
  "NOT_DUE",
  "MISSED_WINDOW",
]);

/**
 * Builds one diagnostic record. Throws on an outcome outside the allowlist --
 * a caller passing e.g. "POSTED" here has a bug, and the loud failure is the
 * point: it is the thing standing between a real publication and it being
 * misfiled as a diagnostic.
 *
 * @param {object} params
 * @param {string} params.market "k" | "hr"
 * @param {string} params.edition "morning" | "confirmed"
 * @param {string} params.slateDate YYYY-MM-DD
 * @param {string} params.latestOutcome one of DIAGNOSTIC_OUTCOMES
 * @param {string} [params.reason] human-readable detail
 * @param {string|null} [params.windowClosesAt] ISO instant, when known
 */
export function buildDiagnosticRecord({ market, edition, slateDate, latestOutcome, reason = "", windowClosesAt = null, at = new Date().toISOString() }) {
  if (!DIAGNOSTIC_OUTCOMES.includes(latestOutcome)) {
    throw new Error(`Refusing to persist "${latestOutcome}" as a diagnostic -- not in the allowlist. A publication outcome belongs in the receipt, never here.`);
  }
  const receiptKey = buildEditionReceiptKey({ market, slateDate, edition });
  return {
    version: DIAGNOSTIC_VERSION,
    receiptKey,
    market,
    edition,
    slateDate,
    latestOutcome,
    reason: String(reason ?? ""),
    updatedAt: at,
    windowClosesAt,
    technicalFailure: TECHNICAL_MISS_STATUSES.includes(latestOutcome),
  };
}

/** True only for a well-formed record whose outcome is on the allowlist -- read-side mirror of the write-side guard. */
export function isValidDiagnostic(record) {
  return Boolean(
    record
    && record.version === DIAGNOSTIC_VERSION
    && DIAGNOSTIC_OUTCOMES.includes(record.latestOutcome)
    && typeof record.receiptKey === "string" && record.receiptKey,
  );
}
