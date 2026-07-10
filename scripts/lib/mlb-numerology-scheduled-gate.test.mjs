import test from "node:test";
import assert from "node:assert/strict";
import { assertScheduledLiveGateEnabled } from "./mlb-numerology-scheduled-gate.mjs";

test("scheduled mode requires explicit live enablement: throws when the gate is not \"true\"", () => {
  assert.throws(() => assertScheduledLiveGateEnabled("schedule", "false"), /disabled/i);
  assert.throws(() => assertScheduledLiveGateEnabled("schedule", undefined), /disabled/i);
});

test("scheduled mode proceeds when the gate is explicitly \"true\"", () => {
  assert.doesNotThrow(() => assertScheduledLiveGateEnabled("schedule", "true"));
});

test("manual workflow_dispatch is never blocked by the scheduled-live gate, regardless of its value", () => {
  assert.doesNotThrow(() => assertScheduledLiveGateEnabled("workflow_dispatch", "false"));
  assert.doesNotThrow(() => assertScheduledLiveGateEnabled("workflow_dispatch", undefined));
});

test("workflow_run is never blocked by the scheduled-live gate (it has its own assertLivePostAllowed check)", () => {
  assert.doesNotThrow(() => assertScheduledLiveGateEnabled("workflow_run", "false"));
});
