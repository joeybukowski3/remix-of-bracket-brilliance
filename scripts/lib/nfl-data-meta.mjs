/**
 * Shared metadata helper for all generated NFL data files (PR-1).
 *
 * Every file the NFL pipeline writes under public/data/nfl must carry a
 * `_meta` block built here so UI freshness components (LastUpdated,
 * StaleWarning) and downstream scripts can rely on one schema.
 *
 * Schema is versioned; bump NFL_SCHEMA_VERSION when the meta shape changes.
 */

export const NFL_SCHEMA_VERSION = "nfl-v0.1";

/**
 * Build a `_meta` block for a generated NFL data file.
 *
 * @param {object} options
 * @param {string} options.source - Human-readable data source, e.g. "nflverse (nfldata games.csv)".
 * @param {number | null} [options.season] - Season the file covers; null for season-agnostic files (teams.json).
 * @param {number | null} [options.week] - Week the file covers; null for season-level files.
 * @param {string | null} [options.modelVersion] - Model identifier for model output files; null for raw data.
 * @param {string[]} [options.notes] - Free-form caveats (e.g. "no 2026 games completed yet").
 * @param {string} [options.generatedAt] - ISO timestamp override, mainly for tests and hand-curated files.
 * @returns {{ schemaVersion: string, generatedAt: string, source: string, season: number | null, week: number | null, modelVersion: string | null, notes: string[] }}
 */
export function buildNflMeta({
  source,
  season = null,
  week = null,
  modelVersion = null,
  notes = [],
  generatedAt = new Date().toISOString(),
}) {
  if (typeof source !== "string" || source.trim() === "") {
    throw new Error("buildNflMeta: source is required and must be a non-empty string");
  }
  if (season !== null && (!Number.isInteger(season) || season < 2000 || season > 2100)) {
    throw new Error(`buildNflMeta: season must be null or an integer year, got ${season}`);
  }
  if (week !== null && (!Number.isInteger(week) || week < 0)) {
    throw new Error(`buildNflMeta: week must be null or a non-negative integer, got ${week}`);
  }
  if (modelVersion !== null && typeof modelVersion !== "string") {
    throw new Error("buildNflMeta: modelVersion must be null or a string");
  }
  if (!Array.isArray(notes) || notes.some((note) => typeof note !== "string")) {
    throw new Error("buildNflMeta: notes must be an array of strings");
  }
  if (Number.isNaN(Date.parse(generatedAt))) {
    throw new Error(`buildNflMeta: generatedAt must be a valid ISO timestamp, got ${generatedAt}`);
  }
  return {
    schemaVersion: NFL_SCHEMA_VERSION,
    generatedAt,
    source,
    season,
    week,
    modelVersion,
    notes: [...notes],
  };
}

/**
 * Serialize a generated payload for writing to public/data/nfl.
 * 2-space indent + trailing newline so repeated runs of the pipeline
 * produce byte-identical files (except _meta.generatedAt).
 */
export function toNflJsonFileString(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}
