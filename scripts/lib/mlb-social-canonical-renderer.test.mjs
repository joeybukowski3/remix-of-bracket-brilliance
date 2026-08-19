/**
 * mlb-social-canonical-renderer.test.mjs
 * Run via: node --test scripts/lib/mlb-social-canonical-renderer.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeSocialPostPlan, SOCIAL_PRODUCT } from "./mlb-social-composition.mjs";
import {
  CANONICAL_GEOMETRY,
  computeCanonicalRowLayout,
  extractCanonicalRenderedRows,
  renderCanonicalSocialSvg,
} from "./mlb-social-canonical-renderer.mjs";

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

function kPlan(count, extraOverrides = () => ({})) {
  const pool = Array.from({ length: count }, (_, i) =>
    kRow({ pitcher: `Pitcher ${i + 1}`, pitcherId: i + 1, gameId: 200 + i, opponent: `OPP${i}`, team: `T${i}`, ...extraOverrides(i) }),
  );
  return composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: pool, title: "MLB STRIKEOUT PROPS", generatedAt: "2026-08-18T12:00:00Z" });
}

function hrPlan(count, extraOverrides = () => ({})) {
  const pool = Array.from({ length: count }, (_, i) =>
    hrRow({ player: `Batter ${i + 1}`, playerId: i + 1, gameId: 300 + i, opponent: `OPP${i}`, team: `T${i}`, ...extraOverrides(i) }),
  );
  return composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: "2026-08-18", candidatePool: pool, title: "MLB HOME RUN TARGETS", generatedAt: "2026-08-18T12:00:00Z" });
}

describe("computeCanonicalRowLayout -- adaptive 2-5 row spacing", () => {
  it("gives fewer rows more room per slot than more rows", () => {
    const two = computeCanonicalRowLayout(2);
    const five = computeCanonicalRowLayout(5);
    assert.ok(two[0].height >= five[0].height);
  });

  it("never overflows the fixed rows band", () => {
    for (const count of [2, 3, 4, 5]) {
      const layout = computeCanonicalRowLayout(count);
      const last = layout.at(-1);
      assert.ok(last.top + last.height <= CANONICAL_GEOMETRY.rowsBottom + 1);
      assert.ok(layout[0].top >= CANONICAL_GEOMETRY.rowsTop - 1);
    }
  });
});

describe("renderCanonicalSocialSvg -- K", () => {
  for (const count of [2, 3, 4, 5]) {
    it(`renders exactly ${count} K row(s)`, () => {
      const plan = kPlan(count);
      const svg = renderCanonicalSocialSvg({ plan });
      assert.equal(extractCanonicalRenderedRows(svg).length, count);
    });
  }

  it("renders rows in exact plan order, never re-sorted", () => {
    const plan = kPlan(3);
    const svg = renderCanonicalSocialSvg({ plan });
    const rendered = extractCanonicalRenderedRows(svg);
    assert.deepEqual(rendered.map((r) => r.playerName), plan.rows.map((r) => r.playerName));
    assert.deepEqual(rendered.map((r) => r.gameId), plan.rows.map((r) => String(r.gameId)));
  });

  it("renders K-specific fields: side, kLine, odds, projectedKs, edge", () => {
    const plan = kPlan(2);
    const svg = renderCanonicalSocialSvg({ plan });
    assert.match(svg, /OVER 4\.5/);
    assert.match(svg, /-120/);
    assert.match(svg, /5\.5/);
    assert.match(svg, /\+1\.0/);
  });

  it("renders the canonical headline, never edition wording", () => {
    const plan = kPlan(2);
    const svg = renderCanonicalSocialSvg({ plan });
    assert.match(svg, /MLB STRIKEOUT PROPS/);
    for (const banned of [/Morning/i, /Confirmed/i, /Updated/i, /Added Player/i, /New Player/i, /Edition/i]) {
      assert.doesNotMatch(svg, banned);
    }
  });

  it("renders the plain gameLabel and appends G1/G2 for a doubleheader", () => {
    const single = kPlan(2);
    const singleSvg = renderCanonicalSocialSvg({ plan: single });
    assert.match(singleSvg, /T0 vs OPP0/);

    const dhPool = [
      kRow({ pitcher: "Same Pitcher", pitcherId: 9, team: "NYY", opponent: "BOS", gameId: 501, gameNumber: 1, isDoubleheader: true }),
      kRow({ pitcher: "Other Pitcher", pitcherId: 10, team: "BOS", opponent: "NYY", gameId: 502, gameNumber: 2, isDoubleheader: true }),
    ];
    const dhPlan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: dhPool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const dhSvg = renderCanonicalSocialSvg({ plan: dhPlan });
    assert.match(dhSvg, /NYY vs BOS — G1/);
    assert.match(dhSvg, /BOS vs NYY — G2/);
  });

  it("distinguishes two legs of the same doubleheader player via distinct gameLabel and gameId", () => {
    const dhPool = [
      kRow({ pitcher: "Twice Starter", pitcherId: 77, team: "NYY", opponent: "BOS", gameId: 601, gameNumber: 1, isDoubleheader: true }),
      kRow({ pitcher: "Twice Starter", pitcherId: 77, team: "NYY", opponent: "TOR", gameId: 602, gameNumber: 2, isDoubleheader: true }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: dhPool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const svg = renderCanonicalSocialSvg({ plan });
    const rendered = extractCanonicalRenderedRows(svg);
    assert.equal(rendered.length, 2);
    assert.notEqual(rendered[0].gameLabel, rendered[1].gameLabel);
    assert.notEqual(rendered[0].gameId, rendered[1].gameId);
  });

  it("a missing side (no line yet) never fabricates OVER/UNDER or the literal string null", () => {
    const pool = [
      kRow({ pitcher: "No Line Guy", pitcherId: 2, kLine: undefined, projectedKs: undefined, oddsOver: undefined, oddsUnder: undefined, direction: undefined, projectionEdge: undefined }),
      kRow({ pitcher: "Second", pitcherId: 3, gameId: 999 }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const svg = renderCanonicalSocialSvg({ plan });
    assert.match(svg, /NO LINE/);
    assert.doesNotMatch(svg, /\bnull\b/);
  });
});

describe("renderCanonicalSocialSvg -- HR", () => {
  for (const count of [2, 3, 4, 5]) {
    it(`renders exactly ${count} HR row(s)`, () => {
      const plan = hrPlan(count);
      const svg = renderCanonicalSocialSvg({ plan });
      assert.equal(extractCanonicalRenderedRows(svg).length, count);
    });
  }

  it("renders rows in exact plan order, never re-sorted", () => {
    const plan = hrPlan(4);
    const svg = renderCanonicalSocialSvg({ plan });
    const rendered = extractCanonicalRenderedRows(svg);
    assert.deepEqual(rendered.map((r) => r.playerName), plan.rows.map((r) => r.playerName));
  });

  it("renders HR-specific fields: HR score, odds, and the three chosen supporting metrics", () => {
    const plan = hrPlan(2, (i) => ({ hrScore: 82.5 + i, hrOddsYes: "+250", barrelRate: 19.2, hardHitRate: 51.3, last7HR: 4 }));
    const svg = renderCanonicalSocialSvg({ plan });
    assert.match(svg, /82\.5/);
    assert.match(svg, /\+250/);
    assert.match(svg, /19\.2%/);
    assert.match(svg, /51\.3%/);
    assert.match(svg, />4</);
  });

  it("renders the canonical headline, never edition wording", () => {
    const plan = hrPlan(2);
    const svg = renderCanonicalSocialSvg({ plan });
    assert.match(svg, /MLB HOME RUN TARGETS/);
    for (const banned of [/Morning/i, /Confirmed/i, /Updated/i, /Added Player/i, /New Player/i, /Edition/i]) {
      assert.doesNotMatch(svg, banned);
    }
  });

  it("a missing nullable secondary metric renders N/A rather than breaking", () => {
    const plan = hrPlan(2, (i) => (i === 0 ? { barrelRate: undefined, hardHitRate: undefined, last7HR: undefined } : {}));
    assert.doesNotThrow(() => renderCanonicalSocialSvg({ plan }));
    const svg = renderCanonicalSocialSvg({ plan });
    assert.match(svg, />N\/A</);
  });

  it("HR doubleheader legs render distinct gameLabels", () => {
    const dhPool = [
      hrRow({ player: "Twice Hitter", playerId: 88, team: "NYY", opponent: "BOS", gameId: 701, gameNumber: 1, isDoubleheader: true }),
      hrRow({ player: "Twice Hitter", playerId: 88, team: "NYY", opponent: "BOS", gameId: 702, gameNumber: 2, isDoubleheader: true }),
    ];
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: "2026-08-18", candidatePool: dhPool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const svg = renderCanonicalSocialSvg({ plan });
    const rendered = extractCanonicalRenderedRows(svg);
    assert.match(rendered[0].gameLabel, /G1/);
    assert.match(rendered[1].gameLabel, /G2/);
  });
});

describe("renderCanonicalSocialSvg -- contract guards", () => {
  it("throws for an unsupported product", () => {
    assert.throws(() => renderCanonicalSocialSvg({ plan: { product: "unknown", rows: [] } }), /unsupported plan\.product/);
  });

  it("throws for zero rows", () => {
    const plan = { product: "mlb-k-props", slateDate: "2026-08-18", rows: [] };
    assert.throws(() => renderCanonicalSocialSvg({ plan }), /at least 1 row/);
  });

  it("throws for more than five rows", () => {
    const pool = Array.from({ length: 6 }, (_, i) => hrRow({ player: `B${i}`, playerId: i, gameId: 900 + i }));
    // composeSocialPostPlan itself caps at 5 -- construct the over-limit plan directly to prove the renderer's own guard.
    const plan = { product: "mlb-hr-props", slateDate: "2026-08-18", rows: pool.map((r) => ({ playerId: r.playerId, playerName: r.player, team: r.team, gameId: r.gameId, gameLabel: `${r.team} vs ${r.opponent}`, content: { kind: "hr", hrScore: r.hrScore, odds: r.hrOddsYes, barrelRate: r.barrelRate, hardHitRate: r.hardHitRate, last7HR: r.last7HR } })) };
    assert.throws(() => renderCanonicalSocialSvg({ plan }), /at most 5 rows/);
  });
});
