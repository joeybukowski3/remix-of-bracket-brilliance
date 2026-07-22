/**
 * mlb-x-edition-audit.test.mjs
 * Run via: node --test scripts/lib/mlb-x-edition-audit.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auditSlate, renderAuditAnnotations, renderAuditSummary } from "./mlb-x-edition-audit.mjs";

const SLATE = "2026-07-21";
const FIRST_PITCH = "2026-07-21T22:40:00Z";
const EVENING = "2026-07-22T02:00:00Z";       // 22:00 ET, everything closed
const MID_MORNING = "2026-07-21T14:00:00Z";   // 10:00 ET, morning still open

const receiptFor = (map) => ({ market, edition }) => map[`${market}-${edition}`] ?? null;
const posted = (id, extra = {}) => ({ primaryPostId: id, postId: id, ...extra });

describe("all four present", () => {
  it("reports every edition published and exits zero", () => {
    const report = auditSlate({
      slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH,
      readReceipt: receiptFor({
        "k-morning": posted("1"), "hr-morning": posted("2"),
        "k-confirmed": posted("3"), "hr-confirmed": posted("4"),
      }),
    });
    assert.equal(report.postedCount, 4);
    assert.deepEqual(report.missed, []);
    assert.equal(report.exitCode, 0);
    assert.ok(report.editions.every((e) => e.posted && e.postId));
  });

  it("surfaces reply status alongside the primary", () => {
    const report = auditSlate({
      slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH,
      readReceipt: receiptFor({ "k-morning": posted("1", { replyStatus: "FAILED_RETRYABLE" }) }),
    });
    const k = report.editions.find((e) => e.key === "mlb-k-2026-07-21-morning");
    assert.equal(k.posted, true, "a failed reply does not make the edition unpublished");
    assert.equal(k.replyStatus, "FAILED_RETRYABLE");
  });
});

describe("missing editions", () => {
  it("reports one missing edition and warns", () => {
    const report = auditSlate({
      slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH,
      readReceipt: receiptFor({ "k-morning": posted("1"), "hr-morning": posted("2"), "k-confirmed": posted("3") }),
      readDiagnostic: () => ({ latestOutcome: "IMAGE_FAILED", reason: "render timed out" }),
    });
    assert.equal(report.postedCount, 3);
    assert.equal(report.missed.length, 1);
    assert.equal(report.missed[0].key, "mlb-hr-2026-07-21-confirmed");
    assert.equal(renderAuditAnnotations(report).length, 1);
    assert.match(renderAuditAnnotations(report)[0], /::warning title=MLB X edition missing::mlb-hr-2026-07-21-confirmed/);
  });

  it("reports the 2026-07-21 case: all four missing", () => {
    const report = auditSlate({
      slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH,
      readReceipt: () => null,
      readDiagnostic: () => ({ latestOutcome: "WAITING_FOR_SELECTED_LINEUPS", reason: "0/5 selected picks confirmed" }),
    });
    assert.equal(report.postedCount, 0);
    assert.equal(report.missed.length, 4);
    assert.equal(renderAuditAnnotations(report).length, 4);
  });

  it("records a reason even with no diagnostic at all", () => {
    const report = auditSlate({ slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH, readReceipt: () => null });
    assert.match(report.editions[0].reason, /no receipt and no diagnostic/);
  });
});

describe("exit code policy", () => {
  it("exits nonzero for a technical miss", () => {
    for (const status of ["IMAGE_FAILED", "X_API_FAILED", "CONFIGURATION_ERROR", "ROW_MISMATCH"]) {
      const report = auditSlate({
        slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH,
        readReceipt: () => null, readDiagnostic: () => ({ latestOutcome: status, reason: status }),
      });
      assert.equal(report.exitCode, 1, `${status} must fail the audit`);
      assert.equal(report.technicalMisses.length, 4);
    }
  });

  it("exits zero for a benign miss", () => {
    for (const status of ["NO_GAMES", "NO_VALID_PICKS", "INVALID_SLATE"]) {
      const report = auditSlate({
        slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH,
        readReceipt: () => null, readDiagnostic: () => ({ latestOutcome: status, reason: status }),
      });
      assert.equal(report.exitCode, 0, `${status} must not fail the audit`);
      assert.equal(report.technicalMisses.length, 0);
      // Still surfaced as missed, just not as a failure.
      assert.equal(report.missed.length, 4);
    }
  });

  it("exits zero when a window is still open", () => {
    const report = auditSlate({
      slateDate: SLATE, now: MID_MORNING, firstGameTime: FIRST_PITCH,
      readReceipt: () => null, readDiagnostic: () => ({ latestOutcome: "IMAGE_FAILED", reason: "not yet" }),
    });
    // Morning is open at 10:00 ET, so nothing is a miss yet.
    const morning = report.editions.filter((e) => e.edition === "morning");
    assert.ok(morning.every((e) => !e.missed && !e.windowClosed));
    assert.equal(report.exitCode, 0);
  });
});

describe("window closure", () => {
  it("treats the morning window as closed after 11:15 ET", () => {
    const open = auditSlate({ slateDate: SLATE, now: "2026-07-21T15:15:00Z", firstGameTime: FIRST_PITCH, readReceipt: () => null });
    const closed = auditSlate({ slateDate: SLATE, now: "2026-07-21T15:16:00Z", firstGameTime: FIRST_PITCH, readReceipt: () => null });
    assert.equal(open.editions.find((e) => e.edition === "morning").windowClosed, false);
    assert.equal(closed.editions.find((e) => e.edition === "morning").windowClosed, true);
  });

  it("treats the confirmed window as closed inside 1h15m of first pitch", () => {
    const at = (mins) => new Date(Date.parse(FIRST_PITCH) - mins * 60_000).toISOString();
    const open = auditSlate({ slateDate: SLATE, now: at(80), firstGameTime: FIRST_PITCH, readReceipt: () => null });
    const closed = auditSlate({ slateDate: SLATE, now: at(70), firstGameTime: FIRST_PITCH, readReceipt: () => null });
    assert.equal(open.editions.find((e) => e.edition === "confirmed").windowClosed, false);
    assert.equal(closed.editions.find((e) => e.edition === "confirmed").windowClosed, true);
  });

  it("treats a slate with no first game time as closed for confirmed", () => {
    const report = auditSlate({ slateDate: SLATE, now: MID_MORNING, firstGameTime: null, readReceipt: () => null });
    assert.equal(report.editions.find((e) => e.edition === "confirmed").windowClosed, true);
  });
});

describe("summary rendering", () => {
  it("renders every edition with its state", () => {
    const report = auditSlate({
      slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH,
      readReceipt: receiptFor({ "k-morning": posted("111"), "hr-morning": posted("222") }),
      readDiagnostic: () => ({ latestOutcome: "NO_VALID_PICKS", reason: "no qualifying picks" }),
    });
    const summary = renderAuditSummary(report);
    assert.match(summary, /MLB X editions — 2026-07-21/);
    assert.match(summary, /\*\*2 of 4 published\.\*\*/);
    assert.match(summary, /`111`/);
    assert.match(summary, /no qualifying picks/);
    assert.match(summary, /benign reasons/);
    for (const edition of ["morning", "confirmed"]) assert.ok(summary.includes(edition));
  });

  it("calls out technical misses explicitly", () => {
    const report = auditSlate({
      slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH,
      readReceipt: () => null, readDiagnostic: () => ({ latestOutcome: "X_API_FAILED", reason: "429" }),
    });
    assert.match(renderAuditSummary(report), /4 technical miss\(es\)/);
  });

  it("says so plainly when nothing was missed", () => {
    const report = auditSlate({
      slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH,
      readReceipt: receiptFor({ "k-morning": posted("1"), "hr-morning": posted("2"), "k-confirmed": posted("3"), "hr-confirmed": posted("4") }),
    });
    assert.match(renderAuditSummary(report), /No missed editions\./);
    assert.deepEqual(renderAuditAnnotations(report), []);
  });
});

describe("audit never posts", () => {
  it("only reads receipts and diagnostics", () => {
    let reads = 0;
    auditSlate({
      slateDate: SLATE, now: EVENING, firstGameTime: FIRST_PITCH,
      readReceipt: () => { reads += 1; return null; },
    });
    assert.equal(reads, 4, "exactly one read per edition, no writes available at all");
  });
});
