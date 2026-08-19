/**
 * mlb-x-image-bundle.test.mjs
 * Run via: node --test scripts/lib/mlb-x-image-bundle.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  acquireRenderLock,
  BundleRejection,
  bundlePaths,
  ensureImageBundle,
  ImageKind,
  imageKindForMarket,
  IMAGE_METADATA_VERSION,
  publishImageBundle,
  toReadinessImageInput,
  validateImageBundle,
} from "./mlb-x-image-bundle.mjs";
import { buildSocialPostPlan } from "./mlb-social-post-plan.mjs";

const SLATE = "2026-07-21";

/**
 * Cleans up after both sync and async callbacks. A plain try/finally would
 * delete the directory the instant an async callback returned its promise,
 * before the work inside it had run.
 */
function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-x-image-bundle-"));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  let result;
  try {
    result = fn(dir);
  } catch (error) {
    cleanup();
    throw error;
  }
  if (result && typeof result.then === "function") {
    return result.then(
      (value) => { cleanup(); return value; },
      (error) => { cleanup(); throw error; },
    );
  }
  cleanup();
  return result;
}

/** Publishes a complete, valid bundle the way a real render would. */
function publish(dir, { kind = ImageKind.STRIKEOUT, slateDate = SLATE, width = 1200, height = 675, rowCount = 8, rowFingerprint = null } = {}) {
  const pngSource = path.join(dir, "render.png.tmp");
  const svgSource = path.join(dir, "render.svg.tmp");
  writeFileSync(pngSource, "PNGDATA");
  writeFileSync(svgSource, "<svg/>");
  return publishImageBundle({ kind, slateDate, directory: dir, pngSource, svgSource, width, height, rowCount, rowFingerprint });
}

