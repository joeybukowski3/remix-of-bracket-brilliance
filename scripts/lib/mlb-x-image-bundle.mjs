/**
 * Atomic image bundle for MLB X social graphics.
 *
 * The renderer writes to fixed, undated paths (artifacts/mlb-strikeout-props-x.png
 * and the HR equivalent), so a leftover PNG from a previous slate is
 * indistinguishable from today's by filename, and modification time proves
 * nothing about which slate a graphic depicts. A bare PNG is therefore
 * untrusted: slate identity comes only from an explicit JSON sidecar published
 * alongside it.
 *
 * Publication is atomic in the sense that matters to a reader: PNG and SVG are
 * renamed into place first and the sidecar last, so observing a sidecar implies
 * the files it references are already final. A reader can never see metadata
 * describing a half-written PNG.
 *
 * The per-market render lock prevents two same-market jobs corrupting the same
 * fixed output paths. It is NOT a publication barrier -- the durable edition
 * receipt remains the only thing preventing a duplicate post.
 */
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const IMAGE_METADATA_VERSION = 1;

export const ImageKind = Object.freeze({
  STRIKEOUT: "mlb-strikeout-props",
  HOME_RUN: "mlb-hr-props",
});

/** market ("k" | "hr") -> bundle kind. */
export function imageKindForMarket(market) {
  if (market === "k") return ImageKind.STRIKEOUT;
  if (market === "hr") return ImageKind.HOME_RUN;
  throw new Error(`Unknown market "${market}" (expected "k" or "hr").`);
}

/** Reason a bundle was rejected. Surfaced so a regeneration is explainable. */
export const BundleRejection = Object.freeze({
  NO_METADATA: "NO_METADATA",
  UNPARSABLE_METADATA: "UNPARSABLE_METADATA",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
  KIND_MISMATCH: "KIND_MISMATCH",
  SLATE_MISMATCH: "SLATE_MISMATCH",
  BAD_DIMENSIONS: "BAD_DIMENSIONS",
  BAD_ROW_COUNT: "BAD_ROW_COUNT",
  MISSING_PNG: "MISSING_PNG",
  MISSING_SVG: "MISSING_SVG",
});

export function bundlePaths(kind, directory) {
  const base = kind === ImageKind.STRIKEOUT ? "mlb-strikeout-props-x" : "mlb-hr-props-x";
  return {
    pngPath: path.join(directory, `${base}.png`),
    svgPath: path.join(directory, `${base}.svg`),
    metadataPath: path.join(directory, `${base}.meta.json`),
    lockPath: path.join(directory, `${base}.render.lock`),
  };
}

/**
 * Validates a published bundle for one market and slate.
 *
 * Deliberately ignores file mtimes: a graphic rendered yesterday and touched
 * today is still yesterday's graphic. Identity comes from the sidecar alone.
 */
export function validateImageBundle({ kind, slateDate, directory }) {
  const paths = bundlePaths(kind, directory);
  const reject = (reason) => ({ valid: false, reason, metadata: null, paths });

  if (!existsSync(paths.metadataPath)) return reject(BundleRejection.NO_METADATA);

  let metadata;
  try {
    metadata = JSON.parse(readFileSync(paths.metadataPath, "utf8"));
  } catch {
    return reject(BundleRejection.UNPARSABLE_METADATA);
  }
  if (!metadata || typeof metadata !== "object") return reject(BundleRejection.UNPARSABLE_METADATA);
  if (metadata.version !== IMAGE_METADATA_VERSION) return reject(BundleRejection.UNSUPPORTED_VERSION);
  if (metadata.kind !== kind) return reject(BundleRejection.KIND_MISMATCH);
  if (metadata.slateDate !== slateDate) return reject(BundleRejection.SLATE_MISMATCH);

  const width = Number(metadata.width);
  const height = Number(metadata.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return reject(BundleRejection.BAD_DIMENSIONS);
  }
  const rowCount = Number(metadata.rowCount);
  if (!Number.isFinite(rowCount) || rowCount <= 0) return reject(BundleRejection.BAD_ROW_COUNT);

  // The sidecar's own references must resolve -- metadata describing a file
  // that is not there is not a usable bundle.
  const png = metadata.imagePath ?? paths.pngPath;
  const svg = metadata.svgPath ?? paths.svgPath;
  if (!existsSync(png) || statSync(png).size <= 0) return reject(BundleRejection.MISSING_PNG);
  if (!existsSync(svg)) return reject(BundleRejection.MISSING_SVG);

  return { valid: true, reason: null, metadata, paths };
}

/**
 * Publishes a bundle atomically.
 *
 * Order is load-bearing: PNG and SVG are moved into place before the sidecar,
 * and the sidecar is the last rename. Since validateImageBundle requires the
 * sidecar, a bundle is invisible until every file it names is final.
 */
