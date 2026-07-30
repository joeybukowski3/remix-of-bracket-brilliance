/**
 * Confirmed MLB daily model card adapter.
 *
 * HR: `selectedHomeRuns` must already be the final, ordered rows chosen by
 * the same shared selector the website's Social Media Tables use --
 * src/lib/mlb/hrPropSocialSelection.ts -> selectTopSocialHrRows(batters, { max: 6 }).
 * This adapter performs no selection of its own: it only maps fields and
 * parses/validates each row's already-attached `hrOddsYes` string. Rows
 * without a parseable American-odds price are dropped (never fabricated,
 * never padded to hit a count).
 *
 * Strikeouts / top-level values: BLOCKED by design, deliberately unchanged
 * by the shared-selector migration -- this stays conservative per the
 * project's explicit instruction not to manufacture confirmed values or
 * recommendation data in this pass. See docs/social-cards.md.
 */
import { buildGameLookup, parseAmericanOddsString, toFiniteNumber, venueSideForRow } from './mlb-source-mappers.mjs';
import { DEFAULT_READINESS, evaluateConfirmedReadiness } from '../mlb.mjs';
import { formatEasternClock } from './mlb-time.mjs';

export const MAX_HR_ROWS = 6;

export const CONFIRMED_K_SOURCE_UNAVAILABLE = 'CONFIRMED_K_SOURCE_UNAVAILABLE';
export const CONFIRMED_VALUES_SOURCE_UNAVAILABLE = 'CONFIRMED_VALUES_SOURCE_UNAVAILABLE';

function mapConfirmedHomeRuns(selectedHomeRuns, gameLookup, diagnostics) {
  const homeRuns = [];

  for (const row of (selectedHomeRuns ?? []).slice(0, MAX_HR_ROWS)) {
    const odds = parseAmericanOddsString(row?.hrOddsYes);
    if (odds === null) {
      diagnostics.droppedHomeRuns.push({ player: row?.player ?? null, reason: 'MISSING_VALID_ODDS' });
      continue;
    }
    homeRuns.push({
      rank: homeRuns.length + 1,
      player: row.player,
      team: row.team,
      opponent: row.opponent,
      venueSide: venueSideForRow(row, gameLookup),
      hrScore: toFiniteNumber(row.hrScore),
      odds,
    });
  }

  return homeRuns;
}

/**
 * @param {object} params
 * @param {object} params.raw                parsed hr-props-raw.json (games, for venue-side join)
 * @param {object[]} params.selectedHomeRuns  already-selected HrDashboardBatter rows
 *   (selectTopSocialHrRows output), already capped at renderer capacity
 * @param {string} params.slateDate           YYYY-MM-DD
 * @param {boolean} [params.preview]          explicit opt-in to receive card data even when not publish-ready
 * @returns {{ data: object|null, readiness: object, diagnostics: object }}
 */
export function buildMlbDailyConfirmedCardInput({ raw, selectedHomeRuns, slateDate, preview = false }) {
  const diagnostics = { droppedHomeRuns: [], reasons: [] };
  const gameLookup = buildGameLookup(raw);

  const homeRuns = mapConfirmedHomeRuns(selectedHomeRuns, gameLookup, diagnostics);

  // No trustworthy static source for confirmed K/values -- see module doc above.
  const strikeouts = [];
  diagnostics.reasons.push(CONFIRMED_K_SOURCE_UNAVAILABLE);

  const values = [];
  diagnostics.reasons.push(CONFIRMED_VALUES_SOURCE_UNAVAILABLE);

  const generatedAt = new Date().toISOString();
  const candidate = {
    schemaVersion: 1,
    sport: 'mlb',
    cardType: 'daily-model-card',
    edition: 'confirmed',
    slateDate,
    generatedAt,
    updatedTimeEt: formatEasternClock(generatedAt) ?? '—',
    homeRuns,
    strikeouts,
    values,
    links: { website: 'joeknowsball.com', xHandle: '@_joeknowsball_' },
  };

  const readiness = evaluateConfirmedReadiness(candidate, DEFAULT_READINESS, { valuesSourceAvailable: false });

  if (!readiness.ready && !preview) {
    return { data: null, readiness, diagnostics };
  }

  return { data: candidate, readiness, diagnostics };
}
