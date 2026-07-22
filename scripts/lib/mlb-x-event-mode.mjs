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
 *
 * A dry-run-only simulated clock (simulation_now) is validated here too,
 * for the same reason: this is exactly the kind of allow/deny decision that
 * belongs in tested code, not scattered YAML conditionals. It is accepted
 * ONLY for a mode that was already resolved as dry-run or diagnostic-only --
 * never live, never schedule, never workflow_run, never an unrecognized
 * mode -- and only when it names the same Eastern slate date the planner
 * already resolved. This is not a general production clock override: a
 * live-capable run never reads simulationNow at all (see post-mlb-x-edition.mjs).
 */
import { getEtSlateDate } from "./mlb-x-slate-timing.mjs";

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

/** Modes a simulated clock may ever be supplied for. Never DISPATCH_LIVE, SCHEDULE, or WORKFLOW_RUN. */
const SIMULATION_ALLOWED_MODES = new Set([EventMode.DISPATCH_DRY_RUN, EventMode.DISPATCH_DIAGNOSTIC]);

/** Exact format requested: YYYY-MM-DDTHH:mm:ssZ (UTC only, no offset or fractional seconds). */
const SIMULATION_NOW_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

function resolveBase({ eventName, dispatchMode }) {
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

/**
 * @param {object} params
 * @param {string} params.eventName GITHUB_EVENT_NAME
 * @param {string|null} [params.dispatchMode] github.event.inputs.mode -- workflow_dispatch only, ignored otherwise
 * @param {string|null} [params.simulationNow] github.event.inputs.simulation_now -- workflow_dispatch dry-run/diagnostic-only ONLY
 * @param {string|null} [params.slateDate] the planner's already-resolved YYYY-MM-DD ET slate date, to cross-check simulationNow against
 * @returns {{ ok: boolean, mode: string, dryRun: boolean, diagnosticOnly: boolean, liveCapable: boolean,
 *             simulationNow: string|null, simulated: boolean, reason: string }}
 *          liveCapable is false whenever dryRun or diagnosticOnly is true, and whenever ok is false.
 *          simulated is true only when simulationNow passed every check below.
 */
export function resolveEventMode({ eventName, dispatchMode = null, simulationNow = null, slateDate = null }) {
  const base = resolveBase({ eventName, dispatchMode });
  const requested = typeof simulationNow === "string" ? simulationNow.trim() : "";

  if (!requested) {
    return { ...base, simulationNow: null, simulated: false };
  }

  // A simulated clock was requested. It may only ever reach a mode this
  // module already resolved as dry-run or diagnostic-only -- a malformed or
  // unrecognized mode, or a live-capable one, refuses it outright rather
  // than silently ignoring it (silently ignoring an input the caller
  // explicitly set is its own kind of surprising failure).
  if (!base.ok || !SIMULATION_ALLOWED_MODES.has(base.mode)) {
    return {
      ok: false, mode: base.mode, dryRun: true, diagnosticOnly: false, liveCapable: false,
      simulationNow: null, simulated: false,
      reason: `simulation_now is only accepted for morning-dry-run, confirmed-dry-run, or diagnostic-only (resolved mode: "${base.mode}")`,
    };
  }

  if (!SIMULATION_NOW_PATTERN.test(requested) || !Number.isFinite(Date.parse(requested))) {
    return {
      ...base, ok: false, simulationNow: null, simulated: false,
      reason: `simulation_now "${requested}" is not a valid YYYY-MM-DDTHH:mm:ssZ timestamp`,
    };
  }

  if (slateDate) {
    const simulatedSlateDate = getEtSlateDate(requested);
    if (simulatedSlateDate !== slateDate) {
      return {
        ...base, ok: false, simulationNow: null, simulated: false,
        reason: `simulation_now "${requested}" resolves to ET slate date "${simulatedSlateDate}", which does not match the planner's resolved slate date "${slateDate}"`,
      };
    }
  }

  return { ...base, simulationNow: requested, simulated: true };
}
