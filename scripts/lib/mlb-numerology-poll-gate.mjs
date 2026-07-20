/**
 * mlb-numerology-poll-gate.mjs
 *
 * Shared "should Numerology deliver right now?" decision, mirroring
 * mlb-x-poll-gate.mjs's HR/K pattern: a pure readiness resolver plus a thin
 * fetch/compose layer, feeding ONE plan that both the email and X delivery
 * jobs key off of. Delivery timing is first-pitch-relative (see
 * computeNumerologySlateTiming: begin polling 120 minutes before the
 * earliest first pitch, deliver whatever is confirmed from 75 minutes
 * before on, stop polling entirely at 30 minutes before) -- never a fixed
 * daily clock time.
 *
 * Eligibility is confirmation-only: a play qualifies for delivery only when
 * it is both above the numerology "qualified" score threshold AND live-
 * confirmed in today's official starting lineup (resolveNumerologyFacts).
 * Numerology's own generated `lineupStatus` field is deliberately NOT
 * consulted here -- it can only ever be "unknown" / "morning_projected" /
 * "projected" (see generate-mlb-numerology.mjs's computeLineupStatus), never
 * "confirmed", so it carries no positive confirmation signal for delivery
 * purposes. The live snapshot is the only source of truth.
 */
import { existsSync } from "node:fs";
import { getDuplicateStatePath } from "./mlb-x-daily-lock.mjs";
import { getNumerologyEmailSubject, hasValidDeliveryReceipt, readDeliveryReceipt } from "./mlb-numerology-email-delivery.mjs";
import { contentPlan } from "./mlb-x-poll-plan.mjs";
import { selectConfirmedNumerologyPlays } from "./mlb-numerology-x-selection-core.mjs";
import { resolveNumerologyFacts } from "./mlb-x-confirmation-snapshot.mjs";
import { resolvePostingReadiness } from "./mlb-x-readiness.mjs";

export const NUMEROLOGY_TARGET_TABLE_SIZE = 5;

/**
 * Live confirmation lookup for one numerology play, adapting the play's
 * `player` field to resolveNumerologyFacts's `playerName` parameter name.
 */
function facts(snapshot, play) {
  return resolveNumerologyFacts(snapshot, {
    team: play?.team,
    playerId: play?.playerId,
    playerName: play?.player,
  });
}

/**
 * Pure readiness decision for one attempt: given the model's already-ranked
 * candidate plays (card.plays) and a live confirmation snapshot, resolve the
 * confirmed selection and combine it with the first-pitch-relative timing
 * phase into one machine-readable readiness result.
 *
 * @param {object} params
 * @param {Array<object>} params.plays     already-ranked numerology plays (card.plays)
 * @param {object} params.snapshot         result of buildConfirmationSnapshot({ computeTiming: computeNumerologySlateTiming })
 * @returns {{ readiness: object, selection: object }}
 */
export function resolveNumerologyPollReadiness({ plays = [], snapshot }) {
  const selection = selectConfirmedNumerologyPlays({
    plays,
    isGameStarted: (play) => facts(snapshot, play).gameStarted,
    liveConfirm: (play) => facts(snapshot, play).hitterLiveConfirmed,
    maxTableSize: NUMEROLOGY_TARGET_TABLE_SIZE,
  });
  const readiness = resolvePostingReadiness({
    timing: snapshot?.timing,
    confirmedCount: selection.confirmedCount,
    targetCount: NUMEROLOGY_TARGET_TABLE_SIZE,
    maxTableSize: NUMEROLOGY_TARGET_TABLE_SIZE,
    projectedExcludedCount: selection.unconfirmedExcludedCount,
    confirmationSourceFailed: !snapshot?.ok,
  });
  return { readiness, selection };
}

/** Pure plan composition, mirroring createMlbXPollPlan's shape but for numerology's single content type. */
export function createNumerologyPollPlan({ slateDate, alreadyDelivered = false, readiness } = {}) {
  return {
    slateDate,
    numerology: contentPlan({ posted: alreadyDelivered, readiness }),
  };
}

/**
 * Has today's slate already been delivered, on EITHER surface? Email and X
 * keep fully independent receipts (see mlb-x-daily-lock.mjs and
 * mlb-numerology-email-delivery.mjs) -- both are checked here so the shared
 * plan only keeps polling/building a fresh artifact while at least one
 * surface still needs delivery, but each delivery job still re-checks its
 * OWN receipt independently before actually sending (this is a planning
 * optimization, never the actual duplicate-protection gate).
 *
 * @param {object} params
 * @param {string} params.slateDate
 * @param {string} params.xStateDir           X's GH Actions cache-backed duplicate-state dir
 * @param {string} params.emailReceiptPath    email's committed receipt file path
 * @param {(path:string)=>boolean} [params.exists]
 * @param {(path:string)=>object|null} [params.readEmailReceipt]
 */
export function getNumerologyDeliveryState({ slateDate, xStateDir, emailReceiptPath, exists = existsSync, readEmailReceipt = readDeliveryReceipt }) {
  const xReceiptPath = getDuplicateStatePath(`mlb-numerology:${slateDate}`, xStateDir);
  const xDelivered = exists(xReceiptPath);
  const emailReceipt = readEmailReceipt(emailReceiptPath);
  const emailDelivered = hasValidDeliveryReceipt(emailReceipt, slateDate, getNumerologyEmailSubject(slateDate));
  return {
    xDelivered,
    emailDelivered,
    bothDelivered: xDelivered && emailDelivered,
    xReceiptPath,
  };
}
