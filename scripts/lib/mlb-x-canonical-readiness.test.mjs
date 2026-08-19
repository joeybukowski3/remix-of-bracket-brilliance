/**
 * mlb-x-canonical-readiness.test.mjs
 * Run via: node --test scripts/lib/mlb-x-canonical-readiness.test.mjs
 *
 * Phase 6 (corrected). Covers the four-state public readiness contract:
 * receipt-first short-circuit, ACTUAL confirmation-data completeness (never
 * a row-count or final-cutoff proxy), per-row pregame safety (doubleheader/
 * early-game safe, and NOT terminal by itself), and the terminal
 * no-post-for-slate condition (isExpired/allGamesStarted only).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeSocialPostPlan, SOCIAL_PRODUCT } from "./mlb-social-composition.mjs";
import { computeSlateTiming } from "./mlb-x-slate-timing.mjs";
import {
  CanonicalReadinessStatus,
  CanonicalReceiptState,
  classifyCanonicalReceipt,
  deriveConfirmationCompleteness,
  evaluateCanonicalPublication,
  evaluateRowTimingSafety,
} from "./mlb-x-canonical-readiness.mjs";

const SLATE = "2026-08-19";
const NOW = new Date("2026-08-19T20:00:00.000Z"); // 4:00 PM ET

function hrRow(i, overrides = {}) {
  return {
    player: `Batter${i}`, playerId: 100 + i, team: "PHI", opponent: "ATL", gameId: 9000 + i,
    gameStartTime: "2026-08-19T23:05:00.000Z", // ~3h05m after NOW -- safely pregame
    hrScore: 90 - i, hrOddsYes: "+200", opposingPitcher: "P", barrelRate: 20, hardHitRate: 50, last7HR: 2, last30HR: 8,
    ...overrides,
  };
}

function hrPlan(count, rowOverrides = {}) {
  const pool = Array.from({ length: count }, (_, i) => hrRow(i, rowOverrides));
  return composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, candidatePool: pool, title: "HR", generatedAt: NOW.toISOString() });
}

function safeTiming(overrides = {}) {
  return { isFinalCutoff: false, isExpired: false, allGamesStarted: false, finalCutoffAt: "2026-08-19T22:25:00.000Z", ...overrides };
}

function fullPrimaryReceipt(overrides = {}) {
  return { primaryPostId: "111", replyStatus: "POSTED", ...overrides };
}
function pendingReplyReceipt(overrides = {}) {
  return { primaryPostId: "111", replyStatus: "PENDING", ...overrides };
}

describe("classifyCanonicalReceipt", () => {
  it("null/no primary -> NOT_PUBLISHED", () => {
    assert.equal(classifyCanonicalReceipt(null), CanonicalReceiptState.NOT_PUBLISHED);
  });
  it("primary + POSTED reply -> FULLY_PUBLISHED", () => {
    assert.equal(classifyCanonicalReceipt(fullPrimaryReceipt()), CanonicalReceiptState.FULLY_PUBLISHED);
  });
  it("primary + NOT_REQUESTED reply -> FULLY_PUBLISHED (nothing was omitted)", () => {
    assert.equal(classifyCanonicalReceipt(fullPrimaryReceipt({ replyStatus: "NOT_REQUESTED" })), CanonicalReceiptState.FULLY_PUBLISHED);
  });
  it("primary + PENDING reply -> PRIMARY_PUBLISHED_REPLY_PENDING", () => {
    assert.equal(classifyCanonicalReceipt(pendingReplyReceipt()), CanonicalReceiptState.PRIMARY_PUBLISHED_REPLY_PENDING);
  });
});

describe("deriveConfirmationCompleteness -- pendingConfirmationCount is the ONLY signal", () => {
  it("pendingConfirmationCount 0 -> complete", () => {
    assert.equal(deriveConfirmationCompleteness({ pendingConfirmationCount: 0 }).complete, true);
  });
  it("pendingConfirmationCount > 0 -> not complete", () => {
    assert.equal(deriveConfirmationCompleteness({ pendingConfirmationCount: 3 }).complete, false);
  });
  it("pendingConfirmationCount unknown (null) -> not complete, never assumed zero", () => {
    const result = deriveConfirmationCompleteness({ pendingConfirmationCount: null });
    assert.equal(result.complete, false);
    assert.equal(result.reason, "CONFIRMATION_STATE_UNKNOWN");
  });
});

describe("evaluateCanonicalPublication -- receipt-first (tests 1, 2, 11, 13)", () => {
  it("1. fully published receipt -> ALREADY_PUBLISHED, no plan/timing needed", () => {
    const result = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE, existingReceipt: fullPrimaryReceipt(), plan: null, slateTiming: null, now: NOW,
    });
    assert.equal(result.status, CanonicalReadinessStatus.ALREADY_PUBLISHED);
    assert.equal(result.shouldCallX, false);
    assert.equal(result.shouldBuildPlan, false);
  });

  it("2. primary published, reply pending -> ALREADY_PUBLISHED with recovery-only X call, never rebuilds a plan", () => {
    const result = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE, existingReceipt: pendingReplyReceipt(), plan: hrPlan(5), pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW,
    });
    assert.equal(result.status, CanonicalReadinessStatus.ALREADY_PUBLISHED);
    assert.equal(result.reason, "PRIMARY_PUBLISHED_REPLY_PENDING_RECOVERY_ONLY");
    assert.equal(result.shouldCallX, true);
    assert.equal(result.shouldBuildPlan, false);
    assert.equal(result.plan, null);
  });

  it("11. successful publication blocks a later evaluation even with a fresh ready plan", () => {
    const afterPublish = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE, existingReceipt: fullPrimaryReceipt(), plan: hrPlan(5), pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW,
    });
    assert.equal(afterPublish.status, CanonicalReadinessStatus.ALREADY_PUBLISHED);
  });

  it("13. rowFingerprint changing AFTER publication never allows another primary", () => {
    const changedPlan = hrPlan(5, { hrScore: 12.3 }); // different fingerprint than any prior plan
    const result = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE, existingReceipt: fullPrimaryReceipt(), plan: changedPlan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW,
    });
    assert.equal(result.status, CanonicalReadinessStatus.ALREADY_PUBLISHED);
  });
});

describe("evaluateCanonicalPublication -- corrected qualification/readiness policy (row count is NEVER a readiness proxy)", () => {
  it("1. 2 qualified + confirmation ready + timing safe -> READY_TO_PUBLISH", () => {
    const plan = hrPlan(2);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.READY_TO_PUBLISH);
    assert.equal(result.qualifiedRowCount, 2);
  });

  it("2. 3 qualified + ready -> READY_TO_PUBLISH", () => {
    const plan = hrPlan(3);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.READY_TO_PUBLISH);
    assert.equal(result.qualifiedRowCount, 3);
  });

  it("3. 4 qualified + ready -> READY_TO_PUBLISH", () => {
    const plan = hrPlan(4);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.READY_TO_PUBLISH);
    assert.equal(result.qualifiedRowCount, 4);
  });

  it("4. 5 qualified but confirmation incomplete -> NO_POST_YET (a full table is not evidence of readiness)", () => {
    const plan = hrPlan(5);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 2, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_YET);
    assert.equal(result.reason, "WAITING_FOR_PENDING_CONFIRMATIONS");
    assert.equal(result.qualifiedRowCount, 5);
  });

  it("5. 2 qualified but confirmation incomplete -> NO_POST_YET", () => {
    const plan = hrPlan(2);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 1, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_YET);
    assert.equal(result.reason, "WAITING_FOR_PENDING_CONFIRMATIONS");
  });

  it("6. final-cutoff status ALONE does not bypass incomplete required confirmation", () => {
    const plan = hrPlan(5);
    const result = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 2,
      slateTiming: safeTiming({ isFinalCutoff: true }), now: NOW,
    });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_YET);
    assert.equal(result.reason, "WAITING_FOR_PENDING_CONFIRMATIONS");
  });

  it(">5 candidates -> composeSocialPostPlan itself caps at DISPLAY_MAX_ROWS (5); readiness reports that count and is still confirmation-gated", () => {
    const plan = hrPlan(9);
    assert.equal(plan.rows.length, 5);
    const ready = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(ready.status, CanonicalReadinessStatus.READY_TO_PUBLISH);
    const notReady = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 4, slateTiming: safeTiming(), now: NOW });
    assert.equal(notReady.status, CanonicalReadinessStatus.NO_POST_YET);
  });
});

describe("evaluateCanonicalPublication -- missing/unknown confirmation and row-count floor", () => {
  it("0 qualified (composeSocialPostPlan returns null) -> NO_POST_YET, not published", () => {
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, candidatePool: [], title: "HR", generatedAt: NOW.toISOString() });
    assert.equal(plan, null);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_YET);
    assert.equal(result.reason, "NO_QUALIFIED_PLAN");
    assert.equal(result.qualifiedRowCount, 0);
  });

  it("1 qualified (below DISPLAY_MIN_ROWS) -> composeSocialPostPlan itself returns null -> NO_POST_YET", () => {
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, candidatePool: [hrRow(0)], title: "HR", generatedAt: NOW.toISOString() });
    assert.equal(plan, null);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_YET);
  });

  it("unknown pendingConfirmationCount (not reported) -> NO_POST_YET, never assumed complete", () => {
    const plan = hrPlan(5);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: null, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_YET);
    assert.equal(result.reason, "CONFIRMATION_STATE_UNKNOWN");
  });

  it("pendingConfirmationCount later resolves to 0 -> READY_TO_PUBLISH", () => {
    const plan = hrPlan(2);
    const first = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 1, slateTiming: safeTiming(), now: NOW });
    assert.equal(first.status, CanonicalReadinessStatus.NO_POST_YET);
    const second = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(second.status, CanonicalReadinessStatus.READY_TO_PUBLISH);
  });

  it("repeated pre-readiness evaluations are pure (no receipt/plan mutation, no I/O)", () => {
    const plan = hrPlan(2);
    const timing = safeTiming();
    const first = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 1, slateTiming: timing, now: NOW });
    const second = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 1, slateTiming: timing, now: NOW });
    assert.deepEqual(first, second);
    assert.equal(first.status, CanonicalReadinessStatus.NO_POST_YET);
  });
});

describe("evaluateCanonicalPublication -- frozen-plan / no reranking", () => {
  it("rowFingerprint changing BEFORE first publication produces a new prospective plan freely", () => {
    const planA = hrPlan(5, { hrScore: 50 });
    const planB = hrPlan(5, { hrScore: 99 });
    assert.notEqual(planA.rowFingerprint, planB.rowFingerprint);
    const resultA = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan: planA, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    const resultB = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan: planB, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(resultA.status, CanonicalReadinessStatus.READY_TO_PUBLISH);
    assert.equal(resultB.status, CanonicalReadinessStatus.READY_TO_PUBLISH);
  });

  it("READY_TO_PUBLISH echoes back the exact plan object unchanged, for the publisher to consume as-is", () => {
    const plan = hrPlan(5);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.plan, plan);
  });

  it("evaluator never reorders plan.rows", () => {
    const plan = hrPlan(5);
    const originalOrder = plan.rows.map((r) => r.playerId);
    evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.deepEqual(plan.rows.map((r) => r.playerId), originalOrder);
  });
});

describe("evaluateRowTimingSafety / evaluateCanonicalPublication -- early games, doubleheaders, and NOT-terminal-by-itself", () => {
  it("7. missing gameStartTime BEFORE terminal cutoff -> NO_POST_YET (never a premature give-up)", () => {
    const plan = hrPlan(5, { gameStartTime: null });
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_YET);
    assert.equal(result.reason, "MISSING_GAME_START_TIME");
  });

  it("8. missing time on evaluation #1, safe authoritative time arrives on evaluation #2 -> READY_TO_PUBLISH", () => {
    const missingTimePlan = hrPlan(5, { gameStartTime: null });
    const first = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan: missingTimePlan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(first.status, CanonicalReadinessStatus.NO_POST_YET);
    assert.equal(first.reason, "MISSING_GAME_START_TIME");

    const resolvedPlan = hrPlan(5); // default fixture rows carry a safe gameStartTime
    const second = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan: resolvedPlan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(second.status, CanonicalReadinessStatus.READY_TO_PUBLISH);
  });

  it("included game already started (but slate not terminal) -> NO_POST_YET, not a permanent give-up", () => {
    const plan = hrPlan(5, { gameStartTime: "2026-08-19T19:00:00.000Z" }); // 1h before NOW
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_YET);
    assert.equal(result.reason, "GAME_ALREADY_STARTED");
  });

  it("included game inside the unsafe pregame window (< 40 min out), slate not terminal -> NO_POST_YET", () => {
    const plan = hrPlan(5, { gameStartTime: "2026-08-19T20:20:00.000Z" }); // 20 min after NOW
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_YET);
    assert.equal(result.reason, "PAST_SAFE_PREGAME_WINDOW");
  });

  it("early game + late games: one early row within the unsafe window blocks the whole plan even though later rows are fine", () => {
    const pool = [
      hrRow(0, { gameId: 8001, gameStartTime: "2026-08-19T20:10:00.000Z" }), // unsafe: 10 min out
      hrRow(1, { gameId: 8002, gameStartTime: "2026-08-20T00:00:00.000Z" }), // safe: hours out
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, candidatePool: pool, title: "HR", generatedAt: NOW.toISOString() });
    const safety = evaluateRowTimingSafety(plan.rows, NOW);
    assert.equal(safety.safe, false);
    assert.equal(safety.reason, "PAST_SAFE_PREGAME_WINDOW");
  });

  it("doubleheader G1/G2 legs are timed independently: G1 already started still blocks even though G2 has not", () => {
    const pool = [
      hrRow(0, { gameId: 7001, gameNumber: 1, isDoubleheader: true, gameStartTime: "2026-08-19T19:30:00.000Z" }), // G1 already started
      hrRow(1, { gameId: 7002, gameNumber: 2, isDoubleheader: true, gameStartTime: "2026-08-19T23:30:00.000Z" }), // G2 fine
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, candidatePool: pool, title: "HR", generatedAt: NOW.toISOString() });
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_YET);
    assert.equal(result.reason, "GAME_ALREADY_STARTED");
  });

  it("doubleheader G1/G2 both safely pregame + confirmed -> READY_TO_PUBLISH, legs kept distinct by gameId", () => {
    const pool = [
      hrRow(0, { gameId: 7001, gameNumber: 1, isDoubleheader: true, gameStartTime: "2026-08-19T22:00:00.000Z" }),
      hrRow(1, { gameId: 7002, gameNumber: 2, isDoubleheader: true, gameStartTime: "2026-08-20T01:00:00.000Z" }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, candidatePool: pool, title: "HR", generatedAt: NOW.toISOString() });
    assert.notEqual(plan.rows[0].gameLabel, plan.rows[1].gameLabel); // G1 vs G2 labels stay distinct
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.READY_TO_PUBLISH);
  });
});

describe("evaluateCanonicalPublication -- terminal slate cutoff (9. genuinely expired/all-started -> NO_POST_FOR_SLATE)", () => {
  it("no qualified plan and the slate has expired (Phase 2 computeSlateTiming.isExpired) -> NO_POST_FOR_SLATE, terminal", () => {
    const result = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan: null, pendingConfirmationCount: null, slateTiming: safeTiming({ isExpired: true }), now: NOW,
    });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_FOR_SLATE);
  });

  it("allGamesStarted (Phase 2) with no qualified plan -> NO_POST_FOR_SLATE, never re-attempted later", () => {
    const result = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan: null, pendingConfirmationCount: null, slateTiming: safeTiming({ allGamesStarted: true }), now: NOW,
    });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_FOR_SLATE);
    const later = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan: null, pendingConfirmationCount: null, slateTiming: safeTiming({ allGamesStarted: true }), now: NOW,
    });
    assert.equal(later.status, CanonicalReadinessStatus.NO_POST_FOR_SLATE);
  });

  it("a fully ready, safe, confirmed plan is STILL NO_POST_FOR_SLATE once the slate is terminally expired", () => {
    const plan = hrPlan(5);
    const result = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming({ isExpired: true }), now: NOW,
    });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_FOR_SLATE);
  });

  it("reuses Phase 2's computeSlateTiming.isExpired directly (no separate cutoff invented)", () => {
    const timing = computeSlateTiming({
      games: [{ gameDate: "2026-08-19T20:30:00.000Z", status: { abstractGameState: "Preview" } }],
      now: NOW, // 20:00, first pitch 20:30 -> 30 min out, inside FINAL_CUTOFF(40) window -> isExpired
      slateDate: SLATE,
    });
    assert.equal(timing.isExpired, true);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan: null, pendingConfirmationCount: null, slateTiming: timing, now: NOW });
    assert.equal(result.status, CanonicalReadinessStatus.NO_POST_FOR_SLATE);
  });
});

describe("evaluateCanonicalPublication -- product/date independence and identity", () => {
  it("K and HR are evaluated independently -- one product's receipt never affects the other", () => {
    const hrResult = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE, existingReceipt: fullPrimaryReceipt(), plan: null, slateTiming: safeTiming(), now: NOW,
    });
    const kResult = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.K, slateDate: SLATE, existingReceipt: null, plan: null, pendingConfirmationCount: null, slateTiming: safeTiming(), now: NOW,
    });
    assert.equal(hrResult.status, CanonicalReadinessStatus.ALREADY_PUBLISHED);
    assert.equal(kResult.status, CanonicalReadinessStatus.NO_POST_YET);
  });

  it("different slate dates are evaluated independently", () => {
    const day1 = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: "2026-08-18", existingReceipt: fullPrimaryReceipt(), plan: null, slateTiming: safeTiming(), now: NOW,
    });
    const day2 = evaluateCanonicalPublication({
      product: SOCIAL_PRODUCT.HR, slateDate: "2026-08-19", existingReceipt: null, plan: hrPlan(5), pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW,
    });
    assert.equal(day1.status, CanonicalReadinessStatus.ALREADY_PUBLISHED);
    assert.equal(day2.status, CanonicalReadinessStatus.READY_TO_PUBLISH);
  });

  it("no morning/confirmed/update edition identity survives in the result or receipt key shape", () => {
    const plan = hrPlan(5);
    const result = evaluateCanonicalPublication({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, plan, pendingConfirmationCount: 0, slateTiming: safeTiming(), now: NOW });
    const serialized = JSON.stringify(result);
    for (const forbidden of ["morning", "confirmed", "update", "MORNING", "CONFIRMED", "UPDATE"]) {
      assert.ok(!serialized.includes(forbidden), `result must not mention "${forbidden}"`);
    }
    assert.equal(plan.receiptKey, `${SOCIAL_PRODUCT.HR}:${SLATE}`);
  });
});
