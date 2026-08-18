/**
 * mlb-social-plan-consistency.mjs
 *
 * Phase 3 invariant: the graphic and the caption must describe the exact
 * same rows, in the exact same order, from the exact same frozen
 * `SocialPostPlan`. This module defines the shared identity used to prove
 * that -- never "they happen to call the same selector."
 */

/** Canonical per-row identity: gameId + playerId, stable across caption/graphic. */
export function planRowIdentity(row) {
  return `${row?.gameId ?? "null"}:${row?.playerId ?? "null"}`;
}

/** Ordered identity list for every row in the plan, in plan order. */
export function getPlanRowIdentities(plan) {
  return (Array.isArray(plan?.rows) ? plan.rows : []).map(planRowIdentity);
}

/**
 * Throws unless `candidateRowIdentities` -- pulled from a caption's
 * captionRows or a rendered graphic's extracted rows -- is exactly the
 * ordered identity sequence of `plan.rows` restricted to the rows that layer
 * actually included (a caption may legitimately include fewer rows than the
 * graphic due to the 280-character budget; the graphic must never include
 * fewer than the plan, since it has no such budget).
 *
 * This only validates that the SUBSET included is drawn from the plan in the
 * plan's own order -- callers that need "every plan row is present" (e.g.
 * the graphic, which has no overflow behavior) should pass
 * `requireComplete: true`.
 */
export function assertRowSubsetConsistency(plan, candidateRowIdentities, { requireComplete = false, label = "rows" } = {}) {
  const planIdentities = getPlanRowIdentities(plan);
  const candidate = Array.isArray(candidateRowIdentities) ? candidateRowIdentities : [];

  if (requireComplete && candidate.length !== planIdentities.length) {
    throw new Error(`${label}: expected all ${planIdentities.length} plan row(s), got ${candidate.length}.`);
  }
  if (candidate.length > planIdentities.length) {
    throw new Error(`${label}: candidate has more rows (${candidate.length}) than the plan (${planIdentities.length}).`);
  }

  // The candidate must be a PREFIX of the plan's row order -- not just "the
  // same set" -- so neither layer can silently reorder or cherry-pick.
  const expectedPrefix = planIdentities.slice(0, candidate.length);
  for (let i = 0; i < candidate.length; i += 1) {
    if (candidate[i] !== expectedPrefix[i]) {
      throw new Error(`${label}: row ${i} identity "${candidate[i]}" does not match plan order (expected "${expectedPrefix[i]}").`);
    }
  }
  return true;
}

/**
 * Proves the graphic and caption for one plan agree: the graphic renders
 * every plan row (in order), and the caption's included rows are a matching
 * ordered prefix of that same sequence. Throws on any mismatch -- a
 * consistency test should call this and expect it never to throw for a
 * correctly-wired canonical renderer + caption pair.
 */
export function assertGraphicCaptionConsistency({ plan, graphicRowIdentities, captionRowIdentities }) {
  assertRowSubsetConsistency(plan, graphicRowIdentities, { requireComplete: true, label: "graphic" });
  assertRowSubsetConsistency(plan, captionRowIdentities, { requireComplete: false, label: "caption" });
  return true;
}