describe("bundle validation", () => {
  it("reuses a valid current-slate bundle", () => {
    withTempDir((dir) => {
      publish(dir);
      const result = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir });
      assert.equal(result.valid, true);
      assert.equal(result.reason, null);
      assert.equal(result.metadata.slateDate, SLATE);
      assert.equal(result.metadata.version, IMAGE_METADATA_VERSION);
    });
  });

  it("lets the morning and confirmed editions reuse the same bundle", () => {
    withTempDir((dir) => {
      publish(dir);
      // The bundle is edition-agnostic: identity is market plus slate only.
      for (const _edition of ["morning", "confirmed"]) {
        assert.equal(validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).valid, true);
      }
    });
  });

  it("rejects a bare PNG with no sidecar", () => {
    withTempDir((dir) => {
      const { pngPath } = bundlePaths(ImageKind.STRIKEOUT, dir);
      writeFileSync(pngPath, "PNGDATA");
      const result = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir });
      assert.equal(result.valid, false);
      assert.equal(result.reason, BundleRejection.NO_METADATA);
    });
  });

  it("rejects a malformed sidecar", () => {
    withTempDir((dir) => {
      publish(dir);
      writeFileSync(bundlePaths(ImageKind.STRIKEOUT, dir).metadataPath, "{ not json");
      assert.equal(
        validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).reason,
        BundleRejection.UNPARSABLE_METADATA,
      );
    });
  });

  it("rejects an unsupported metadata version", () => {
    withTempDir((dir) => {
      const { paths } = publish(dir);
      const meta = JSON.parse(readFileSync(paths.metadataPath, "utf8"));
      writeFileSync(paths.metadataPath, JSON.stringify({ ...meta, version: 999 }));
      assert.equal(
        validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).reason,
        BundleRejection.UNSUPPORTED_VERSION,
      );
    });
  });

  it("rejects the wrong slate", () => {
    withTempDir((dir) => {
      publish(dir, { slateDate: "2026-07-20" });
      assert.equal(
        validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).reason,
        BundleRejection.SLATE_MISMATCH,
      );
    });
  });

  it("rejects the wrong kind, so HR and K metadata cannot be confused", () => {
    withTempDir((dir) => {
      const { paths } = publish(dir, { kind: ImageKind.STRIKEOUT });
      // Same market's files, but the sidecar claims to be the other market.
      const meta = JSON.parse(readFileSync(paths.metadataPath, "utf8"));
      writeFileSync(paths.metadataPath, JSON.stringify({ ...meta, kind: ImageKind.HOME_RUN }));
      assert.equal(
        validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).reason,
        BundleRejection.KIND_MISMATCH,
      );
    });
  });

  it("keeps HR and K bundles on separate paths", () => {
    withTempDir((dir) => {
      publish(dir, { kind: ImageKind.STRIKEOUT, rowCount: 8 });
      publish(dir, { kind: ImageKind.HOME_RUN, rowCount: 5 });
      const k = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir });
      const hr = validateImageBundle({ kind: ImageKind.HOME_RUN, slateDate: SLATE, directory: dir });
      assert.equal(k.metadata.kind, ImageKind.STRIKEOUT);
      assert.equal(hr.metadata.kind, ImageKind.HOME_RUN);
      assert.notEqual(k.paths.pngPath, hr.paths.pngPath);
      assert.notEqual(k.metadata.rowCount, hr.metadata.rowCount);
    });
  });

  it("invalidates a bundle whose referenced PNG or SVG is gone", () => {
    withTempDir((dir) => {
      const { paths } = publish(dir);
      unlinkSync(paths.pngPath);
      assert.equal(validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).reason, BundleRejection.MISSING_PNG);
    });
    withTempDir((dir) => {
      const { paths } = publish(dir);
      unlinkSync(paths.svgPath);
      assert.equal(validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).reason, BundleRejection.MISSING_SVG);
    });
  });

  it("invalidates non-positive dimensions and a zero row count", () => {
    for (const [overrides, reason] of [
      [{ width: 0 }, BundleRejection.BAD_DIMENSIONS],
      [{ height: -5 }, BundleRejection.BAD_DIMENSIONS],
      [{ rowCount: 0 }, BundleRejection.BAD_ROW_COUNT],
    ]) {
      withTempDir((dir) => {
        publish(dir, overrides);
        assert.equal(validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).reason, reason);
      });
    }
  });

  it("does not treat modification time as proof of slate identity", () => {
    withTempDir((dir) => {
      // Yesterday's bundle, freshly touched. Still yesterday's slate.
      const { paths } = publish(dir, { slateDate: "2026-07-20" });
      writeFileSync(paths.pngPath, "TOUCHED-TODAY");
      assert.equal(validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).reason, BundleRejection.SLATE_MISMATCH);
    });
  });
});

describe("content-aware reuse (rowFingerprint)", () => {
  const FP_A = "fp-aaaa";
  const FP_B = "fp-bbbb";

  it("a caller that never checks rowFingerprint keeps the pre-Phase-4 behavior", () => {
    withTempDir((dir) => {
      publish(dir); // no rowFingerprint passed to publish -> stored as null
      const result = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir });
      assert.equal(result.valid, true);
    });
  });

  it("reuses when product/date/fingerprint all match", () => {
    withTempDir((dir) => {
      publish(dir, { rowFingerprint: FP_A });
      const result = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir, rowFingerprint: FP_A });
      assert.equal(result.valid, true);
    });
  });

  it("rejects reuse when the fingerprint differs, even with the same product/date", () => {
    withTempDir((dir) => {
      publish(dir, { rowFingerprint: FP_A });
      const result = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir, rowFingerprint: FP_B });
      assert.equal(result.valid, false);
      assert.equal(result.reason, BundleRejection.FINGERPRINT_MISMATCH);
    });
  });

  it("never cross-reuses across products even with a matching fingerprint", () => {
    withTempDir((dir) => {
      publish(dir, { kind: ImageKind.STRIKEOUT, rowFingerprint: FP_A });
      const result = validateImageBundle({ kind: ImageKind.HOME_RUN, slateDate: SLATE, directory: dir, rowFingerprint: FP_A });
      assert.equal(result.valid, false);
      assert.equal(result.reason, BundleRejection.NO_METADATA);
    });
  });

  it("never cross-reuses across slate dates even with a matching fingerprint", () => {
    withTempDir((dir) => {
      publish(dir, { slateDate: "2026-07-20", rowFingerprint: FP_A });
      const result = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir, rowFingerprint: FP_A });
      assert.equal(result.valid, false);
      assert.equal(result.reason, BundleRejection.SLATE_MISMATCH);
    });
  });

  it("fails closed on old metadata with no fingerprint on record, for a caller that checks", () => {
    withTempDir((dir) => {
      publish(dir); // legacy publish: rowFingerprint stored as null
      const result = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir, rowFingerprint: FP_A });
      assert.equal(result.valid, false);
      assert.equal(result.reason, BundleRejection.FINGERPRINT_MISMATCH);
    });
  });
});

