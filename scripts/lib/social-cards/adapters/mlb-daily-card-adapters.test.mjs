import { describe, expect, it } from 'vitest';

import { normalizeConfirmed, normalizeMorning } from '../mlb.mjs';
import { renderCard } from '../render.mjs';
import {
  buildMlbDailyConfirmedCardInput,
  CONFIRMED_K_SOURCE_UNAVAILABLE,
  CONFIRMED_VALUES_SOURCE_UNAVAILABLE,
} from './build-confirmed.mjs';
import { buildMlbDailyMorningCardInput } from './build-morning.mjs';
import { formatEasternClock } from './mlb-time.mjs';
import { resolveMlbDailyCardSource } from './resolve-source.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SLATE_DATE = '2026-07-29';

function game(gameKey, homeTeam, awayTeam) {
  return { gameKey, gameId: 1, matchup: `${awayTeam} @ ${homeTeam}`, homeTeam, awayTeam };
}

function batter({ player, team, opponent, gameKey, hrScore, hrOddsYes = null, lineupStatus = 'projected' }) {
  return { player, team, opponent, gameKey, hrScore, hrOddsYes, lineupStatus };
}

function pitcher({ pitcher: name, team, opponent, gameKey, role = 'starter', kVs, projectedKs }) {
  return { pitcher: name, team, opponent, gameKey, role, kVs, projectedKs };
}

function pick({ player, team, opponent, hrOddsYes = null }) {
  return { player, team, opponent, hrOddsYes };
}

function buildRaw({ games, batters, pitchers, generatedAt = '2026-07-29T13:15:00.000Z' }) {
  return { date: SLATE_DATE, generatedAt, modelVersion: 'test', games, batters, pitchers };
}

function buildBestBets(bestBets, generatedAt = '2026-07-29T13:15:00.000Z') {
  return { date: SLATE_DATE, generatedAt, bestBets };
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
      resolveMlbDailyCardSource({ edition: 'afternoon', slateDate: SLATE_DATE, rawPath: 'x', bestBetsPath: 'y' }),
    ).toThrow(/Unknown edition/);
  });

  it('rejects a malformed slate date', () => {
    expect(() =>
      resolveMlbDailyCardSource({ edition: 'morning', slateDate: '07-29-2026', rawPath: 'x', bestBetsPath: 'y' }),
    ).toThrow(/YYYY-MM-DD/);
  });

  it('rejects a nonexistent path and never falls back to fixtures', () => {
    expect(() =>
      resolveMlbDailyCardSource({
        edition: 'morning',
        slateDate: SLATE_DATE,
        rawPath: path.join(tmpdir(), 'definitely-does-not-exist.json'),
        bestBetsPath: path.join(tmpdir(), 'also-missing.json'),
      }),
    ).toThrow(/not found/);
  });

  it('rejects a slate-date mismatch between the requested date and the artifact', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'social-card-source-'));
    const rawPath = writeTempJson(dir, 'raw.json', buildRaw({ games: [], batters: [], pitchers: [] }));
    const bestBetsPath = writeTempJson(dir, 'best-bets.json', buildBestBets([]));

    expect(() =>
      resolveMlbDailyCardSource({ edition: 'morning', slateDate: '2026-08-01', rawPath, bestBetsPath }),
    ).toThrow(/does not match requested slate date/);
  });

  it('loads matching sources for a valid slate date', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'social-card-source-'));
    const rawPath = writeTempJson(dir, 'raw.json', buildRaw({ games: [], batters: [], pitchers: [] }));
    const bestBetsPath = writeTempJson(dir, 'best-bets.json', buildBestBets([]));

    const { raw, bestBets } = resolveMlbDailyCardSource({ edition: 'morning', slateDate: SLATE_DATE, rawPath, bestBetsPath });
    expect(raw.date).toBe(SLATE_DATE);
    expect(bestBets.date).toBe(SLATE_DATE);
  });
});

