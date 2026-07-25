/**
 * mlb-hr-handedness-frequency.test.mjs
 * Run: node --test scripts/lib/mlb-hr-handedness-frequency.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HAND_FREQ_SCORE_WEIGHT,
  selectHandednessHrFrequency,
  scoreHandednessFrequency,
  SPLIT_STATUS,
} from "./mlb-hr-handedness-frequency.mjs";

function handSplits({ vsLeft = null, vsRight = null } = {}) {
  return {
    playerId: 1,
    freshnessStatus: "fresh",
    splits: {
      vsLeft: vsLeft
        ? {
            atBats: vsLeft.atBats,
            homeRuns: vsLeft.homeRuns,
            raw: { atBats: vsLeft.atBats, homeRuns: vsLeft.homeRuns, plateAppearances: vsLeft.atBats + 5 },
          }
        : null,
      vsRight: vsRight
        ? {
            atBats: vsRight.atBats,
            homeRuns: vsRight.homeRuns,
            raw: { atBats: vsRight.atBats, homeRuns: vsRight.homeRuns, plateAppearances: vsRight.atBats + 5 },
          }
        : null,
    },
  };
}

describe("handedness HR frequency selection", () => {
  it("LHP selects only vs-LHP split", () => {
    const result = selectHandednessHrFrequency({
      pitcherHand: "L",
      batterHandSplits: handSplits({
        vsLeft: { atBats: 120, homeRuns: 4 },
        vsRight: { atBats: 112, homeRuns: 6 },
      }),
    });
    assert.equal(result.splitSide, "vsLeft");
    assert.equal(result.splitAtBats, 120);
    assert.equal(result.splitHomeRuns, 4);
    assert.equal(result.splitAbPerHr, 30.0);
    assert.equal(result.splitStatus, SPLIT_STATUS.OK);
    assert.equal(result.splitHandLabel, "LHP");
    assert.equal(result.displayPrimary, "1 HR / 30.0 AB");
    assert.equal(result.displaySecondary, "4 HR in 120 AB");
  });

  it("RHP selects only vs-RHP split", () => {
    const result = selectHandednessHrFrequency({
      pitcherHand: "R",
      batterHandSplits: handSplits({
        vsLeft: { atBats: 120, homeRuns: 4 },
        vsRight: { atBats: 112, homeRuns: 6 },
      }),
    });
    assert.equal(result.splitSide, "vsRight");
    assert.equal(result.splitAtBats, 112);
    assert.equal(result.splitHomeRuns, 6);
    assert.equal(result.splitAbPerHr, 18.7);
    assert.equal(result.splitStatus, SPLIT_STATUS.OK);
    assert.equal(result.splitHandLabel, "RHP");
    assert.equal(result.displayPrimary, "1 HR / 18.7 AB");
    assert.equal(result.displaySecondary, "6 HR in 112 AB");
  });

  it("pitcher-hand change selects the other split", () => {
    const splits = handSplits({
      vsLeft: { atBats: 120, homeRuns: 4 },
      vsRight: { atBats: 112, homeRuns: 6 },
    });
    const vsL = selectHandednessHrFrequency({ pitcherHand: "L", batterHandSplits: splits });
    const vsR = selectHandednessHrFrequency({ pitcherHand: "R", batterHandSplits: splits });
    assert.equal(vsL.splitAbPerHr, 30.0);
    assert.equal(vsR.splitAbPerHr, 18.7);
    assert.notEqual(vsL.splitSide, vsR.splitSide);
  });

  it("120 AB / 4 HR = 30.0", () => {
    const result = selectHandednessHrFrequency({
      pitcherHand: "L",
      batterHandSplits: handSplits({ vsLeft: { atBats: 120, homeRuns: 4 } }),
    });
    assert.equal(result.splitAbPerHr, 30.0);
  });

  it("112 AB / 6 HR = 18.7", () => {
    const result = selectHandednessHrFrequency({
      pitcherHand: "R",
      batterHandSplits: handSplits({ vsRight: { atBats: 112, homeRuns: 6 } }),
    });
    assert.equal(result.splitAbPerHr, 18.7);
  });

  it("zero HR does not produce Infinity", () => {
    const result = selectHandednessHrFrequency({
      pitcherHand: "R",
      batterHandSplits: handSplits({ vsRight: { atBats: 45, homeRuns: 0 } }),
    });
    assert.equal(result.splitStatus, SPLIT_STATUS.ZERO_HR);
    assert.equal(result.splitAbPerHr, null);
    assert.equal(result.displayPrimary, "0 HR in 45 AB");
    assert.ok(result.scoreComponent == null || Number.isFinite(result.scoreComponent));
    assert.notEqual(result.scoreComponent, Infinity);
  });

  it("missing split data", () => {
    const result = selectHandednessHrFrequency({
      pitcherHand: "L",
      batterHandSplits: handSplits({ vsRight: { atBats: 100, homeRuns: 5 } }),
    });
    assert.equal(result.splitStatus, SPLIT_STATUS.SPLIT_UNAVAILABLE);
    assert.equal(result.displayPrimary, "Split unavailable");
    assert.equal(result.scoreComponent, null);
  });

  it("missing pitcher hand", () => {
    const result = selectHandednessHrFrequency({
      pitcherHand: null,
      batterHandSplits: handSplits({ vsLeft: { atBats: 100, homeRuns: 5 } }),
    });
    assert.equal(result.splitStatus, SPLIT_STATUS.PITCHER_HAND_UNAVAILABLE);
    assert.equal(result.displayPrimary, "Pitcher hand unavailable");
    assert.equal(result.scoreComponent, null);
  });

  it("never emits Infinity, NaN, or negatives for valid inputs", () => {
    const cases = [
      { pitcherHand: "L", batterHandSplits: handSplits({ vsLeft: { atBats: 120, homeRuns: 4 } }) },
      { pitcherHand: "R", batterHandSplits: handSplits({ vsRight: { atBats: 10, homeRuns: 0 } }) },
      { pitcherHand: "S", batterHandSplits: handSplits({ vsLeft: { atBats: 10, homeRuns: 1 } }) },
      { pitcherHand: "R", batterHandSplits: null },
    ];
    for (const input of cases) {
      const r = selectHandednessHrFrequency(input);
      for (const key of ["splitAtBats", "splitHomeRuns", "splitAbPerHr", "scoreComponent"]) {
        const v = r[key];
        if (v != null) {
          assert.ok(Number.isFinite(v), `${key} not finite: ${v}`);
          assert.ok(v >= 0, `${key} negative: ${v}`);
        }
      }
    }
  });
});

describe("handedness HR frequency score component", () => {
  it("small samples shrink toward neutral 50", () => {
    const small = scoreHandednessFrequency({ atBats: 10, homeRuns: 2, abPerHr: 5 });
    const large = scoreHandednessFrequency({ atBats: 200, homeRuns: 40, abPerHr: 5 });
    assert.ok(small != null && large != null);
    assert.ok(Math.abs(small - 50) < Math.abs(large - 50));
  });

  it("score remains within 0–100", () => {
    const samples = [
      { atBats: 120, homeRuns: 4, abPerHr: 30 },
      { atBats: 112, homeRuns: 6, abPerHr: 18.666 },
      { atBats: 40, homeRuns: 0, abPerHr: null },
      { atBats: 200, homeRuns: 25, abPerHr: 8 },
      { atBats: 5, homeRuns: 0, abPerHr: null },
    ];
    for (const s of samples) {
      const score = scoreHandednessFrequency(s);
      assert.ok(score == null || (score >= 0 && score <= 100), String(score));
    }
  });

  it("is deterministic", () => {
    const a = selectHandednessHrFrequency({
      pitcherHand: "R",
      batterHandSplits: handSplits({ vsRight: { atBats: 112, homeRuns: 6 } }),
    });
    const b = selectHandednessHrFrequency({
      pitcherHand: "R",
      batterHandSplits: handSplits({ vsRight: { atBats: 112, homeRuns: 6 } }),
    });
    assert.deepEqual(a, b);
  });

  it("uses the approved 10% weight constant", () => {
    assert.equal(HAND_FREQ_SCORE_WEIGHT, 0.10);
  });
});