/**
 * Bridges the CANONICAL `SocialPostPlan.rowFingerprint` (computed by
 * buildSocialPostPlan, not reimplemented here) to actual bundle reuse
 * decisions. These are the forward-looking equivalents of the fingerprint
 * unit tests already covered against real composed plans in
 * mlb-social-composition.test.mjs -- this describe block proves that once a
 * canonical plan's fingerprint changes, ensureImageBundle actually refuses
 * reuse and re-invokes the renderer (not just that the hash itself differs).
 */
describe("canonical SocialPostPlan fingerprint drives real reuse decisions", () => {
  const PLAN_SLATE = "2026-08-18";

  function kPlan({ gameLabel = "PHI vs ATL — G1", projectedKs = 6.1, generatedAt = "2026-08-18T09:00:00.000Z", sourceSummary = [] } = {}) {
    return buildSocialPostPlan({
      product: "mlb-k-props",
      slateDate: PLAN_SLATE,
      rows: [{
        playerId: 1001, playerName: "Zack Wheeler", team: "PHI", opponent: "ATL",
        gameId: 9001, gameNumber: null, gameStartTime: "2026-08-18T23:05:00Z", isDoubleheader: false,
        gameLabel,
        content: { kind: "k", side: "OVER", kLine: 6.5, projectedKs, edge: projectedKs - 6.5, odds: "-110" },
      }],
      title: "MLB STRIKEOUT PROPS",
      generatedAt,
      sourceSummary,
    });
  }

  function hrPlan({ hrScore = 82.4, generatedAt = "2026-08-18T09:00:00.000Z", sourceSummary = [] } = {}) {
    return buildSocialPostPlan({
      product: "mlb-hr-props",
      slateDate: PLAN_SLATE,
      rows: [{
        playerId: 2001, playerName: "Aaron Judge", team: "NYY", opponent: "BOS",
        gameId: 9003, gameNumber: null, gameStartTime: "2026-08-18T23:05:00Z", isDoubleheader: false,
        gameLabel: "NYY vs BOS",
        content: { kind: "hr", hrScore, odds: "+230", opposingPitcher: "Brayan Bello", barrelRate: 22.4, hardHitRate: 58.1, last7HR: 4, last30HR: 11 },
      }],
      title: "MLB HOME RUN TARGETS",
      generatedAt,
      sourceSummary,
    });
  }

  function publishFromPlan(dir, plan) {
    const pngSource = path.join(dir, "canon-render.png.tmp");
    const svgSource = path.join(dir, "canon-render.svg.tmp");
    writeFileSync(pngSource, "PNGDATA");
    writeFileSync(svgSource, "<svg/>");
    return publishImageBundle({
      kind: ImageKind.STRIKEOUT, slateDate: plan.slateDate, directory: dir,
      pngSource, svgSource, width: 1200, height: 675, rowCount: plan.rows.length,
      rowFingerprint: plan.rowFingerprint,
    });
  }

  it("gameLabel G1 -> G2: fingerprint changes, and the existing bundle is rejected + rerendered", async () => {
    await withTempDir(async (dir) => {
      const planG1 = kPlan({ gameLabel: "PHI vs ATL — G1" });
      const planG2 = kPlan({ gameLabel: "PHI vs ATL — G2" });
      assert.notEqual(planG1.rowFingerprint, planG2.rowFingerprint, "canonical fingerprint must change on gameLabel");

      publishFromPlan(dir, planG1);
      // Same product/date, new (G2) fingerprint: must NOT reuse G1's bundle.
      const stale = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: planG2.slateDate, directory: dir, rowFingerprint: planG2.rowFingerprint });
      assert.equal(stale.valid, false);
      assert.equal(stale.reason, BundleRejection.FINGERPRINT_MISMATCH);

      let renders = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: planG2.slateDate, directory: dir, rowFingerprint: planG2.rowFingerprint,
        render: async () => { renders += 1; publishFromPlan(dir, planG2); },
      });
      assert.equal(renders, 1, "the renderer must be invoked for the changed content");
      assert.equal(result.source, "rendered");
      assert.equal(result.metadata.rowFingerprint, planG2.rowFingerprint);
    });
  });

  it("projection change (6.1 -> 6.4): fingerprint changes, and the existing bundle is rejected + rerendered", async () => {
    await withTempDir(async (dir) => {
      const planBefore = kPlan({ projectedKs: 6.1 });
      const planAfter = kPlan({ projectedKs: 6.4 });
      assert.notEqual(planBefore.rowFingerprint, planAfter.rowFingerprint, "canonical fingerprint must change on projectedKs");

      publishFromPlan(dir, planBefore);
      let renders = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: planAfter.slateDate, directory: dir, rowFingerprint: planAfter.rowFingerprint,
        render: async () => { renders += 1; publishFromPlan(dir, planAfter); },
      });
      assert.equal(renders, 1);
      assert.equal(result.source, "rendered");
    });
  });

  it("HR Score change (82.4 -> 84.1): fingerprint changes, and the existing bundle is rejected + rerendered", async () => {
    await withTempDir(async (dir) => {
      const planBefore = hrPlan({ hrScore: 82.4 });
      const planAfter = hrPlan({ hrScore: 84.1 });
      assert.notEqual(planBefore.rowFingerprint, planAfter.rowFingerprint, "canonical fingerprint must change on hrScore");

      const pngSource = path.join(dir, "hr-render.png.tmp");
      const svgSource = path.join(dir, "hr-render.svg.tmp");
      writeFileSync(pngSource, "PNGDATA");
      writeFileSync(svgSource, "<svg/>");
      publishImageBundle({
        kind: ImageKind.HOME_RUN, slateDate: planBefore.slateDate, directory: dir,
        pngSource, svgSource, width: 1200, height: 675, rowCount: 1, rowFingerprint: planBefore.rowFingerprint,
      });

      let renders = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.HOME_RUN, slateDate: planAfter.slateDate, directory: dir, rowFingerprint: planAfter.rowFingerprint,
        render: async () => {
          renders += 1;
          const p2 = path.join(dir, "hr-render2.png.tmp");
          const s2 = path.join(dir, "hr-render2.svg.tmp");
          writeFileSync(p2, "PNGDATA2");
          writeFileSync(s2, "<svg/>2");
          publishImageBundle({
            kind: ImageKind.HOME_RUN, slateDate: planAfter.slateDate, directory: dir,
            pngSource: p2, svgSource: s2, width: 1200, height: 675, rowCount: 1, rowFingerprint: planAfter.rowFingerprint,
          });
        },
      });
      assert.equal(renders, 1);
      assert.equal(result.source, "rendered");
    });
  });

  it("generatedAt-only change: fingerprint unchanged, bundle stays reusable, renderer NOT invoked", async () => {
    await withTempDir(async (dir) => {
      const planA = kPlan({ generatedAt: "2026-08-18T09:00:00.000Z" });
      const planLater = kPlan({ generatedAt: "2026-08-18T15:30:00.000Z" });
      assert.equal(planA.rowFingerprint, planLater.rowFingerprint, "generatedAt must not affect the canonical fingerprint");

      publishFromPlan(dir, planA);
      let renders = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: planLater.slateDate, directory: dir, rowFingerprint: planLater.rowFingerprint,
        render: async () => { renders += 1; },
      });
      assert.equal(renders, 0, "a generatedAt-only change must not trigger a rerender");
      assert.equal(result.source, "reused");
    });
  });

  it("readiness/sourceSummary-only change: fingerprint unchanged, bundle stays reusable, renderer NOT invoked", async () => {
    await withTempDir(async (dir) => {
      const planA = kPlan({ sourceSummary: ["morning snapshot"] });
      const planLater = kPlan({ sourceSummary: ["confirmed snapshot", "second source"] });
      assert.equal(planA.rowFingerprint, planLater.rowFingerprint, "readiness/sourceSummary must not affect the canonical fingerprint");
      assert.notDeepEqual(planA.readiness.sourceSummary, planLater.readiness.sourceSummary);

      publishFromPlan(dir, planA);
      let renders = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: planLater.slateDate, directory: dir, rowFingerprint: planLater.rowFingerprint,
        render: async () => { renders += 1; },
      });
      assert.equal(renders, 0, "a readiness-only change must not trigger a rerender");
      assert.equal(result.source, "reused");
    });
  });

  it("identical product + slateDate + rowFingerprint: bundle remains reusable across two independently-built plan instances", async () => {
    await withTempDir(async (dir) => {
      const planA = kPlan();
      const planB = kPlan(); // separately constructed, same visible content
      assert.equal(planA.rowFingerprint, planB.rowFingerprint);
      assert.equal(planA.product, planB.product);
      assert.equal(planA.slateDate, planB.slateDate);

      publishFromPlan(dir, planA);
      let renders = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: planB.slateDate, directory: dir, rowFingerprint: planB.rowFingerprint,
        render: async () => { renders += 1; },
      });
      assert.equal(renders, 0);
      assert.equal(result.source, "reused");
      assert.equal(result.metadata.rowFingerprint, planA.rowFingerprint);
    });
  });
});

