import { describe, expect, it } from 'vitest';

import { normalizeConfirmed, normalizeMorning } from '../mlb.mjs';
import { renderCard } from '../render.mjs';
import {
  buildMlbDailyConfirmedCardInput,
  CONFIRMED_K_SOURCE_UNAVAILABLE,
  CONFIRMED_VALUES_SOURCE_UNAVAILABLE,
} from './build-confirmed.mjs';
import { buildMlbDailyMorningCardInput, MORNING_K_ROWS_UNAVAILABLE } from './build-morning.mjs';
import { formatEasternClock } from './mlb-time.mjs';
import { resolveMlbDailyCardSource } from './resolve-source.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SLATE_DATE = '2026-07-29';

function game(gameKey, homeTeam, awayTeam) {
  return { gameKey, gameId: 1, matchup: `${awayTeam} @ ${homeTeam}`, homeTeam, awayTeam };
}

/** Shaped like a selectTopSocialHrRows() output row (HrDashboardBatter). */
function selectedHr({ player, team, opponent, gameKey, hrScore, hrOddsYes = null }) {
  return { player, team, opponent, gameKey, hrScore, hrOddsYes };
}

/** Shaped like a selectTopSocialKRows() output row (PitcherStrikeoutTeamRow). Deliberately carries
 * market-only fields (kLine/kOddsOver/kOddsUnder) that the morning adapter must never copy through. */
function selectedK({ pitcher, team, opponent, gameKey, strikeoutMatchupScore, projectedKs, kLine = 6.5, kOddsOver = '-120', kOddsUnder = '+100' }) {
  return { pitcher, team, opponent, gameKey, strikeoutMatchupScore, projectedKs, kLine, kOddsOver, kOddsUnder };
}

function buildRaw({ games, batters = [], pitchers = [], generatedAt = '2026-07-29T13:15:00.000Z' }) {
  return { date: SLATE_DATE, generatedAt, modelVersion: 'test', games, batters, pitchers };
}

describe('mlb-time formatEasternClock', () => {
  it('formats a UTC ISO timestamp as an Eastern clock string', () => {
    expect(formatEasternClock('2026-07-29T13:15:00.000Z')).toMatch(/^\d{1,2}:\d{2} (AM|PM) ET$/);
  });

  it('returns null for missing/invalid input', () => {
    expect(formatEasternClock(null)).toBeNull();
    expect(formatEasternClock('not-a-date')).toBeNull();
  });
});

describe('resolveMlbDailyCardSource', () => {
  function writeTempJson(dir, name, data) {
    const filePath = path.join(dir, name);
    writeFileSync(filePath, JSON.stringify(data));
    return filePath;
  }

  it('rejects an unknown edition', () => {
    expect(() =>
      resolveMlbDailyCardSource({ edition: 'afternoon', slateDate: SLATE_DATE, rawPath: 'x' }),
    ).toThrow(/Unknown edition/);
  });

  it('rejects a malformed slate date', () => {
    expect(() =>
      resolveMlbDailyCardSource({ edition: 'morning', slateDate: '07-29-2026', rawPath: 'x' }),
    ).toThrow(/YYYY-MM-DD/);
  });

  it('rejects a nonexistent path and never falls back to fixtures', () => {
    expect(() =>
      resolveMlbDailyCardSource({
        edition: 'morning',
        slateDate: SLATE_DATE,
        rawPath: path.join(tmpdir(), 'definitely-does-not-exist.json'),
      }),
    ).toThrow(/not found/);
  });

  it('rejects a slate-date mismatch between the requested date and the artifact', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'social-card-source-'));
    const rawPath = writeTempJson(dir, 'raw.json', buildRaw({ games: [] }));

    expect(() =>
      resolveMlbDailyCardSource({ edition: 'morning', slateDate: '2026-08-01', rawPath }),
    ).toThrow(/does not match requested slate date/);
  });

  it('loads the matching source for a valid slate date', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'social-card-source-'));
    const rawPath = writeTempJson(dir, 'raw.json', buildRaw({ games: [] }));

    const { raw } = resolveMlbDailyCardSource({ edition: 'morning', slateDate: SLATE_DATE, rawPath });
    expect(raw.date).toBe(SLATE_DATE);
  });
});

