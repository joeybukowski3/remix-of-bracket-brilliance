/**
 * mlb-k-workload-experiment-4.test.mjs
 * Run: node --test scripts/lib/mlb-k-workload-experiment-4.test.mjs
 *
 * 1. reprojectV4 at BASELINE_PARAMS_V4 must reproduce the production
 *    (Experiment 3 reprojectFromDecomp) expectedBF / expectedInnings exactly.
 * 2. pitcher-anchored candidates must move the projection toward the pitcher's
 *    own season/recent numbers in the expected direction.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeWorkloadProjection } from "../mlb-k/compute-workload-projection.mjs";
import { decomposeWorkload } from "./mlb-k-workload-experiment.mjs";
import { BASELINE_PARAMS_V4, buildV4Inputs, reprojectV4 } from "./mlb-k-workload-experiment-4.mjs";

function appearance({ ip, bf, pitches, strikeouts = 5, isStart = true }) {
  return { inningsPitched: ip, battersFaced: bf, pitches, strikeouts, isStart, gamesStarted: isStart ? 1 : 0 };
}
function starterShape(starts) {
  return {
    starts,
    recentAppearances: starts,
    allStarterAppearances: starts,
    completeness: {
      score: 0.9,
      counts: {
        currentSeasonAppearances: starts.length,
        currentSeasonStarterAppearances: starts.length,
        currentSeasonReliefAppearances: 0,
      },
    },
  };
}

const CASES = [
  {
    name: "workhorse, 6 starts",
    starts: [
      appearance({ ip: 6.1, bf: 25, pitches: 98 }),
      appearance({ ip: 7.0, bf: 27, pitches: 104 }),
      appearance({ ip: 5.2, bf: 23, pitches: 91 }),
      appearance({ ip: 6.2, bf: 26, pitches: 100 }),
      appearance({ ip: 7.1, bf: 28, pitches: 108 }),
      appearance({ ip: 6.0, bf: 24, pitches: 95 }),
    ],
    opponent: { seasonPitchesPerPA: 3.95, recent14PitchesPerPA: 3.88 },
    league: { kRate: 0.225, pitchesPerPA: 3.9 },
  },
  {
    name: "short starter, thin sample",
    starts: [
      appearance({ ip: 4.1, bf: 18, pitches: 74 }),
      appearance({ ip: 3.2, bf: 16, pitches: 68 }),
    ],
    opponent: { seasonPitchesPerPA: 3.7 },
    league: { kRate: 0.22, pitchesPerPA: 3.85 },
  },
];

function asOfShapeFromStarts(starts) {
  const n = starts.length;
  const last5 = starts.slice(-5);
  const sum = (arr, k) => arr.reduce((s, a) => s + (a[k] ?? 0), 0);
  return {
    seasonStarts: n,
    recentStartCount: last5.length,
    firstStartOfSeason: false,
    usedPriorSeason: false,
    seasonInnings: sum(starts, "inningsPitched"),
    seasonBattersFaced: sum(starts, "battersFaced"),
    seasonPitches: sum(starts, "pitches"),
    recentMeanInnings: sum(last5, "inningsPitched") / last5.length,
    recentMeanBattersFaced: sum(last5, "battersFaced") / last5.length,
    recentMeanPitches: sum(last5, "pitches") / last5.length,
  };
}

describe("reprojectV4 fidelity vs production at baseline params", () => {
  for (const c of CASES) {
    it(`matches production expectedBF/expectedInnings — ${c.name}`, () => {
      const workloadData = starterShape(c.starts);
      const prod = computeWorkloadProjection({
        workloadData,
        pitcher: { seasonKRate: 0.24, recentKRate: 0.25, whiffRate: null },
        opponent: c.opponent,
        league: c.league,
        context: { listedProbableStarter: true },
      });
      const { decomp } = decomposeWorkload({
        workloadData,
        opponent: c.opponent,
        league: c.league,
        context: { listedProbableStarter: true },
      });
      const v4in = buildV4Inputs(asOfShapeFromStarts(c.starts), workloadData);
      const re = reprojectV4(decomp, v4in, BASELINE_PARAMS_V4);
      assert.equal(re.expectedBF, prod.projection.expectedBF, "expectedBF");
      assert.equal(re.expectedInnings, prod.projection.expectedInnings, "expectedInnings");
    });
  }
});

describe("pitcher-anchored candidates move the projection toward the pitcher's own numbers", () => {
  it("a higher season weight pulls a recently-hot pitcher back toward his season line", () => {
    // season line is modest; last 5 are inflated
    const seasonStarts = Array.from({ length: 12 }, () => appearance({ ip: 5.4, bf: 22, pitches: 88 }));
    const recentHot = [
      appearance({ ip: 7.0, bf: 27, pitches: 104 }),
      appearance({ ip: 7.1, bf: 28, pitches: 106 }),
      appearance({ ip: 6.2, bf: 26, pitches: 101 }),
      appearance({ ip: 7.0, bf: 27, pitches: 103 }),
      appearance({ ip: 6.1, bf: 25, pitches: 99 }),
    ];
    const workloadData = starterShape(recentHot);
    const { decomp } = decomposeWorkload({ workloadData, opponent: { seasonPitchesPerPA: 3.9 }, league: { pitchesPerPA: 3.9 } });
    const v4in = {
      ...buildV4Inputs(asOfShapeFromStarts([...seasonStarts, ...recentHot]), workloadData),
      // season means from the full 17-start line
      seasonIpPerStart: (12 * 5.4 + 33.4) / 17,
      seasonBfPerStart: (12 * 22 + 133) / 17,
      seasonPitchesPerStart: (12 * 88 + 513) / 17,
      seasonStarts: 17,
    };
    const bf50 = reprojectV4(decomp, v4in, { mode: "pitcher-anchored", seasonWeight: 0.5 }).expectedBF;
    const bf70 = reprojectV4(decomp, v4in, { mode: "pitcher-anchored", seasonWeight: 0.7 }).expectedBF;
    assert.ok(bf70 < bf50, `expected 0.7-season (${bf70}) below 0.5-season (${bf50}) for a hot pitcher`);
  });

  it("the pitches-per-BF arm still returns a sane BF inside role caps", () => {
    const starts = CASES[0].starts;
    const workloadData = starterShape(starts);
    const { decomp } = decomposeWorkload({ workloadData, opponent: CASES[0].opponent, league: CASES[0].league });
    const v4in = buildV4Inputs(asOfShapeFromStarts(starts), workloadData);
    const out = reprojectV4(decomp, v4in, { mode: "pitcher-anchored", seasonWeight: 0.6, usePitcherPitchesPerBF: true });
    assert.ok(out.expectedBF >= 12 && out.expectedBF <= 30, `BF ${out.expectedBF} within starter caps`);
    assert.ok(Number.isFinite(out.expectedInnings));
  });
});
