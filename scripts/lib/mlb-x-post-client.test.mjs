/**
 * mlb-x-post-client.test.mjs
 * Run via: node --test scripts/lib/mlb-x-post-client.test.mjs
 *
 * Covers the live-post kill switch traced end to end: a repository Actions
 * Variable (vars.X_ALLOW_LIVE_POST) -> workflow `env:` -> process.env ->
 * assertLivePostAllowed. The bug this guards against: X_ALLOW_LIVE_POST was
 * saved as a repository *Secret* rather than a *Variable*, so
 * vars.X_ALLOW_LIVE_POST always resolved empty even though a same-named
 * secret existed -- the gate correctly failed closed, but nothing made that
 * distinguishable from "the kill switch is just off" until now.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertLivePostAllowed, normalizeAllowLivePostFlag } from "./mlb-x-post-client.mjs";

describe("normalizeAllowLivePostFlag", () => {
  it("missing/undefined is not present and not enabled", () => {
    assert.deepEqual(normalizeAllowLivePostFlag(undefined), { present: false, enabled: false });
  });

  it("empty string is not present and not enabled", () => {
    assert.deepEqual(normalizeAllowLivePostFlag(""), { present: false, enabled: false });
  });

  it('"true" is present and enabled', () => {
    assert.deepEqual(normalizeAllowLivePostFlag("true"), { present: true, enabled: true });
  });

  it('"TRUE" is present and enabled (case-insensitive)', () => {
    assert.deepEqual(normalizeAllowLivePostFlag("TRUE"), { present: true, enabled: true });
  });

  it('whitespace-padded "  true  " is present and enabled (trimmed)', () => {
    assert.deepEqual(normalizeAllowLivePostFlag("  true  \n"), { present: true, enabled: true });
  });

  it('"false" is present but not enabled', () => {
    assert.deepEqual(normalizeAllowLivePostFlag("false"), { present: true, enabled: false });
  });

  it("whitespace-only is treated as not present (not enabled either)", () => {
    assert.deepEqual(normalizeAllowLivePostFlag("   "), { present: false, enabled: false });
  });
});

describe("assertLivePostAllowed", () => {
  it("manual dispatch, live-capable event, flag missing: blocked", () => {
    assert.throws(
      () => assertLivePostAllowed({ eventName: "workflow_dispatch", allowLivePost: undefined }),
      /X_ALLOW_LIVE_POST=true/,
    );
  });

  it("manual dispatch, live-capable event, flag true: allowed", () => {
    assert.doesNotThrow(() => assertLivePostAllowed({ eventName: "workflow_dispatch", allowLivePost: "true" }));
  });

  it("scheduled trigger, flag true: allowed", () => {
    assert.doesNotThrow(() => assertLivePostAllowed({ eventName: "schedule", allowLivePost: "true" }));
  });

  it("scheduled trigger, flag missing: blocked", () => {
    assert.throws(() => assertLivePostAllowed({ eventName: "schedule", allowLivePost: undefined }));
  });

  it("workflow_run trigger, flag true: allowed", () => {
    assert.doesNotThrow(() => assertLivePostAllowed({ eventName: "workflow_run", allowLivePost: "true" }));
  });

  it("workflow_run trigger, flag false: blocked", () => {
    assert.throws(() => assertLivePostAllowed({ eventName: "workflow_run", allowLivePost: "false" }));
  });

  it("whitespace-padded true is accepted on a live-capable event", () => {
    assert.doesNotThrow(() => assertLivePostAllowed({ eventName: "workflow_dispatch", allowLivePost: " true \n" }));
  });

  it("unrecognized/non-Actions event is blocked regardless of the flag", () => {
    assert.throws(() => assertLivePostAllowed({ eventName: "push", allowLivePost: "true" }));
  });

  it("never logs the raw flag value, only present/enabled", () => {
    const logged = [];
    assert.throws(() =>
      assertLivePostAllowed({
        eventName: "workflow_dispatch",
        allowLivePost: "definitely-not-a-boolean-but-should-never-appear-in-logs",
        log: (m) => logged.push(m),
      }),
    );
    const joined = logged.join("\n");
    assert.match(joined, /present=true/);
    assert.match(joined, /enabled=false/);
    assert.doesNotMatch(joined, /definitely-not-a-boolean-but-should-never-appear-in-logs/);
  });

  it("logs present=false when the flag is entirely missing", () => {
    const logged = [];
    assert.throws(() => assertLivePostAllowed({ eventName: "schedule", allowLivePost: undefined, log: (m) => logged.push(m) }));
    assert.match(logged.join("\n"), /present=false enabled=false/);
  });
});
