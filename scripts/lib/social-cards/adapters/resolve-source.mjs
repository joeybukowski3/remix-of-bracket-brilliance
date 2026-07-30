/**
 * Live-source resolver for the MLB daily model card adapters.
 *
 * Validates that the one frozen production artifact the adapters read
 * (hr-props-raw.json) actually exists at the given path and matches the
 * requested slate date. Never falls back to scripts/fixtures/* -- a missing
 * or mismatched source is a hard failure, not a silent substitution.
 *
 * HR and K row SELECTION no longer happens here or in any adapter -- both
 * are computed by the shared selectors also used by the website's Social
 * Media Tables (src/lib/mlb/hrPropSocialSelection.ts,
 * src/lib/mlb/mlbSocialSelection.ts, src/lib/mlb/kPropValueSorting.ts), from
 * this same hr-props-raw.json payload. See scripts/generate-social-card-live.ts.
 */
import { existsSync, readFileSync } from 'node:fs';

const VALID_EDITIONS = new Set(['morning', 'confirmed']);
const SLATE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function loadJsonFile(filePath, label) {
  if (!filePath) throw new Error(`${label} path is required`);
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}. Live mode never falls back to scripts/fixtures/*.`);
  }
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`${label} at ${filePath} could not be read: ${error instanceof Error ? error.message : error}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} at ${filePath} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * @param {object} params
 * @param {'morning'|'confirmed'} params.edition
 * @param {string} params.slateDate  YYYY-MM-DD
 * @param {string} params.rawPath    path to hr-props-raw.json
 * @returns {{ raw: object }}
 */
export function resolveMlbDailyCardSource({ edition, slateDate, rawPath }) {
  if (!VALID_EDITIONS.has(edition)) {
    throw new Error(`Unknown edition "${edition}". Expected "morning" or "confirmed".`);
  }
  if (!SLATE_DATE_PATTERN.test(String(slateDate ?? ''))) {
    throw new Error(`--slate-date must be YYYY-MM-DD (got "${slateDate}")`);
  }

  const raw = loadJsonFile(rawPath, 'hr-props-raw');
  const rawDate = String(raw?.date ?? '');
  if (rawDate !== slateDate) {
    throw new Error(`hr-props-raw slate date "${rawDate || 'missing'}" does not match requested slate date "${slateDate}"`);
  }

  return { raw };
}
