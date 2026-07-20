/**
 * mlb-k-social-eligibility.test.mjs
 * Run via: node --test scripts/lib/mlb-k-social-eligibility.test.mjs
 *
 * Covers the social poster's independent eligibility gate (Required Fix
 * 7 from the K-props data-quality audit): the poster must never include
 * a LOW_CONFIDENCE/INSUFFICIENT_DATA/INVALID_ODDS/INVALID_WORKLOAD row,
 * even if a future change to the page's own sort/selection logic stops
 * filtering by status.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeScrapedKRows, filterEligibleKRows } from "./mlb-k-social-eligibility.mjs";

describe("filterEligibleKRows", () => {
  it("keeps only rows with an explicit VALID status", () => {
    const rows = [
      { pitcher: "Valid Pitcher", status: "VALID" },
      { pitcher: "Low Confidence Pitcher", status: "LOW_CONFIDENCE" },
      { pitcher: "Insufficient Data Pitcher", status: "INSUFFICIENT_DATA" },
      { pitcher: "Invalid Odds Pitcher", status: "INVALID_ODDS" },
      { pitcher: "Invalid Workload Pitcher", status: "INVALID_WORKLOAD" },
    ];
    const { eligibleRows, excludedCount, excludedStatuses } = filterEligibleKRows(rows);
    assert.deepEqual(eligibleRows.map((r) => r.pitcher), ["Valid Pitcher"]);
    assert.equal(excludedCount, 4);
    assert.deepEqual(excludedStatuses.sort(), ["INSUFFICIENT_DATA", "INVALID_ODDS", "INVALID_WORKLOAD", "LOW_CONFIDENCE"].sort());
  });

  it("treats a missing/null status as ineligible, not an implicit pass", () => {
    const rows = [{ pitcher: "No Status Attribute", status: null }, { pitcher: "Empty Status", status: "" }];
    const { eligibleRows, excludedStatuses } = filterEligibleKRows(rows);
    assert.equal(eligibleRows.length, 0);
    assert.deepEqual(excludedStatuses, ["missing", "missing"]);
  });

  it("would still exclude a row ranked first by score if its status is not VALID (Jack Perkins regression)", () => {
    // Reproduces the shape of the audited bug: the highest-scored row is
    // exactly the one with the fabricated projection/odds mismatch.
    const rows = [
      { pitcher: "Jack Perkins", strikeoutScore: 95, status: "INVALID_ODDS" },
      { pitcher: "Real Pick", strikeoutScore: 60, status: "VALID" },
    ];
    const { eligibleRows } = filterEligibleKRows(rows);
    assert.deepEqual(eligibleRows.map((r) => r.pitcher), ["Real Pick"]);
  });

  it("returns everything unchanged when all rows are VALID", () => {
    const rows = [{ pitcher: "A", status: "VALID" }, { pitcher: "B", status: "VALID" }];
    const { eligibleRows, excludedCount } = filterEligibleKRows(rows);
    assert.equal(eligibleRows.length, 2);
    assert.equal(excludedCount, 0);
  });
});

describe("dedupeScrapedKRows", () => {
  it("drops the mobile/desktop responsive-DOM duplicate of the same pitcher/team/opponent", () => {
    // Reproduces the production bug: SocialTableK renders one [data-k-row]
    // block for mobile and one for desktop; Playwright's un-filtered
    // [data-k-row] locator scrapes both, so every pitcher appears twice with
    // otherwise-identical fields. This caused every K post attempt to fail
    // with FAILED_ARTIFACT_SELECTION_MISMATCH ("duplicate row identity").
    const rows = [
      { pitcher: "Tarik Skubal", team: "DET", opponent: "CWS", kLine: 6.5 },
      { pitcher: "Tarik Skubal", team: "DET", opponent: "CWS", kLine: 6.5 },
      { pitcher: "Paul Skenes", team: "PIT", opponent: "CIN", kLine: 7.5 },
      { pitcher: "Paul Skenes", team: "PIT", opponent: "CIN", kLine: 7.5 },
    ];
    const { rows: deduped, duplicatesRemoved } = dedupeScrapedKRows(rows);
    assert.deepEqual(deduped.map((r) => r.pitcher), ["Tarik Skubal", "Paul Skenes"]);
    assert.equal(duplicatesRemoved, 2);
  });

  it("keeps two different pitchers on the same team/opponent (a legitimate doubleheader-style case)", () => {
    const rows = [
      { pitcher: "Pitcher A", team: "NYY", opponent: "BOS" },
      { pitcher: "Pitcher B", team: "NYY", opponent: "BOS" },
    ];
    const { rows: deduped, duplicatesRemoved } = dedupeScrapedKRows(rows);
    assert.equal(deduped.length, 2);
    assert.equal(duplicatesRemoved, 0);
  });

  it("is a no-op when there are no duplicates", () => {
    const rows = [{ pitcher: "A", team: "NYY", opponent: "BOS" }, { pitcher: "B", team: "LAD", opponent: "SF" }];
    const { rows: deduped, duplicatesRemoved } = dedupeScrapedKRows(rows);
    assert.equal(deduped.length, 2);
    assert.equal(duplicatesRemoved, 0);
  });

  it("treats identity as case-insensitive/whitespace-trimmed (defensive against scrape formatting drift)", () => {
    const rows = [
      { pitcher: "Tarik Skubal", team: "DET", opponent: "CWS" },
      { pitcher: " Tarik Skubal ", team: "det", opponent: "cws" },
    ];
    const { rows: deduped, duplicatesRemoved } = dedupeScrapedKRows(rows);
    assert.equal(deduped.length, 1);
    assert.equal(duplicatesRemoved, 1);
  });
});