describe('buildMlbDailyMorningCardInput', () => {
  const games = [game('TOR@WSH', 'WSH', 'TOR'), game('NYM@ATL', 'ATL', 'NYM')];
  const batters = [
    batter({ player: 'James Wood', team: 'WSH', opponent: 'TOR', gameKey: 'TOR@WSH', hrScore: 78 }),
    batter({ player: 'Pete Alonso', team: 'NYM', opponent: 'ATL', gameKey: 'NYM@ATL', hrScore: 74 }),
  ];
  const pitchers = [
    pitcher({ pitcher: 'Paul Skenes', team: 'PIT', opponent: 'CIN', gameKey: 'PIT@CIN', kVs: 92, projectedKs: 7.6 }),
    pitcher({ pitcher: 'Tarik Skubal', team: 'DET', opponent: 'KCR', gameKey: 'DET@KCR', kVs: 89, projectedKs: 7.2 }),
    pitcher({ pitcher: 'Reliever Guy', team: 'BOS', opponent: 'NYY', gameKey: 'BOS@NYY', role: 'reliever', kVs: 99, projectedKs: 9 }),
  ];
  const bestBets = buildBestBets([
    pick({ player: 'James Wood', team: 'WSH', opponent: 'TOR' }),
    pick({ player: 'Pete Alonso', team: 'NYM', opponent: 'ATL' }),
  ]);
  const raw = buildRaw({ games, batters, pitchers });

  it('maps frozen HR bestBets order and joined hrScore/venueSide, and never attaches odds', () => {
    const { data } = buildMlbDailyMorningCardInput({ raw, bestBets, slateDate: SLATE_DATE });

    expect(data.homeRuns).toHaveLength(2);
    expect(data.homeRuns[0]).toMatchObject({ player: 'James Wood', hrScore: 78, venueSide: 'home' });
    expect(data.homeRuns[1]).toMatchObject({ player: 'Pete Alonso', hrScore: 74, venueSide: 'away' });
    expect(JSON.stringify(data.homeRuns)).not.toContain('odds');
  });

  it('excludes relievers and sorts K rows by kVs descending', () => {
    const { data } = buildMlbDailyMorningCardInput({ raw, bestBets, slateDate: SLATE_DATE });

    expect(data.strikeouts.map((row) => row.pitcher)).toEqual(['Paul Skenes', 'Tarik Skubal']);
    expect(data.strikeouts[0].kScore).toBe(92);
    expect(JSON.stringify(data.strikeouts)).not.toMatch(/"(side|line|odds|edge)"/);
  });

  it('enforces the 6/5 renderer caps without padding or reordering beyond the frozen selection', () => {
    const manyBatters = Array.from({ length: 8 }, (_, i) =>
      batter({ player: `Batter ${i}`, team: 'WSH', opponent: 'TOR', gameKey: 'TOR@WSH', hrScore: 50 + i }),
    );
    const manyPicks = manyBatters.map((b) => pick({ player: b.player, team: b.team, opponent: b.opponent }));
    const manyPitchers = Array.from({ length: 8 }, (_, i) =>
      pitcher({ pitcher: `Pitcher ${i}`, team: 'PIT', opponent: 'CIN', gameKey: 'PIT@CIN', kVs: 50 + i, projectedKs: 5 }),
    );

    const { data } = buildMlbDailyMorningCardInput({
      raw: buildRaw({ games, batters: manyBatters, pitchers: manyPitchers }),
      bestBets: buildBestBets(manyPicks),
      slateDate: SLATE_DATE,
    });

    expect(data.homeRuns).toHaveLength(6);
    expect(data.strikeouts).toHaveLength(5);
    // Frozen bestBets order preserved (first 6 of the 8 picks), never re-ranked.
    expect(data.homeRuns.map((r) => r.player)).toEqual(['Batter 0', 'Batter 1', 'Batter 2', 'Batter 3', 'Batter 4', 'Batter 5']);
  });

  it('derives snapshot fields from documented sources and records diagnostics for unavailable fields', () => {
    const { data, diagnostics } = buildMlbDailyMorningCardInput({ raw, bestBets, slateDate: SLATE_DATE });

    expect(data.snapshot.gamesModeled).toBe(2);
    expect(data.snapshot.projectedStartingPitchers).toBe(3);
    expect(data.snapshot.modeledHitters).toBe(2);
    expect(data.snapshot.highestHrScore).toEqual({ value: 78, player: 'James Wood' });
    expect(data.snapshot.highestProjectedK).toEqual({ value: 7.6, player: 'Paul Skenes' });
    expect(data.updatedTimeEt).toMatch(/ET$/);
    expect(diagnostics.warnings).not.toContain('LAST_REFRESH_UNAVAILABLE');

    const { diagnostics: emptyDiagnostics, data: emptyData } = buildMlbDailyMorningCardInput({
      raw: buildRaw({ games: [], batters: [], pitchers: [] }),
      bestBets: buildBestBets([]),
      slateDate: SLATE_DATE,
    });
    expect(emptyData.snapshot.gamesModeled).toBe(0);
    expect(emptyDiagnostics.warnings).toContain('NO_STARTER_K_ROWS_AVAILABLE');
  });

  it('drops a bestBets pick with no matching raw batter row instead of fabricating one', () => {
    const badBestBets = buildBestBets([pick({ player: 'Ghost Player', team: 'ZZZ', opponent: 'YYY' })]);
    const { data, diagnostics } = buildMlbDailyMorningCardInput({ raw, bestBets: badBestBets, slateDate: SLATE_DATE });

    expect(data.homeRuns).toHaveLength(0);
    expect(diagnostics.droppedHomeRuns).toEqual([{ player: 'Ghost Player', reason: 'NO_MATCHING_RAW_BATTER_ROW' }]);
  });

  it('produces output that survives the real normalizer and renderer with no leaked literals or remote URLs', () => {
    const { data } = buildMlbDailyMorningCardInput({ raw, bestBets, slateDate: SLATE_DATE });
    const normalized = normalizeMorning(data);
    const svg = renderCard(normalized);

    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).not.toMatch(/undefined|NaN|(?:^|[^a-zA-Z])null(?:[^a-zA-Z]|$)/);
    expect(svg).not.toMatch(/(?:href|src)="https?:\/\//);
  });
});