describe("atomic publication", () => {
  it("leaves no partial bundle visible: the sidecar lands last", () => {
    withTempDir((dir) => {
      const paths = bundlePaths(ImageKind.STRIKEOUT, dir);
      // Files present but no sidecar yet -- mid-publication from a reader's view.
      writeFileSync(paths.pngPath, "PNGDATA");
      writeFileSync(paths.svgPath, "<svg/>");
      assert.equal(validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).valid, false);
      // Once the sidecar lands the bundle becomes valid in one step.
      publish(dir);
      assert.equal(validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }).valid, true);
      assert.equal(existsSync(`${paths.metadataPath}.tmp`), false, "no temp file left behind");
    });
  });

  it("removes a stale sidecar before republishing so it cannot describe old files", () => {
    withTempDir((dir) => {
      publish(dir, { slateDate: "2026-07-20", rowCount: 3 });
      publish(dir, { slateDate: SLATE, rowCount: 9 });
      const result = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir });
      assert.equal(result.valid, true);
      assert.equal(result.metadata.rowCount, 9);
    });
  });
});

describe("ensureImageBundle", () => {
  const noSleep = async () => {};

  it("reuses a valid bundle without rendering", async () => {
    await withTempDir(async (dir) => {
      publish(dir);
      let rendered = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir,
        render: async () => { rendered += 1; },
      });
      assert.equal(result.valid, true);
      assert.equal(result.source, "reused");
      assert.equal(rendered, 0);
    });
  });

  it("regenerates when the sidecar is missing, malformed, or the wrong slate", async () => {
    for (const setup of [
      (dir) => { writeFileSync(bundlePaths(ImageKind.STRIKEOUT, dir).pngPath, "PNGDATA"); },
      (dir) => { publish(dir); writeFileSync(bundlePaths(ImageKind.STRIKEOUT, dir).metadataPath, "{ bad"); },
      (dir) => { publish(dir, { slateDate: "2026-07-20" }); },
    ]) {
      await withTempDir(async (dir) => {
        setup(dir);
        let rendered = 0;
        const result = await ensureImageBundle({
          kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir,
          render: async () => { rendered += 1; publish(dir); },
        });
        assert.equal(rendered, 1);
        assert.equal(result.valid, true);
        assert.equal(result.source, "rendered");
      });
    }
  });

  it("renders immediately rather than waiting when no external render is expected", async () => {
    await withTempDir(async (dir) => {
      let slept = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir,
        render: async () => publish(dir),
        expectExternalRender: false,
        sleep: async () => { slept += 1; },
      });
      assert.equal(result.source, "rendered");
      assert.equal(slept, 0, "must not burn window time waiting for nobody");
    });
  });

  it("polls to success when an external render lands", async () => {
    await withTempDir(async (dir) => {
      let ticks = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir,
        expectExternalRender: true,
        sleep: async () => { ticks += 1; if (ticks === 3) publish(dir); },
        clock: () => 0,
      });
      assert.equal(result.valid, true);
      assert.equal(result.source, "polled");
      assert.equal(ticks, 3);
    });
  });

  it("times out after the bounded poll and reports why", async () => {
    await withTempDir(async (dir) => {
      let t = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir,
        expectExternalRender: true,
        pollTimeoutMs: 10 * 60_000, pollIntervalMs: 45_000,
        sleep: noSleep,
        clock: () => { const v = t; t += 45_000; return v; },
      });
      assert.equal(result.valid, false);
      assert.equal(result.source, "timeout");
      assert.equal(result.reason, BundleRejection.NO_METADATA);
      // Maps onto IMAGE_FAILED for the readiness contract.
      assert.equal(toReadinessImageInput(result).exists, false);
    });
  });

  it("reports unavailable when there is no render path and no bundle", async () => {
    await withTempDir(async (dir) => {
      const result = await ensureImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir, render: null });
      assert.equal(result.valid, false);
      assert.equal(result.source, "unavailable");
    });
  });

  it("reuses without rendering when the fingerprint matches", async () => {
    await withTempDir(async (dir) => {
      publish(dir, { rowFingerprint: "fp-1" });
      let rendered = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir, rowFingerprint: "fp-1",
        render: async () => { rendered += 1; },
      });
      assert.equal(result.valid, true);
      assert.equal(result.source, "reused");
      assert.equal(rendered, 0);
    });
  });

  it("re-renders and republishes when the fingerprint differs, even for the same product/date", async () => {
    await withTempDir(async (dir) => {
      publish(dir, { rowFingerprint: "fp-old", rowCount: 3 });
      let rendered = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir, rowFingerprint: "fp-new",
        render: async () => { rendered += 1; publish(dir, { rowFingerprint: "fp-new", rowCount: 9 }); },
      });
      assert.equal(rendered, 1);
      assert.equal(result.valid, true);
      assert.equal(result.source, "rendered");
      assert.equal(result.metadata.rowFingerprint, "fp-new");
      assert.equal(result.metadata.rowCount, 9);
    });
  });

  it("forces a fresh render when old metadata has no fingerprint on record", async () => {
    await withTempDir(async (dir) => {
      publish(dir); // legacy bundle, no fingerprint
      let rendered = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir, rowFingerprint: "fp-new",
        render: async () => { rendered += 1; publish(dir, { rowFingerprint: "fp-new" }); },
      });
      assert.equal(rendered, 1, "old fingerprint-less metadata must never be grandfathered in as reusable");
      assert.equal(result.source, "rendered");
    });
  });
});

