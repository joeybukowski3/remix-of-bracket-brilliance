import test from "node:test";
import assert from "node:assert/strict";
import { isMlPostingEnabled } from "./mlb-ml-posting-gate.mjs";

test("ML posting is blocked while paused: undefined/missing env value", () => {
  assert.equal(isMlPostingEnabled(undefined), false);
});

test("ML posting is blocked while paused: explicit \"false\"", () => {
  assert.equal(isMlPostingEnabled("false"), false);
});

test("ML posting is blocked for any value other than the exact string \"true\"", () => {
  assert.equal(isMlPostingEnabled("TRUE"), false);
  assert.equal(isMlPostingEnabled("1"), false);
  assert.equal(isMlPostingEnabled(""), false);
});

test("ML posting is enabled only when explicitly \"true\"", () => {
  assert.equal(isMlPostingEnabled("true"), true);
});
