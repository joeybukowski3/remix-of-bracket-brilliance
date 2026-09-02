import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { calculateProjectedKs, calculateProjectedK9 } from "../generate-mlb-hr-props.mjs";
import { calculateProjectedInnings, classifyPitcherRole } from "./mlb-projected-innings.mjs";
import { computeWorkloadProjection } from "../mlb-k/compute-workload-projection.mjs";
import { V2_PRODUCTION_CONFIDENCE } from "./mlb-k-production-projection.mjs";
import { buildPitcherAsOf, buildTeamOffenseAsOf, buildLeagueAsOf, buildWorkloadDataShape } from "./mlb-k-backtest-asof.mjs";
import { buildBacktestRow } from "./mlb-k-backtest-dataset.mjs";
import { loadProjectStrikeoutsV2 } from "./mlb-k-backtest-v2-loader.mjs";

let deps;

function pitchRow(date, overrides = {}) {
  return {
    date,
    gamePk: Number(date.replace(/-/g, "")),
    season: Number(date.slice(0, 4)),
    isHome: overrides.isHome ?? true,
    gamesStarted: 1,
    inningsPitched: "6.0",
    strikeOuts: 7,
    battersFaced: 24,
    baseOnBalls: 2,
    numberOfPitches: 95,
    hits: 4,
    ...overrides,
  };
}
function teamRow(date, overrides = {}) {
  return { date, gamePk: Number(date.replace(/-/g, "")), strikeOuts: 9, plateAppearances: 38, numberOfPitches: 150, ...overrides };
}

function makeRow({ cutoff = "2025-06-01", starts = 10, actualK = 6, confidenceRows = true } = {}) {
  const currentSeasonRows = Array.from({ length: starts }, (_, index) => {
    const day = String(1 + index).padStart(2, "0");
    return pitchRow(`2025-05-${day}`, { isHome: index % 2 === 0 });
  });
  const teamRows = Array.from({ length: 40 }, (_, index) => {
    const month = index < 20 ? "04" : "05";
    const day = String(1 + (index % 20)).padStart(2, "0");
    return teamRow(`2025-${month}-${day}`);
  });
  const pitcherAsOf = buildPitcherAsOf({ currentSeasonRows, cutoffDate: cutoff, excludeGamePk: 999 });
  const opponentAsOf = buildTeamOffenseAsOf({ teamRows, cutoffDate: cutoff });
  const leagueAsOf = buildLeagueAsOf({ teamRowsByTeam: new Map([[1, teamRows], [2, teamRows], [3, teamRows]]), cutoffDate: cutoff });
  const workloadDataShape = buildWorkloadDataShape(pitcherAsOf, { season: 2025, cutoffDate: cutoff });
  return buildBacktestRow({
    identity: { season: 2025, date: cutoff, gameId: 999, gameNumber: 1, pitcherId: 111, pitcherName: "Test Pitcher", team: "AAA", opponent: "BBB", pitcherIsHome: true, handedness: "R", venueId: 1 },
    pitcherAsOf, opponentAsOf, leagueAsOf, workloadDataShape,
    actual: { strikeouts: actualK, inningsPitched: 6, battersFaced: 25, pitches: 98, walks: 2, hits: 5 },
    deps,
  });
}

before(async () => {
  deps = {
    calculateProjectedInnings,
    calculateProjectedK9,
    calculateProjectedKs,
    classifyPitcherRole,
    computeWorkloadProjection,
    projectStrikeoutsV2: await loadProjectStrikeoutsV2(),
    v2ProductionConfidence: V2_PRODUCTION_CONFIDENCE,
  };
});

describe("buildBacktestRow — three views", () => {
  it("computes V2 and legacy independently and never blends them", () => {
    const row = makeRow();
    assert.notEqual(row.v2.projectedStrikeouts, null);
    assert.notEqual(row.legacy.projectedKs, null);
    // legacy path is IP*K9/9 exactly
    assert.equal(row.legacy.projectedKs, calculateProjectedKs(row.legacy.projectedIP, row.legacy.projectedK9));
    // production-resolved equals one of the two, never an average
    const resolved = row.productionResolved.projectedKs;
    const nearV2 = Math.abs(resolved - row.v2.projectedKs) < 1e-9;
    const nearLegacy = Math.abs(resolved - row.legacy.projectedKs) < 1e-9;
    assert.ok(nearV2 || nearLegacy);
  });

  it("keeps low/insufficient-confidence V2 rows in the dataset", () => {
    const row = makeRow({ starts: 1, actualK: 4 }); // sparse => low confidence
    assert.notEqual(row.v2.projectedStrikeouts, null, "V2 projection retained");
    assert.equal(row.availability.v2, true);
    if (!V2_PRODUCTION_CONFIDENCE.has(row.v2.confidence)) {
      assert.equal(row.v2.productionEligible, false);
      assert.equal(row.productionResolved.source, "legacy-fallback");
      assert.equal(row.projectionServedByProduction, "legacy");
      assert.equal(row.availability.isProductionFallbackRow, true);
    }
  });

  it("production-resolved uses the exact live eligibility rule (confidence ∈ {high,medium} and >0)", () => {
    const row = makeRow();
    const shouldBeV2 = row.v2.projectedStrikeouts > 0 && V2_PRODUCTION_CONFIDENCE.has(row.v2.confidence);
    assert.equal(row.productionResolved.source === "v2", shouldBeV2);
  });

  it("residual sign convention: actual − projection", () => {
    const row = makeRow({ actualK: 10 });
    if (row.productionResolved.projectedKs != null) {
      assert.equal(row.residuals.productionResolved, round(10 - row.productionResolved.projectedKs));
    }
  });

  it("records fidelity degradation flags every row", () => {
    const row = makeRow();
    assert.ok(row.degradationFlags.includes("SAVANT_STATCAST_RATES_SUBSTITUTED_STATSAPI"));
    assert.ok(row.degradationFlags.includes("PROJECTED_LINEUP_KRATE_DROPPED"));
  });

  it("availability.both drives the paired comparison field", () => {
    const row = makeRow();
    if (row.availability.both) {
      assert.equal(typeof row.residuals.v2MinusLegacyAbsError, "number");
    }
  });

  it("legacy k9Source reflects whether real season SO/IP were present", () => {
    const withSeason = makeRow({ starts: 10 });
    assert.equal(withSeason.legacy.k9Source, "season-real");
  });
});

function round(value) {
  return Math.round(value * 1e4) / 1e4;
}