describe('buildMlbDailyMorningCardInput', () => {
  const games = [game('TOR@WSH', 'WSH', 'TOR'), game('NYM@ATL', 'ATL', 'NYM'), game('PIT@CIN', 'CIN', 'PIT')];
  const raw = buildRaw({ games, pitchers: [{ gameKey: 'PIT@CIN' }, { gameKey: 'DET@KCR' }, { gameKey: 'BOS@NYY' }], batters: [{}, {}] });

  // Deliberately pre-selected (already ordered by the shared selector, not
  // by score) -- proves the adapter maps whatever order it's handed rather
  // than re-deriving one. Skenes (92) would sort first by score; here
  // Luzardo (70) is first because that's the order the caller supplied.
  const selectedStrikeouts = [
    selectedK({ pitcher: 'Jesus Luzardo', team: 'MIA', opponent: 'MIA', strikeoutMatchupScore: 70, projectedKs: 6.1 }),
    selectedK({ pitcher: 'Paul Skenes', team: 'PIT', opponent: 'CIN', gameKey: 'PIT@CIN', strikeoutMatchupScore: 92, projectedKs: 7.6 }),
  ];
  const selectedHomeRuns = [
    selectedHr({ player: 'James Wood', team: 'WSH', opponent: 'TOR', gameKey: 'TOR@WSH', hrScore: 78 }),
    selectedHr({ player: 'Pete Alonso', team: 'NYM', opponent: 'ATL', gameKey: 'NYM@ATL', hrScore: 74 }),
  ];

  it('maps the already-selected HR rows in the supplied order, joins venueSide, and never attaches odds', () => {
    const { data } = buildMlbDailyMorningCardInput({ raw, selectedHomeRuns, selectedStrikeouts, slateDate: SLATE_DATE });

    expect(data.homeRuns).toHaveLength(2);
    expect(data.homeRuns[0]).toMatchObject({ player: 'James Wood', hrScore: 78, venueSide: 'home' });
    expect(data.homeRuns[1]).toMatchObject({ player: 'Pete Alonso', hrScore: 74, venueSide: 'away' });
    expect(JSON.stringify(data.homeRuns)).not.toContain('odds');
  });

  it('preserves the supplied K selection order exactly -- the adapter performs no sorting/ranking', () => {
    const { data } = buildMlbDailyMorningCardInput({ raw, selectedHomeRuns, selectedStrikeouts, slateDate: SLATE_DATE });

    expect(data.strikeouts.map((row) => row.pitcher)).toEqual(['Jesus Luzardo', 'Paul Skenes']);
    expect(data.strikeouts[0].kScore).toBe(70);
  });

  it('maps kScore from strikeoutMatchupScore and projectedK from projectedKs -- the same fields the website displays', () => {
    const { data } = buildMlbDailyMorningCardInput({ raw, selectedHomeRuns, selectedStrikeouts, slateDate: SLATE_DATE });
    expect(data.strikeouts[1]).toMatchObject({ pitcher: 'Paul Skenes', kScore: 92, projectedK: 7.6 });
  });

  it('never leaks market-only fields (line/odds/side/edge) from the selected K rows into the morning card', () => {
    const { data } = buildMlbDailyMorningCardInput({ raw, selectedHomeRuns, selectedStrikeouts, slateDate: SLATE_DATE });
    expect(JSON.stringify(data.strikeouts)).not.toMatch(/"(kLine|kOddsOver|kOddsUnder|side|line|odds|edge)"/);
  });

  it('reports MORNING_K_ROWS_UNAVAILABLE and blocks generation (data: null) when selection yields zero K rows', () => {
    const result = buildMlbDailyMorningCardInput({ raw, selectedHomeRuns, selectedStrikeouts: [], slateDate: SLATE_DATE });

    expect(result.data).toBeNull();
    expect(result.readiness).toEqual({ ready: false, reasons: [MORNING_K_ROWS_UNAVAILABLE] });
    expect(result.diagnostics.warnings).toContain(MORNING_K_ROWS_UNAVAILABLE);
  });

  it('does not fabricate K rows: an explicit partial preview yields a real card with a genuinely empty strikeout section', () => {
    const result = buildMlbDailyMorningCardInput({ raw, selectedHomeRuns, selectedStrikeouts: [], slateDate: SLATE_DATE, preview: true });

    expect(result.data).not.toBeNull();
    expect(result.data.preview).toBe(true);
    expect(result.data.strikeouts).toEqual([]);
    expect(result.readiness.ready).toBe(false);
    expect(result.diagnostics.warnings).toContain(MORNING_K_ROWS_UNAVAILABLE);
  });

  it('caps at renderer capacity (6 HR / 5 K) without reordering or padding when the caller supplies more', () => {
    const manyHr = Array.from({ length: 8 }, (_, i) => selectedHr({ player: `Batter ${i}`, team: 'WSH', opponent: 'TOR', gameKey: 'TOR@WSH', hrScore: 50 + i }));
    const manyK = Array.from({ length: 8 }, (_, i) => selectedK({ pitcher: `Pitcher ${i}`, team: 'PIT', opponent: 'CIN', gameKey: 'PIT@CIN', strikeoutMatchupScore: 50 + i, projectedKs: 5 }));

    const { data } = buildMlbDailyMorningCardInput({ raw, selectedHomeRuns: manyHr, selectedStrikeouts: manyK, slateDate: SLATE_DATE });

    expect(data.homeRuns).toHaveLength(6);
    expect(data.strikeouts).toHaveLength(5);
    // Truncation keeps the first N of the SUPPLIED order -- no reranking.
    expect(data.homeRuns.map((r) => r.player)).toEqual(['Batter 0', 'Batter 1', 'Batter 2', 'Batter 3', 'Batter 4', 'Batter 5']);
    expect(data.strikeouts.map((r) => r.pitcher)).toEqual(['Pitcher 0', 'Pitcher 1', 'Pitcher 2', 'Pitcher 3', 'Pitcher 4']);
  });

  it('derives snapshot fields from raw counts/generatedAt and records diagnostics for unavailable fields', () => {
    const { data, diagnostics } = buildMlbDailyMorningCardInput({ raw, selectedHomeRuns, selectedStrikeouts, slateDate: SLATE_DATE });

    expect(data.snapshot.gamesModeled).toBe(3);
    expect(data.snapshot.projectedStartingPitchers).toBe(3);
    expect(data.snapshot.modeledHitters).toBe(2);
    expect(data.snapshot.highestHrScore).toEqual({ value: 78, player: 'James Wood' });
    expect(data.snapshot.highestProjectedK).toEqual({ value: 7.6, player: 'Paul Skenes' });
    expect(data.updatedTimeEt).toMatch(/ET$/);
    expect(diagnostics.warnings).not.toContain('LAST_REFRESH_UNAVAILABLE');
  });

  it('produces output that survives the real normalizer and renderer with no leaked literals or remote URLs', () => {
    const { data } = buildMlbDailyMorningCardInput({ raw, selectedHomeRuns, selectedStrikeouts, slateDate: SLATE_DATE });
    const normalized = normalizeMorning(data);
    const svg = renderCard(normalized);

    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).not.toMatch(/undefined|NaN|(?:^|[^a-zA-Z])null(?:[^a-zA-Z]|$)/);
    expect(svg).not.toMatch(/(?:href|src)="https?:\/\//);
  });
});

