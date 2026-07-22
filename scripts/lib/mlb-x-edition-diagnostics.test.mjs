/**
 * mlb-x-edition-diagnostics.test.mjs
 * Run via: node --test scripts/lib/mlb-x-edition-diagnostics.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDiagnosticRecord, DIAGNOSTIC_OUTCOMES, DIAGNOSTIC_VERSION, isValidDiagnostic } from "./mlb-x-edition-diagnostics.mjs";
import { isPostedReceipt } from "./mlb-x-edition-receipts.mjs";

const base = { market: "k", edition: "morning", slateDate: "2026-07-22" };

describe("allowlist", () => {
  it("contains exactly the ten required outcomes", () => {
    assert.deepEqual([...DIAGNOSTIC_OUTCOMES].sort(), [
      "CONFIGURATION_ERROR", "IMAGE_FAILED", "INVALID_SLATE", "MISSED_WINDOW",
      "NOT_DUE", "NO_VALID_PICKS", "ROW_MISMATCH", "STATE_PERSISTENCE_FAILED",
      "WAITING_FOR_SELECTED_LINEUPS", "X_API_FAILED",
    ].sort());
  });

  it("builds a record for every allowed outcome", () => {
    for (const latestOutcome of DIAGNOSTIC_OUTCOMES) {
      const record = buildDiagnosticRecord({ ...base, latestOutcome, reason: "r" });
      assert.equal(record.latestOutcome, latestOutcome);
      assert.equal(record.version, DIAGNOSTIC_VERSION);
    }
  });

  it("refuses a posted-shaped outcome -- this is the guard that keeps a diagnostic from ever being mistaken for a publication", () => {
    for (const forbidden of ["POSTED", "FALLBACK_POSTED", "ALREADY_POSTED", "REPLY_RECOVERED", "DRY_RUN", "SKIPPED", "LEASE_UNAVAILABLE"]) {
      assert.throws(() => buildDiagnosticRecord({ ...base, latestOutcome: forbidden }), /not in the allowlist/);
    }
  });

  it("refuses an unrecognized outcome rather than silently accepting it", () => {
    assert.throws(() => buildDiagnosticRecord({ ...base, latestOutcome: "SOMETHING_NEW" }), /not in the allowlist/);
  });
});

describe("record shape", () => {
  it("includes the receipt key, matching buildEditionReceiptKey", () => {
    const record = buildDiagnosticRecord({ ...base, latestOutcome: "NOT_DUE" });
    assert.equal(record.receiptKey, "mlb-k-2026-07-22-morning");
  });

  it("marks technicalFailure using the same list the audit's exit-code policy uses", () => {
    const technical = buildDiagnosticRecord({ ...base, latestOutcome: "IMAGE_FAILED" });
    const benign = buildDiagnosticRecord({ ...base, latestOutcome: "NOT_DUE" });
    assert.equal(technical.technicalFailure, true);
    assert.equal(benign.technicalFailure, false);
  });

  it("marks every technical outcome true and every benign one false", () => {
    const technicalSet = new Set(["IMAGE_FAILED", "X_API_FAILED", "CONFIGURATION_ERROR", "ROW_MISMATCH", "STATE_PERSISTENCE_FAILED"]);
    for (const latestOutcome of DIAGNOSTIC_OUTCOMES) {
      const record = buildDiagnosticRecord({ ...base, latestOutcome });
      assert.equal(record.technicalFailure, technicalSet.has(latestOutcome), latestOutcome);
    }
  });

  it("carries no postId-shaped field of any kind", () => {
    const record = buildDiagnosticRecord({ ...base, latestOutcome: "NOT_DUE" });
    assert.equal("postId" in record, false);
    assert.equal("primaryPostId" in record, false);
  });

  it("a diagnostic record never satisfies isPostedReceipt", () => {
    for (const latestOutcome of DIAGNOSTIC_OUTCOMES) {
      assert.equal(isPostedReceipt(buildDiagnosticRecord({ ...base, latestOutcome })), false, latestOutcome);
    }
  });

  it("preserves windowClosesAt when supplied and defaults to null", () => {
    assert.equal(buildDiagnosticRecord({ ...base, latestOutcome: "NOT_DUE" }).windowClosesAt, null);
    assert.equal(buildDiagnosticRecord({ ...base, latestOutcome: "NOT_DUE", windowClosesAt: "2026-07-22T15:15:00.000Z" }).windowClosesAt, "2026-07-22T15:15:00.000Z");
  });

  it("stringifies a non-string reason rather than throwing", () => {
    assert.equal(buildDiagnosticRecord({ ...base, latestOutcome: "NOT_DUE", reason: undefined }).reason, "");
  });
});

describe("isValidDiagnostic", () => {
  it("accepts a well-formed record", () => {
    assert.equal(isValidDiagnostic(buildDiagnosticRecord({ ...base, latestOutcome: "NOT_DUE" })), true);
  });

  it("rejects a wrong version, missing receiptKey, or unlisted outcome", () => {
    const good = buildDiagnosticRecord({ ...base, latestOutcome: "NOT_DUE" });
    assert.equal(isValidDiagnostic({ ...good, version: 2 }), false);
    assert.equal(isValidDiagnostic({ ...good, receiptKey: "" }), false);
    assert.equal(isValidDiagnostic({ ...good, latestOutcome: "POSTED" }), false);
    assert.equal(isValidDiagnostic(null), false);
    assert.equal(isValidDiagnostic({}), false);
  });
});
