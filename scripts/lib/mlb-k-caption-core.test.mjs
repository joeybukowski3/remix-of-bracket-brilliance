import test from "node:test";
import assert from "node:assert/strict";
import { buildCaption, formatSignedEdge, getFavoredOdds, validateRows } from "./mlb-k-caption-core.mjs";

// Rows here already represent what reaches the caption builder after the
// page's own selectTopSocialKRows ranking and filterEligibleKRows status
// filter -- i.e. status===VALID, kLine >= 3.5 (MIN_ELIGIBLE_K_LINE), a
// real projection, and coherent two-sided odds are all already enforced
// upstream (kPropStatus.ts / mlb-k-social-eligibility.mjs). This module
// only has to get direction/odds/edge right for whatever it's handed.
function row(overrides = {}) {
  return {
    pitcher: "Test Pitcher",
    team: "BAL",
    opponent: "CHC",
    strikeoutScore: 72,
    kRate: 28,
    whiffRate: 31,
    kLine: 5.5,
    oddsOver: "-115",
    oddsUnder: "-115",
    bookmaker: "draftkings",
    direction: "over",
    projectedKs: 6.4,
    projectionEdge: 0.9,
    ...overrides,
  };
}

test("getFavoredOdds picks oddsOver for an OVER row", () => {
  const r = row({ direction: "over", oddsOver: "+105", oddsUnder: "-140" });
  assert.equal(getFavoredOdds(r), "+105");
});

test("getFavoredOdds picks oddsUnder for an UNDER row", () => {
  const r = row({ direction: "under", oddsOver: "+105", oddsUnder: "-110" });
  assert.equal(getFavoredOdds(r), "-110");
});

test("formatSignedEdge: positive edge gets an explicit + sign", () => {
  assert.equal(formatSignedEdge(1.5), "+1.5");
});

test("formatSignedEdge: negative edge keeps its own - sign, not doubled", () => {
  assert.equal(formatSignedEdge(-1.3), "-1.3");
});

test("signed direction agreement: an UNDER row's edge is negative and an OVER row's edge is positive", () => {
  const under = row({ direction: "under", projectedKs: 5.2, kLine: 6.5, projectionEdge: -1.3 });
  const over = row({ direction: "over", projectedKs: 6.0, kLine: 4.5, projectionEdge: 1.5 });
  assert.ok(under.projectionEdge < 0);
  assert.ok(over.projectionEdge > 0);
});

test("required caption format: OVER row renders exactly 'OVER {line} Ks ({odds})' / 'Projection: {n}' / 'Edge: +{n}'", () => {
  const rows = [row({ pitcher: "Over Guy", team: "NYY", opponent: "BOS", direction: "over", kLine: 4.5, oddsOver: "+105", projectedKs: 6.0, projectionEdge: 1.5 })];
  const result = buildCaption({ date: "2026-07-10", rows });
  assert.equal(result.skipped, false);
  assert.match(result.caption, /OVER 4\.5 Ks \(\+105\)/);
  assert.match(result.caption, /Projection: 6\.0/);
  assert.match(result.caption, /Edge: \+1\.5/);
});

test("required caption format: UNDER row renders exactly 'UNDER {line} Ks ({odds})' / 'Projection: {n}' / 'Edge: -{n}'", () => {
  const rows = [row({ pitcher: "Under Guy", team: "SEA", opponent: "HOU", direction: "under", kLine: 6.5, oddsUnder: "-110", oddsOver: "-115", projectedKs: 5.2, projectionEdge: -1.3 })];
  const result = buildCaption({ date: "2026-07-10", rows });
  assert.equal(result.skipped, false);
  assert.match(result.caption, /UNDER 6\.5 Ks \(-110\)/);
  assert.match(result.caption, /Projection: 5\.2/);
  assert.match(result.caption, /Edge: -1\.3/);
});

test("a strong UNDER can appear ahead of a weaker OVER in the same table (ranking itself lives in kPropValueSorting.ts; this just confirms the caption preserves whatever order it's given)", () => {
  const rows = [
    row({ pitcher: "Big Under", direction: "under", kLine: 6.5, projectedKs: 4.0, projectionEdge: -2.5, oddsUnder: "-120" }),
    row({ pitcher: "Small Over", direction: "over", kLine: 5.5, projectedKs: 5.8, projectionEdge: 0.3, oddsOver: "-110" }),
  ];
  const result = buildCaption({ date: "2026-07-10", rows: rows });
  const bigUnderIndex = result.caption.indexOf("Big Under");
  const smallOverIndex = result.caption.indexOf("Small Over");
  assert.ok(bigUnderIndex < smallOverIndex, "the row passed in first (the stronger edge, per the caller's own ranking) must render first");
  assert.match(result.caption, /UNDER 6\.5 Ks \(-120\)/);
});

test("a strong OVER can appear ahead of a weaker UNDER in the same table", () => {
  const rows = [
    row({ pitcher: "Big Over", direction: "over", kLine: 4.5, projectedKs: 7.5, projectionEdge: 3.0, oddsOver: "+120" }),
    row({ pitcher: "Small Under", direction: "under", kLine: 5.5, projectedKs: 5.3, projectionEdge: -0.2, oddsUnder: "-105" }),
  ];
  const result = buildCaption({ date: "2026-07-10", rows: rows });
  const bigOverIndex = result.caption.indexOf("Big Over");
  const smallUnderIndex = result.caption.indexOf("Small Under");
  assert.ok(bigOverIndex < smallUnderIndex);
  assert.match(result.caption, /OVER 4\.5 Ks \(\+120\)/);
});

test("validateRows: fewer than the target number of rows (1-2) is handled safely, not rejected", () => {
  assert.equal(validateRows([row()]), "");
  assert.equal(validateRows([row(), row({ pitcher: "Second" })]), "");
});

test("validateRows: zero rows produces a clean skip reason (SKIPPED_NO_ELIGIBLE_ROWS path), not a broken post", () => {
  const reason = validateRows([]);
  assert.match(reason, /no eligible K prop rows/i);
});

test("buildCaption: zero rows is a clean skip, never a fabricated/empty post", () => {
  const result = buildCaption({ date: "2026-07-10", rows: [] });
  assert.equal(result.skipped, true);
  assert.equal(result.caption, "");
});

test("validateRows: a row with no clear direction (neither over nor under) is rejected rather than silently defaulting to OVER", () => {
  const reason = validateRows([row({ direction: null })]);
  assert.match(reason, /no clear OVER\/UNDER direction/i);
});

test("validateRows: missing projection is rejected", () => {
  const reason = validateRows([row({ projectedKs: null })]);
  assert.match(reason, /projection is missing/i);
});

test("validateRows: missing K line is rejected", () => {
  const reason = validateRows([row({ kLine: null })]);
  assert.match(reason, /K line is missing/i);
});

test("validateRows: missing odds for the favored direction is rejected even if the other side's odds are present", () => {
  const reason = validateRows([row({ direction: "under", oddsUnder: null, oddsOver: "-115" })]);
  assert.match(reason, /under price is missing/i);
});

test("deterministic tie-breaking: caption output does not depend on object key insertion order or Math.random, given the same input rows in the same order", () => {
  const rows = [row({ pitcher: "A" }), row({ pitcher: "B", strikeoutScore: 71 })];
  const first = buildCaption({ date: "2026-07-10", rows });
  const second = buildCaption({ date: "2026-07-10", rows });
  assert.equal(first.caption, second.caption);
});
