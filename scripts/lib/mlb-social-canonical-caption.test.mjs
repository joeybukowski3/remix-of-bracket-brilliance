/**
 * mlb-social-canonical-caption.test.mjs
 * Run via: node --test scripts/lib/mlb-social-canonical-caption.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeSocialPostPlan, SOCIAL_PRODUCT } from "./mlb-social-composition.mjs";
import {
  buildCanonicalOmittedReply,
  buildHrCanonicalCaption,
  buildKCanonicalCaption,
  HR_CANONICAL_LINK,
  K_CANONICAL_LINK,
  weightedLength,
} from "./mlb-social-canonical-caption.mjs";

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

function kPlan(count) {
  const pool = Array.from({ length: count }, (_, i) => kRow({ pitcher: `Pitcher ${i + 1}`, pitcherId: i + 1, gameId: 200 + i }));
  return composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
}

function hrPlan(count) {
  const pool = Array.from({ length: count }, (_, i) => hrRow({ player: `Batter ${i + 1}`, playerId: i + 1, gameId: 300 + i }));
  return composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
}

const FORBIDDEN_WORDING = [/\bMorning\b/i, /\bConfirmed\b/i, /\bUpdated\b/i, /Added Player/i, /New Player/i, /\bEdition\b/i];

describe("buildKCanonicalCaption", () => {
  it("builds a 2-row caption under 280 characters with all rows present, in plan order", () => {
    const plan = kPlan(2);
    const result = buildKCanonicalCaption(plan);
    assert.equal(result.skipped, false);
    assert.equal(result.captionRows.length, 2);
    assert.ok(weightedLength(result.caption) <= 280);
    assert.deepEqual(result.captionRows.map((r) => r.playerName), plan.rows.map((r) => r.playerName));
    assert.ok(result.caption.includes(K_CANONICAL_LINK));
    for (const banned of FORBIDDEN_WORDING) assert.doesNotMatch(result.caption, banned);
  });

  it("builds a 5-row caption, preserving every selected player when it fits", () => {
    const plan = kPlan(5);
    const result = buildKCanonicalCaption(plan);
    assert.equal(result.skipped, false);
    assert.equal(result.captionRows.length, 5);
    assert.ok(weightedLength(result.caption) <= 280);
  });

  it("carries G1/G2 doubleheader context into the caption line", () => {
    const pool = [
      kRow({ pitcher: "Leg One", pitcherId: 9, gameId: 501, gameNumber: 1, isDoubleheader: true }),
      kRow({ pitcher: "Leg Two", pitcherId: 10, gameId: 502, gameNumber: 2, isDoubleheader: true }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const result = buildKCanonicalCaption(plan);
    assert.match(result.caption, /\(G1\)/);
    assert.match(result.caption, /\(G2\)/);
  });

  it("restrains hashtags to a single restrained line", () => {
    const result = buildKCanonicalCaption(kPlan(3));
    const hashtagLines = result.caption.split("\n").filter((line) => line.includes("#"));
    assert.equal(hashtagLines.length, 1);
    assert.ok(hashtagLines[0].split("#").length - 1 <= 3);
  });

  it("uses an overflow fixture (many rows, long names) without dropping a row silently -- overflow goes to omittedRows, never disappears", () => {
    const pool = Array.from({ length: 5 }, (_, i) =>
      kRow({ pitcher: `Extremely Long Pitcher Name Number ${i + 1}`, pitcherId: i + 1, team: `TEAM${i}`, gameId: 700 + i, oddsOver: "-1000000" }),
    );
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const result = buildKCanonicalCaption(plan);
    if (!result.skipped) {
      assert.equal(result.captionRows.length + result.omittedRows.length, 5);
      assert.ok(weightedLength(result.caption) <= 280);
    }
  });
});

describe("buildHrCanonicalCaption", () => {
  it("builds a 2-row caption under 280 characters with all rows present, in plan order", () => {
    const plan = hrPlan(2);
    const result = buildHrCanonicalCaption(plan);
    assert.equal(result.skipped, false);
    assert.equal(result.captionRows.length, 2);
    assert.ok(weightedLength(result.caption) <= 280);
    assert.deepEqual(result.captionRows.map((r) => r.playerName), plan.rows.map((r) => r.playerName));
    assert.ok(result.caption.includes(HR_CANONICAL_LINK));
    for (const banned of FORBIDDEN_WORDING) assert.doesNotMatch(result.caption, banned);
  });

  it("builds a 5-row caption, preserving every selected player when it fits", () => {
    const plan = hrPlan(5);
    const result = buildHrCanonicalCaption(plan);
    assert.equal(result.skipped, false);
    assert.equal(result.captionRows.length, 5);
    assert.ok(weightedLength(result.caption) <= 280);
  });

  it("carries G1/G2 doubleheader context into the caption line", () => {
    const pool = [
      hrRow({ player: "Leg One", playerId: 9, gameId: 501, gameNumber: 1, isDoubleheader: true }),
      hrRow({ player: "Leg Two", playerId: 10, gameId: 502, gameNumber: 2, isDoubleheader: true }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const result = buildHrCanonicalCaption(plan);
    assert.match(result.caption, /\(G1\)/);
    assert.match(result.caption, /\(G2\)/);
  });

  it("restrains hashtags to a single restrained line", () => {
    const result = buildHrCanonicalCaption(hrPlan(3));
    const hashtagLines = result.caption.split("\n").filter((line) => line.includes("#"));
    assert.equal(hashtagLines.length, 1);
    assert.ok(hashtagLines[0].split("#").length - 1 <= 3);
  });
});

describe("buildCanonicalOmittedReply", () => {
  it("is not requested when nothing was omitted", () => {
    const result = buildCanonicalOmittedReply({ omittedRows: [], product: "k" });
    assert.equal(result.shouldReply, false);
  });

  it("packages omitted K rows into one deterministic reply within budget", () => {
    const plan = kPlan(5);
    const omitted = plan.rows.slice(3);
    const result = buildCanonicalOmittedReply({ omittedRows: omitted, product: "k" });
    assert.equal(result.shouldReply, true);
    assert.ok(weightedLength(result.caption) <= 280);
    assert.ok(result.includedRows.length > 0);
  });

  it("packages omitted HR rows into one deterministic reply within budget", () => {
    const plan = hrPlan(5);
    const omitted = plan.rows.slice(3);
    const result = buildCanonicalOmittedReply({ omittedRows: omitted, product: "hr" });
    assert.equal(result.shouldReply, true);
    assert.ok(weightedLength(result.caption) <= 280);
  });
});
