/**
 * mlb-x-edition-image.test.mjs
 * Run via: node --test scripts/lib/mlb-x-edition-image.test.mjs
 *
 * Phase 4: proves ensureEditionImage threads rowFingerprint through to the
 * image-bundle layer so a same-day, same-market bundle whose content has
 * changed is never silently reused.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { computeEditionRowFingerprint, ensureEditionImage } from "./mlb-x-edition-image.mjs";
import { ImageKind, validateImageBundle } from "./mlb-x-image-bundle.mjs";

const SLATE = "2026-07-21";

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "mlb-x-edition-image-"));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  let result;
  try {
    result = fn(dir);
  } catch (error) {
    cleanup();
    throw error;
  }
  return result.then(
    (value) => { cleanup(); return value; },
    (error) => { cleanup(); throw error; },
  );
}

const ROWS_A = [{ player: "Alpha", gameId: 1, kLine: 6.5 }, { player: "Bravo", gameId: 2, kLine: 7.5 }];
const ROWS_B = [{ player: "Alpha", gameId: 1, kLine: 5.5 }, { player: "Bravo", gameId: 2, kLine: 7.5 }]; // Alpha's line changed

function fakeRenderGraphic({ svgPath, pngPath, rows }) {
  writeFileSync(pngPath, "PNGDATA");
  writeFileSync(svgPath, "<svg/>");
  return {
    pngPath,
    svgPath,
    renderedRows: rows,
    width: 1200,
    height: 675,
  };
}

describe("computeEditionRowFingerprint", () => {
  it("is deterministic for the same rows", () => {
    assert.equal(computeEditionRowFingerprint(ROWS_A), computeEditionRowFingerprint(ROWS_A));
  });

  it("changes when a visible field (e.g. kLine) changes", () => {
    assert.notEqual(computeEditionRowFingerprint(ROWS_A), computeEditionRowFingerprint(ROWS_B));
  });

  it("changes when row order changes", () => {
    assert.notEqual(computeEditionRowFingerprint(ROWS_A), computeEditionRowFingerprint([...ROWS_A].reverse()));
  });

  it("treats missing/non-array rows as empty", () => {
    assert.equal(computeEditionRowFingerprint(undefined), computeEditionRowFingerprint([]));
  });
});

describe("ensureEditionImage content-aware reuse", () => {
  it("reuses without re-invoking renderGraphic when the fingerprint matches", async () => {
    await withTempDir(async (dir) => {
      let renders = 0;
      const renderGraphic = async (params) => { renders += 1; return fakeRenderGraphic(params); };
      const fp = computeEditionRowFingerprint(ROWS_A);

      const first = await ensureEditionImage({ market: "k", slateDate: SLATE, rows: ROWS_A, directory: dir, renderGraphic, rowFingerprint: fp });
      assert.equal(first.source, "rendered");
      assert.equal(renders, 1);

      const second = await ensureEditionImage({ market: "k", slateDate: SLATE, rows: ROWS_A, directory: dir, renderGraphic, rowFingerprint: fp });
      assert.equal(second.source, "reused");
      assert.equal(renders, 1, "renderGraphic must not run again for identical content");
      assert.equal(second.renderedRows, null, "a reused bundle never fabricates renderedRows");
    });
  });

  it("re-renders when the rows change even though market/slate are identical", async () => {
    await withTempDir(async (dir) => {
      let renders = 0;
      const renderGraphic = async (params) => { renders += 1; return fakeRenderGraphic(params); };

      await ensureEditionImage({ market: "k", slateDate: SLATE, rows: ROWS_A, directory: dir, renderGraphic, rowFingerprint: computeEditionRowFingerprint(ROWS_A) });
      assert.equal(renders, 1);

      const second = await ensureEditionImage({ market: "k", slateDate: SLATE, rows: ROWS_B, directory: dir, renderGraphic, rowFingerprint: computeEditionRowFingerprint(ROWS_B) });
      assert.equal(renders, 2, "changed content must trigger a fresh render, not a stale reuse");
      assert.equal(second.source, "rendered");
      assert.deepEqual(second.renderedRows, ROWS_B);
    });
  });

  it("stores the fingerprint on the published sidecar", async () => {
    await withTempDir(async (dir) => {
      const fp = computeEditionRowFingerprint(ROWS_A);
      await ensureEditionImage({
        market: "hr", slateDate: SLATE, rows: ROWS_A, directory: dir,
        renderGraphic: async (params) => fakeRenderGraphic(params),
        rowFingerprint: fp,
      });
      const validated = validateImageBundle({ kind: ImageKind.HOME_RUN, slateDate: SLATE, directory: dir, rowFingerprint: fp });
      assert.equal(validated.valid, true);
      assert.equal(validated.metadata.rowFingerprint, fp);
    });
  });

  it("omitting rowFingerprint entirely preserves pre-Phase-4 kind+slateDate-only reuse", async () => {
    await withTempDir(async (dir) => {
      let renders = 0;
      const renderGraphic = async (params) => { renders += 1; return fakeRenderGraphic(params); };

      await ensureEditionImage({ market: "k", slateDate: SLATE, rows: ROWS_A, directory: dir, renderGraphic });
      assert.equal(renders, 1);

      // Different rows, no rowFingerprint passed by the caller at all: the
      // legacy behavior (identity is market+slate only) must still apply.
      const second = await ensureEditionImage({ market: "k", slateDate: SLATE, rows: ROWS_B, directory: dir, renderGraphic });
      assert.equal(renders, 1, "a caller that never opts into fingerprint checking keeps exactly the old behavior");
      assert.equal(second.source, "reused");
    });
  });
});
