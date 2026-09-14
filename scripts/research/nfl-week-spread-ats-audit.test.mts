import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { audit, metrics, selectLatest, validMarket } from './nfl-week-spread-ats-audit.mts';
import { contentHash } from '../lib/nfl-production-prediction-archive.ts';

test('strict kickoff excludes kickoff and postgame rows; input order cannot select a different snapshot', () => {
  const rows = [
    { id: 'pre', time: '2026-09-10T00:19:59Z' },
    { id: 'kick', time: '2026-09-10T00:20:00Z' },
    { id: 'post', time: '2026-09-10T04:00:00Z' },
  ];
  for (const input of [rows, [...rows].reverse()]) assert.equal(selectLatest(input, Date.parse(rows[1].time), 'time', 'id').id, 'pre');
  assert.throws(() => selectLatest([rows[0], { ...rows[0], id: 'different' }], Date.parse(rows[1].time), 'time', 'id'), /Ambiguous/);
});
test('error sign, RMSE and missing data are explicit', () => {
  assert.deepEqual(metrics([{ projection: 3, actual: 1 }, { projection: 2, actual: 6 }, { projection: 5, actual: null }]), { n: 2, mae: 3, rmse: Math.sqrt(10), mean_signed_error: -1, median_absolute_error: 3 });
  assert.deepEqual(metrics([]), { n: 0, mae: null, rmse: null, mean_signed_error: null, median_absolute_error: null });
});
test('market rejects wrong identity, inverted sign, late provider updates and altered state', () => {
  const g = { gameId: 'game', homeAbbr: 'sea', awayAbbr: 'ne', dateUtc: '2026-09-10T00:20:00Z' };
  const r: any = { jkbGameId: 'game', homeTeamId: 'sea', awayTeamId: 'ne', kickoffUtc: g.dateUtc, league: 'nfl', provider: 'provider', sportsbook: 'book', capturedAt: '2026-09-09T12:00:00Z', providerUpdatedAt: '2026-09-09T11:59:00Z', spread: { homeLine: -3, awayLine: 3, homePrice: -110, awayPrice: -110 }, total: null, moneyline: null };
  r.contentHash = contentHash({ v: 'jkb-betting-line-v1', league: r.league, jkbGameId: r.jkbGameId, provider: r.provider, sportsbook: r.sportsbook, spread: r.spread, total: null, moneyline: null });
  const cutoff = Date.parse(g.dateUtc);
  assert.equal(validMarket(r, g, cutoff), true);
  for (const patch of [{ homeTeamId: 'ne' }, { providerUpdatedAt: g.dateUtc }, { capturedAt: g.dateUtc }, { contentHash: 'tampered' }, { spread: { ...r.spread, awayLine: -3 } }]) assert.equal(validMarket({ ...r, ...patch }, g, cutoff), false);
});
test('repository audit is deterministic, retains all games and exposes unavailable metrics', () => {
  const a = audit(process.cwd(), 2026, 1, '2026-09-14T10:43:31.000Z');
  const b = audit(process.cwd(), 2026, 1, '2026-09-14T10:43:31.000Z');
  assert.deepEqual(a, b);
  assert.equal(a.rows.length, a.coverage.scheduled_games);
  assert.equal(a.jkb.n, a.coverage.resolved_games);
  for (const r of a.rows.filter(r => r.prediction_id)) assert.ok(Date.parse(r.prediction_timestamp) < Date.parse(r.kickoff));
  assert.equal(a.closing_market.n, 0);
  assert.equal(a.ats.status, 'unavailable');
  assert.equal(a.clv.status, 'unavailable');
  assert.equal(a.coverage.completed_games_expected, a.coverage.completed_games_joined);
  const baseline = JSON.parse(readFileSync('docs/research/nfl-week1-spread-ats-audit-2026/evidence/completion-provenance.json', 'utf8'));
  assert.deepEqual(Object.fromEntries(a.rows.map(r => [r.game_id,r.prediction_id])), baseline.selected_predictions);
  for (const [path, hash] of Object.entries(baseline.protected_sha256)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash, path);
  for (const r of a.rows.filter(r => r.actual != null)) {
    assert.equal(r.signed_error, r.projection-r.actual);
    assert.equal(r.rmse_contribution, r.signed_error ** 2);
    assert.equal(r.verifiedClosingMarket, null);
    assert.equal(r.recommendation_result, 'NO_PICK');
  }
});
