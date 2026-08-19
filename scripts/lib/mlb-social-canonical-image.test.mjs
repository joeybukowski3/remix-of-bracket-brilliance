/**
 * mlb-social-canonical-image.test.mjs
 * Run via: node --test scripts/lib/mlb-social-canonical-image.test.mjs
 *
 * Phase 5: proves ensureCanonicalImage passes plan.rowFingerprint DIRECTLY to
 * the image-bundle layer (no recomputation, no computeEditionRowFingerprint),
 * reuses a matching bundle without re-rendering, and re-renders when the
 * plan's rowFingerprint changes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureCanonicalImage } from "./mlb-social-canonical-image.mjs";
import { computeRowFingerprint } from "./mlb-social-post-plan.mjs";
import { ImageKind, validateImageBundle } from "./mlb-x-image-bundle.mjs";

const SLATE = "2026-08-19";

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-social-canonical-image-"));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  return fn(dir).then(
    (value) => { cleanup(); return value; },
    (error) => { cleanup(); throw error; },
  );
}

function row(overrides = {}) {
  return {
    playerId: 1, playerName: "Alpha", team: "PHI", opponent: "ATL", gameId: 100, gameNumber: null,
    gameStartTime: null, isDoubleheader: false, gameLabel: "PHI vs ATL",
    content: { kind: "hr", hrScore: 80, odds: "+200", opposingPitcher: "X", barrelRate: 20, hardHitRate: 50, last7HR: 2, last30HR: 8 },
    ...overrides,
  };
}

function planWithRows(rows, product = "mlb-hr-props") {
  return {
    product, slateDate: SLATE, rows, rowFingerprint: computeRowFingerprint(rows),
    title: "MLB HOME RUN TARGETS", subtitle: null,
    readiness: { status: "PLAN_READY", generatedAt: "2026-08-19T00:00:00.000Z", sourceSummary: [] },
    receiptKey: `${product}:${SLATE}`,
  };
}

function fakeRenderGraphic({ svgPath, pngPath, plan }) {
  writeFileSync(pngPath, "PNGDATA");
  writeFileSync(svgPath, "<svg/>");
  return { pngPath, svgPath, renderedRows: plan.rows.map((r) => ({ gameId: r.gameId, playerId: r.playerId })) };
}

describe("ensureCanonicalImage", () => {
  it("passes plan.rowFingerprint directly to the image bundle (no recomputation)", async () => {
    await withTempDir(async (dir) => {
      const plan = planWithRows([row()]);
      let renders = 0;
      const bundle = await ensureCanonicalImage({ plan, directory: dir, renderGraphic: async (p) => { renders += 1; return fakeRenderGraphic(p); } });
      assert.equal(renders, 1);
      assert.equal(bundle.metadata.rowFingerprint, plan.rowFingerprint);

      const validated = validateImageBundle({ kind: ImageKind.HOME_RUN, slateDate: SLATE, directory: dir, rowFingerprint: plan.rowFingerprint });
      assert.equal(validated.valid, true);
    });
  });

  it("reuses an existing bundle without re-rendering when rowFingerprint matches", async () => {
    await withTempDir(async (dir) => {
      const plan = planWithRows([row()]);
      let renders = 0;
      const renderGraphic = async (p) => { renders += 1; return fakeRenderGraphic(p); };

      const first = await ensureCanonicalImage({ plan, directory: dir, renderGraphic });
      assert.equal(first.source, "rendered");
      assert.equal(renders, 1);

      const second = await ensureCanonicalImage({ plan, directory: dir, renderGraphic });
      assert.equal(second.source, "reused");
      assert.equal(renders, 1, "renderGraphic must not run again for identical rowFingerprint");
      assert.equal(second.renderedRows, null, "a reused bundle never fabricates renderedRows");
    });
  });

  it("re-renders when the plan's rowFingerprint changes", async () => {
    await withTempDir(async (dir) => {
      const planA = planWithRows([row()]);
      const planB = planWithRows([row({ content: { ...row().content, hrScore: 99 } })]);
      assert.notEqual(planA.rowFingerprint, planB.rowFingerprint);

      let renders = 0;
      const renderGraphic = async (p) => { renders += 1; return fakeRenderGraphic(p); };

      await ensureCanonicalImage({ plan: planA, directory: dir, renderGraphic });
      assert.equal(renders, 1);

      const second = await ensureCanonicalImage({ plan: planB, directory: dir, renderGraphic });
      assert.equal(renders, 2, "changed rowFingerprint must trigger a fresh render");
      assert.equal(second.source, "rendered");
    });
  });

  it("uses the HR image kind for mlb-hr-props and the strikeout kind for mlb-k-props", async () => {
    await withTempDir(async (dir) => {
      const hrPlan = planWithRows([row()], "mlb-hr-props");
      const kPlan = planWithRows([row({ content: { kind: "k", side: "OVER", kLine: 6.5, projectedKs: 7.1, edge: 0.6, odds: "-110" } })], "mlb-k-props");
      const renderGraphic = async (p) => fakeRenderGraphic(p);

      await ensureCanonicalImage({ plan: hrPlan, directory: dir, renderGraphic });
      await ensureCanonicalImage({ plan: kPlan, directory: dir, renderGraphic });

      assert.equal(validateImageBundle({ kind: ImageKind.HOME_RUN, slateDate: SLATE, directory: dir, rowFingerprint: hrPlan.rowFingerprint }).valid, true);
      assert.equal(validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir, rowFingerprint: kPlan.rowFingerprint }).valid, true);
    });
  });
});
