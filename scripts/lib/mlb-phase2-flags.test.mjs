/**
 * mlb-phase2-flags.test.mjs
 * Run via: node --test scripts/lib/mlb-phase2-flags.test.mjs
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getPhase2Flags, isMlProjectedIpShadowEnabled } from "./mlb-phase2-flags.mjs";

const FLAG_NAMES = [
  "ENABLE_ML_PROJECTED_IP_SHADOW",
  "ENABLE_ML_PARK_SHADOW",
  "ENABLE_BULLPEN_DATA_PIPELINE",
  "ENABLE_ML_BULLPEN_SHADOW",
  "ENABLE_HR_BULLPEN_SHADOW",
  "ENABLE_HR_HAND_SPLIT_SHADOW",
  "ENABLE_PHASE2_SHADOW_COMPARISON",
];

let savedEnv = {};

beforeEach(() => {
  savedEnv = {};
  for (const name of FLAG_NAMES) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of FLAG_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

describe("getPhase2Flags", () => {
  it("defaults every flag to false when no env vars are set", () => {
    const flags = getPhase2Flags();
    for (const name of FLAG_NAMES) {
      assert.equal(flags[name], false, `${name} should default to false`);
    }
  });

  it("enables only the flag explicitly set to the string 'true'", () => {
    process.env.ENABLE_ML_PROJECTED_IP_SHADOW = "true";
    const flags = getPhase2Flags();
    assert.equal(flags.ENABLE_ML_PROJECTED_IP_SHADOW, true);
    for (const name of FLAG_NAMES) {
      if (name !== "ENABLE_ML_PROJECTED_IP_SHADOW") {
        assert.equal(flags[name], false, `${name} should remain false`);
      }
    }
  });

  it("treats any non-'true' string as disabled", () => {
    process.env.ENABLE_ML_PARK_SHADOW = "1";
    process.env.ENABLE_BULLPEN_DATA_PIPELINE = "TRUE";
    process.env.ENABLE_ML_BULLPEN_SHADOW = "yes";
    process.env.ENABLE_HR_BULLPEN_SHADOW = "false";
    const flags = getPhase2Flags();
    assert.equal(flags.ENABLE_ML_PARK_SHADOW, false);
    assert.equal(flags.ENABLE_BULLPEN_DATA_PIPELINE, false);
    assert.equal(flags.ENABLE_ML_BULLPEN_SHADOW, false);
    assert.equal(flags.ENABLE_HR_BULLPEN_SHADOW, false);
  });

  it("reads process.env fresh on every call (not cached at import time)", () => {
    assert.equal(getPhase2Flags().ENABLE_ML_PROJECTED_IP_SHADOW, false);
    process.env.ENABLE_ML_PROJECTED_IP_SHADOW = "true";
    assert.equal(getPhase2Flags().ENABLE_ML_PROJECTED_IP_SHADOW, true);
    delete process.env.ENABLE_ML_PROJECTED_IP_SHADOW;
    assert.equal(getPhase2Flags().ENABLE_ML_PROJECTED_IP_SHADOW, false);
  });
});

describe("isMlProjectedIpShadowEnabled", () => {
  it("mirrors getPhase2Flags().ENABLE_ML_PROJECTED_IP_SHADOW", () => {
    assert.equal(isMlProjectedIpShadowEnabled(), false);
    process.env.ENABLE_ML_PROJECTED_IP_SHADOW = "true";
    assert.equal(isMlProjectedIpShadowEnabled(), true);
  });
});
