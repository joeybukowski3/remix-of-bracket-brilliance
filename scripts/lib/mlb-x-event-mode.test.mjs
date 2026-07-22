/**
 * mlb-x-event-mode.test.mjs
 * Run via: node --test scripts/lib/mlb-x-event-mode.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventMode, resolveEventMode } from "./mlb-x-event-mode.mjs";

describe("schedule", () => {
  it("is live-capable and not a dry run", () => {
    const r = resolveEventMode({ eventName: "schedule" });
    assert.equal(r.ok, true);
    assert.equal(r.mode, EventMode.SCHEDULE);
    assert.equal(r.dryRun, false);
    assert.equal(r.diagnosticOnly, false);
    assert.equal(r.liveCapable, true);
  });

  it("ignores a stray dispatch mode input -- schedule never carries one for real", () => {
    const r = resolveEventMode({ eventName: "schedule", dispatchMode: "morning-dry-run" });
    assert.equal(r.liveCapable, true, "dispatchMode is only consulted for workflow_dispatch");
  });
});

describe("workflow_run", () => {
  it("is live-capable and not a dry run", () => {
    const r = resolveEventMode({ eventName: "workflow_run" });
    assert.equal(r.ok, true);
    assert.equal(r.mode, EventMode.WORKFLOW_RUN);
    assert.equal(r.dryRun, false);
    assert.equal(r.liveCapable, true);
  });
});

describe("workflow_dispatch", () => {
  it("morning-dry-run and confirmed-dry-run resolve to a dry run, not live-capable", () => {
    for (const mode of ["morning-dry-run", "confirmed-dry-run"]) {
      const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: mode });
      assert.equal(r.ok, true, mode);
      assert.equal(r.mode, EventMode.DISPATCH_DRY_RUN, mode);
      assert.equal(r.dryRun, true, mode);
      assert.equal(r.diagnosticOnly, false, mode);
      assert.equal(r.liveCapable, false, mode);
    }
  });

  it("morning-live and confirmed-live resolve to live-capable, not a dry run", () => {
    for (const mode of ["morning-live", "confirmed-live"]) {
      const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: mode });
      assert.equal(r.ok, true, mode);
      assert.equal(r.mode, EventMode.DISPATCH_LIVE, mode);
      assert.equal(r.dryRun, false, mode);
      assert.equal(r.liveCapable, true, mode);
    }
  });

  it("diagnostic-only is diagnostic mode, never live-capable", () => {
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "diagnostic-only" });
    assert.equal(r.ok, true);
    assert.equal(r.mode, EventMode.DISPATCH_DIAGNOSTIC);
    assert.equal(r.diagnosticOnly, true);
    assert.equal(r.liveCapable, false);
  });

  it("a missing mode fails closed rather than defaulting to live or to a silent dry run", () => {
    for (const dispatchMode of [null, undefined, ""]) {
      const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode });
      assert.equal(r.ok, false);
      assert.equal(r.mode, EventMode.UNKNOWN);
      assert.equal(r.liveCapable, false);
    }
  });

  it("an unrecognized mode fails closed", () => {
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "totally-made-up" });
    assert.equal(r.ok, false);
    assert.equal(r.liveCapable, false);
    assert.match(r.reason, /unrecognized/);
  });
});

describe("unrecognized event", () => {
  it("fails closed for an event this system has no defined behavior for", () => {
    for (const eventName of ["push", "pull_request", "", "issue_comment"]) {
      const r = resolveEventMode({ eventName });
      assert.equal(r.ok, false, eventName);
      assert.equal(r.liveCapable, false, eventName);
      assert.equal(r.mode, EventMode.UNKNOWN, eventName);
    }
  });
});

describe("liveCapable is never true unless ok is also true", () => {
  it("holds across every case in the table", () => {
    const cases = [
      { eventName: "schedule" },
      { eventName: "workflow_run" },
      { eventName: "workflow_dispatch", dispatchMode: "morning-dry-run" },
      { eventName: "workflow_dispatch", dispatchMode: "confirmed-dry-run" },
      { eventName: "workflow_dispatch", dispatchMode: "morning-live" },
      { eventName: "workflow_dispatch", dispatchMode: "confirmed-live" },
      { eventName: "workflow_dispatch", dispatchMode: "diagnostic-only" },
      { eventName: "workflow_dispatch", dispatchMode: "" },
      { eventName: "workflow_dispatch", dispatchMode: "bogus" },
      { eventName: "push" },
      { eventName: "" },
    ];
    for (const input of cases) {
      const r = resolveEventMode(input);
      if (!r.ok) assert.equal(r.liveCapable, false, JSON.stringify(input));
      if (r.dryRun || r.diagnosticOnly) assert.equal(r.liveCapable, false, JSON.stringify(input));
    }
  });
});

// A dry-run-only simulated clock. Never a general production clock override:
// resolveEventMode must refuse it for every mode except the three dry-run/
// diagnostic ones, and always ties it to the planner's own resolved slate
// date so a stale or wrong-day value can never silently apply.
describe("simulation_now", () => {
  const SLATE = "2026-07-22";
  const IN_SLATE = "2026-07-22T14:00:00Z"; // 10:00 ET, same calendar day
  const CROSS_SLATE = "2026-07-23T14:00:00Z"; // 10:00 ET the FOLLOWING day

  it("1. is accepted for morning-dry-run", () => {
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "morning-dry-run", simulationNow: IN_SLATE, slateDate: SLATE });
    assert.equal(r.ok, true);
    assert.equal(r.simulated, true);
    assert.equal(r.simulationNow, IN_SLATE);
    assert.equal(r.dryRun, true);
    assert.equal(r.liveCapable, false);
  });

  it("2. is accepted for confirmed-dry-run", () => {
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "confirmed-dry-run", simulationNow: IN_SLATE, slateDate: SLATE });
    assert.equal(r.ok, true);
    assert.equal(r.simulated, true);
    assert.equal(r.simulationNow, IN_SLATE);
  });

  it("3. is accepted for diagnostic-only", () => {
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "diagnostic-only", simulationNow: IN_SLATE, slateDate: SLATE });
    assert.equal(r.ok, true);
    assert.equal(r.simulated, true);
    assert.equal(r.diagnosticOnly, true);
  });

  it("4. is rejected for morning-live", () => {
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "morning-live", simulationNow: IN_SLATE, slateDate: SLATE });
    assert.equal(r.ok, false);
    assert.equal(r.simulated, false);
    assert.equal(r.simulationNow, null);
    assert.match(r.reason, /simulation_now is only accepted for/);
  });

  it("5. is rejected for confirmed-live", () => {
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "confirmed-live", simulationNow: IN_SLATE, slateDate: SLATE });
    assert.equal(r.ok, false);
    assert.equal(r.simulated, false);
  });

  it("6. schedule cannot inject simulation_now", () => {
    const r = resolveEventMode({ eventName: "schedule", simulationNow: IN_SLATE, slateDate: SLATE });
    assert.equal(r.ok, false);
    assert.equal(r.simulated, false);
    assert.match(r.reason, /simulation_now is only accepted for/);
  });

  it("7. workflow_run cannot inject simulation_now", () => {
    const r = resolveEventMode({ eventName: "workflow_run", simulationNow: IN_SLATE, slateDate: SLATE });
    assert.equal(r.ok, false);
    assert.equal(r.simulated, false);
  });

  it("8. a malformed timestamp is rejected", () => {
    for (const bad of ["2026-07-22", "2026-07-22 14:00:00Z", "not-a-date", "2026-07-22T14:00:00", "2026-07-22T14:00:00+00:00"]) {
      const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "morning-dry-run", simulationNow: bad, slateDate: SLATE });
      assert.equal(r.ok, false, bad);
      assert.equal(r.simulated, false, bad);
      assert.match(r.reason, /not a valid/, bad);
    }
  });

  it("9. a simulated date differing from the planner's ET slate date is rejected", () => {
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "morning-dry-run", simulationNow: CROSS_SLATE, slateDate: SLATE });
    assert.equal(r.ok, false);
    assert.equal(r.simulated, false);
    assert.match(r.reason, /does not match the planner's resolved slate date/);
  });

  it("accepts a late-evening ET timestamp that is still the same calendar slate date in UTC's next day", () => {
    // 21:30 ET on 2026-07-22 is 01:30 UTC on 2026-07-23 -- still slate date 2026-07-22 in America/New_York.
    const lateEt = "2026-07-23T01:30:00Z";
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "confirmed-dry-run", simulationNow: lateEt, slateDate: SLATE });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.simulated, true);
  });

  it("an unresolvable slateDate check is skipped, not silently accepted, when slateDate is omitted", () => {
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "morning-dry-run", simulationNow: IN_SLATE });
    assert.equal(r.ok, true, "no slateDate to cross-check against -- format/mode checks alone still apply");
    assert.equal(r.simulated, true);
  });

  it("10. simulated is the flag summaries key off of to label SIMULATED TIME", () => {
    const simulated = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "morning-dry-run", simulationNow: IN_SLATE, slateDate: SLATE });
    const real = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "morning-dry-run" });
    assert.equal(simulated.simulated, true);
    assert.equal(real.simulated, false);
  });

  it("11. a simulated run is never liveCapable -- it cannot call X", () => {
    for (const dispatchMode of ["morning-dry-run", "confirmed-dry-run", "diagnostic-only"]) {
      const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode, simulationNow: IN_SLATE, slateDate: SLATE });
      assert.equal(r.liveCapable, false, dispatchMode);
    }
  });

  it("12. a simulated run always resolves dryRun true (or diagnosticOnly true), so runEditionPost never reaches a receipt write", () => {
    for (const dispatchMode of ["morning-dry-run", "confirmed-dry-run"]) {
      const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode, simulationNow: IN_SLATE, slateDate: SLATE });
      assert.equal(r.dryRun, true, dispatchMode);
    }
    const diag = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "diagnostic-only", simulationNow: IN_SLATE, slateDate: SLATE });
    assert.equal(diag.diagnosticOnly, true);
  });

  it("ignores an empty-string simulation_now the same as omitting it entirely", () => {
    const r = resolveEventMode({ eventName: "workflow_dispatch", dispatchMode: "morning-live", simulationNow: "", slateDate: SLATE });
    assert.equal(r.ok, true, "empty simulation_now must not itself block an otherwise-valid live dispatch");
    assert.equal(r.simulated, false);
  });
});
