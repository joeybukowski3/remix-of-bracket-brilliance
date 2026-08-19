/**
 * mlb-social-plan-consistency.test.mjs
 * Run via: node --test scripts/lib/mlb-social-plan-consistency.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeSocialPostPlan, SOCIAL_PRODUCT } from "./mlb-social-composition.mjs";
import { buildHrCanonicalCaption, buildKCanonicalCaption } from "./mlb-social-canonical-caption.mjs";
import { extractCanonicalRenderedRows, renderCanonicalSocialSvg } from "./mlb-social-canonical-renderer.mjs";
import { assertGraphicCaptionConsistency, getPlanRowIdentities, planRowIdentity } from "./mlb-social-plan-consistency.mjs";

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

describe("graphic/caption consistency -- K", () => {
  it("proves the canonical graphic and canonical caption trace back to the exact same plan rows, in order", () => {
    const pool = Array.from({ length: 5 }, (_, i) => kRow({ pitcher: `Pitcher ${i + 1}`, pitcherId: i + 1, gameId: 200 + i }));
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });

    const svg = renderCanonicalSocialSvg({ plan });
    const graphicRows = extractCanonicalRenderedRows(svg);
    const graphicRowIdentities = graphicRows.map((r) => `${r.gameId}:${r.playerId}`);

    const captionResult = buildKCanonicalCaption(plan);
    const captionRowIdentities = captionResult.captionRows.map(planRowIdentity);

    assert.doesNotThrow(() => assertGraphicCaptionConsistency({ plan, graphicRowIdentities, captionRowIdentities }));
  });

  it("fails when the graphic silently drops a plan row", () => {
    const pool = Array.from({ length: 3 }, (_, i) => kRow({ pitcher: `Pitcher ${i + 1}`, pitcherId: i + 1, gameId: 200 + i }));
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const planIdentities = getPlanRowIdentities(plan);
    const truncatedGraphicIdentities = planIdentities.slice(0, 2); // simulate a renderer bug that dropped the last row

    assert.throws(() => assertGraphicCaptionConsistency({ plan, graphicRowIdentities: truncatedGraphicIdentities, captionRowIdentities: planIdentities }), /graphic:/);
  });

  it("fails when the caption reorders rows relative to the plan", () => {
    const pool = Array.from({ length: 3 }, (_, i) => kRow({ pitcher: `Pitcher ${i + 1}`, pitcherId: i + 1, gameId: 200 + i }));
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const planIdentities = getPlanRowIdentities(plan);
    const reorderedCaptionIdentities = [planIdentities[1], planIdentities[0], planIdentities[2]]; // simulate a caption bug that reordered rows

    assert.throws(() => assertGraphicCaptionConsistency({ plan, graphicRowIdentities: planIdentities, captionRowIdentities: reorderedCaptionIdentities }), /caption:/);
  });

  it("fails when a layer introduces an identity that is not in the plan at all", () => {
    const pool = Array.from({ length: 2 }, (_, i) => kRow({ pitcher: `Pitcher ${i + 1}`, pitcherId: i + 1, gameId: 200 + i }));
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.K, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const planIdentities = getPlanRowIdentities(plan);
    const fabricatedGraphicIdentities = [planIdentities[0], "999:fabricated"];

    assert.throws(() => assertGraphicCaptionConsistency({ plan, graphicRowIdentities: fabricatedGraphicIdentities, captionRowIdentities: planIdentities }));
  });
});

describe("graphic/caption consistency -- HR", () => {
  it("proves the canonical graphic and canonical caption trace back to the exact same plan rows, in order", () => {
    const pool = Array.from({ length: 5 }, (_, i) => hrRow({ player: `Batter ${i + 1}`, playerId: i + 1, gameId: 300 + i }));
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });

    const svg = renderCanonicalSocialSvg({ plan });
    const graphicRows = extractCanonicalRenderedRows(svg);
    const graphicRowIdentities = graphicRows.map((r) => `${r.gameId}:${r.playerId}`);

    const captionResult = buildHrCanonicalCaption(plan);
    const captionRowIdentities = captionResult.captionRows.map(planRowIdentity);

    assert.doesNotThrow(() => assertGraphicCaptionConsistency({ plan, graphicRowIdentities, captionRowIdentities }));
  });

  it("a caption that legitimately omits rows for budget reasons is still consistent (valid prefix, not a full match)", () => {
    const pool = Array.from({ length: 5 }, (_, i) => hrRow({ player: `Batter ${i + 1}`, playerId: i + 1, gameId: 300 + i }));
    const plan = composeSocialPostPlan({ product: SOCIAL_PRODUCT.HR, slateDate: "2026-08-18", candidatePool: pool, title: "t", generatedAt: "2026-08-18T12:00:00Z" });
    const planIdentities = getPlanRowIdentities(plan);
    const partialCaptionIdentities = planIdentities.slice(0, 3);
    assert.doesNotThrow(() => assertGraphicCaptionConsistency({ plan, graphicRowIdentities: planIdentities, captionRowIdentities: partialCaptionIdentities }));
  });
});
