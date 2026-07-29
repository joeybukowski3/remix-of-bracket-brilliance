/**
 * Morning MLB daily model card adapter.
 *
 * Maps the frozen production HR selection (hr-props-best-bets.json.bestBets,
 * joined to hr-props-raw.json.batters/.games for hrScore/venueSide) and a
 * deterministic top-N-by-existing-score K selection (hr-props-raw.json.pitchers,
 * ordered by the pipeline's own precomputed `kVs`) into the normalized morning
 * card contract consumed by scripts/lib/social-cards/mlb.mjs::normalizeMorning.
 *
 * Never attaches odds/side/line/edge. Never reranks the frozen HR order. See
 * NOTES-live-adapters.md and docs/social-cards.md for why there is no frozen
 * "best K picks" artifact and why a documented top-N-by-kVs sort is used
 * instead for K rows only.
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

function mapStrikeouts(raw, diagnostics) {
  const gameLookup = buildGameLookup(raw);
  const pitchers = Array.isArray(raw?.pitchers) ? raw.pitchers : [];

  const starters = pitchers.filter((pitcher) => pitcher?.role === 'starter' && toFiniteNumber(pitcher?.kVs) !== null);

  if (!starters.length) diagnostics.warnings.push('NO_STARTER_K_ROWS_AVAILABLE');

  const sorted = [...starters].sort((left, right) => {
    const delta = toFiniteNumber(right.kVs) - toFiniteNumber(left.kVs);
    if (delta !== 0) return delta;
    return String(left.pitcher ?? '').localeCompare(String(right.pitcher ?? ''), 'en');
  });

  return sorted.slice(0, MAX_K_ROWS).map((pitcher, index) => ({
    rank: index + 1,
    pitcher: pitcher.pitcher,
    team: pitcher.team,
    opponent: pitcher.opponent,
    venueSide: venueSideForRow(pitcher, gameLookup),
    kScore: toFiniteNumber(pitcher.kVs),
    projectedK: toFiniteNumber(pitcher.projectedKs),
  }));
}

/**
 * @param {object} params
 * @param {object} params.raw       parsed hr-props-raw.json
 * @param {object} params.bestBets  parsed hr-props-best-bets.json
 * @param {string} params.slateDate YYYY-MM-DD
 * @returns {{ data: object, diagnostics: { droppedHomeRuns: Array<object>, warnings: Array<string> } }}
 */
export function buildMlbDailyMorningCardInput({ raw, bestBets, slateDate }) {
  const diagnostics = { droppedHomeRuns: [], warnings: [] };

  const homeRuns = mapHomeRuns(bestBets, raw, diagnostics);
  const strikeouts = mapStrikeouts(raw, diagnostics);

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
    homeRuns,
    strikeouts,
    snapshot,
    links: { website: 'joeknowsball.com', xHandle: '@_joeknowsball_' },
  };

  return { data, diagnostics };
}
