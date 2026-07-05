/**
 * compute-workload-projection.test.mjs
 * Run via: node --test scripts/mlb-k/compute-workload-projection.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyWorkloadRole, computeWorkloadProjection } from "./compute-workload-projection.mjs";

function appearance({ ip, bf = 4, pitches = 15, strikeouts = 1, isStart = false }) {
  return { inningsPitched: ip, battersFaced: bf, pitches, strikeouts, isStart };
}

function workloadDataFor({ appearances, starts = [], currentStarts = starts.length, currentAppearances = appearances.length }) {
  const reliefCount = currentAppearances - currentStarts;
  return {
    starts,
    recentAppearances: appearances,
    completeness: {
      score: 0.8,
      counts: {
        currentSeasonAppearances: currentAppearances,
        currentSeasonStarterAppearances: currentStarts,
        currentSeasonReliefAppearances: reliefCount,
      },
    },
  };
}

describe("classifyWorkloadRole", () => {
  it("classifies a pitcher with 3+ appearances, <=1 start, and >=70% relief share as a reliever", () => {
    const data = workloadDataFor({
      appearances: [appearance({ ip: 0.667 }), appearance({ ip: 1 }), appearance({ ip: 0.333 })],
      currentStarts: 0,
      currentAppearances: 3,
    });
    assert.equal(classifyWorkloadRole(data), "reliever");
  });

  it("classifies a bulk/piggyback pitcher with short starts (<=2.5 IP) as an opener", () => {
    const shortStarts = [appearance({ ip: 1, isStart: true }), appearance({ ip: 1, isStart: true })];
    const data = { ...workloadDataFor({ appearances: shortStarts, starts: shortStarts, currentStarts: 2, currentAppearances: 2 }), starts: shortStarts };
    assert.equal(classifyWorkloadRole(data), "opener");
  });

  it("classifies a normal full-length starter as starter", () => {
    const fullStarts = [appearance({ ip: 6, isStart: true }), appearance({ ip: 6.333, isStart: true })];
    const data = { ...workloadDataFor({ appearances: fullStarts, starts: fullStarts, currentStarts: 2, currentAppearances: 2 }), starts: fullStarts };
    assert.equal(classifyWorkloadRole(data), "starter");
  });
});

describe("computeWorkloadProjection: reliever with six recent short appearances", () => {
  // Mirrors Wandy-Peralta-shaped relief usage: 0.2-1.0 innings, low batters
  // faced, low pitch counts across the 6 most recent outings.
  const appearances = [
    appearance({ ip: 2 / 3, bf: 3, pitches: 12, strikeouts: 0 }),
    appearance({ ip: 1, bf: 4, pitches: 15, strikeouts: 1 }),
    appearance({ ip: 1, bf: 3, pitches: 11, strikeouts: 0 }),
    appearance({ ip: 1, bf: 4, pitches: 13, strikeouts: 1 }),
    appearance({ ip: 2 / 3, bf: 3, pitches: 10, strikeouts: 0 }),
    appearance({ ip: 1, bf: 4, pitches: 14, strikeouts: 1 }),
  ];
  const workloadData = workloadDataFor({ appearances, currentStarts: 0, currentAppearances: 6 });
  const role = classifyWorkloadRole(workloadData);
  const projection = computeWorkloadProjection({
    workloadData,
    pitcher: { seasonKRate: 0.2, recentKRate: 0.22 },
    opponent: {},
    league: {},
    context: {},
  });

  it("classifies as reliever", () => {
    assert.equal(role, "reliever");
  });

  it("produces a realistic weighted IP within reliever bounds (0.1-3.0), not a starter-shaped value", () => {
    assert.ok(projection.projection.expectedInnings >= 0.1 && projection.projection.expectedInnings <= 3);
    assert.ok(projection.projection.expectedInnings < 2, `expected a short relief outing, got ${projection.projection.expectedInnings}`);
  });

  it("produces a realistic BF within reliever bounds (2-10)", () => {
    assert.ok(projection.projection.expectedBF >= 2 && projection.projection.expectedBF <= 10);
  });

  it("produces a realistic projected-Ks value bounded by a short outing (well under a starter's total)", () => {
    assert.ok(projection.projection.workloadOnlyProjectedKs < 5, `expected a low K total for a reliever, got ${projection.projection.workloadOnlyProjectedKs}`);
  });
});

describe("computeWorkloadProjection: opener bounds", () => {
  const shortStarts = [
    appearance({ ip: 1, bf: 4, pitches: 15, strikeouts: 1, isStart: true }),
    appearance({ ip: 1.333, bf: 5, pitches: 18, strikeouts: 2, isStart: true }),
    appearance({ ip: 1, bf: 4, pitches: 14, strikeouts: 0, isStart: true }),
  ];
  const workloadData = { ...workloadDataFor({ appearances: shortStarts, starts: shortStarts, currentStarts: 3, currentAppearances: 3 }), starts: shortStarts };
  const role = classifyWorkloadRole(workloadData);
  const projection = computeWorkloadProjection({ workloadData, pitcher: {}, opponent: {}, league: {}, context: {} });

  it("classifies as opener", () => {
    assert.equal(role, "opener");
  });

  it("applies opener IP bounds (0.7-4.0), not starter bounds (3-9)", () => {
    assert.ok(projection.projection.expectedInnings >= 0.7 && projection.projection.expectedInnings <= 4);
  });

  it("applies opener BF bounds (4-14), not starter bounds (10-30)", () => {
    assert.ok(projection.projection.expectedBF >= 4 && projection.projection.expectedBF <= 14);
  });

  it("flags OPENER_WORKLOAD_CAP", () => {
    assert.ok(projection.flags.includes("OPENER_WORKLOAD_CAP"));
  });
});
