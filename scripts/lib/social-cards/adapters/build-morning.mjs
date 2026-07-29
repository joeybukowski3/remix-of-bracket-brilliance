/**
 * Morning MLB daily model card adapter.
 *
 * HR: maps the frozen production HR selection (hr-props-best-bets.json.bestBets,
 * joined to hr-props-raw.json.batters/.games for hrScore/venueSide). Preserves
 * the frozen bestBets order exactly; never reranks, filters, or pads it.
 *
 * K: requires an explicit, already-selected K-plan artifact supplied by the
 * caller (see resolve-source.mjs's optional --k-plan). raw.pitchers is NEVER
 * read here -- it is the full, unranked production pitcher pool, and no
 * frozen "already selected" K artifact exists anywhere in this repository
 * today (see docs/social-cards.md). Building a top-N-by-score ranking from
 * that pool inside the adapter would be candidate selection, which this
 * adapter must never perform. When no K-plan is supplied, K rows are
 * MORNING_K_SOURCE_UNAVAILABLE: generation blocks by default, or produces an
 * explicit partial preview (empty strikeouts) only when the caller passes
 * `preview: true`.
 */
import { deriveMorningSnapshot } from '../mlb.mjs';
import {
  buildBatterLookup,
  buildGameLookup,
  normalizeJoinKey,
  toFiniteNumber,
  venueSideForRow,
} from './mlb-source-mappers.mjs';
import { formatEasternClock } from './mlb-time.mjs';

export const MAX_HR_ROWS = 6;
export const MAX_K_ROWS = 5;
export const MORNING_K_SOURCE_UNAVAILABLE = 'MORNING_K_SOURCE_UNAVAILABLE';

function mapHomeRuns(bestBets, raw, diagnostics) {
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
    homeRuns.push({
      rank: homeRuns.length + 1,
      player: pick.player,
      team: pick.team,
      opponent: pick.opponent,
      venueSide: venueSideForRow(source, gameLookup),
      hrScore,
    });
  }

  return homeRuns;
}

/**
 * Maps an already-selected, already-ordered K-plan artifact into card rows.
 * No filtering, no sorting, no ranking, no raw.pitchers fallback -- only a
 * cap at renderer capacity and a field-shape mapping, exactly like
 * mapHomeRuns does for the frozen bestBets order above.
 *
 * @param {object|null} kPlan  externally supplied { strikeouts: [...] } artifact,
 *   or null when no K-plan source was supplied to the adapter.
 * @param {object} raw  parsed hr-props-raw.json -- used ONLY for raw.games
 *   (venue-side lookup by gameKey), never for raw.pitchers.
 */
function mapStrikeouts(kPlan, raw, diagnostics) {
  if (!kPlan) {
    diagnostics.warnings.push(MORNING_K_SOURCE_UNAVAILABLE);
    return [];
  }

  const gameLookup = buildGameLookup(raw);
  const rows = Array.isArray(kPlan.strikeouts) ? kPlan.strikeouts : [];

  return rows.slice(0, MAX_K_ROWS).map((row, index) => ({
    rank: row.rank ?? index + 1,
    pitcher: row.pitcher,
    team: row.team,
    opponent: row.opponent,
    venueSide: row.venueSide ?? venueSideForRow(row, gameLookup),
    kScore: toFiniteNumber(row.kScore),
    projectedK: toFiniteNumber(row.projectedK),
  }));
}

/**
 * @param {object} params
 * @param {object} params.raw          parsed hr-props-raw.json
 * @param {object} params.bestBets     parsed hr-props-best-bets.json
 * @param {object|null} [params.kPlan] parsed, already-validated K-plan artifact
 *   (see resolve-source.mjs). null when no --k-plan was supplied.
 * @param {string} params.slateDate    YYYY-MM-DD
 * @param {boolean} [params.preview]   explicit opt-in to receive a partial card
 *   (empty strikeouts) when no K-plan is available. Without this, a missing
 *   K-plan blocks generation entirely.
 * @returns {{ data: object|null, readiness: object, diagnostics: { droppedHomeRuns: Array<object>, warnings: Array<string> } }}
 */
export function buildMlbDailyMorningCardInput({ raw, bestBets, kPlan = null, slateDate, preview = false }) {
  const diagnostics = { droppedHomeRuns: [], warnings: [] };

  const homeRuns = mapHomeRuns(bestBets, raw, diagnostics);
  const strikeouts = mapStrikeouts(kPlan, raw, diagnostics);

  if (!kPlan && !preview) {
    return {
      data: null,
      readiness: { ready: false, reasons: [MORNING_K_SOURCE_UNAVAILABLE] },
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

  const readiness = kPlan
    ? { ready: true, reasons: [] }
    : { ready: false, reasons: [MORNING_K_SOURCE_UNAVAILABLE] };

  return { data, readiness, diagnostics };
}
