/**
 * Live-source resolver for the MLB daily model card adapters.
 *
 * Validates that the two frozen production artifacts the adapters read
 * (hr-props-raw.json, hr-props-best-bets.json) actually exist at the given
 * paths and match the requested slate date. Never falls back to
 * scripts/fixtures/* -- a missing or mismatched source is a hard failure,
 * not a silent substitution.
 *
 * Also optionally validates a K-plan artifact (an already-selected,
 * already-ordered set of strikeout rows) when a kPlanPath is supplied. No
 * such artifact is produced anywhere in this repository yet -- see
 * docs/social-cards.md for the proposed future schema/producer -- so kPlan
 * resolves to null unless the caller explicitly supplies one, and the K-plan
 * artifact's own `edition`/`slateDate` fields are checked the same way the
 * HR sources are.
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
 * @param {string} params.bestBetsPath  path to hr-props-best-bets.json
 * @param {string|null} [params.kPlanPath]  optional path to an already-selected
 *   K-plan artifact ({ edition, slateDate, strikeouts: [...] }). Omit to leave
 *   kPlan as null (no source available).
 * @returns {{ raw: object, bestBets: object, kPlan: object|null }}
 */
export function resolveMlbDailyCardSource({ edition, slateDate, rawPath, bestBetsPath, kPlanPath = null }) {
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

  const bestBets = loadJsonFile(bestBetsPath, 'hr-props-best-bets');
  const bestBetsDate = String(bestBets?.date ?? '');
  if (bestBetsDate !== slateDate) {
    throw new Error(`hr-props-best-bets slate date "${bestBetsDate || 'missing'}" does not match requested slate date "${slateDate}"`);
  }

  let kPlan = null;
  if (kPlanPath) {
    kPlan = loadJsonFile(kPlanPath, 'k-plan');
    const kPlanEdition = String(kPlan?.edition ?? '');
    if (kPlanEdition !== edition) {
      throw new Error(`k-plan edition "${kPlanEdition || 'missing'}" does not match requested edition "${edition}"`);
    }
    const kPlanDate = String(kPlan?.slateDate ?? '');
    if (kPlanDate !== slateDate) {
      throw new Error(`k-plan slate date "${kPlanDate || 'missing'}" does not match requested slate date "${slateDate}"`);
    }
  }

  return { raw, bestBets, kPlan };
}
