/**
 * mlb-k-x-selection-core.test.mjs
 * Run via: node --test scripts/lib/mlb-k-x-selection-core.test.mjs
 *
 * Previously no dedicated test file existed for this module. Proves every
 * inclusion/exclusion rule of the approved K value-play eligibility spec:
 *   - Projected IP > 3.0 (exactly 3.0 excluded, 3.1 qualifies, missing excluded)
 *   - model K projection exists, market K line exists
 *   - projection edge is non-zero, side derived strictly from its sign
 *   - recommended-side odds exist for THAT derived side specifically
 *   - pitcher's game has not started, is the current starter
 *   - ranking by absolute edge, Overs and Unders competing equally
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateKValuePlayEligibility,
  getKValueEdgeInfo,
  K_VALUE_EXCLUSION_REASON,
  MIN_K_LINE,
  MIN_PROJECTED_IP,
  selectConfirmedKRows,
} from "./mlb-k-x-selection-core.mjs";

function row(overrides = {}) {
  return {
    pitcher: "Test Pitcher",
    team: "BOS",
    opponent: "NYY",
    status: "VALID",
    kLine: 5.5,
    projectedKs: 7.1,
    projectedIP: 5.5,
    oddsOver: "-120",
    oddsUnder: "+100",
    isCurrentStarter: true,
    gameStarted: false,
    opposingLineupConfirmed: true,
    ...overrides,
  };
}

describe("getKValueEdgeInfo", () => {
  it("spec example 1: projection 7.1, line 5.5 -> OVER, edge +1.6", () => {
    const info = getKValueEdgeInfo(row({ projectedKs: 7.1, kLine: 5.5 }));
    assert.equal(info.side, "OVER");
    assert.equal(info.edge, 1.6);
    assert.equal(info.absoluteEdge, 1.6);
  });

  it("spec example 2: projection 4.2, line 5.5 -> UNDER, edge -1.3", () => {
    const info = getKValueEdgeInfo(row({ projectedKs: 4.2, kLine: 5.5 }));
    assert.equal(info.side, "UNDER");
    assert.equal(info.edge, -1.3);
    assert.equal(info.absoluteEdge, 1.3);
  });

  it("edge exactly zero yields side=null, never a fabricated default", () => {
    const info = getKValueEdgeInfo(row({ projectedKs: 5.5, kLine: 5.5 }));
    assert.equal(info.edge, 0);
    assert.equal(info.side, null);
  });

  it("missing projectedKs or kLine yields null edge/side, never a fabricated 0", () => {
    assert.equal(getKValueEdgeInfo(row({ projectedKs: null })).side, null);
    assert.equal(getKValueEdgeInfo(row({ kLine: null })).side, null);
  });
});

describe("evaluateKValuePlayEligibility -- Projected IP > 3.0", () => {
  it("exactly 3.0 is excluded (strictly greater than required)", () => {
    const result = evaluateKValuePlayEligibility(row({ projectedIP: MIN_PROJECTED_IP }));
    assert.equal(result.eligible, false);
    assert.equal(result.reason, K_VALUE_EXCLUSION_REASON.INVALID_MARKET);
  });

  it("3.1 qualifies", () => {
    assert.equal(evaluateKValuePlayEligibility(row({ projectedIP: 3.1 })).eligible, true);
  });

  it("missing projectedIP is excluded, never inferred from role/line/usage", () => {
    assert.equal(evaluateKValuePlayEligibility(row({ projectedIP: null })).eligible, false);
    assert.equal(evaluateKValuePlayEligibility(row({ projectedIP: undefined })).eligible, false);
  });

  it("a large projectedIP comfortably qualifies", () => {
    assert.equal(evaluateKValuePlayEligibility(row({ projectedIP: 6.2 })).eligible, true);
  });
});

describe("evaluateKValuePlayEligibility -- projection edge and side derivation", () => {
  it("non-zero edge is required -- exactly zero is excluded", () => {
    const result = evaluateKValuePlayEligibility(row({ projectedKs: 5.5, kLine: 5.5 }));
    assert.equal(result.eligible, false);
    assert.equal(result.reason, K_VALUE_EXCLUSION_REASON.INVALID_MARKET);
  });

  it("side is derived strictly from the edge sign, never trusted from a scraped direction field", () => {
    // row.direction claims UNDER, but the real edge (7.1 - 5.5 = +1.6) is OVER.
    const eligible = evaluateKValuePlayEligibility(row({ direction: "UNDER", projectedKs: 7.1, kLine: 5.5 }));
    assert.equal(eligible.side, "OVER");
    assert.equal(eligible.eligible, true);
  });

  it("positive edge recommends OVER", () => {
    assert.equal(evaluateKValuePlayEligibility(row({ projectedKs: 7.1, kLine: 5.5 })).side, "OVER");
  });

  it("negative edge recommends UNDER", () => {
    assert.equal(evaluateKValuePlayEligibility(row({ projectedKs: 4.2, kLine: 5.5, oddsUnder: "+100" })).side, "UNDER");
  });
});

describe("evaluateKValuePlayEligibility -- side-specific odds", () => {
  it("an OVER play qualifies only when valid Over odds exist", () => {
    assert.equal(evaluateKValuePlayEligibility(row({ projectedKs: 7.1, kLine: 5.5, oddsOver: "-120" })).eligible, true);
  });

  it("an OVER play is excluded when Over odds are missing, even though Under odds exist", () => {
    const result = evaluateKValuePlayEligibility(row({ projectedKs: 7.1, kLine: 5.5, oddsOver: null, oddsUnder: "+100" }));
    assert.equal(result.eligible, false);
    assert.equal(result.side, "OVER");
  });

  it("a UNDER play qualifies only when valid Under odds exist", () => {
    assert.equal(evaluateKValuePlayEligibility(row({ projectedKs: 4.2, kLine: 5.5, oddsUnder: "+100" })).eligible, true);
  });

  it("a UNDER play is excluded when Under odds are missing, even though Over odds exist", () => {
    const result = evaluateKValuePlayEligibility(row({ projectedKs: 4.2, kLine: 5.5, oddsUnder: null, oddsOver: "-120" }));
    assert.equal(result.eligible, false);
    assert.equal(result.side, "UNDER");
  });

  it("malformed odds text (not American-odds-shaped) is excluded", () => {
    assert.equal(evaluateKValuePlayEligibility(row({ projectedKs: 7.1, kLine: 5.5, oddsOver: "even" })).eligible, false);
  });
});

describe("evaluateKValuePlayEligibility -- market/status data-quality guards", () => {
  it("status other than VALID is excluded even with otherwise-perfect data", () => {
    for (const status of ["LOW_CONFIDENCE", "INSUFFICIENT_DATA", "INVALID_ODDS", "INVALID_WORKLOAD", "NO_MARKET", null]) {
      assert.equal(evaluateKValuePlayEligibility(row({ status })).eligible, false, `status=${status}`);
    }
  });

  it(`kLine below MIN_K_LINE (${MIN_K_LINE}) is excluded`, () => {
    assert.equal(evaluateKValuePlayEligibility(row({ kLine: 2.5, projectedKs: 4.1 })).eligible, false);
  });

  it("missing kLine is excluded", () => {
    assert.equal(evaluateKValuePlayEligibility(row({ kLine: null })).eligible, false);
  });

  it("missing projectedKs is excluded", () => {
    assert.equal(evaluateKValuePlayEligibility(row({ projectedKs: null })).eligible, false);
  });
});

describe("evaluateKValuePlayEligibility -- starter identity and timing", () => {
  it("a started game is excluded (STALE_STARTER reason)", () => {
    const result = evaluateKValuePlayEligibility(row({ gameStarted: true }));
    assert.equal(result.eligible, false);
    assert.equal(result.reason, K_VALUE_EXCLUSION_REASON.STALE_STARTER);
  });

  it("a pitcher who is no longer the current starter is excluded (STALE_STARTER reason)", () => {
    const result = evaluateKValuePlayEligibility(row({ isCurrentStarter: false }));
    assert.equal(result.eligible, false);
    assert.equal(result.reason, K_VALUE_EXCLUSION_REASON.STALE_STARTER);
  });

  it("a fully valid row is eligible", () => {
    assert.equal(evaluateKValuePlayEligibility(row()).eligible, true);
  });
});

describe("selectConfirmedKRows -- ranking, both sides compete equally", () => {
  it("Overs and Unders are ranked together by absolute edge, descending", () => {
    const rows = [
      row({ pitcher: "OverGuy", projectedKs: 7.1, kLine: 5.5, oddsOver: "-120" }), // +1.6
      row({ pitcher: "UnderGuy", projectedKs: 4.2, kLine: 5.5, oddsUnder: "+100" }), // -1.3
      row({ pitcher: "BiggerUnderGuy", projectedKs: 2.0, kLine: 5.5, oddsUnder: "+150" }), // -3.5
    ];
    const selection = selectConfirmedKRows({ rows, maxTableSize: 5 });
    assert.deepEqual(
      selection.selected.map((r) => r.pitcher),
      ["BiggerUnderGuy", "OverGuy", "UnderGuy"],
    );
    assert.deepEqual(
      selection.selected.map((r) => r.direction),
      ["UNDER", "OVER", "UNDER"],
    );
  });

  it("slices to maxTableSize while validStarterCount reflects the full eligible pool", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      row({ pitcher: `P${n}`, projectedKs: 5.5 + n * 0.5, kLine: 5.5, oddsOver: "-110" }),
    );
    const selection = selectConfirmedKRows({ rows, maxTableSize: 5 });
    assert.equal(selection.selected.length, 5);
    assert.equal(selection.validStarterCount, 7);
  });

  it("excludes bucket correctly: invalid-market vs stale-starter are counted separately", () => {
    const rows = [
      row({ pitcher: "BadMarket", projectedIP: 2.9 }), // invalid market (IP too low)
      row({ pitcher: "Started", gameStarted: true }), // stale starter
      row({ pitcher: "NotStarter", isCurrentStarter: false }), // stale starter
      row({ pitcher: "Good" }),
    ];
    const selection = selectConfirmedKRows({ rows, maxTableSize: 5 });
    assert.equal(selection.excludedInvalidMarketCount, 1);
    assert.equal(selection.excludedStaleStarterCount, 2);
    assert.deepEqual(selection.selected.map((r) => r.pitcher), ["Good"]);
  });

  it("never mutates the input rows array", () => {
    const rows = [row({ pitcher: "One" })];
    const before = structuredClone(rows);
    selectConfirmedKRows({ rows });
    assert.deepEqual(rows, before);
  });
});

describe("selectConfirmedKRows -- opposing-lineup handling (pre-existing, unchanged)", () => {
  it("holds back an otherwise-eligible row whose opposing lineup isn't confirmed yet, outside the final cutoff", () => {
    const rows = [row({ pitcher: "Held", opposingLineupConfirmed: false }), row({ pitcher: "Confirmed", opposingLineupConfirmed: true, projectedKs: 6.0 })];
    const selection = selectConfirmedKRows({ rows, atCutoff: false, maxTableSize: 5 });
    assert.deepEqual(selection.selected.map((r) => r.pitcher), ["Confirmed"]);
    assert.equal(selection.heldForOpposingCount, 1);
  });

  it("relaxes the opposing-lineup requirement at the final cutoff, but never the starter-identity checks", () => {
    const rows = [
      row({ pitcher: "HeldButAtCutoff", opposingLineupConfirmed: false }),
      row({ pitcher: "StillStale", opposingLineupConfirmed: false, isCurrentStarter: false }),
    ];
    const selection = selectConfirmedKRows({ rows, atCutoff: true, maxTableSize: 5 });
    assert.deepEqual(selection.selected.map((r) => r.pitcher), ["HeldButAtCutoff"]);
    assert.equal(selection.heldForOpposingCount, 0);
    assert.equal(selection.excludedStaleStarterCount, 1);
  });
});
