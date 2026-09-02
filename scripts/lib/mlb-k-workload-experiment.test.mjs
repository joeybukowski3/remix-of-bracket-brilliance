/**
 * mlb-k-workload-experiment.test.mjs
 * Run via: node --test scripts/lib/mlb-k-workload-experiment.test.mjs
 *
 * Fidelity: decomposeWorkload() at BASELINE_PARAMS must reproduce the production
 * computeWorkloadProjection() expectedBF / expectedInnings exactly, and
 * reprojectFromDecomp() at BASELINE_PARAMS must match decomposeWorkload().
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeWorkloadProjection } from "../mlb-k/compute-workload-projection.mjs";
import { BASELINE_PARAMS, decomposeWorkload, reprojectFromDecomp } from "./mlb-k-workload-experiment.mjs";

function appearance({ ip, bf, pitches, strikeouts = 4, isStart = true }) {
  return { inningsPitched: ip, battersFaced: bf, pitches, strikeouts, isStart, gamesStarted: isStart ? 1 : 0 };
}

function starterShape(starts, { currentStarts = starts.length } = {}) {
  return {
    starts,
    recentAppearances: starts,
    completeness: {
      score: 0.9,
      counts: {
        currentSeasonAppearances: starts.length,
        currentSeasonStarterAppearances: currentStarts,
        currentSeasonReliefAppearances: starts.length - currentStarts,
      },
    },
  };
}

const CASES = [
  {
    name: "workhorse starter, 6 starts",
    workloadData: starterShape([
      appearance({ ip: 6.1, bf: 25, pitches: 98 }),
      appearance({ ip: 7.0, bf: 27, pitches: 104 }),
      appearance({ ip: 5.2, bf: 23, pitches: 91 }),
      appearance({ ip: 6.2, bf: 26, pitches: 100 }),
      appearance({ ip: 7.1, bf: 28, pitches: 108 }),
      appearance({ ip: 6.0, bf: 24, pitches: 95 }),
    ]),
    opponent: { seasonPitchesPerPA: 3.95, recent14PitchesPerPA: 3.88 },
    league: { kRate: 0.225, pitchesPerPA: 3.9 },
  },
  {
    name: "short starter, thin sample",
    workloadData: starterShape([
      appearance({ ip: 4.1, bf: 18, pitches: 74 }),
      appearance({ ip: 3.2, bf: 16, pitches: 68 }),
    ]),
    opponent: { seasonPitchesPerPA: 3.7 },
    league: { kRate: 0.22, pitchesPerPA: 3.85 },
  },
  {
    name: "missing pitch counts",
    workloadData: starterShape([
      appearance({ ip: 5.2, bf: 22, pitches: null }),
      appearance({ ip: 6.0, bf: 24, pitches: null }),
      appearance({ ip: 5.1, bf: 21, pitches: null }),
      appearance({ ip: 6.1, bf: 25, pitches: null }),
    ]),
    opponent: {},
    league: { kRate: 0.225, pitchesPerPA: 3.9 },
  },
];

describe("decomposeWorkload fidelity vs production", () => {
  for (const testCase of CASES) {
    it(`matches production expectedBF/expectedInnings — ${testCase.name}`, () => {
      const prod = computeWorkloadProjection({
        workloadData: testCase.workloadData,
        pitcher: { seasonKRate: 0.24, recentKRate: 0.25, whiffRate: null },
        opponent: testCase.opponent,
        league: testCase.league,
        context: { listedProbableStarter: true },
      });
      const { projection } = decomposeWorkload({
        workloadData: testCase.workloadData,
        opponent: testCase.opponent,
        league: testCase.league,
        context: { listedProbableStarter: true },
      });
      assert.equal(projection.expectedBF, prod.projection.expectedBF, "expectedBF");
      assert.equal(projection.expectedInnings, prod.projection.expectedInnings, "expectedInnings");
    });

    it(`reprojectFromDecomp at baseline matches decomposeWorkload — ${testCase.name}`, () => {
      const { projection, decomp } = decomposeWorkload({
        workloadData: testCase.workloadData,
        opponent: testCase.opponent,
        league: testCase.league,
        context: { listedProbableStarter: true },
      });
      const re = reprojectFromDecomp(decomp, BASELINE_PARAMS);
      assert.equal(re.expectedBF, projection.expectedBF);
      assert.equal(re.expectedInnings, projection.expectedInnings);
    });
  }
});

describe("candidate knobs move workload dispersion the expected direction", () => {
  it("raising the recent-BF weight pulls a low-workload starter further from league", () => {
    const shape = starterShape([
      appearance({ ip: 3.2, bf: 15, pitches: 64 }),
      appearance({ ip: 4.0, bf: 17, pitches: 70 }),
      appearance({ ip: 3.1, bf: 14, pitches: 61 }),
      appearance({ ip: 4.1, bf: 18, pitches: 73 }),
    ]);
    const args = { workloadData: shape, opponent: { seasonPitchesPerPA: 3.9 }, league: { pitchesPerPA: 3.9 } };
    const base = decomposeWorkload(args).projection.expectedBF;
    const cand = decomposeWorkload(args, { bfByPitchesWeight: 0.4, bfRecentWeight: 0.6 }).projection.expectedBF;
    assert.ok(cand < base, `expected ${cand} < ${base}`);
  });
});
