/**
 * RESEARCH ONLY -- tests for the combination math and candidate ranking used by
 * scripts/research/mlb-k-workload-dispersion.mjs.
 * Run with: node --test scripts/research/lib/mlb-k-workload-combination.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PRODUCTION_ALPHA,
  projectWithAlpha,
  rankCandidates,
  recoverLeagueAnchor,
  sampleSizeAlpha,
} from "./mlb-k-shrinkage-helpers.mjs";
import { BF_CANDIDATES } from "./mlb-k-workload-estimators.mjs";
import { classifyRow, partitionByOutcomeValidity } from "./mlb-k-outcome-validity.mjs";
import { filterLeakageSafe } from "./mlb-k-research-helpers.mjs";

const OUT = path.join(
  process.cwd(),
  "data",
  "mlb",
  "k-research",
  "high-line-calibration",
  "workload-dispersion",
);
const readOut = (file) => JSON.parse(readFileSync(path.join(OUT, file), "utf8"));

const SS_K = 125;

// ------------------------------- combination math -------------------------------

test("a combination is exactly its alpha rate times its workload BF", () => {
  const row = {
    v2PitcherSkillRate: 0.28,
    v2OpponentEnvRate: 0.23,
    v2MatchupAdjustment: 0.0075,
    v2ProjectedBF: 23,
    seasonBattersFaced: 500,
    seasonGamesStarted: 21,
    recentStarts: [{ bf: 24 }, { bf: 23 }, { bf: 25 }, { bf: 22 }, { bf: 24 }],
  };
  const anchor = recoverLeagueAnchor(row.v2OpponentEnvRate, row.v2MatchupAdjustment);
  const bf = BF_CANDIDATES.seasonBlend30(row);
  const alpha = sampleSizeAlpha(row.seasonBattersFaced, SS_K).alpha;
  const combined = projectWithAlpha({
    alpha,
    pitcherSkillRate: row.v2PitcherSkillRate,
    leagueAnchor: anchor,
    matchupAdjustment: row.v2MatchupAdjustment,
    projectedBF: bf,
  });
  assert.ok(Math.abs(combined.projectedKs - combined.projectedKRate * bf) < 1e-12);

  // Swapping only the workload term scales the projection by exactly the BF ratio.
  const production = projectWithAlpha({
    alpha,
    pitcherSkillRate: row.v2PitcherSkillRate,
    leagueAnchor: anchor,
    matchupAdjustment: row.v2MatchupAdjustment,
    projectedBF: row.v2ProjectedBF,
  });
  assert.ok(
    Math.abs(combined.projectedKs / production.projectedKs - bf / row.v2ProjectedBF) < 1e-12,
    "the workload term must enter multiplicatively and change nothing else",
  );
  // The K rate is a property of alpha alone, untouched by the workload swap.
  assert.equal(combined.projectedKRate, production.projectedKRate);
});

test("the two levers are separable: alpha changes the rate, workload changes only BF", () => {
  const row = {
    v2PitcherSkillRate: 0.3,
    v2OpponentEnvRate: 0.22,
    v2MatchupAdjustment: -0.0075,
    v2ProjectedBF: 24,
    seasonBattersFaced: 300,
    seasonGamesStarted: 13,
  };
  const anchor = recoverLeagueAnchor(row.v2OpponentEnvRate, row.v2MatchupAdjustment);
  const withProduction = projectWithAlpha({
    alpha: PRODUCTION_ALPHA,
    pitcherSkillRate: row.v2PitcherSkillRate,
    leagueAnchor: anchor,
    matchupAdjustment: row.v2MatchupAdjustment,
    projectedBF: row.v2ProjectedBF,
  });
  const withSs = projectWithAlpha({
    alpha: sampleSizeAlpha(row.seasonBattersFaced, SS_K).alpha,
    pitcherSkillRate: row.v2PitcherSkillRate,
    leagueAnchor: anchor,
    matchupAdjustment: row.v2MatchupAdjustment,
    projectedBF: row.v2ProjectedBF,
  });
  assert.notEqual(withProduction.projectedKRate, withSs.projectedKRate);
  // Above-average skill plus a larger alpha must reach further, never less far.
  assert.ok(withSs.projectedKRate > withProduction.projectedKRate);
});

// ------------------------------- candidate ranking -------------------------------

test("candidate ranking is deterministic and independent of input order", () => {
  const candidates = [
    { id: "b", bfMae: 2.75, bfRmse: 3.7 },
    { id: "a", bfMae: 2.75, bfRmse: 3.7 },
    { id: "c", bfMae: 2.7, bfRmse: 3.9 },
    { id: "d", bfMae: 2.75, bfRmse: 3.6 },
  ];
  const keys = [
    { key: "bfMae", direction: "asc" },
    { key: "bfRmse", direction: "asc" },
  ];
  const order = rankCandidates(candidates, keys).map((row) => row.id);
  assert.deepEqual(order, ["c", "d", "a", "b"], "MAE first, then RMSE, then id");
  assert.deepEqual(rankCandidates([...candidates].reverse(), keys).map((row) => row.id), order);
});

test("the workload candidate is ranked on workload accuracy, never on a K or market metric", () => {
  const grid = readFileSync(path.join(OUT, "workload-candidate-grid.csv"), "utf8");
  const headers = grid.split("\n")[0].split(",");
  // The ranking inputs must exist; no strikeout or line column may be present.
  assert.ok(headers.includes("bfMae") && headers.includes("bfRmse"));
  for (const header of headers) {
    assert.ok(!/kline|odds|strikeout|hitrate/i.test(header), `${header} must not be a workload ranking input`);
  }
});

// --------------------------- published artifacts agree ---------------------------

test("the published clean baseline matches an independent recount of the archive", () => {
  const archive = JSON.parse(
    readFileSync(
      path.join(process.cwd(), "data", "mlb", "k-research", "high-line-calibration", "pregame-archive.json"),
      "utf8",
    ),
  );
  const leakageSafe = filterLeakageSafe(archive.rows);
  const { kept, excluded } = partitionByOutcomeValidity(leakageSafe, { classify: classifyRow });
  const baseline = readOut("clean-baseline.json");

  assert.equal(baseline.leakageSafeN, leakageSafe.length);
  assert.equal(baseline.excludedN, excluded.length);
  assert.equal(baseline.cleanN, kept.length);
  assert.equal(baseline.cleanN + baseline.excludedN, baseline.leakageSafeN, "no row is lost or double counted");
});

test("the era-B replay reproduces the shipped projection and era A does not", () => {
  const baseline = readOut("clean-baseline.json");
  assert.equal(baseline.eraSplit.eraBReplayMaxAbsDrift, 0, "alpha=0.55 must reproduce the era it shipped in");
  assert.equal(baseline.eraSplit.eraAUnshrunkFormulaMismatches, 0, "era A must match the un-shrunk formula exactly");
  assert.ok(baseline.eraSplit.eraA_preShrinkageN > baseline.eraSplit.eraB_alpha055N);
});

test("nothing in this study is marked as promoted", () => {
  const winner = readOut("winner-summary.json");
  assert.equal(winner.promoted, false);
  assert.equal(readOut("research-metadata.json").productionFilesWritten.length, 0);
  assert.equal(readOut("research-metadata.json").publicArtifactsWritten.length, 0);
});
