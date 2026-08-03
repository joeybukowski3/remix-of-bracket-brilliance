/**
 * Shared provenance helpers for committed nflverse source caches.
 *
 * Generalises the manifest conventions established by
 * data/nfl/nflverse/stats-team-week/manifest.json and
 * scripts/validate-nfl-weekly-source-cache.mjs so the Phase 4 injury, roster
 * and snap caches record provenance the same way instead of restating it.
 *
 * Two cache shapes are supported:
 *
 *   sourceType "verbatim"   the committed bytes are exactly the upstream bytes
 *   sourceType "projection" the committed bytes are a documented column/row
 *                           subset of the upstream file
 *
 * A projection still records the upstream byteSize/sha256/rowCount alongside
 * the committed file's own digest, so the reduction stays auditable and can be
 * re-derived from the recorded upstream release at any time. This exists only
 * because roster_weekly_2025.csv is 15.4 MB upstream — far too large to commit
 * whole — while the join needs 12 of its 36 columns.
 */

import { createHash } from "node:crypto";

/** nflverse release asset URL for a season-scoped file. */
export function nflverseReleaseUrl(release, filename) {
  return `https://github.com/nflverse/nflverse-data/releases/download/${release}/${filename}`;
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Header columns of a CSV text, without parsing the whole body. */
export function csvHeaderColumns(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.trim() === "") return [];
  return firstLine.split(",").map((column) => column.trim());
}

/** Data-row count (excludes the header, ignores a trailing newline). */
export function csvRowCount(text) {
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return Math.max(0, lines.length - 1);
}

/**
 * Build one manifest entry.
 *
 * @param {object} options
 * @param {number} options.season
 * @param {string} options.filename           committed file name
 * @param {string} options.sourceUrl          upstream release asset URL
 * @param {"verbatim" | "projection"} options.sourceType
 * @param {string} options.text               committed file contents
 * @param {string} options.retrievedDateUtc   YYYY-MM-DD
 * @param {object} [options.upstream]         required when sourceType is "projection"
 * @param {string[]} [options.projectedColumns]
 * @param {string} [options.projectionFilter] human-readable row filter description
 */
export function buildCacheManifestEntry({
  season,
  filename,
  sourceUrl,
  sourceType,
  text,
  retrievedDateUtc,
  upstream = null,
  projectedColumns = null,
  projectionFilter = null,
}) {
  // League-wide files (players.csv) are season-agnostic and carry season: null.
  if (season !== null && !Number.isInteger(season)) {
    throw new Error(`buildCacheManifestEntry: season must be an integer or null, got ${season}`);
  }
  if (sourceType !== "verbatim" && sourceType !== "projection") {
    throw new Error(`buildCacheManifestEntry: unknown sourceType ${sourceType}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(retrievedDateUtc ?? "")) {
    throw new Error(`buildCacheManifestEntry: retrievedDateUtc must be YYYY-MM-DD, got ${retrievedDateUtc}`);
  }

  const bytes = Buffer.from(text, "utf-8");
  const entry = {
    season,
    filename,
    sourceUrl,
    sourceType,
    retrievedDateUtc,
    byteSize: bytes.byteLength,
    sha256: sha256Hex(bytes),
    rowCount: csvRowCount(text),
    headerColumns: csvHeaderColumns(text),
  };

  if (sourceType === "projection") {
    if (!upstream || !Number.isInteger(upstream.byteSize) || typeof upstream.sha256 !== "string") {
      throw new Error("buildCacheManifestEntry: projection requires upstream byteSize/sha256/rowCount");
    }
    entry.upstream = {
      byteSize: upstream.byteSize,
      sha256: upstream.sha256,
      rowCount: upstream.rowCount,
      headerColumns: upstream.headerColumns ?? null,
    };
    entry.projectedColumns = projectedColumns ?? entry.headerColumns;
    entry.projectionFilter = projectionFilter;
  }

  return entry;
}

/**
 * Verify a committed cache file against its manifest entry. Returns a list of
 * human-readable problems; empty means the cache is intact.
 *
 * Never fetches. Byte-level verification only.
 */
export function verifyCacheEntry(entry, text, { requiredHeaders = [] } = {}) {
  const problems = [];
  const bytes = Buffer.from(text, "utf-8");

  if (bytes.byteLength !== entry.byteSize) {
    problems.push(`${entry.filename}: byteSize ${bytes.byteLength} != manifest ${entry.byteSize}`);
  }
  const digest = sha256Hex(bytes);
  if (digest !== entry.sha256) {
    problems.push(`${entry.filename}: sha256 ${digest} != manifest ${entry.sha256}`);
  }
  const rows = csvRowCount(text);
  if (rows !== entry.rowCount) {
    problems.push(`${entry.filename}: rowCount ${rows} != manifest ${entry.rowCount}`);
  }

  const header = csvHeaderColumns(text);
  const manifestHeader = entry.headerColumns ?? [];
  if (header.join(",") !== manifestHeader.join(",")) {
    problems.push(`${entry.filename}: header drifted from manifest`);
  }
  for (const required of requiredHeaders) {
    if (!header.includes(required)) {
      problems.push(`${entry.filename}: required column "${required}" is missing`);
    }
  }

  return problems;
}