describe('buildMlbDailyConfirmedCardInput', () => {
  const games = [game('TOR@WSH', 'WSH', 'TOR')];
  const batters = [batter({ player: 'James Wood', team: 'WSH', opponent: 'TOR', gameKey: 'TOR@WSH', hrScore: 78, hrOddsYes: '+340' })];
  const raw = buildRaw({ games, batters, pitchers: [] });
  const bestBets = buildBestBets([pick({ player: 'James Wood', team: 'WSH', opponent: 'TOR', hrOddsYes: '+340' })]);

  it('maps confirmed HR rows with real parsed odds', () => {
    const { data } = buildMlbDailyConfirmedCardInput({ raw, bestBets, slateDate: SLATE_DATE, preview: true });
    expect(data.homeRuns[0]).toMatchObject({ player: 'James Wood', odds: 340, venueSide: 'home' });
  });

  it('drops HR rows missing valid odds rather than fabricating a price', () => {
    const noOddsBestBets = buildBestBets([pick({ player: 'James Wood', team: 'WSH', opponent: 'TOR', hrOddsYes: null })]);
    const noOddsBatters = [batter({ player: 'James Wood', team: 'WSH', opponent: 'TOR', gameKey: 'TOR@WSH', hrScore: 78, hrOddsYes: null })];
    const { data, diagnostics } = buildMlbDailyConfirmedCardInput({
      raw: buildRaw({ games, batters: noOddsBatters, pitchers: [] }),
      bestBets: noOddsBestBets,
      slateDate: SLATE_DATE,
      preview: true,
    });
    expect(data.homeRuns).toHaveLength(0);
    expect(diagnostics.droppedHomeRuns).toEqual([{ player: 'James Wood', reason: 'MISSING_VALID_ODDS' }]);
  });

  it('never populates strikeouts or values (no trustworthy static source) and records why', () => {
    const { diagnostics, readiness } = buildMlbDailyConfirmedCardInput({ raw, bestBets, slateDate: SLATE_DATE, preview: true });
    expect(diagnostics.reasons).toContain(CONFIRMED_K_SOURCE_UNAVAILABLE);
    expect(diagnostics.reasons).toContain(CONFIRMED_VALUES_SOURCE_UNAVAILABLE);
    expect(readiness.reasons).toContain('INSUFFICIENT_CONFIRMED_K_ROWS');
    expect(readiness.reasons).toContain('CONFIRMED_VALUES_SOURCE_UNAVAILABLE');
  });

  it('returns a blocked result (data: null) when not ready and preview is not explicitly requested', () => {
    const result = buildMlbDailyConfirmedCardInput({ raw, bestBets, slateDate: SLATE_DATE });
    expect(result.data).toBeNull();
    expect(result.readiness.ready).toBe(false);
  });

  it('only returns populated data when preview is explicitly requested', () => {
    const result = buildMlbDailyConfirmedCardInput({ raw, bestBets, slateDate: SLATE_DATE, preview: true });
    expect(result.data).not.toBeNull();
    expect(result.readiness.ready).toBe(false);
  });

  it('produces preview output that survives the real normalizeConfirmed + renderer', () => {
    const { data } = buildMlbDailyConfirmedCardInput({ raw, bestBets, slateDate: SLATE_DATE, preview: true });
    const normalized = normalizeConfirmed(data, { preview: true, valuesSourceAvailable: false });
    const svg = renderCard(normalized);

    expect(normalized.publishReady).toBe(false);
    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).not.toMatch(/undefined|NaN|(?:^|[^a-zA-Z])null(?:[^a-zA-Z]|$)/);
    expect(svg).not.toMatch(/(?:href|src)="https?:\/\//);
  });
});
