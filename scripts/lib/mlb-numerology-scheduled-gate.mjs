/**
 * A schedule trigger may only resolve to a live "post" when the
 * workflow's own explicit scheduled-live gate says so -- separate from
 * X_ALLOW_LIVE_POST, which just gates whether *any* live post can happen
 * at all. This keeps a newly-added schedule trigger safely preview-only
 * until someone deliberately turns scheduled live posting on, without
 * touching manual workflow_dispatch behavior at all. See
 * NUMEROLOGY_X_SCHEDULED_LIVE_ENABLED in post-mlb-numerology-to-x.yml,
 * which resolves mode=dry-run for schedule events unless this is "true"
 * -- this function is a defense-in-depth check that should never actually
 * throw in normal operation, only if the workflow YAML itself has a bug.
 */
export function assertScheduledLiveGateEnabled(eventName, gateEnvValue) {
  if (eventName !== "schedule") return;
  if (gateEnvValue !== "true") {
    throw new Error('Scheduled live posting is disabled (the scheduled-live gate is not "true"). This should not be reachable -- the workflow resolves mode=dry-run for schedule events unless this gate is on.');
  }
}