describe("per-market render concurrency", () => {
  it("lets HR and K render at the same time", () => {
    withTempDir((dir) => {
      const k = acquireRenderLock(ImageKind.STRIKEOUT, dir);
      const hr = acquireRenderLock(ImageKind.HOME_RUN, dir);
      assert.equal(k.acquired, true);
      assert.equal(hr.acquired, true);
      k.release(); hr.release();
    });
  });

  it("prevents a second same-market render from racing the first", () => {
    withTempDir((dir) => {
      const first = acquireRenderLock(ImageKind.STRIKEOUT, dir);
      const second = acquireRenderLock(ImageKind.STRIKEOUT, dir);
      assert.equal(first.acquired, true);
      assert.equal(second.acquired, false);
      first.release();
      const third = acquireRenderLock(ImageKind.STRIKEOUT, dir);
      assert.equal(third.acquired, true);
      third.release();
    });
  });

  it("a blocked same-market attempt waits for the bundle instead of rendering", async () => {
    await withTempDir(async (dir) => {
      const held = acquireRenderLock(ImageKind.STRIKEOUT, dir);
      assert.equal(held.acquired, true);
      let rendered = 0;
      let ticks = 0;
      const result = await ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir,
        render: async () => { rendered += 1; },
        sleep: async () => { ticks += 1; if (ticks === 2) publish(dir); },
        clock: () => 0,
      });
      // It must not render into the paths the lock holder owns.
      assert.equal(rendered, 0);
      assert.equal(result.valid, true);
      assert.equal(result.source, "polled");
      held.release();
    });
  });

  it("concurrent same-market attempts cannot publish mismatched metadata", async () => {
    await withTempDir(async (dir) => {
      // Two attempts race; the loser waits and reuses. Exactly one sidecar
      // exists and it agrees with the PNG it names.
      const winner = ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir,
        render: async () => publish(dir, { rowCount: 7 }),
      });
      const loser = ensureImageBundle({
        kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir,
        render: async () => publish(dir, { rowCount: 2 }),
      });
      const [a, b] = await Promise.all([winner, loser]);
      assert.equal(a.valid, true);
      assert.equal(b.valid, true);
      assert.equal(a.metadata.rowCount, b.metadata.rowCount, "both observers see one consistent bundle");
      const onDisk = validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir });
      assert.equal(onDisk.valid, true);
      assert.equal(onDisk.metadata.rowCount, a.metadata.rowCount);
    });
  });

  it("breaks a stale lock so a crashed job cannot wedge a market", () => {
    withTempDir((dir) => {
      const stuck = acquireRenderLock(ImageKind.STRIKEOUT, dir, { now: 0 });
      assert.equal(stuck.acquired, true);
      const later = acquireRenderLock(ImageKind.STRIKEOUT, dir, { now: Date.now() + 60 * 60_000, staleMs: 60_000 });
      assert.equal(later.acquired, true);
      later.release();
    });
  });
});

describe("market mapping and readiness hand-off", () => {
  it("maps markets to kinds and rejects anything else", () => {
    assert.equal(imageKindForMarket("k"), ImageKind.STRIKEOUT);
    assert.equal(imageKindForMarket("hr"), ImageKind.HOME_RUN);
    assert.throws(() => imageKindForMarket("nfl"), /Unknown market/);
  });

  it("hands the readiness contract a traceable image input", () => {
    withTempDir((dir) => {
      publish(dir);
      const bundle = { ...validateImageBundle({ kind: ImageKind.STRIKEOUT, slateDate: SLATE, directory: dir }), source: "reused" };
      const input = toReadinessImageInput(bundle);
      assert.equal(input.exists, true);
      assert.equal(input.slateDate, SLATE);
      assert.ok(input.width > 0 && input.height > 0);
      assert.ok(input.path.endsWith(".png"));
    });
  });
});
