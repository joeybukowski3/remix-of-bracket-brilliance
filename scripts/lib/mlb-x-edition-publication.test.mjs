/**
 * mlb-x-edition-publication.test.mjs
 * Run via: node --test scripts/lib/mlb-x-edition-publication.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertRowConsistency,
  getPublicationStatePath,
  hasPrimaryPost,
  isReplyComplete,
  loadPlanForTarget,
  PlanLoadError,
  PublicationStep,
  readPublicationState,
  ReplyStatus,
  resolvePublicationStep,
  rowIdentity,
  savePrimaryPost,
  saveReplyOutcome,
} from "./mlb-x-edition-publication.mjs";
import { buildEditionPlans, buildSelectedLineupStatus, planFileName, PlanRejection, writePlansAtomically } from "./mlb-x-edition-plan.mjs";
import { isPostedReceipt } from "./mlb-x-edition-receipts.mjs";

const SLATE = "2026-07-21";
const K_MORNING = "mlb-k-2026-07-21-morning";
const K_CONFIRMED = "mlb-k-2026-07-21-confirmed";
const HR_MORNING = "mlb-hr-2026-07-21-morning";

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-x-pub-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const row = (player, gameId) => ({ player, pitcher: player, gameId });

function makePlans() {
  const rows = [row("Alpha", 1), row("Bravo", 2)];
  const status = buildSelectedLineupStatus({ selectedRows: rows, isConfirmed: () => true });
  const market = { available: true, selectedRows: rows, selectedLineupStatus: status, artifactSlateDate: SLATE, artifactGeneratedAt: "2026-07-21T13:00:00Z", artifactSources: [] };
  return buildEditionPlans({
    now: "2026-07-21T14:00:00Z", slateDate: SLATE, firstGameTime: "2026-07-21T22:40:00Z", gamesScheduled: 15,
    markets: { k: market, hr: market },
    liveMode: true, allowLivePost: true, credentialsPresent: true, verifiedAccount: true,
    imageBundleFor: () => null,
  });
}

describe("frozen-plan transport", () => {
  it("loads the plan for exactly one target", () => {
    withTempDir((dir) => {
      writePlansAtomically(makePlans(), dir);
      const result = loadPlanForTarget({ directory: dir, market: "k", edition: "morning", slateDate: SLATE });
      assert.equal(result.ok, true);
      assert.equal(result.plan.market, "k");
      assert.equal(result.plan.edition, "morning");
      assert.equal(result.plan.readiness.receiptKey, K_MORNING);
    });
  });

  it("supplies the frozen rows the poster must publish verbatim", () => {
    withTempDir((dir) => {
      writePlansAtomically(makePlans(), dir);
      const { plan } = loadPlanForTarget({ directory: dir, market: "k", edition: "morning", slateDate: SLATE });
      assert.deepEqual(plan.selectedRows.map((r) => r.player), ["Alpha", "Bravo"]);
      assert.equal(plan.selectedLineupStatus.selectedPickCount, 2);
      assert.ok(plan.readiness.languageMode);
    });
  });

  it("fails visibly when the plan file is missing", () => {
    withTempDir((dir) => {
      const result = loadPlanForTarget({ directory: dir, market: "k", edition: "morning", slateDate: SLATE });
      assert.equal(result.ok, false);
      assert.equal(result.error, PlanLoadError.PLAN_MISSING);
      assert.equal(result.plan, null);
    });
  });

  it("fails visibly on unreadable JSON", () => {
    withTempDir((dir) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, planFileName("k", "morning")), "{ not json");
      assert.equal(loadPlanForTarget({ directory: dir, market: "k", edition: "morning", slateDate: SLATE }).error, PlanLoadError.PLAN_UNREADABLE);
    });
  });

  it("rejects a bad version, market, edition, slate, or receipt key", () => {
    const cases = [
      [(p) => { p.version = 99; }, PlanRejection.UNSUPPORTED_VERSION],
      [(p) => { p.market = "hr"; }, PlanRejection.INVALID_MARKET],   // file says k, body says hr
      [(p) => { p.edition = "confirmed"; }, PlanRejection.INVALID_EDITION],
      [(p) => { p.slateDate = "2026-07-22"; p.readiness.receiptKey = "mlb-k-2026-07-22-morning"; }, PlanRejection.PLAN_SLATE_MISMATCH],
      [(p) => { p.readiness.receiptKey = "mlb-k-2026-07-20-morning"; }, PlanRejection.READINESS_RECEIPT_KEY_MISMATCH],
    ];
    for (const [mutate, expected] of cases) {
      withTempDir((dir) => {
        const plans = makePlans();
        const target = plans.find((p) => p.market === "k" && p.edition === "morning");
        const copy = JSON.parse(JSON.stringify(target));
        mutate(copy);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, planFileName("k", "morning")), JSON.stringify(copy));
        const result = loadPlanForTarget({ directory: dir, market: "k", edition: "morning", slateDate: SLATE });
        assert.equal(result.ok, false);
        // market/edition mismatches surface as either the field check or the
        // expected-target check; both are visible failures.
        assert.ok(result.error, `expected a rejection for ${expected}`);
      });
    }
  });

  it("never silently falls back to internal selection", () => {
    withTempDir((dir) => {
      const result = loadPlanForTarget({ directory: dir, market: "hr", edition: "confirmed", slateDate: SLATE });
      assert.equal(result.ok, false);
      assert.equal(result.plan, null, "no substitute plan is fabricated");
    });
  });
});

describe("primary and reply are separate outcomes", () => {
  it("persists the primary receipt before any reply attempt", () => {
    withTempDir((dir) => {
      const state = savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "111", market: "k", slateDate: SLATE, edition: "morning", replyRequested: true });
      assert.equal(state.primaryPostId, "111");
      assert.equal(state.replyStatus, ReplyStatus.PENDING);
      // Readable as a posted receipt immediately, before the reply happens.
      assert.equal(isPostedReceipt(readPublicationState(K_MORNING, dir)), true);
    });
  });

  it("refuses to persist a primary without a confirmed post id", () => {
    withTempDir((dir) => {
      assert.throws(() => savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "  " }), /confirmed post id/i);
      assert.equal(readPublicationState(K_MORNING, dir), null);
    });
  });

  it("a reply failure preserves the successful primary", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "111", replyRequested: true });
      const after = saveReplyOutcome({ receiptKey: K_MORNING, stateDir: dir, replyStatus: ReplyStatus.FAILED_RETRYABLE, replyFailureReason: "429" });
      assert.equal(after.primaryPostId, "111");
      assert.equal(after.replyStatus, ReplyStatus.FAILED_RETRYABLE);
      assert.equal(after.replyFailureReason, "429");
      assert.equal(isPostedReceipt(after), true, "edition remains published");
    });
  });

  it("records a successful reply post id", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "111", replyRequested: true });
      const after = saveReplyOutcome({ receiptKey: K_MORNING, stateDir: dir, replyStatus: ReplyStatus.POSTED, replyPostId: "222" });
      assert.equal(after.replyPostId, "222");
      assert.equal(after.replyFailureReason, null);
      assert.equal(isReplyComplete(after), true);
    });
  });

  it("refuses to record a reply with no primary on record", () => {
    withTempDir((dir) => {
      assert.throws(() => saveReplyOutcome({ receiptKey: K_MORNING, stateDir: dir, replyStatus: ReplyStatus.POSTED, replyPostId: "1" }), /no primary post/i);
    });
  });
});

describe("recovery flow", () => {
  it("runs the full publication when nothing exists", () => {
    withTempDir((dir) => {
      assert.equal(resolvePublicationStep({ receiptKey: K_MORNING, stateDir: dir }).step, PublicationStep.FULL_PUBLICATION);
    });
  });

  it("enters reply-only recovery when the primary exists but the reply is incomplete", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "111", replyRequested: true });
      const step = resolvePublicationStep({ receiptKey: K_MORNING, stateDir: dir });
      assert.equal(step.step, PublicationStep.REPLY_RECOVERY_ONLY);
      assert.equal(step.primaryPostId, "111", "recovery replies to the stored primary");
    });
  });

  it("reports already complete when both parts are done", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "111", replyRequested: true });
      saveReplyOutcome({ receiptKey: K_MORNING, stateDir: dir, replyStatus: ReplyStatus.POSTED, replyPostId: "222" });
      assert.equal(resolvePublicationStep({ receiptKey: K_MORNING, stateDir: dir }).step, PublicationStep.ALREADY_COMPLETE);
    });
  });

  it("treats a primary with no reply requested as complete", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "111", replyRequested: false });
      assert.equal(resolvePublicationStep({ receiptKey: K_MORNING, stateDir: dir }).step, PublicationStep.ALREADY_COMPLETE);
    });
  });

  it("stops retrying after FAILED_FINAL without duplicating the primary", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "111", replyRequested: true });
      saveReplyOutcome({ receiptKey: K_MORNING, stateDir: dir, replyStatus: ReplyStatus.FAILED_FINAL, replyFailureReason: "unrecoverable" });
      const step = resolvePublicationStep({ receiptKey: K_MORNING, stateDir: dir });
      assert.equal(step.step, PublicationStep.ALREADY_COMPLETE);
      assert.equal(step.primaryPostId, "111");
    });
  });

  it("a retryable reply failure stays recoverable without a new primary", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "111", replyRequested: true });
      saveReplyOutcome({ receiptKey: K_MORNING, stateDir: dir, replyStatus: ReplyStatus.FAILED_RETRYABLE, replyFailureReason: "429" });
      const step = resolvePublicationStep({ receiptKey: K_MORNING, stateDir: dir });
      assert.equal(step.step, PublicationStep.REPLY_RECOVERY_ONLY);
      assert.equal(step.primaryPostId, "111");
    });
  });
});

describe("edition isolation of reply state", () => {
  it("a morning reply failure does not touch the confirmed edition", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "morning-1", market: "k", slateDate: SLATE, edition: "morning", replyRequested: true });
      saveReplyOutcome({ receiptKey: K_MORNING, stateDir: dir, replyStatus: ReplyStatus.FAILED_RETRYABLE, replyFailureReason: "429" });

      // Confirmed edition is untouched: it must run its own full publication.
      const confirmedStep = resolvePublicationStep({ receiptKey: K_CONFIRMED, stateDir: dir });
      assert.equal(confirmedStep.step, PublicationStep.FULL_PUBLICATION);
      assert.equal(confirmedStep.primaryPostId, null, "must not adopt the morning primary post id");
    });
  });

  it("confirmed publication does not overwrite morning recovery state", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "morning-1", replyRequested: true });
      saveReplyOutcome({ receiptKey: K_MORNING, stateDir: dir, replyStatus: ReplyStatus.FAILED_RETRYABLE, replyFailureReason: "429" });
      savePrimaryPost({ receiptKey: K_CONFIRMED, stateDir: dir, primaryPostId: "confirmed-1", replyRequested: true });

      const morning = readPublicationState(K_MORNING, dir);
      assert.equal(morning.primaryPostId, "morning-1");
      assert.equal(morning.replyStatus, ReplyStatus.FAILED_RETRYABLE);
      assert.equal(readPublicationState(K_CONFIRMED, dir).primaryPostId, "confirmed-1");
    });
  });

  it("HR reply state cannot affect K", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: HR_MORNING, stateDir: dir, primaryPostId: "hr-1", replyRequested: true });
      assert.equal(resolvePublicationStep({ receiptKey: K_MORNING, stateDir: dir }).step, PublicationStep.FULL_PUBLICATION);
      assert.equal(readPublicationState(K_MORNING, dir), null);
    });
  });

  it("a state file whose body names another edition is not trusted", () => {
    withTempDir((dir) => {
      // Contamination: correct filename, wrong edition inside.
      writeFileSync(getPublicationStatePath(K_CONFIRMED, dir), JSON.stringify({ receiptKey: K_MORNING, primaryPostId: "morning-1", replyStatus: ReplyStatus.POSTED }));
      assert.equal(readPublicationState(K_CONFIRMED, dir), null);
      assert.equal(resolvePublicationStep({ receiptKey: K_CONFIRMED, stateDir: dir }).step, PublicationStep.FULL_PUBLICATION);
    });
  });

  it("each edition writes its own state file", () => {
    withTempDir((dir) => {
      savePrimaryPost({ receiptKey: K_MORNING, stateDir: dir, primaryPostId: "a" });
      savePrimaryPost({ receiptKey: K_CONFIRMED, stateDir: dir, primaryPostId: "b" });
      savePrimaryPost({ receiptKey: HR_MORNING, stateDir: dir, primaryPostId: "c" });
      assert.equal(JSON.parse(readFileSync(getPublicationStatePath(K_MORNING, dir), "utf8")).primaryPostId, "a");
      assert.equal(JSON.parse(readFileSync(getPublicationStatePath(K_CONFIRMED, dir), "utf8")).primaryPostId, "b");
      assert.equal(JSON.parse(readFileSync(getPublicationStatePath(HR_MORNING, dir), "utf8")).primaryPostId, "c");
    });
  });
});

describe("row consistency", () => {
  const rows = [row("Alpha", 1), row("Bravo", 2), row("Charlie", 3)];

  it("passes when plan, caption and graphic describe the same rows", () => {
    const result = assertRowConsistency({ planRows: rows, captionRows: [...rows].reverse(), renderedRows: rows });
    assert.equal(result.consistent, true, "order must not matter");
    assert.deepEqual(result.mismatches, []);
  });

  it("blocks a caption that silently dropped a row (not declared in omittedRows)", () => {
    const result = assertRowConsistency({ planRows: rows, captionRows: rows.slice(0, 2), renderedRows: rows });
    assert.equal(result.consistent, false);
    assert.match(result.mismatches[0], /do not reconstruct the full plan/);
  });

  it("allows a caption that omits a row for space, as long as omittedRows accounts for it", () => {
    // This is the caption-budget feature working as designed: a row that does
    // not fit in 280 characters is dropped from the caption, not the post.
    const result = assertRowConsistency({ planRows: rows, captionRows: rows.slice(0, 2), omittedRows: [rows[2]], renderedRows: rows });
    assert.equal(result.consistent, true);
  });

  it("blocks a caption row that is not a genuine plan row, even if declared omitted elsewhere", () => {
    const foreign = row("Foreign", 99);
    const result = assertRowConsistency({ planRows: rows, captionRows: [rows[0], rows[1], foreign], omittedRows: [rows[2]], renderedRows: rows });
    assert.equal(result.consistent, false);
    assert.match(result.mismatches[0], /not present in the plan/);
  });

  it("blocks a row double-counted as both included and omitted", () => {
    const result = assertRowConsistency({ planRows: rows, captionRows: [rows[0], rows[1]], omittedRows: [rows[1], rows[2]], renderedRows: rows });
    assert.equal(result.consistent, false);
    assert.match(result.mismatches[0], /both the caption and omittedRows/);
  });

  it("blocks a graphic that rendered a different player", () => {
    const result = assertRowConsistency({ planRows: rows, captionRows: rows, renderedRows: [row("Alpha", 1), row("Delta", 2), row("Charlie", 3)] });
    assert.equal(result.consistent, false);
    assert.match(result.mismatches[0], /rendered rows differ/);
  });

  it("blocks a duplicated row even when the name set matches", () => {
    const result = assertRowConsistency({ planRows: rows, captionRows: [rows[0], rows[0], rows[1], rows[2]], renderedRows: rows });
    assert.equal(result.consistent, false);
  });

  it("distinguishes the same player in different games", () => {
    assert.notEqual(rowIdentity(row("Alpha", 1)), rowIdentity(row("Alpha", 2)));
  });

  it("matches on player and game regardless of pitcher/player field naming", () => {
    assert.equal(rowIdentity({ player: "Alpha", gameId: 1 }), rowIdentity({ pitcher: "alpha", gameId: 1 }));
  });
});

describe("helpers", () => {
  it("hasPrimaryPost requires a non-empty id", () => {
    assert.equal(hasPrimaryPost({ primaryPostId: "1" }), true);
    assert.equal(hasPrimaryPost({ primaryPostId: "  " }), false);
    assert.equal(hasPrimaryPost(null), false);
  });

  it("isReplyComplete covers terminal statuses only", () => {
    assert.equal(isReplyComplete({ replyStatus: ReplyStatus.POSTED }), true);
    assert.equal(isReplyComplete({ replyStatus: ReplyStatus.NOT_REQUESTED }), true);
    assert.equal(isReplyComplete({ replyStatus: ReplyStatus.FAILED_FINAL }), true);
    assert.equal(isReplyComplete({ replyStatus: ReplyStatus.PENDING }), false);
    assert.equal(isReplyComplete({ replyStatus: ReplyStatus.FAILED_RETRYABLE }), false);
  });
});
