/**
 * RESEARCH ONLY -- tests for the archive outcome-validity gate.
 * Run with: node --test scripts/research/lib/mlb-k-outcome-validity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  EXCLUSION_REASONS,
  classifyOutcome,
  classifyProjection,
  classifyRow,
  exclusionCounts,
  isValidOutcome,
  partitionByOutcomeValidity,
  strictNumber,
} from "./mlb-k-outcome-validity.mjs";

import { filterLeakageSafe } from "./mlb-k-research-helpers.mjs";

const ARCHIVE = path.join(
  process.cwd(),
  "data",
  "mlb",
  "k-research",
  "high-line-calibration",
  "pregame-archive.json",
);

// --------------------------- the defect being repaired ---------------------------

test("strictNumber treats null and empty string as absent, not as zero", () => {
  // This is the exact coercion bug in the extractor: Number(null) === 0.
  assert.equal(Number(null), 0);
  assert.equal(strictNumber(null), null);
  assert.equal(strictNumber(undefined), null);
  assert.equal(strictNumber(""), null);
  assert.equal(strictNumber(0), 0);
  assert.equal(strictNumber("7"), 7);
  assert.equal(strictNumber("abc"), null);
});

test("0 K on 0 BF is excluded as an unresolved placeholder", () => {
  const verdict = classifyOutcome({ actualKs: 0, actualBF: 0 });
  assert.equal(verdict.valid, false);
  assert.equal(verdict.reason, EXCLUSION_REASONS.UNRESOLVED_ZERO_BF_PLACEHOLDER);
});

test("a genuine 0-strikeout appearance with positive BF stays valid", () => {
  assert.equal(isValidOutcome({ actualKs: 0, actualBF: 9 }), true);
  assert.equal(isValidOutcome({ actualKs: 0, actualBF: 23 }), true);
});

test("a positive-strikeout appearance with positive BF stays valid", () => {
  assert.equal(isValidOutcome({ actualKs: 11, actualBF: 25 }), true);
});

test("a missing actual outcome remains excluded", () => {
  assert.equal(classifyOutcome({ actualKs: null, actualBF: 24 }).reason, EXCLUSION_REASONS.MISSING_ACTUAL_KS);
  assert.equal(classifyOutcome({ actualKs: 5, actualBF: null }).reason, EXCLUSION_REASONS.MISSING_ACTUAL_BF);
  assert.equal(classifyOutcome({}).valid, false);
  assert.equal(classifyOutcome(null).valid, false);
});

test("a positive strikeout count on zero BF is still rejected", () => {
  // Arithmetically impossible; if it ever appears it is a data defect, not a start.
  const verdict = classifyOutcome({ actualKs: 4, actualBF: 0 });
  assert.equal(verdict.valid, false);
  assert.equal(verdict.reason, EXCLUSION_REASONS.UNRESOLVED_ZERO_BF_PLACEHOLDER);
});

test("negative outcomes are rejected with their own reason", () => {
  assert.equal(classifyOutcome({ actualKs: -1, actualBF: 20 }).reason, EXCLUSION_REASONS.NEGATIVE_OUTCOME);
  assert.equal(classifyOutcome({ actualKs: 3, actualBF: -5 }).reason, EXCLUSION_REASONS.NEGATIVE_OUTCOME);
});

// ------------------------------- partition contract -------------------------------

test("partition keeps every row exactly once and preserves excluded rows", () => {
  const rows = [
    { id: "a", actualKs: 0, actualBF: 0 },
    { id: "b", actualKs: 0, actualBF: 9 },
    { id: "c", actualKs: 7, actualBF: 24 },
    { id: "d", actualKs: null, actualBF: null },
  ];
  const { kept, excluded } = partitionByOutcomeValidity(rows);
  assert.equal(kept.length + excluded.length, rows.length);
  assert.deepEqual(kept.map((row) => row.id), ["b", "c"]);
  assert.deepEqual(excluded.map((entry) => entry.row.id), ["a", "d"]);
  // The excluded rows survive intact, not as a count.
  assert.equal(excluded[0].row.actualBF, 0);
  assert.equal(excluded[0].reason, EXCLUSION_REASONS.UNRESOLVED_ZERO_BF_PLACEHOLDER);
  assert.equal(excluded[1].reason, EXCLUSION_REASONS.MISSING_ACTUAL_KS);
});

test("exclusion counts are deterministic and cover every declared reason", () => {
  const { excluded } = partitionByOutcomeValidity([
    { actualKs: 0, actualBF: 0 },
    { actualKs: 0, actualBF: 0 },
    { actualKs: null, actualBF: 3 },
  ]);
  const counts = exclusionCounts(excluded);
  assert.deepEqual(Object.keys(counts), Object.keys(EXCLUSION_REASONS));
  assert.equal(counts.UNRESOLVED_ZERO_BF_PLACEHOLDER, 2);
  assert.equal(counts.MISSING_ACTUAL_KS, 1);
  assert.equal(counts.NEGATIVE_OUTCOME, 0);
  // Re-running on the same input gives the identical tally.
  assert.deepEqual(exclusionCounts(excluded), counts);
});

test("partition is order-independent in what it keeps", () => {
  const rows = [
    { id: "a", actualKs: 0, actualBF: 0 },
    { id: "b", actualKs: 0, actualBF: 9 },
    { id: "c", actualKs: 7, actualBF: 24 },
  ];
  const forward = partitionByOutcomeValidity(rows).kept.map((row) => row.id).sort();
  const reversed = partitionByOutcomeValidity([...rows].reverse()).kept.map((row) => row.id).sort();
  assert.deepEqual(forward, reversed);
});

// ------------------------------ against the real archive ------------------------------

test("the archive outcome exclusion is exactly the 8 known unresolved placeholder rows", () => {
  const archive = JSON.parse(readFileSync(ARCHIVE, "utf8"));
  const leakageSafe = filterLeakageSafe(archive.rows);
  const { kept, excluded } = partitionByOutcomeValidity(leakageSafe);

  assert.equal(leakageSafe.length, 958, "prior leakage-safe count");
  assert.equal(excluded.length, 8, "outcome exclusion count");
  assert.equal(kept.length, 950, "archive size after the outcome repair alone");
  assert.deepEqual(exclusionCounts(excluded), {
    MISSING_ACTUAL_KS: 0,
    MISSING_ACTUAL_BF: 0,
    UNRESOLVED_ZERO_BF_PLACEHOLDER: 8,
    NEGATIVE_OUTCOME: 0,
    UNPROJECTED_ZEROED_PROJECTION: 0,
  });
  // Every excluded row came from the grading source with the null-coercion path.
  for (const entry of excluded) {
    assert.equal(entry.row.actualsSource, "top-k-grading");
    assert.equal(entry.row.actualBF, 0);
    assert.equal(entry.row.actualOuts, null, "an unresolved row has no innings either");
  }
});

test("a zeroed projection is rejected and a real projection is kept", () => {
  // The null signature: the model declined, and Number(null) made every field 0.
  const declined = { v2ProjectedKs: 0, v2ProjectedKRate: 0, v2PitcherSkillRate: 0, v2ProjectedBF: 0 };
  assert.equal(classifyProjection(declined).reason, EXCLUSION_REASONS.UNPROJECTED_ZEROED_PROJECTION);
  // MIN_K_RATE is 0.10, so a K rate of 0 can never be a genuine projection.
  assert.equal(
    classifyProjection({ v2ProjectedKRate: 0, v2PitcherSkillRate: 0.22, v2ProjectedBF: 23 }).reason,
    EXCLUSION_REASONS.UNPROJECTED_ZEROED_PROJECTION,
  );
  assert.equal(classifyProjection({ v2ProjectedKRate: 0.21, v2PitcherSkillRate: 0.23, v2ProjectedBF: 23 }).valid, true);
  // A low but real projection survives.
  assert.equal(classifyProjection({ v2ProjectedKRate: 0.1, v2PitcherSkillRate: 0.1, v2ProjectedBF: 12 }).valid, true);
});

test("classifyRow gates the projection first, then the outcome", () => {
  const real = { v2ProjectedKRate: 0.21, v2PitcherSkillRate: 0.23, v2ProjectedBF: 23 };
  assert.equal(classifyRow({ ...real, actualKs: 7, actualBF: 24 }).valid, true);
  assert.equal(classifyRow({ ...real, actualKs: 0, actualBF: 24 }).valid, true, "a real 0-K start still survives");
  assert.equal(
    classifyRow({ ...real, actualKs: 0, actualBF: 0 }).reason,
    EXCLUSION_REASONS.UNRESOLVED_ZERO_BF_PLACEHOLDER,
  );
  assert.equal(
    classifyRow({ v2ProjectedKRate: 0, v2PitcherSkillRate: 0, v2ProjectedBF: 0, actualKs: 7, actualBF: 24 }).reason,
    EXCLUSION_REASONS.UNPROJECTED_ZEROED_PROJECTION,
  );
});

test("the full repair removes 14 rows in two distinct classes", () => {
  const archive = JSON.parse(readFileSync(ARCHIVE, "utf8"));
  const leakageSafe = filterLeakageSafe(archive.rows);
  const { kept, excluded } = partitionByOutcomeValidity(leakageSafe, { classify: classifyRow });

  assert.equal(kept.length, 944, "clean archive size");
  assert.deepEqual(exclusionCounts(excluded), {
    MISSING_ACTUAL_KS: 0,
    MISSING_ACTUAL_BF: 0,
    UNRESOLVED_ZERO_BF_PLACEHOLDER: 8,
    NEGATIVE_OUTCOME: 0,
    UNPROJECTED_ZEROED_PROJECTION: 6,
  });
  // Production declined on those 6; the archive should show the zeroed signature.
  for (const entry of excluded.filter((e) => e.reason === EXCLUSION_REASONS.UNPROJECTED_ZEROED_PROJECTION)) {
    assert.equal(entry.row.v2ProjectedKRate, 0);
    assert.equal(entry.row.v2PitcherSkillRate, 0);
  }
  // Every kept row carries a real projection and a real outcome.
  for (const row of kept) {
    assert.ok(row.v2ProjectedKRate > 0 && row.v2ProjectedBF > 0);
    assert.ok(row.actualBF > 0);
  }
});

test("real zero-strikeout appearances survive the archive repair", () => {
  const archive = JSON.parse(readFileSync(ARCHIVE, "utf8"));
  const { kept } = partitionByOutcomeValidity(filterLeakageSafe(archive.rows));
  const genuineZeroK = kept.filter((row) => row.actualKs === 0);
  assert.equal(genuineZeroK.length, 17, "genuine 0-K starts are retained, not swept up by the repair");
  for (const row of genuineZeroK) assert.ok(row.actualBF > 0);
});

test("the repair is idempotent: re-partitioning the clean set excludes nothing", () => {
  const archive = JSON.parse(readFileSync(ARCHIVE, "utf8"));
  const { kept } = partitionByOutcomeValidity(filterLeakageSafe(archive.rows));
  const second = partitionByOutcomeValidity(kept);
  assert.equal(second.excluded.length, 0);
  assert.equal(second.kept.length, kept.length);
});
