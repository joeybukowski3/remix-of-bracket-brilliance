/**
 * Morning MLB daily model card adapter.
 *
 * This adapter performs NO selection, filtering, sorting, or ranking of any
 * kind. Both `selectedHomeRuns` and `selectedStrikeouts` must already be the
 * final, ordered, capacity-capped rows chosen by the shared selectors also
 * used by the website's Social Media Tables:
 *   - HR: src/lib/mlb/hrPropSocialSelection.ts -> selectTopSocialHrRows(batters, { max: 6 })
 *   - K:  src/lib/mlb/mlbSocialSelection.ts -> buildPitcherStrikeoutRows(...),
 *         then src/lib/mlb/kPropValueSorting.ts -> selectTopSocialKRows(rows, 5)
 * See scripts/generate-social-card-live.ts, which computes these selections
 * and calls this adapter with the results. This file's only job is mapping
 * field names into the card contract and stripping market-only fields
 * (kLine/kOddsOver/kOddsUnder/side/edge) that must never appear on the
 * morning card -- see docs/social-cards.md.
 */
import { deriveMorningSnapshot } from '../mlb.mjs';
import { buildGameLookup, toFiniteNumber, venueSideForRow } from './mlb-source-mappers.mjs';
import { formatEasternClock } from './mlb-time.mjs';

export const MAX_HR_ROWS = 6;
export const MAX_K_ROWS = 5;
export const MORNING_K_ROWS_UNAVAILABLE = 'MORNING_K_ROWS_UNAVAILABLE';

function mapHomeRuns(selectedHomeRuns, gameLookup) {
  return (selectedHomeRuns ?? []).slice(0, MAX_HR_ROWS).map((row, index) => ({
    rank: index + 1,
    player: row.player,
    team: row.team,
    opponent: row.opponent,
    venueSide: venueSideForRow(row, gameLookup),
    hrScore: toFiniteNumber(row.hrScore),
  }));
}

function mapStrikeouts(selectedStrikeouts, gameLookup) {
  return (selectedStrikeouts ?? []).slice(0, MAX_K_ROWS).map((row, index) => ({
    rank: index + 1,
    pitcher: row.pitcher,
    team: row.team,
    opponent: row.opponent,
    venueSide: venueSideForRow(row, gameLookup),
    kScore: toFiniteNumber(row.strikeoutMatchupScore),
    projectedK: toFiniteNumber(row.projectedKs),
  }));
}

/**
 * @param {object} params
 * @param {object} params.raw                 parsed hr-props-raw.json (used only for
 *   games/snapshot counts + generatedAt -- never for selection)
 * @param {object[]} params.selectedHomeRuns   already-selected HrDashboardBatter rows
 *   (selectTopSocialHrRows output), already capped at renderer capacity
 * @param {object[]} params.selectedStrikeouts already-selected PitcherStrikeoutTeamRow
 *   rows (selectTopSocialKRows output), already capped at renderer capacity
 * @param {string} params.slateDate            YYYY-MM-DD
 * @param {boolean} [params.preview]           explicit opt-in to receive a partial
 *   card (empty strikeouts) when selectTopSocialKRows found no VALID rows
 * @returns {{ data: object|null, readiness: object, diagnostics: { warnings: string[] } }}
 */
export function buildMlbDailyMorningCardInput({ raw, selectedHomeRuns, selectedStrikeouts, slateDate, preview = false }) {
  const diagnostics = { warnings: [] };
  const gameLookup = buildGameLookup(raw);

  const homeRuns = mapHomeRuns(selectedHomeRuns, gameLookup);
  const strikeouts = mapStrikeouts(selectedStrikeouts, gameLookup);

  const hasKRows = strikeouts.length > 0;
  if (!hasKRows) diagnostics.warnings.push(MORNING_K_ROWS_UNAVAILABLE);

  if (!hasKRows && !preview) {
    return {
      data: null,
      readiness: { ready: false, reasons: [MORNING_K_ROWS_UNAVAILABLE] },
      diagnostics,
    };
  }

  const gamesModeled = Array.isArray(raw?.games) ? raw.games.length : null;
  if (gamesModeled === null) diagnostics.warnings.push('GAMES_MODELED_UNAVAILABLE');

  const projectedStartingPitchers = Array.isArray(raw?.pitchers) ? raw.pitchers.length : null;
  if (projectedStartingPitchers === null) diagnostics.warnings.push('PROJECTED_STARTING_PITCHERS_UNAVAILABLE');

  const modeledHitters = Array.isArray(raw?.batters) ? raw.batters.length : null;
  if (modeledHitters === null) diagnostics.warnings.push('MODELED_HITTERS_UNAVAILABLE');

  const lastRefresh = formatEasternClock(raw?.generatedAt);
  if (!lastRefresh) diagnostics.warnings.push('LAST_REFRESH_UNAVAILABLE');

  const snapshot = deriveMorningSnapshot({
    gamesModeled,
    projectedStartingPitchers,
    modeledHitters,
    homeRuns,
    strikeouts,
    lastRefresh,
  });

  const data = {
    schemaVersion: 1,
    sport: 'mlb',
    cardType: 'daily-model-card',
    edition: 'morning',
    slateDate,
    generatedAt: new Date().toISOString(),
    updatedTimeEt: lastRefresh ?? '—',
    preview: Boolean(preview),
    homeRuns,
    strikeouts,
    snapshot,
    links: { website: 'joeknowsball.com', xHandle: '@_joeknowsball_' },
  };

  const readiness = hasKRows
    ? { ready: true, reasons: [] }
    : { ready: false, reasons: [MORNING_K_ROWS_UNAVAILABLE] };

  return { data, readiness, diagnostics };
}
