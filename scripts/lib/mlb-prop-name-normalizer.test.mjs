import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMlbPropName } from "./mlb-prop-name-normalizer.mjs";

test("normalizes MLB prop names consistently", () => {
  assert.equal(normalizeMlbPropName("José Ramírez Jr."), "jose ramirez");
  assert.equal(normalizeMlbPropName("C.J. Abrams"), "cj abrams");
  assert.equal(normalizeMlbPropName("O'Neil Cruz"), "o'neil cruz");
  assert.equal(normalizeMlbPropName("Hyun-Jin Ryu IV"), "hyun-jin ryu");
  assert.equal(normalizeMlbPropName("  Luis   Robert   Sr. "), "luis robert");
});
