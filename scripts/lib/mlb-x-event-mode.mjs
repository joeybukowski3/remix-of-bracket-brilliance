/**
 * Explicit event-mode resolution for the poster CLI.
 *
 * Decides whether a run is live-capable, must be a dry run, is
 * diagnostic-only, or must fail closed -- purely from the GitHub Actions
 * trigger (GITHUB_EVENT_NAME) and, for workflow_dispatch, the chosen mode
 * input. This exists because the previous shell logic in the workflow
 * ("DRY_RUN_FLAG stays --dry-run unless mode == morning-live") silently
 * treated every schedule/workflow_run firing as dry-run forever: neither
 * trigger ever sets github.event.inputs.mode, so the "is it live" check
 * compared an always-empty string against "morning-live" and never matched.
 * Never repeat that shape of bug: an event/mode this function does not
 * explicitly recognize resolves to `ok: false`, not a silent dry run and not
 * a silent live-capable pass.
 *
 * schedule and workflow_run are live-capable by trigger identity alone --
 * workflow_run's other two preconditions (triggering workflow concluded
 * success, ran on the main branch, and is the canonical MLB data workflow)
 * are enforced upstream of this module and of the CLI entirely: GitHub's own
 * `on.workflow_run` filter (workflows: ["Generate MLB Data"], branches:
 * [main]) means the event never fires otherwise, and the plan job's `if:`
 * gate additionally requires conclusion == 'success' before any poster job
 * can even start. Live-capable is not the same as "will post live" -- the
 * caller still requires X_ALLOW_LIVE_POST=true, real credentials, account
 * verification, and a shouldPost readiness verdict before any X call.
 */

export const EventMode = Object.freeze({
  SCHEDULE: "schedule",
  WORKFLOW_RUN: "workflow_run",
  DISPATCH_DRY_RUN: "dispatch_dry_run",
  DISPATCH_LIVE: "dispatch_live",
  DISPATCH_DIAGNOSTIC: "dispatch_diagnostic",
  UNKNOWN: "unknown",
});

/** workflow_dispatch's `mode` choice input -> resolution. */
const DISPATCH_MODES = Object.freeze({
  "morning-dry-run": { mode: EventMode.DISPATCH_DRY_RUN, dryRun: true, diagnosticOnly: false },
  "confirmed-dry-run": { mode: EventMode.DISPATCH_DRY_RUN, dryRun: true, diagnosticOnly: false },
  "morning-live": { mode: EventMode.DISPATCH_LIVE, dryRun: false, diagnosticOnly: false },
  "confirmed-live": { mode: EventMode.DISPATCH_LIVE, dryRun: false, diagnosticOnly: false },
  "diagnostic-only": { mode: EventMode.DISPATCH_DIAGNOSTIC, dryRun: true, diagnosticOnly: true },
});

/**
 * @param {object} params
 * @param {string} params.eventName GITHUB_EVENT_NAME
 * @param {string|null} [params.dispatchMode] github.event.inputs.mode -- workflow_dispatch only, ignored otherwise
 * @returns {{ ok: boolean, mode: string, dryRun: boolean, diagnosticOnly: boolean, liveCapable: boolean, reason: string }}
 *          liveCapable is false whenever dryRun or diagnosticOnly is true, and whenever ok is false.
 */
export function resolveEventMode({ eventName, dispatchMode = null }) {
  if (eventName === "schedule") {
    return { ok: true, mode: EventMode.SCHEDULE, dryRun: false, diagnosticOnly: false, liveCapable: true, reason: "scheduled trigger is live-capable" };
  }
  if (eventName === "workflow_run") {
    return {
      ok: true, mode: EventMode.WORKFLOW_RUN, dryRun: false, diagnosticOnly: false, liveCapable: true,
      reason: "workflow_run trigger is live-capable (branch, workflow name and conclusion already enforced upstream by the trigger filter and the plan job's gate)",
    };
  }
  if (eventName === "workflow_dispatch") {
    const normalized = String(dispatchMode ?? "").trim();
    const resolved = DISPATCH_MODES[normalized];
    if (!resolved) {
      return {
        ok: false, mode: EventMode.UNKNOWN, dryRun: true, diagnosticOnly: false, liveCapable: false,
        reason: normalized ? `unrecognized workflow_dispatch mode "${normalized}"` : "workflow_dispatch fired with no mode selected",
      };
    }
    return {
      ok: true, mode: resolved.mode, dryRun: resolved.dryRun, diagnosticOnly: resolved.diagnosticOnly,
      liveCapable: !resolved.dryRun && !resolved.diagnosticOnly, reason: `workflow_dispatch mode "${normalized}"`,
    };
  }
  return {
    ok: false, mode: EventMode.UNKNOWN, dryRun: true, diagnosticOnly: false, liveCapable: false,
    reason: `unrecognized trigger event "${eventName}"`,
  };
}
