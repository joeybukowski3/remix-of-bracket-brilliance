/**
 * mlb-social-composition.test.mjs
 * Run via: node --test scripts/lib/mlb-social-composition.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SOCIAL_PRODUCT,
  composeSocialPostPlan,
  getOpportunityIdentity,
  getKCandidatePool,
  getHrCandidatePool,
  K_EDGE_DIVERSITY_TOLERANCE,
  HR_SCORE_DIVERSITY_TOLERANCE,
} from "./mlb-social-composition.mjs";
import { computeRowFingerprint } from "./mlb-social-post-plan.mjs";
import { selectConfirmedKRows } from "./mlb-k-x-selection-core.mjs";
import { selectConfirmedHrProps } from "./mlb-hr-x-selection-core.mjs";

function kRow(overrides = {}) {
  return {
    pitcher: "Test Pitcher",
    pitcherId: 1,
    team: "AAA",
    opponent: "ZZZ",
    gameId: 100,
    kLine: 4.5,
    projectedKs: 5.5,
    direction: "OVER",
    projectionEdge: 1.0,
    oddsOver: "-120",
    oddsUnder: "+100",
    ...overrides,
  };
}

function hrRow(overrides = {}) {
  return {
    player: "Test Batter",
    playerId: 1,
    team: "AAA",
    opponent: "ZZZ",
    gameId: 100,
    hrScore: 70,
    hrOddsYes: "+200",
    opposingPitcher: "Some Pitcher",
    barrelRate: 15,
    hardHitRate: 45,
    last7HR: 1,
    last30HR: 3,
    ...overrides,
  };
}

const BASE_PLAN_ARGS = { slateDate: "2026-08-18", title: "Test", generatedAt: "2026-08-18T12:00:00.000Z" };

describe("composeSocialPostPlan row-count policy", () => {
  it("returns null for 0 candidates", () => {
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: [], ...BASE_PLAN_ARGS });
    assert.equal(plan, null);
  });

  it("returns null for 1 candidate", () => {
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: [kRow({ pitcherId: 1, gameId: 1 })], ...BASE_PLAN_ARGS });
    assert.equal(plan, null);
  });

  for (const count of [2, 3, 4, 5]) {
    it(`returns exactly ${count} rows for ${count} distinct qualified candidates`, () => {
      const pool = Array.from({ length: count }, (_, i) =>
        kRow({ pitcherId: i, gameId: i, pitcher: `Pitcher ${i}`, projectionEdge: 5 - i, projectedKs: 5.5 - i * 0.01 }),
      );
      const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: pool, ...BASE_PLAN_ARGS });
      assert.equal(plan.rows.length, count);
    });
  }

  it("caps at 5 rows for 8 distinct qualified candidates", () => {
    const pool = Array.from({ length: 8 }, (_, i) => kRow({ pitcherId: i, gameId: i, pitcher: `Pitcher ${i}`, projectionEdge: 8 - i }));
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows.length, 5);
  });
});

describe("analytic integrity", () => {
  it("always preserves the #1 ranked candidate, even under game concentration", () => {
    const pool = [
      kRow({ pitcherId: 1, gameId: 1, pitcher: "Ace One", projectionEdge: 3.0 }),
      kRow({ pitcherId: 2, gameId: 1, pitcher: "Ace Two", projectionEdge: 2.9 }),
      kRow({ pitcherId: 3, gameId: 1, pitcher: "Ace Three", projectionEdge: 2.8 }),
      kRow({ pitcherId: 4, gameId: 2, pitcher: "Alt Four", projectionEdge: 2.7 }),
      kRow({ pitcherId: 5, gameId: 3, pitcher: "Alt Five", projectionEdge: 2.6 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows[0].playerId, 1);
    assert.equal(plan.rows[0].playerName, "Ace One");
  });

  it("does not mutate the input candidate pool", () => {
    const pool = [
      kRow({ pitcherId: 1, gameId: 1 }),
      kRow({ pitcherId: 2, gameId: 2 }),
      kRow({ pitcherId: 3, gameId: 3 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(pool));
    composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.deepEqual(pool, snapshot);
  });

  it("never rewrites candidate scores -- PostRow content reflects the source row's own values", () => {
    const pool = [
      kRow({ pitcherId: 1, gameId: 1, projectedKs: 7.2, kLine: 5.5, projectionEdge: 1.7 }),
      kRow({ pitcherId: 2, gameId: 2, projectedKs: 4.0, kLine: 4.5, direction: "UNDER", projectionEdge: -0.5 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows[0].content.projectedKs, 7.2);
    assert.equal(plan.rows[0].content.kLine, 5.5);
    assert.equal(plan.rows[0].content.edge, 1.7);
    assert.equal(plan.rows[1].content.side, "UNDER");
    assert.equal(plan.rows[1].content.edge, -0.5);
  });

  it("selectConfirmedKRows/selectConfirmedHrProps ordering is unaffected by this module existing", () => {
    const { selected: kSelected } = selectConfirmedKRows({
      rows: [
        kRow({ pitcherId: 1, gameId: 1, projectedKs: 7.5, kLine: 5.5, isCurrentStarter: true, opposingLineupConfirmed: true, status: "VALID", projectedIP: 6 }),
        kRow({ pitcherId: 2, gameId: 2, projectedKs: 6.0, kLine: 5.5, isCurrentStarter: true, opposingLineupConfirmed: true, status: "VALID", projectedIP: 6 }),
      ],
    });
    assert.equal(kSelected[0].pitcherId, 1);
    assert.equal(kSelected[1].pitcherId, 2);

    const { selected: hrSelected } = selectConfirmedHrProps({
      batters: [
        hrRow({ playerId: 1, gameId: 1, hrScore: 90, lineupStatus: "confirmed", battingOrder: 1 }),
        hrRow({ playerId: 2, gameId: 2, hrScore: 40, lineupStatus: "confirmed", battingOrder: 2 }),
      ],
    });
    assert.equal(hrSelected[0].playerId, 1);
    assert.equal(hrSelected[1].playerId, 2);
  });
});

describe("already-diverse slate", () => {
  it("preserves analytic ordering exactly when top 5 span 5 different games", () => {
    const pool = Array.from({ length: 5 }, (_, i) => kRow({ pitcherId: i + 1, gameId: i + 1, pitcher: `P${i + 1}`, projectionEdge: 5 - i }));
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.deepEqual(
      plan.rows.map((r) => r.playerId),
      [1, 2, 3, 4, 5],
    );
  });

  it("HR: consumes an analytically ranked (hrScore DESC) pool and preserves that order exactly with unchanged scores when no diversity intervention is needed", () => {
    // This pool mirrors real selectConfirmedHrProps output shape: hrScore
    // strictly descending by rank, one row per distinct game so no soft-cap
    // violation ever triggers -- composition must be a pure pass-through.
    const rankedScores = [87.1, 84.3, 75.8, 73.8, 73.4];
    const pool = rankedScores.map((hrScore, i) => hrRow({ playerId: i + 1, gameId: i + 1, player: `Batter ${i + 1}`, hrScore }));
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.deepEqual(
      plan.rows.map((r) => r.playerId),
      [1, 2, 3, 4, 5],
      "analytic rank order preserved exactly -- composition never re-ranks",
    );
    assert.deepEqual(
      plan.rows.map((r) => r.content.hrScore),
      rankedScores,
      "underlying hrScore values are carried through unchanged, not recomputed",
    );
  });
});

describe("soft diversity", () => {
  it("substitutes at the margin when a nearby different-game candidate is comparable", () => {
    // Ranks 1-2 are game 1 (allowed pair). Rank 3 is the 3rd occurrence of
    // game 1 -- a soft-cap violation -- and a comparable different-game
    // alternate (rank 6, outside the initial top-5 display window but within
    // DIVERSITY_RANK_WINDOW and HR_SCORE_DIVERSITY_TOLERANCE) is available.
    // hrScore is monotonically descending by rank, matching the real
    // selectConfirmedHrProps output order this pool is meant to simulate.
    const pool = [
      hrRow({ playerId: 1, gameId: 1, player: "A", hrScore: 90 }),
      hrRow({ playerId: 2, gameId: 1, player: "B", hrScore: 85 }),
      hrRow({ playerId: 3, gameId: 1, player: "C", hrScore: 61 }),
      hrRow({ playerId: 4, gameId: 2, player: "D", hrScore: 60.5 }),
      hrRow({ playerId: 5, gameId: 3, player: "E", hrScore: 60 }),
      hrRow({ playerId: 6, gameId: 4, player: "F", hrScore: 59 }), // gap of 2.0 from C, within tolerance
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    const ids = plan.rows.map((r) => r.playerId);
    assert.ok(ids.includes(1) && ids.includes(2), "top 2 survive untouched");
    assert.ok(ids.includes(4) && ids.includes(5), "other distinct-game candidates untouched");
    assert.ok(ids.includes(6), "comparable different-game alternate (rank 6) was substituted in");
    assert.ok(!ids.includes(3), "3rd same-game occurrence was swapped out");
  });
});

describe("quality over diversity", () => {
  it("keeps a materially stronger 3rd same-game candidate when no alternative is comparable", () => {
    const pool = [
      hrRow({ playerId: 1, gameId: 1, player: "A", hrScore: 90 }),
      hrRow({ playerId: 2, gameId: 1, player: "B", hrScore: 85 }),
      hrRow({ playerId: 3, gameId: 1, player: "C", hrScore: 80 }), // materially stronger than any alt
      hrRow({ playerId: 4, gameId: 2, player: "D", hrScore: 40 }), // far below tolerance
      hrRow({ playerId: 5, gameId: 3, player: "E", hrScore: 35 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    const ids = plan.rows.map((r) => r.playerId);
    assert.deepEqual(ids, [1, 2, 3, 4, 5]);
    const gameOneCount = plan.rows.filter((r) => r.gameId === 1).length;
    assert.equal(gameOneCount, 3, "3 players from one game is acceptable when quality warrants it");
  });
});

describe("no filler", () => {
  it("produces exactly two rows for exactly two legitimate candidates, never a fabricated third", () => {
    const pool = [hrRow({ playerId: 1, gameId: 1 }), hrRow({ playerId: 2, gameId: 2, hrScore: 50 })];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows.length, 2);
  });
});

describe("duplicate opportunity", () => {
  it("collapses the same playerId+gameId+product appearing twice into one row", () => {
    const pool = [
      hrRow({ playerId: 1, gameId: 1, hrScore: 90 }),
      hrRow({ playerId: 1, gameId: 1, hrScore: 90 }), // exact duplicate
      hrRow({ playerId: 2, gameId: 2, hrScore: 50 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows.length, 2);
    assert.equal(plan.rows.filter((r) => r.playerId === 1).length, 1);
  });

  it("getOpportunityIdentity distinguishes by gameId, not player name alone", () => {
    const a = getOpportunityIdentity(hrRow({ playerId: 1, gameId: 1 }), SOCIAL_PRODUCT.HR);
    const b = getOpportunityIdentity(hrRow({ playerId: 1, gameId: 2 }), SOCIAL_PRODUCT.HR);
    assert.notEqual(a, b);
  });
});

describe("duplicate identity hierarchy", () => {
  it("1. same playerId + same gameId -> deduped", () => {
    const pool = [
      hrRow({ playerId: 1, gameId: 1, hrScore: 90 }),
      hrRow({ playerId: 1, gameId: 1, hrScore: 90 }),
      hrRow({ playerId: 2, gameId: 2, hrScore: 50 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows.length, 2);
  });

  it("2. same playerId + different gameId -> preserved (doubleheader)", () => {
    const pool = [
      hrRow({ playerId: 1, gameId: 111, hrScore: 90 }),
      hrRow({ playerId: 1, gameId: 222, hrScore: 70 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows.length, 2);
  });

  it("3. missing playerId, same normalized player/team + same gameId -> deduped via fallback", () => {
    const pool = [
      hrRow({ playerId: null, player: "Aaron Judge", team: "NYY", gameId: 1, hrScore: 90 }),
      hrRow({ playerId: null, player: "AARON JUDGE", team: "nyy", gameId: 1, hrScore: 90 }), // same opportunity, different casing/whitespace
      hrRow({ playerId: 2, player: "Other Batter", team: "BOS", gameId: 2, hrScore: 50 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows.length, 2);
  });

  it("4. missing playerId, same player/team + different gameId -> preserved (fallback stays doubleheader-safe)", () => {
    const pool = [
      hrRow({ playerId: null, player: "Aaron Judge", team: "NYY", gameId: 111, hrScore: 90 }),
      hrRow({ playerId: null, player: "Aaron Judge", team: "NYY", gameId: 222, hrScore: 70 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows.length, 2);
    assert.deepEqual(
      plan.rows.map((r) => r.gameId),
      [111, 222],
    );
  });

  it("5. missing gameId -> does not collapse otherwise-plausible distinct opportunities", () => {
    const pool = [
      hrRow({ playerId: null, player: "Aaron Judge", team: "NYY", gameId: null, hrScore: 90 }),
      hrRow({ playerId: null, player: "Aaron Judge", team: "NYY", gameId: null, hrScore: 70 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows.length, 2, "conservative: no gameId means never dedupe by name/team alone");
  });

  it("preferred identity (id+game) is authoritative even if the name string differs between rows", () => {
    const a = getOpportunityIdentity(hrRow({ playerId: 1, gameId: 1, player: "Name A" }), SOCIAL_PRODUCT.HR);
    const b = getOpportunityIdentity(hrRow({ playerId: 1, gameId: 1, player: "Name B" }), SOCIAL_PRODUCT.HR);
    assert.equal(a, b);
  });

  it("fallback identity normalizes case/whitespace on both name and team", () => {
    const a = getOpportunityIdentity(hrRow({ playerId: null, player: "  Aaron Judge  ", team: "NYY", gameId: 1 }), SOCIAL_PRODUCT.HR);
    const b = getOpportunityIdentity(hrRow({ playerId: null, player: "aaron judge", team: "nyy", gameId: 1 }), SOCIAL_PRODUCT.HR);
    assert.equal(a, b);
    assert.notEqual(a, null);
  });

  it("K fallback identity uses the pitcher field, not player", () => {
    const a = getOpportunityIdentity(kRow({ pitcherId: null, pitcher: "Gerrit Cole", team: "NYY", gameId: 1 }), SOCIAL_PRODUCT.K);
    const b = getOpportunityIdentity(kRow({ pitcherId: null, pitcher: "gerrit cole", team: "nyy", gameId: 1 }), SOCIAL_PRODUCT.K);
    assert.equal(a, b);
    assert.notEqual(a, null);
  });

  it("returns null when gameId is missing, even with a full name+team", () => {
    const identity = getOpportunityIdentity(hrRow({ playerId: null, player: "Aaron Judge", team: "NYY", gameId: null }), SOCIAL_PRODUCT.HR);
    assert.equal(identity, null);
  });

  it("returns null when gameId exists but neither id nor name+team is usable", () => {
    const identity = getOpportunityIdentity(hrRow({ playerId: null, player: "", team: "", gameId: 1 }), SOCIAL_PRODUCT.HR);
    assert.equal(identity, null);
  });
});

describe("doubleheader", () => {
  it("keeps the same player's two different-game legs as independent eligible opportunities", () => {
    const pool = [
      hrRow({ playerId: 1, gameId: 111, player: "Same Player", hrScore: 90, gameNumber: 1 }),
      hrRow({ playerId: 1, gameId: 222, player: "Same Player", hrScore: 70, gameNumber: 2 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.equal(plan.rows.length, 2);
    assert.deepEqual(
      plan.rows.map((r) => r.gameId),
      [111, 222],
    );
  });
});

describe("fingerprint", () => {
  const rowsA = [
    { playerId: 1, gameId: 1, gameLabel: "AAA vs ZZZ", content: { kind: "k", side: "OVER", kLine: 4.5, projectedKs: 5.5, edge: 1.0, odds: "-120" } },
    { playerId: 2, gameId: 2, gameLabel: "BBB vs YYY", content: { kind: "k", side: "UNDER", kLine: 5.5, projectedKs: 4.5, edge: -1.0, odds: "+110" } },
  ];

  it("produces the same fingerprint for the same ordered visible rows", () => {
    assert.equal(computeRowFingerprint(rowsA), computeRowFingerprint(JSON.parse(JSON.stringify(rowsA))));
  });

  it("changes when odds change", () => {
    const changed = JSON.parse(JSON.stringify(rowsA));
    changed[0].content.odds = "-115";
    assert.notEqual(computeRowFingerprint(rowsA), computeRowFingerprint(changed));
  });

  it("changes when kLine changes", () => {
    const changed = JSON.parse(JSON.stringify(rowsA));
    changed[0].content.kLine = 5.0;
    assert.notEqual(computeRowFingerprint(rowsA), computeRowFingerprint(changed));
  });

  it("changes when gameId changes", () => {
    const changed = JSON.parse(JSON.stringify(rowsA));
    changed[0].gameId = 999;
    assert.notEqual(computeRowFingerprint(rowsA), computeRowFingerprint(changed));
  });

  it("changes when gameLabel changes", () => {
    const changed = JSON.parse(JSON.stringify(rowsA));
    changed[0].gameLabel = "AAA vs QQQ";
    assert.notEqual(computeRowFingerprint(rowsA), computeRowFingerprint(changed));
  });

  it("does not change when generatedAt/readiness metadata changes", () => {
    const plan1 = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: [kRow({ pitcherId: 1, gameId: 1 }), kRow({ pitcherId: 2, gameId: 2 })], ...BASE_PLAN_ARGS, generatedAt: "2026-08-18T09:00:00.000Z" });
    const plan2 = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: [kRow({ pitcherId: 1, gameId: 1 }), kRow({ pitcherId: 2, gameId: 2 })], ...BASE_PLAN_ARGS, generatedAt: "2026-08-18T15:30:00.000Z", sourceSummary: ["different snapshot"] });
    assert.equal(plan1.rowFingerprint, plan2.rowFingerprint);
    assert.notEqual(plan1.readiness.generatedAt, plan2.readiness.generatedAt);
  });

  it("changes when rows are reordered", () => {
    const reordered = [rowsA[1], rowsA[0]];
    assert.notEqual(computeRowFingerprint(rowsA), computeRowFingerprint(reordered));
  });
});

describe("determinism", () => {
  it("produces identical rows and fingerprint across repeated runs on identical input", () => {
    const pool = [
      hrRow({ playerId: 1, gameId: 1, hrScore: 90 }),
      hrRow({ playerId: 2, gameId: 1, hrScore: 80 }),
      hrRow({ playerId: 3, gameId: 1, hrScore: 60 }),
      hrRow({ playerId: 4, gameId: 1, hrScore: 59 }),
      hrRow({ playerId: 5, gameId: 2, hrScore: 58 }),
    ];
    const plan1 = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    const plan2 = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.deepEqual(plan1.rows, plan2.rows);
    assert.equal(plan1.rowFingerprint, plan2.rowFingerprint);
  });
});

describe("product-specific tolerances", () => {
  it("K substitution is gated by K_EDGE_DIVERSITY_TOLERANCE (0.3), not the larger HR scale", () => {
    // Gap of 2.0 K-edge units: far below the HR tolerance (3.0) but well
    // above the K tolerance (0.3) -- must NOT substitute.
    const pool = [
      kRow({ pitcherId: 1, gameId: 1, pitcher: "A", projectionEdge: 5.0, projectedKs: 9.5, kLine: 4.5 }),
      kRow({ pitcherId: 2, gameId: 1, pitcher: "B", projectionEdge: 4.5, projectedKs: 9.0, kLine: 4.5 }),
      kRow({ pitcherId: 3, gameId: 1, pitcher: "C", projectionEdge: 4.0, projectedKs: 8.5, kLine: 4.5 }),
      kRow({ pitcherId: 4, gameId: 2, pitcher: "D", projectionEdge: 2.0, projectedKs: 6.5, kLine: 4.5 }),
      kRow({ pitcherId: 5, gameId: 3, pitcher: "E", projectionEdge: 1.9, projectedKs: 6.4, kLine: 4.5 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, candidatePool: pool, ...BASE_PLAN_ARGS });
    assert.deepEqual(plan.rows.map((r) => r.playerId), [1, 2, 3, 4, 5]);
    assert.ok(K_EDGE_DIVERSITY_TOLERANCE < 2.0 && 2.0 < HR_SCORE_DIVERSITY_TOLERANCE);
  });

  it("HR substitution is gated by HR_SCORE_DIVERSITY_TOLERANCE (3.0), not the smaller K scale", () => {
    // Gap of 2.0 hrScore points: above the K tolerance (0.3) but comfortably
    // within the HR tolerance (3.0) -- MUST substitute. hrScore is
    // monotonically descending by rank, matching real analytic output order.
    const pool = [
      hrRow({ playerId: 1, gameId: 1, player: "A", hrScore: 90 }),
      hrRow({ playerId: 2, gameId: 1, player: "B", hrScore: 85 }),
      hrRow({ playerId: 3, gameId: 1, player: "C", hrScore: 61 }), // 3rd occurrence of game 1
      hrRow({ playerId: 4, gameId: 2, player: "D", hrScore: 60.5 }),
      hrRow({ playerId: 5, gameId: 3, player: "E", hrScore: 60 }),
      hrRow({ playerId: 6, gameId: 4, player: "F", hrScore: 59 }), // gap 2.0 from C, rank 6
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, candidatePool: pool, ...BASE_PLAN_ARGS });
    const ids = plan.rows.map((r) => r.playerId);
    assert.ok(!ids.includes(3));
    assert.ok(ids.includes(6));
  });
});

describe("candidate-pool wrapper", () => {
  it("getKCandidatePool requests more than the display limit from selectConfirmedKRows", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      kRow({ pitcherId: i, gameId: i, pitcher: `P${i}`, projectedKs: 8 - i * 0.1, kLine: 4.5, isCurrentStarter: true, opposingLineupConfirmed: true, status: "VALID", projectedIP: 6 }),
    );
    const pool = getKCandidatePool({ rows });
    assert.ok(pool.length > 5);
  });

  it("getHrCandidatePool requests more than the display limit from selectConfirmedHrProps", () => {
    const batters = Array.from({ length: 10 }, (_, i) => hrRow({ playerId: i, gameId: i, hrScore: 90 - i, lineupStatus: "confirmed", battingOrder: 1 }));
    const pool = getHrCandidatePool({ batters });
    assert.ok(pool.length > 5);
  });
});
