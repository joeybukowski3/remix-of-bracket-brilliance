/**
 * mlb-k-backtest-cache.mjs
 *
 * Shared, resumable, hash-verified HTTP cache for the Projected K historical
 * backtest (analysis-only; the whole tree is gitignored).
 *
 * `createCachedFetch` returns a `fetchImpl` that is drop-in compatible with the
 * subset of the WHATWG `fetch` API that this repo's StatsAPI helpers use
 * (`response.ok`, `.status`, `.text()`, `.json()`). Responses are cached on disk
 * keyed by URL; a cached entry is re-served without a network call, so an
 * interrupted acquisition never restarts completed work.
 *
 * Modes:
 *   - "online"  : serve cache hits, fetch + store misses (default)
 *   - "offline" : serve cache hits, throw on a miss (dataset build / CI)
 *   - "refresh" : always fetch + overwrite
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function urlKey(url) {
  return createHash("sha1").update(String(url)).digest("hex");
}

function writeAtomic(filePath, bytes) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  writeFileSync(temporaryPath, bytes);
  try {
    renameSync(temporaryPath, filePath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CachedResponse {
  constructor({ status, text, fromCache }) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this._text = text;
    this.fromCache = Boolean(fromCache);
  }

  async text() {
    return this._text;
  }

  async json() {
    return JSON.parse(this._text);
  }
}

/**
 * @param {object} options
 * @param {string} options.cacheDir       root directory for cached bodies
 * @param {"online"|"offline"|"refresh"} [options.mode]
 * @param {(event: object) => void} [options.onEvent]  telemetry hook
 * @param {typeof fetch} [options.networkFetch]        real fetch (override for tests)
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxAttempts]
 * @param {number} [options.backoffMs]
 * @param {number} [options.minIntervalMs]  polite spacing between real requests
 */
export function createCachedFetch({
  cacheDir,
  mode = "online",
  onEvent = () => {},
  networkFetch = globalThis.fetch,
  timeoutMs = 15_000,
  maxAttempts = 4,
  backoffMs = 400,
  minIntervalMs = 60,
} = {}) {
  if (!cacheDir) throw new Error("createCachedFetch requires cacheDir");
  const stats = { hits: 0, misses: 0, networkOk: 0, networkFail: 0, bytes: 0 };
  let lastRequestAt = 0;

  const bodyPath = (key) => path.join(cacheDir, key.slice(0, 2), `${key}.json`);
  const metaPath = (key) => `${bodyPath(key)}.meta.json`;

  function readCache(key, url) {
    const bPath = bodyPath(key);
    const mPath = metaPath(key);
    if (!existsSync(bPath) || !existsSync(mPath)) return null;
    try {
      const bytes = readFileSync(bPath);
      const meta = JSON.parse(readFileSync(mPath, "utf8"));
      if (meta.url !== String(url)) return null;
      if (meta.byteCount !== bytes.length) return null;
      if (meta.sha256 !== sha256Hex(bytes)) return null;
      return { text: bytes.toString("utf8"), meta };
    } catch {
      return null;
    }
  }

  function writeCache(key, url, status, text) {
    const bytes = Buffer.from(text, "utf8");
    const meta = {
      url: String(url),
      status,
      byteCount: bytes.length,
      sha256: sha256Hex(bytes),
      retrievedAt: new Date().toISOString(),
    };
    writeAtomic(bodyPath(key), bytes);
    writeAtomic(metaPath(key), Buffer.from(`${JSON.stringify(meta, null, 2)}\n`, "utf8"));
    return meta;
  }

  async function realFetch(url) {
    const wait = minIntervalMs - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        lastRequestAt = Date.now();
        const response = await networkFetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        const text = await response.text();
        clearTimeout(timer);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        JSON.parse(text); // reject truncated/garbage bodies before caching
        return { status: response.status, text };
      } catch (error) {
        clearTimeout(timer);
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < maxAttempts) await sleep(backoffMs * 2 ** (attempt - 1));
      }
    }
    throw new Error(`Request failed after ${maxAttempts} attempt(s): ${lastError}`);
  }

  async function cachedFetch(url) {
    const key = urlKey(url);
    if (mode !== "refresh") {
      const cached = readCache(key, url);
      if (cached) {
        stats.hits += 1;
        onEvent({ type: "hit", url: String(url) });
        return new CachedResponse({ status: cached.meta.status, text: cached.text, fromCache: true });
      }
    }
    if (mode === "offline") {
      throw new Error(`Cache miss in offline mode: ${url}`);
    }
    stats.misses += 1;
    try {
      const { status, text } = await realFetch(url);
      const meta = writeCache(key, url, status, text);
      stats.networkOk += 1;
      stats.bytes += meta.byteCount;
      onEvent({ type: "network", url: String(url), byteCount: meta.byteCount });
      return new CachedResponse({ status, text, fromCache: false });
    } catch (error) {
      stats.networkFail += 1;
      onEvent({ type: "network-fail", url: String(url), error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  cachedFetch.stats = stats;
  return cachedFetch;
}

/** Recursively total the byte size of a directory tree (0 when absent). */
export function directorySize(directory) {
  if (!existsSync(directory)) return 0;
  return readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    const entryPath = path.join(directory, entry.name);
    return sum + (entry.isDirectory() ? directorySize(entryPath) : statSync(entryPath).size);
  }, 0);
}

export function writeJsonAtomic(filePath, value) {
  writeAtomic(filePath, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}
