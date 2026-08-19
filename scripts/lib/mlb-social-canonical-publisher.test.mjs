/**
 * mlb-social-canonical-publisher.test.mjs
 * Run via: node --test scripts/lib/mlb-social-canonical-publisher.test.mjs
 *
 * Phase 5: proves the canonical publisher consumes ONE frozen SocialPostPlan
 * as the sole authority for rows/graphic/caption/rowFingerprint/publication
 * identity, never reranks or reselects, enforces the one-post-per-product/
 * date guarantee regardless of rowFingerprint, and honors dry-run/live/lease
 * gating with safe partial-failure/retry semantics.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeSocialPostPlan, SOCIAL_PRODUCT } from "./mlb-social-composition.mjs";
import { CanonicalPostOutcome, publishCanonicalSocialPost, validateFrozenSocialPlan } from "./mlb-social-canonical-publisher.mjs";
import { ReplyStatus } from "./mlb-x-edition-publication.mjs";

const SLATE = "2026-08-19";

// ── Fixture candidate pools --------------------------------------------------
function hrRow(i, overrides = {}) {
  return { player: `Batter${i}`, playerId: 100 + i, team: "PHI", opponent: "ATL", gameId: 9000 + i, hrScore: 90 - i, hrOddsYes: "+200", opposingPitcher: "P", barrelRate: 20, hardHitRate: 50, last7HR: 2, last30HR: 8, ...overrides };
}
function kRow(i, overrides = {}) {
  return { pitcher: `Pitcher${i}`, pitcherId: 200 + i, team: "SEA", opponent: "HOU", gameId: 9100 + i, kLine: 6.5, projectedKs: 7.5, direction: "OVER", oddsOver: "-110", ...overrides };
}

function hrPlan(count, extraOverrides) {
  const pool = Array.from({ length: count }, (_, i) => hrRow(i, extraOverrides));
  return composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, candidatePool: pool, title: "HR", generatedAt: "2026-08-19T00:00:00.000Z" });
}
function kPlan(count, extraOverrides) {
  const pool = Array.from({ length: count }, (_, i) => kRow(i, extraOverrides));
  return composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: SLATE, candidatePool: pool, title: "K", generatedAt: "2026-08-19T00:00:00.000Z" });
}

// ── Fakes ---------------------------------------------------------------------
function fakeLeaseFactory() {
  const held = new Set();
  return (receiptKey) => {
    if (held.has(receiptKey)) return { acquired: false, heldBy: "someone-else", release: () => {} };
    held.add(receiptKey);
    return { acquired: true, release: () => held.delete(receiptKey) };
  };
}

function fakeStateStore() {
  const receipts = new Map();
  const key = ({ product, slateDate }) => `${product}:${slateDate}`;
  return {
    sync: () => {},
    readCanonicalReceipt: (args) => receipts.get(key(args)) ?? null,
    writeCanonicalReceipt: ({ product, slateDate, receipt }) => { receipts.set(key({ product, slateDate }), receipt); },
    _receipts: receipts,
  };
}

function fakeEnsureImage({ source = "rendered" } = {}) {
  const calls = [];
  const fn = async (plan) => {
    calls.push(plan);
    return {
      valid: true, source,
      metadata: { imagePath: "/tmp/fake.png" },
      renderedRows: source === "rendered" ? plan.rows.map((r) => ({ gameId: r.gameId, playerId: r.playerId })) : null,
    };
  };
  fn.calls = calls;
  return fn;
}

function fakeBuildCaption({ omit = 0 } = {}) {
  const calls = [];
  const fn = async (plan) => {
    calls.push(plan);
    const captionRows = omit > 0 ? plan.rows.slice(0, plan.rows.length - omit) : plan.rows;
    return { skipped: false, reason: "", caption: "caption text", captionRows, omittedRows: plan.rows.slice(captionRows.length) };
  };
  fn.calls = calls;
  return fn;
}

function baseDeps(plan, overrides = {}) {
  return {
    plan,
    liveMode: true,
    allowLivePost: true,
    credentialsPresent: true,
    stateStore: fakeStateStore(),
    acquireLease: fakeLeaseFactory(),
    ensureImage: fakeEnsureImage(),
    buildCaption: fakeBuildCaption(),
    postPrimary: async () => ({ postId: "post-1" }),
    postReply: null,
    dryRun: false,
    now: () => "2026-08-19T12:00:00.000Z",
    ...overrides,
  };
}

describe("validateFrozenSocialPlan", () => {
  it("accepts a well-formed plan", () => {
    assert.equal(validateFrozenSocialPlan(hrPlan(2)).valid, true);
  });
  it("rejects null", () => {
    assert.equal(validateFrozenSocialPlan(null).valid, false);
  });
  it("rejects a mismatched receiptKey", () => {
    const plan = { ...hrPlan(2), receiptKey: "wrong" };
    assert.equal(validateFrozenSocialPlan(plan).reason, "PLAN_RECEIPT_KEY_MISMATCH");
  });
});

describe("display-count policy (composition layer, exercised through the plan the publisher receives)", () => {
  it("0 qualified rows produces no plan -> publisher sees NO_PLAN", async () => {
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE, candidatePool: [], title: "HR", generatedAt: "x" });
    assert.equal(plan, null);
    const result = await publishCanonicalSocialPost(baseDeps(plan));
    assert.equal(result.outcome, CanonicalPostOutcome.NO_PLAN);
  });
  it("1 qualified row produces no plan", () => {
    assert.equal(hrPlan(1), null);
  });
  it("2 qualified rows produces a publishable plan", () => {
    assert.equal(hrPlan(2).rows.length, 2);
  });
  it("5 qualified rows produces a publishable plan", () => {
    assert.equal(hrPlan(5).rows.length, 5);
  });
  it(">5 candidates stays capped at 5", () => {
    assert.equal(hrPlan(9).rows.length, 5);
  });
});

describe("canonical publisher: happy path, K and HR, same plan throughout", () => {
  it("HR: posts using the same plan for image and caption, no reranking", async () => {
    const plan = hrPlan(3);
    const ensureImage = fakeEnsureImage();
    const buildCaption = fakeBuildCaption();
    const result = await publishCanonicalSocialPost(baseDeps(plan, { ensureImage, buildCaption }));

    assert.equal(result.outcome, CanonicalPostOutcome.POSTED);
    assert.equal(result.primaryPostId, "post-1");
    assert.equal(ensureImage.calls.length, 1);
    assert.strictEqual(ensureImage.calls[0], plan, "ensureImage must receive the exact frozen plan, not a copy or a re-derived one");
    assert.strictEqual(buildCaption.calls[0], plan, "buildCaption must receive the exact frozen plan");
    assert.equal(ensureImage.calls[0].rowFingerprint, plan.rowFingerprint);
  });

  it("K: posts using the same plan for image and caption", async () => {
    const plan = kPlan(2);
    const result = await publishCanonicalSocialPost(baseDeps(plan));
    assert.equal(result.outcome, CanonicalPostOutcome.POSTED);
  });

  it("a reused image bundle still results in a successful post", async () => {
    const plan = hrPlan(2);
    const result = await publishCanonicalSocialPost(baseDeps(plan, { ensureImage: fakeEnsureImage({ source: "reused" }) }));
    assert.equal(result.outcome, CanonicalPostOutcome.POSTED);
  });
});

describe("consistency gate", () => {
  it("blocks publication when the caption includes a row not present in the plan", async () => {
    const plan = hrPlan(2);
    const foreignRow = { ...plan.rows[0], gameId: "not-in-plan", playerId: "not-in-plan" };
    const buildCaption = async () => ({ skipped: false, caption: "x", captionRows: [foreignRow], omittedRows: [] });
    let primaryCalled = false;
    const result = await publishCanonicalSocialPost(baseDeps(plan, { buildCaption, postPrimary: async () => { primaryCalled = true; return { postId: "x" }; } }));
    assert.equal(result.outcome, CanonicalPostOutcome.CONSISTENCY_FAILED);
    assert.equal(primaryCalled, false, "a consistency failure must never call X");
  });

  it("blocks publication when a freshly rendered graphic is missing a plan row", async () => {
    const plan = hrPlan(3);
    const ensureImage = async () => ({
      valid: true, source: "rendered",
      metadata: { imagePath: "/tmp/fake.png" },
      renderedRows: plan.rows.slice(0, 1).map((r) => ({ gameId: r.gameId, playerId: r.playerId })), // dropped rows
    });
    const result = await publishCanonicalSocialPost(baseDeps(plan, { ensureImage }));
    assert.equal(result.outcome, CanonicalPostOutcome.CONSISTENCY_FAILED);
  });
});

describe("image failure", () => {
  it("IMAGE_FAILED blocks publication before any X call", async () => {
    const plan = hrPlan(2);
    let primaryCalled = false;
    const ensureImage = async () => ({ valid: false, reason: "MISSING_PNG" });
    const result = await publishCanonicalSocialPost(baseDeps(plan, { ensureImage, postPrimary: async () => { primaryCalled = true; return { postId: "x" }; } }));
    assert.equal(result.outcome, CanonicalPostOutcome.IMAGE_FAILED);
    assert.equal(primaryCalled, false);
  });
});

describe("one-post-per-product/date guarantee", () => {
  it("first HR publication on a date is allowed", async () => {
    const plan = hrPlan(2);
    const result = await publishCanonicalSocialPost(baseDeps(plan));
    assert.equal(result.outcome, CanonicalPostOutcome.POSTED);
  });

  it("a second HR plan for the same date is blocked even when rowFingerprint differs", async () => {
    const stateStore = fakeStateStore();
    const acquireLease = fakeLeaseFactory();
    const planA = hrPlan(2);
    await publishCanonicalSocialPost(baseDeps(planA, { stateStore, acquireLease }));

    const planB = hrPlan(2, { hrScore: 999 }); // different content -> different rowFingerprint
    assert.notEqual(planA.rowFingerprint, planB.rowFingerprint);
    let primaryCalled = false;
    const result = await publishCanonicalSocialPost(baseDeps(planB, { stateStore, acquireLease, postPrimary: async () => { primaryCalled = true; return { postId: "should-not-post" }; } }));
    assert.equal(result.outcome, CanonicalPostOutcome.ALREADY_POSTED);
    assert.equal(primaryCalled, false, "a later plan for the same product/date must never trigger a second primary post");
  });

  it("first K publication on a date is allowed, and a second is blocked", async () => {
    const stateStore = fakeStateStore();
    const acquireLease = fakeLeaseFactory();
    const first = await publishCanonicalSocialPost(baseDeps(kPlan(2), { stateStore, acquireLease }));
    assert.equal(first.outcome, CanonicalPostOutcome.POSTED);

    const second = await publishCanonicalSocialPost(baseDeps(kPlan(2, { kLine: 1.5 }), { stateStore, acquireLease }));
    assert.equal(second.outcome, CanonicalPostOutcome.ALREADY_POSTED);
  });

  it("an HR receipt does not block a K receipt for the same date", async () => {
    const stateStore = fakeStateStore();
    const acquireLease = fakeLeaseFactory();
    await publishCanonicalSocialPost(baseDeps(hrPlan(2), { stateStore, acquireLease }));
    const kResult = await publishCanonicalSocialPost(baseDeps(kPlan(2), { stateStore, acquireLease }));
    assert.equal(kResult.outcome, CanonicalPostOutcome.POSTED);
  });

  it("a different slate date is independent", async () => {
    const stateStore = fakeStateStore();
    const acquireLease = fakeLeaseFactory();
    const day1 = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: "2026-08-19", candidatePool: [hrRow(0), hrRow(1)], title: "HR", generatedAt: "x" });
    const day2 = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: "2026-08-20", candidatePool: [hrRow(0), hrRow(1)], title: "HR", generatedAt: "x" });
    await publishCanonicalSocialPost(baseDeps(day1, { stateStore, acquireLease }));
    const result = await publishCanonicalSocialPost(baseDeps(day2, { stateStore, acquireLease }));
    assert.equal(result.outcome, CanonicalPostOutcome.POSTED);
  });
});

describe("dry-run and live gating", () => {
  it("dry-run never calls X", async () => {
    const plan = hrPlan(2);
    let primaryCalled = false;
    const result = await publishCanonicalSocialPost(baseDeps(plan, { dryRun: true, postPrimary: async () => { primaryCalled = true; return { postId: "x" }; } }));
    assert.equal(result.outcome, CanonicalPostOutcome.DRY_RUN);
    assert.equal(primaryCalled, false);
    assert.equal(result.calledX, false);
  });

  it("missing live permission (liveMode/allowLivePost/credentials) never calls X even when dryRun is false", async () => {
    const plan = hrPlan(2);
    let primaryCalled = false;
    const result = await publishCanonicalSocialPost(baseDeps(plan, { dryRun: false, liveMode: false, postPrimary: async () => { primaryCalled = true; return { postId: "x" }; } }));
    assert.equal(result.outcome, CanonicalPostOutcome.CONFIGURATION_ERROR);
    assert.equal(primaryCalled, false);
  });

  it("missing credentials never calls X", async () => {
    const plan = hrPlan(2);
    let primaryCalled = false;
    const result = await publishCanonicalSocialPost(baseDeps(plan, { dryRun: false, credentialsPresent: false, postPrimary: async () => { primaryCalled = true; return { postId: "x" }; } }));
    assert.equal(result.outcome, CanonicalPostOutcome.CONFIGURATION_ERROR);
    assert.equal(primaryCalled, false);
  });
});

describe("lease collision", () => {
  it("prevents duplicate publication", async () => {
    const stateStore = fakeStateStore();
    const acquireLease = () => ({ acquired: false, heldBy: "another-runner", release: () => {} });
    const plan = hrPlan(2);
    const result = await publishCanonicalSocialPost(baseDeps(plan, { stateStore, acquireLease }));
    assert.equal(result.outcome, CanonicalPostOutcome.LEASE_UNAVAILABLE);
    assert.equal(stateStore._receipts.size, 0);
  });
});

describe("primary/reply partial-failure and retry semantics", () => {
  it("a primary already recorded (reply pending) never posts a second primary; only reply recovery runs", async () => {
    const stateStore = fakeStateStore();
    stateStore.writeCanonicalReceipt({
      product: SOCIAL_PRODUCT.HR, slateDate: SLATE,
      receipt: { receiptKey: `${SOCIAL_PRODUCT.HR}:${SLATE}`, outcome: "POSTED", postId: "existing-1", primaryPostId: "existing-1", replyStatus: ReplyStatus.PENDING },
    });
    let primaryCalled = false;
    let replyCalled = false;
    const plan = hrPlan(2);
    const result = await publishCanonicalSocialPost(baseDeps(plan, {
      stateStore,
      postPrimary: async () => { primaryCalled = true; return { postId: "should-never-happen" }; },
      postReply: async () => { replyCalled = true; return { postId: "reply-1" }; },
    }));
    assert.equal(primaryCalled, false, "a pending-reply receipt must never trigger a second primary post");
    assert.equal(replyCalled, true);
    assert.equal(result.outcome, CanonicalPostOutcome.REPLY_RECOVERED);
    assert.equal(result.replyPostId, "reply-1");
  });

  it("reply failure preserves the primary post and records FAILED_RETRYABLE", async () => {
    const stateStore = fakeStateStore();
    const plan = hrPlan(2);
    const result = await publishCanonicalSocialPost(baseDeps(plan, {
      stateStore,
      postReply: async () => { throw new Error("network blip"); },
    }));
    assert.equal(result.outcome, CanonicalPostOutcome.POSTED);
    assert.equal(result.primaryPostId, "post-1");
    const receipt = stateStore.readCanonicalReceipt({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE });
    assert.equal(receipt.primaryPostId, "post-1", "the primary post id must survive a reply failure");
    assert.equal(receipt.replyStatus, ReplyStatus.FAILED_RETRYABLE);
  });

  it("overflow reply behavior: a caption that omits rows gets a safe self-reply, primary unaffected", async () => {
    const stateStore = fakeStateStore();
    const plan = hrPlan(5);
    const buildCaption = fakeBuildCaption({ omit: 2 });
    const result = await publishCanonicalSocialPost(baseDeps(plan, {
      stateStore, buildCaption,
      postReply: async ({ inReplyTo }) => { assert.equal(inReplyTo, "post-1"); return { postId: "reply-1" }; },
    }));
    assert.equal(result.outcome, CanonicalPostOutcome.POSTED);
    assert.equal(result.replyPostId, "reply-1");
    const receipt = stateStore.readCanonicalReceipt({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE });
    assert.equal(receipt.replyStatus, ReplyStatus.POSTED);
  });

  it("postReply returning null (nothing omitted) records NOT_REQUESTED, not a failure", async () => {
    const stateStore = fakeStateStore();
    const plan = hrPlan(2);
    const result = await publishCanonicalSocialPost(baseDeps(plan, { stateStore, postReply: async () => null }));
    assert.equal(result.outcome, CanonicalPostOutcome.POSTED);
    const receipt = stateStore.readCanonicalReceipt({ product: SOCIAL_PRODUCT.HR, slateDate: SLATE });
    assert.equal(receipt.replyStatus, ReplyStatus.NOT_REQUESTED);
  });
});

describe("X API failure", () => {
  it("a primary post failure never writes a receipt", async () => {
    const stateStore = fakeStateStore();
    const plan = hrPlan(2);
    const result = await publishCanonicalSocialPost(baseDeps(plan, { stateStore, postPrimary: async () => { throw new Error("rate limited"); } }));
    assert.equal(result.outcome, CanonicalPostOutcome.X_API_FAILED);
    assert.equal(stateStore._receipts.size, 0);
  });
});
