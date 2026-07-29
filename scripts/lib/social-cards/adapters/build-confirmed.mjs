/**
 * Confirmed MLB daily model card adapter.
 *
 * HR: hr-props-best-bets.json.bestBets already carries a real, attached
 * sportsbook price (`hrOddsYes`) for every pick -- a genuinely trustworthy,
 * deterministic, already-selected, already-priced source. Rows without a
 * parseable American-odds string are dropped (never fabricated, never
 * padded to hit a count).
 *
 * Strikeouts / top-level values: BLOCKED by design in Phase 1. See
 * NOTES-live-adapters.md -- there is no frozen, already-selected artifact
 * with side+line+odds+edge together. The only production logic that derives
 * those (scripts/lib/mlb-k-x-selection-core.mjs) requires a live Playwright
 * scrape plus a live MLB Stats API confirmation snapshot, both out of scope
 * here, and deriving side/edge ourselves from raw kLine/projectedKs would be
 * exactly the "infer betting sides / calculate new edges" this adapter must
 * never do. Left empty with recorded diagnostic reasons instead.
 */
import { DEFAULT_READINESS, evaluateConfirmedReadiness } from '../mlb.mjs';
import {
  buildBatterLookup,
  buildGameLookup,
  normalizeJoinKey,
  parseAmericanOddsString,
  toFiniteNumber,
  venueSideForRow,
} from './mlb-source-mappers.mjs';
import { formatEasternClock } from './mlb-time.mjs';

export const MAX_HR_ROWS = 6;

export const CONFIRMED_K_SOURCE_UNAVAILABLE = 'CONFIRMED_K_SOURCE_UNAVAILABLE';
export const CONFIRMED_VALUES_SOURCE_UNAVAILABLE = 'CONFIRMED_VALUES_SOURCE_UNAVAILABLE';

function mapConfirmedHomeRuns(bestBets, raw, diagnostics) {
  const gameLookup = buildGameLookup(raw);
  const batterLookup = buildBatterLookup(raw);
  const homeRuns = [];

  for (const pick of (bestBets?.bestBets ?? []).slice(0, MAX_HR_ROWS)) {
    const key = normalizeJoinKey(pick?.player, pick?.team, pick?.opponent);
    const source = batterLookup.get(key);
    const hrScore = toFiniteNumber(source?.hrScore);
    if (!source || hrScore === null) {
      diagnostics.droppedHomeRuns.push({ player: pick?.player ?? null, reason: 'NO_MATCHING_RAW_BATTER_ROW' });
      continue;
    }
    const odds = parseAmericanOddsString(pick?.hrOddsYes ?? source?.hrOddsYes);
    if (odds === null) {
      diagnostics.droppedHomeRuns.push({ player: pick?.player ?? null, reason: 'MISSING_VALID_ODDS' });
      continue;
    }
    homeRuns.push({
      rank: homeRuns.length + 1,
      player: pick.player,
      team: pick.team,
      opponent: pick.opponent,
      venueSide: venueSideForRow(source, gameLookup),
      hrScore,
      odds,
    });
  }

  return homeRuns;
}

/**
 * @param {object} params
 * @param {object} params.raw        parsed hr-props-raw.json
 * @param {object} params.bestBets   parsed hr-props-best-bets.json
 * @param {string} params.slateDate  YYYY-MM-DD
 * @param {boolean} [params.preview] explicit opt-in to receive card data even when not publish-ready
 * @returns {{ data: object|null, readiness: object, diagnostics: object }}
 */
export function buildMlbDailyConfirmedCardInput({ raw, bestBets, slateDate, preview = false }) {
  const diagnostics = { droppedHomeRuns: [], reasons: [] };

  const homeRuns = mapConfirmedHomeRuns(bestBets, raw, diagnostics);

  // No trustworthy static source -- see module doc above.
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
