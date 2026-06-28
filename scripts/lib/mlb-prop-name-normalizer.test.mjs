import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMlbPropName } from "./mlb-prop-name-normalizer.mjs";

test("normalizes representative MLB player names", () => {
  assert.equal(normalizeMlbPropName("José Ramírez Jr."), "jose ramirez");
  assert.equal(normalizeMlbPropName("C.J. Abrams"), "cj abrams");
  assert.equal(normalizeMlbPropName("Hyun-Jin Ryu IV"), "hyun-jin ryu");
});