describe('buildMlbDailyConfirmedCardInput', () => {
  const games = [game('TOR@WSH', 'WSH', 'TOR')];
  const raw = buildRaw({ games });
  const selectedHomeRuns = [selectedHr({ player: 'James Wood', team: 'WSH', opponent: 'TOR', gameKey: 'TOR@WSH', hrScore: 78, hrOddsYes: '+340' })];

  it('maps confirmed HR rows from the shared selection with real parsed odds -- no bestBets involved', () => {
    const { data } = buildMlbDailyConfirmedCardInput({ raw, selectedHomeRuns, slateDate: SLATE_DATE, preview: true });
    expect(data.homeRuns[0]).toMatchObject({ player: 'James Wood', odds: 340, venueSide: 'home' });
  });

  it('drops HR rows missing valid odds rather than fabricating a price', () => {
    const noOdds = [selectedHr({ player: 'James Wood', team: 'WSH', opponent: 'TOR', gameKey: 'TOR@WSH', hrScore: 78, hrOddsYes: null })];
    const { data, diagnostics } = buildMlbDailyConfirmedCardInput({ raw, selectedHomeRuns: noOdds, slateDate: SLATE_DATE, preview: true });
    expect(data.homeRuns).toHaveLength(0);
    expect(diagnostics.droppedHomeRuns).toEqual([{ player: 'James Wood', reason: 'MISSING_VALID_ODDS' }]);
  });

  it('never populates strikeouts or values (no trustworthy static source) and records why -- unchanged, conservative', () => {
    const { diagnostics, readiness } = buildMlbDailyConfirmedCardInput({ raw, selectedHomeRuns, slateDate: SLATE_DATE, preview: true });
    expect(diagnostics.reasons).toContain(CONFIRMED_K_SOURCE_UNAVAILABLE);
    expect(diagnostics.reasons).toContain(CONFIRMED_VALUES_SOURCE_UNAVAILABLE);
    expect(readiness.reasons).toContain('INSUFFICIENT_CONFIRMED_K_ROWS');
    expect(readiness.reasons).toContain('CONFIRMED_VALUES_SOURCE_UNAVAILABLE');
  });

  it('returns a blocked result (data: null) when not ready and preview is not explicitly requested', () => {
    const result = buildMlbDailyConfirmedCardInput({ raw, selectedHomeRuns, slateDate: SLATE_DATE });
    expect(result.data).toBeNull();
    expect(result.readiness.ready).toBe(false);
  });

  it('only returns populated data when preview is explicitly requested', () => {
    const result = buildMlbDailyConfirmedCardInput({ raw, selectedHomeRuns, slateDate: SLATE_DATE, preview: true });
    expect(result.data).not.toBeNull();
    expect(result.readiness.ready).toBe(false);
  });

  it('produces preview output that survives the real normalizeConfirmed + renderer', () => {
    const { data } = buildMlbDailyConfirmedCardInput({ raw, selectedHomeRuns, slateDate: SLATE_DATE, preview: true });
    const normalized = normalizeConfirmed(data, { preview: true, valuesSourceAvailable: false });
    const svg = renderCard(normalized);

    expect(normalized.publishReady).toBe(false);
    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).not.toMatch(/undefined|NaN|(?:^|[^a-zA-Z])null(?:[^a-zA-Z]|$)/);
    expect(svg).not.toMatch(/(?:href|src)="https?:\/\//);
  });
});
