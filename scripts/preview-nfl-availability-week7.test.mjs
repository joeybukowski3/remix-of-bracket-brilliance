import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAvailability, resolveSnapshot } from '../src/lib/nfl/availability/resolver.ts';

const player = { season: 2026, week: 7, gameId: '2026_07_NYG_HOU', kickoff: '2026-10-25T17:00:00Z', playerId: 'gsis:00-0039923', playerName: 'J.J. McCarthy', team: 'nyg', opponent: 'hou', position: 'QB' };
const cutoff = '2026-10-22T19:00:00Z';
const fact = (id, kind, value, more = {}) => ({ id, kind, value, source: 'official_team', url: 'https://example.test', publishedAt: '2026-10-21T19:15:00Z', retrievedAt: '2026-10-22T18:57:31Z', season: 2026, week: 7, gameId: player.gameId, playerId: player.playerId, team: player.team, detail: '', ...more });

describe('availability resolver', () => {
  it('confirmed QB1 overrides stale ordering and exposes conflict', () => {
    const row = resolveAvailability(player, [fact('team', 'role', 'confirmed_starter'), fact('depth', 'depth', '2', { source: 'espn_depth', publishedAt: '2026-10-22T12:59:29Z' })], cutoff);
    assert.equal(row.role, 'confirmed_starter'); assert.equal(row.conflict, true);
  });
  it('official OUT and inactive exclude; questionable remains conditional', () => {
    assert.equal(resolveAvailability(player, [fact('out', 'game_status', 'out')], cutoff).lineupEligibility, 'excluded');
    assert.equal(resolveAvailability(player, [fact('inactive', 'inactive', 'inactive')], cutoff).lineupEligibility, 'excluded');
    assert.equal(resolveAvailability(player, [fact('q', 'game_status', 'questionable')], cutoff).lineupEligibility, 'conditional');
    assert.equal(resolveAvailability(player, [fact('d', 'game_status', 'doubtful')], cutoff).lineupEligibility, 'conditional');
    assert.equal(resolveAvailability(player, [fact('act', 'roster', 'ACT', { source: 'nflverse_roster', publishedAt: '2026-10-20T18:00:00Z' }), fact('later-out', 'game_status', 'out')], cutoff).lineupEligibility, 'excluded');
    assert.equal(resolveAvailability(player, [fact('act', 'roster', 'ACT', { source: 'nflverse_roster', publishedAt: '2026-10-20T18:00:00Z' }), fact('game-day-inactive', 'inactive', 'inactive')], cutoff).lineupEligibility, 'excluded');
  });
  it('missing report and ACT roster do not become healthy', () => {
    assert.equal(resolveAvailability(player, [], cutoff).availability, 'unknown');
    assert.equal(resolveAvailability(player, [fact('act', 'roster', 'ACT', { source: 'nflverse_roster' })], cutoff).availability, 'unknown');
    const unsupported = resolveAvailability(player, [fact('historical-out', 'game_status', 'out', { source: 'historical_usage' })], cutoff);
    assert.equal(unsupported.availability, 'unknown');
    assert.equal(unsupported.rejectedEvidence[0].reason, 'source-not-authoritative-for-fact');
  });
  it('higher-priority status wins and conflict stays visible', () => {
    const row = resolveAvailability(player, [fact('out', 'game_status', 'out'), fact('q', 'game_status', 'questionable', { source: 'nflverse_injury' })], cutoff);
    assert.equal(row.gameStatus, 'out'); assert.equal(row.conflict, true);
  });
  it('team changes and ambiguous identity cannot borrow evidence', () => {
    assert.equal(resolveAvailability(player, [fact('old', 'role', 'confirmed_starter', { team: 'min' })], cutoff).role, 'unknown');
    assert.equal(resolveAvailability({ ...player, playerId: null }, [], cutoff).lineupEligibility, 'unknown');
  });
  it('rejects invalid, post-cutoff, and post-kickoff timestamps', () => {
    assert.equal(resolveAvailability(player, [fact('invalid', 'game_status', 'out', { publishedAt: '2026-10-23T00:00:00Z' })], cutoff).rejectedEvidence[0].reason, 'invalid-or-unverified-timestamps');
    assert.equal(resolveAvailability(player, [fact('future', 'game_status', 'out', { publishedAt: '2026-10-24T10:00:00Z', retrievedAt: '2026-10-24T10:01:00Z' })], cutoff).availability, 'unknown');
    assert.equal(resolveAvailability(player, [fact('stale', 'depth', '1', { source: 'espn_depth', publishedAt: '2026-10-01T00:00:00Z' })], cutoff).rejectedEvidence[0].reason, 'stale-depth-chart');
    assert.throws(() => resolveAvailability(player, [], player.kickoff));
  });
  it('permits committees and multiple starters without a forced depth rank', () => {
    const rb = { ...player, position: 'RB' }, wr = { ...player, position: 'WR', playerId: 'gsis:00-0031503' };
    const rows = resolveSnapshot([rb, wr], [fact('rb', 'role', 'backup_rotation'), fact('wr', 'role', 'confirmed_starter', { playerId: wr.playerId })], cutoff);
    assert.equal(rows.find(r => r.playerId === rb.playerId).role, 'backup_rotation');
    assert.equal(rows.find(r => r.playerId === wr.playerId).role, 'confirmed_starter');
    assert.ok(rows.every(r => r.depthRank === null));
  });
  it('regeneration is order-independent and duplicate player-games fail', () => {
    const facts = [fact('role', 'role', 'confirmed_starter'), fact('depth', 'depth', '1', { source: 'espn_depth' })];
    assert.deepEqual(resolveSnapshot([player], facts, cutoff), resolveSnapshot([player], [...facts].reverse(), cutoff));
    assert.throws(() => resolveSnapshot([player, player], facts, cutoff));
  });
  it('offline preview is byte-idempotent and leaves production artifacts intact', () => {
    const inputs = ['public/data/nfl/2026/games.json', 'public/data/nfl/2026/yardage-projections.json', 'public/data/fantasy/projections/2026/week-07.json', 'public/data/nfl/2026/touchdown-preview.json'];
    const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
    const before = inputs.map(hash), directory = mkdtempSync(join(tmpdir(), 'jkb-availability-'));
    const output = join(directory, 'preview.json');
    try {
      const run = () => execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/preview-nfl-availability-week7.ts', `--output=${output}`], { stdio: 'pipe' });
      run(); const first = hash(output); run();
      assert.equal(hash(output), first);
      assert.deepEqual(inputs.map(hash), before);
    } finally { unlinkSync(output); rmdirSync(directory); }
  });
});