export function publishImageBundle({
  kind, slateDate, directory, pngSource, svgSource,
  width, height, rowCount, now = new Date().toISOString(),
}) {
  const paths = bundlePaths(kind, directory);
  mkdirSync(directory, { recursive: true });

  // A stale sidecar must not survive a failed republication and go on
  // describing files from a previous slate.
  if (existsSync(paths.metadataPath)) unlinkSync(paths.metadataPath);

  if (path.resolve(pngSource) !== path.resolve(paths.pngPath)) renameSync(pngSource, paths.pngPath);
  if (path.resolve(svgSource) !== path.resolve(paths.svgPath)) renameSync(svgSource, paths.svgPath);

  const metadata = {
    version: IMAGE_METADATA_VERSION,
    kind,
    slateDate,
    generatedAt: now,
    width,
    height,
    rowCount,
    imagePath: paths.pngPath,
    svgPath: paths.svgPath,
  };
  const tempMetadata = `${paths.metadataPath}.tmp`;
  writeFileSync(tempMetadata, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  renameSync(tempMetadata, paths.metadataPath); // last: makes the bundle visible
  return { metadata, paths };
}

const DEFAULT_LOCK_STALE_MS = 15 * 60_000;

/** Exclusive per-market render lock. Never a publication barrier. */
export function acquireRenderLock(kind, directory, { now = Date.now(), staleMs = DEFAULT_LOCK_STALE_MS } = {}) {
  const { lockPath } = bundlePaths(kind, directory);
  mkdirSync(directory, { recursive: true });
  try {
    const fd = openSync(lockPath, "wx"); // fails if it already exists
    writeFileSync(lockPath, JSON.stringify({ kind, acquiredAt: new Date(now).toISOString(), pid: process.pid }));
    closeSync(fd);
    return { acquired: true, lockPath, release: () => rmSync(lockPath, { force: true }) };
  } catch {
    // A crashed job must not wedge the market forever.
    try {
      if (existsSync(lockPath) && now - statSync(lockPath).mtimeMs > staleMs) {
        rmSync(lockPath, { force: true });
        return acquireRenderLock(kind, directory, { now, staleMs });
      }
    } catch { /* fall through to not-acquired */ }
    return { acquired: false, lockPath, release: () => {} };
  }
}

export const POLL_TIMEOUT_MS = 10 * 60_000;
export const POLL_INTERVAL_MS = 45_000;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns a validated bundle for this market and slate, rendering if needed.
 *
 * Waiting is only ever justified when another job is known to be producing the
 * same bundle. With no such expectation this renders immediately rather than
 * burning ten minutes of a window that may only get one attempt.
 */
export async function ensureImageBundle({
  kind, slateDate, directory,
  render = null,
  expectExternalRender = false,
  pollTimeoutMs = POLL_TIMEOUT_MS,
  pollIntervalMs = POLL_INTERVAL_MS,
  sleep = defaultSleep,
  clock = () => Date.now(),
}) {
  const first = validateImageBundle({ kind, slateDate, directory });
  if (first.valid) return { ...first, source: "reused", rejectedReason: null };

  if (!expectExternalRender && typeof render === "function") {
    const lock = acquireRenderLock(kind, directory, { now: clock() });
    try {
      // Another same-market job took the lock between our check and now; it is
      // rendering the identical bundle, so waiting is justified after all.
      if (!lock.acquired) {
        return pollForBundle({ kind, slateDate, directory, pollTimeoutMs, pollIntervalMs, sleep, clock, rejectedReason: first.reason });
      }
      // Re-check under the lock: a concurrent job may have finished while we
      // were acquiring, which would make re-rendering pure waste.
      const underLock = validateImageBundle({ kind, slateDate, directory });
      if (underLock.valid) return { ...underLock, source: "reused", rejectedReason: first.reason };

      await render({ kind, slateDate, directory, paths: bundlePaths(kind, directory) });
      const published = validateImageBundle({ kind, slateDate, directory });
      return published.valid
        ? { ...published, source: "rendered", rejectedReason: first.reason }
        : { ...published, source: "render-invalid", rejectedReason: published.reason };
    } finally {
      lock.release();
    }
  }

  if (expectExternalRender) {
    return pollForBundle({ kind, slateDate, directory, pollTimeoutMs, pollIntervalMs, sleep, clock, rejectedReason: first.reason });
  }

  return { ...first, source: "unavailable", rejectedReason: first.reason };
}

async function pollForBundle({ kind, slateDate, directory, pollTimeoutMs, pollIntervalMs, sleep, clock, rejectedReason }) {
  const deadline = clock() + pollTimeoutMs;
  for (;;) {
    const result = validateImageBundle({ kind, slateDate, directory });
    if (result.valid) return { ...result, source: "polled", rejectedReason };
    if (clock() >= deadline) {
      return { ...result, source: "timeout", rejectedReason: result.reason };
    }
    await sleep(pollIntervalMs);
  }
}

/** Shape resolveEditionReadiness expects for its `image` input. */
export function toReadinessImageInput(bundle) {
  if (!bundle?.valid) return { exists: false, slateDate: null, generatedAt: null, width: 0, height: 0, source: bundle?.source ?? null, path: null };
  const m = bundle.metadata;
  return {
    exists: true,
    slateDate: m.slateDate,
    generatedAt: m.generatedAt,
    width: m.width,
    height: m.height,
    source: bundle.source,
    path: m.imagePath,
  };
}
