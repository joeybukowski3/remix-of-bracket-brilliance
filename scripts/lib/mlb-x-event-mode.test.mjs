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
