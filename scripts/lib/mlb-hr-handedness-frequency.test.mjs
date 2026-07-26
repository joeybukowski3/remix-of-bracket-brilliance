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
  buildHandednessSplitSide,
  buildHandednessSplits,
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
            plateAppearances: vsLeft.plateAppearances ?? vsLeft.atBats + 5,
            hits: vsLeft.hits ?? null,
            walks: vsLeft.walks ?? null,
            strikeouts: vsLeft.strikeouts ?? null,
            battingAverage: vsLeft.battingAverage ?? null,
            onBasePercentage: vsLeft.onBasePercentage ?? null,
            sluggingPercentage: vsLeft.sluggingPercentage ?? null,
            ops: vsLeft.ops ?? null,
            hrRate: vsLeft.hrRate ?? null,
            sampleSizeTier: vsLeft.sampleSizeTier ?? "medium",
            raw: {
              atBats: vsLeft.atBats,
              homeRuns: vsLeft.homeRuns,
              plateAppearances: vsLeft.plateAppearances ?? vsLeft.atBats + 5,
              hits: vsLeft.hits ?? null,
              walks: vsLeft.walks ?? null,
              strikeouts: vsLeft.strikeouts ?? null,
              battingAverage: vsLeft.battingAverage ?? null,
              onBasePercentage: vsLeft.onBasePercentage ?? null,
              sluggingPercentage: vsLeft.sluggingPercentage ?? null,
              ops: vsLeft.ops ?? null,
              hrRate: vsLeft.hrRate ?? null,
            },
          }
        : null,
      vsRight: vsRight
        ? {
            atBats: vsRight.atBats,
            homeRuns: vsRight.homeRuns,
            plateAppearances: vsRight.plateAppearances ?? vsRight.atBats + 5,
            hits: vsRight.hits ?? null,
            walks: vsRight.walks ?? null,
            strikeouts: vsRight.strikeouts ?? null,
            battingAverage: vsRight.battingAverage ?? null,
            onBasePercentage: vsRight.onBasePercentage ?? null,
            sluggingPercentage: vsRight.sluggingPercentage ?? null,
            ops: vsRight.ops ?? null,
            hrRate: vsRight.hrRate ?? null,
            sampleSizeTier: vsRight.sampleSizeTier ?? "medium",
            raw: {
              atBats: vsRight.atBats,
              homeRuns: vsRight.homeRuns,
              plateAppearances: vsRight.plateAppearances ?? vsRight.atBats + 5,
              hits: vsRight.hits ?? null,
              walks: vsRight.walks ?? null,
              strikeouts: vsRight.strikeouts ?? null,
              battingAverage: vsRight.battingAverage ?? null,
              onBasePercentage: vsRight.onBasePercentage ?? null,
              sluggingPercentage: vsRight.sluggingPercentage ?? null,
              ops: vsRight.ops ?? null,
              hrRate: vsRight.hrRate ?? null,
            },
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

describe("handednessSplits dual-side display payload", () => {
  it("builds both vsLeft and vsRight from available raw metrics", () => {
    const payload = buildHandednessSplits(
      handSplits({
        vsLeft: {
          atBats: 120,
          homeRuns: 4,
          plateAppearances: 135,
          hits: 32,
          walks: 12,
          strikeouts: 30,
          battingAverage: 0.267,
          onBasePercentage: 0.333,
          sluggingPercentage: 0.5,
          ops: 0.833,
          hrRate: 4 / 135,
          sampleSizeTier: "medium",
        },
        vsRight: {
          atBats: 45,
          homeRuns: 0,
          plateAppearances: 50,
          hits: 10,
          walks: 4,
          strikeouts: 12,
          battingAverage: 0.222,
          onBasePercentage: 0.28,
          sluggingPercentage: 0.311,
          ops: 0.591,
          hrRate: 0,
          sampleSizeTier: "low",
        },
      }),
    );

    assert.equal(payload.vsLeft.status, SPLIT_STATUS.OK);
    assert.equal(payload.vsLeft.atBats, 120);
    assert.equal(payload.vsLeft.homeRuns, 4);
    assert.equal(payload.vsLeft.abPerHr, 30.0);
    assert.equal(payload.vsLeft.plateAppearances, 135);
    assert.equal(payload.vsLeft.hits, 32);
    assert.equal(payload.vsLeft.walks, 12);
    assert.equal(payload.vsLeft.strikeouts, 30);
    assert.equal(payload.vsLeft.ops, 0.833);
    assert.equal(payload.vsLeft.sampleSizeTier, "medium");
    assert.ok(Math.abs(payload.vsLeft.strikeoutRate - 30 / 135) < 1e-9);
    assert.ok(Math.abs(payload.vsLeft.walkRate - 12 / 135) < 1e-9);

    assert.equal(payload.vsRight.status, SPLIT_STATUS.ZERO_HR);
    assert.equal(payload.vsRight.atBats, 45);
    assert.equal(payload.vsRight.homeRuns, 0);
    assert.equal(payload.vsRight.abPerHr, null);
    assert.equal(payload.vsRight.sampleSizeTier, "low");
  });

  it("marks missing sides unavailable without fabricating metrics", () => {
    const side = buildHandednessSplitSide(null);
    assert.equal(side.status, SPLIT_STATUS.SPLIT_UNAVAILABLE);
    assert.equal(side.atBats, null);
    assert.equal(side.homeRuns, null);
    assert.equal(side.abPerHr, null);
    assert.equal(side.hardHitRate, undefined);

    const bothMissing = buildHandednessSplits(null);
    assert.equal(bothMissing.vsLeft.status, SPLIT_STATUS.SPLIT_UNAVAILABLE);
    assert.equal(bothMissing.vsRight.status, SPLIT_STATUS.SPLIT_UNAVAILABLE);
  });

  it("does not invent hard-hit rate", () => {
    const side = buildHandednessSplitSide({
      atBats: 100,
      homeRuns: 5,
      plateAppearances: 110,
      raw: { atBats: 100, homeRuns: 5, plateAppearances: 110 },
      sampleSizeTier: "medium",
    });
    assert.equal(Object.hasOwn(side, "hardHitRate"), false);
    assert.equal(side.homeRuns, 5);
  });
});
