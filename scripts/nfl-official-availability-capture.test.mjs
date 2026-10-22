import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveOfficialCapture, validateOfficialCapture } from '../src/lib/nfl/availability/capture.ts';
import { validateCurrentWeekProjectionArtifact } from './validate-nfl-current-week-yardage-projections.mjs';

const capture = JSON.parse(readFileSync('data/nfl/availability/2026/week-07.json', 'utf8'));
const cutoff = '2026-10-22T21:11:00Z';
const players = [
  { season: 2026, week: 7, gameId: '2026_07_NE_CHI', kickoff: '2026-10-23T00:15:00.000Z', team: 'chi', opponent: 'ne', playerId: 'gsis:00-0040236', playerName: 'Kyle Monangai', position: 'RB' },
  { season: 2026, week: 7, gameId: '2026_07_NYG_HOU', kickoff: '2026-10-25T17:00:00.000Z', team: 'nyg', opponent: 'hou', playerId: 'gsis:00-0039923', playerName: 'J.J. McCarthy', position: 'QB' },
  { season: 2026, week: 7, gameId: '2026_07_NYG_HOU', kickoff: '2026-10-25T17:00:00.000Z', team: 'nyg', opponent: 'hou', playerId: 'gsis:00-0031503', playerName: 'Jameis Winston', position: 'QB' },
];
const copy = () => structuredClone(capture);

describe('official availability capture', () => {
  it('resolves checked classifications and is order independent', () => {
    assert.equal(validateOfficialCapture(capture, 2026, 7, cutoff).coverage.scope, 'partial');
    const rows = resolveOfficialCapture(capture, players, cutoff);
    assert.equal(rows.find(r => r.playerName === 'Kyle Monangai').lineupEligibility, 'excluded');
    assert.equal(rows.find(r => r.playerName === 'J.J. McCarthy').role, 'confirmed_starter');
    assert.equal(rows.find(r => r.playerName === 'Jameis Winston').role, 'backup_rotation');
    assert.deepEqual(rows, resolveOfficialCapture(capture, [...players].reverse(), cutoff));
  });
  it('leaves missing reports unknown and conditional designations conditional', () => {
    const withQuestionable = copy();
    for (const observation of withQuestionable.observations.filter(r => r.playerName === 'Kyle Monangai')) observation.value = 'questionable';
    assert.equal(resolveOfficialCapture(withQuestionable, players, cutoff)[0].availability, 'conditional');
    const missing = copy(); missing.observations = [];
    assert.ok(resolveOfficialCapture(missing, players, cutoff).every(r => r.availability === 'unknown'));
  });
  it('rejects contradictions, malformed identity, future and stale capture', () => {
    const contrary = copy(); contrary.observations.push({ ...contrary.observations[0], id: 'contrary', value: 'questionable' });
    assert.throws(() => validateOfficialCapture(contrary, 2026, 7, cutoff), /Contradictory/);
    assert.throws(() => validateOfficialCapture(contrary, 2026, 7, '2026-10-26T21:11:00Z', true), /Contradictory/);
    const wrong = copy(); wrong.observations[0].playerId = 'gsis:00-0000000';
    assert.throws(() => resolveOfficialCapture(wrong, players, cutoff), /identity not found/);
    assert.throws(() => validateOfficialCapture(capture, 2026, 7, '2026-10-22T20:00:00Z'), /post-cutoff/);
    assert.throws(() => validateOfficialCapture(capture, 2026, 7, '2026-10-26T21:11:00Z'), /older than 72 hours/);
  });
  it('rejects duplicate IDs and fabricated publication timestamps', () => {
    const duplicate = copy(); duplicate.observations.push({ ...duplicate.observations[0] });
    assert.throws(() => validateOfficialCapture(duplicate, 2026, 7, cutoff), /Malformed/);
    const future = copy(); future.observations[0].publishedAt = '2026-10-23T00:00:00Z';
    assert.throws(() => validateOfficialCapture(future, 2026, 7, cutoff), /Malformed/);
    const mislabeledNfl = copy(); mislabeledNfl.observations.find(r => r.source === 'official_nfl').url = 'https://example.com/injury-report';
    assert.throws(() => validateOfficialCapture(mislabeledNfl, 2026, 7, cutoff), /Malformed/);
    const twoStarters = copy(); twoStarters.observations.find(r => r.playerName === 'Jameis Winston').value = 'confirmed_starter';
    assert.throws(() => validateOfficialCapture(twoStarters, 2026, 7, cutoff), /Contradictory official QB starters/);
    const outStarter = copy(); outStarter.observations.push({ ...outStarter.observations.find(r => r.playerName === 'J.J. McCarthy'), id: 'mccarthy-out', kind: 'game_status', value: 'out' });
    assert.throws(() => validateOfficialCapture(outStarter, 2026, 7, cutoff), /Contradictory official starter and exclusion/);
  });
  it('keeps Week 7 opportunity unchanged while removing the OUT player from Yardage and downstream TD inputs', () => {
    const paths = ['public/data/nfl/2026/yardage-projections.json', 'public/data/nfl/2026/touchdown-preview.json'];
    const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
    const before = paths.map(hash);
    const directory = mkdtempSync(join(tmpdir(), 'jkb-yardage-week7-'));
    const output = join(directory, 'preview.json');
    try {
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/generate-nfl-current-week-yardage-projections.ts',
        '--season=2026', '--week=7', `--generated-at=${cutoff}`, '--dry-run', `--output=${output}`],
      { stdio: 'pipe', timeout: 180_000 });
      const old = JSON.parse(readFileSync(paths[0], 'utf8'));
      const proposed = JSON.parse(readFileSync(output, 'utf8'));
      const oldTd = JSON.parse(readFileSync(paths[1], 'utf8'));
      const key = row => `${row.gameId}|${row.playerId}|${row.market}`;
      const previous = new Map(old.rows.map(row => [key(row), row]));
      const next = new Map(proposed.rows.map(row => [key(row), row]));
      assert.equal(old.rows.length, 403);
      assert.equal(proposed.rows.length, 401);
      assert.deepEqual([...next.keys()].filter(id => !previous.has(id)), []);
      assert.deepEqual([...previous.keys()].filter(id => !next.has(id)).sort(), [
        '2026_07_NE_CHI|gsis:00-0040236|receiving',
        '2026_07_NE_CHI|gsis:00-0040236|rushing',
      ]);
      assert.ok(oldTd.players.some(player => player.playerId === 'gsis:00-0040236'));
      assert.ok(!proposed.rows.some(row => row.playerId === 'gsis:00-0040236' && ['receiving', 'rushing'].includes(row.market)));
      const mccarthy = proposed.rows.find(row => row.playerId === 'gsis:00-0039923' && row.market === 'passing');
      assert.equal(mccarthy?.status, 'projected');
      assert.equal(mccarthy?.roleSource, 'official_team');
      assert.equal(mccarthy?.availability.role, 'confirmed_starter');
      assert.ok(!proposed.rows.some(row => row.playerId === 'gsis:00-0031503' && row.market === 'passing'));
      for (const [id, row] of next) {
        assert.equal(row.projectedYards, previous.get(id).projectedYards, `unexpected yard redistribution: ${id}`);
        if (row.market === 'receiving') assert.equal(row.projectedTargets, previous.get(id).projectedTargets, `unexpected target redistribution: ${id}`);
      }
      assert.ok(proposed.rows.some(row => row.team === 'chi' && row.market === 'receiving' && row.allocationDiagnostics?.teamResidualUnallocated > 0));
      assert.ok(proposed.rows.every(row => row.availability.availability === 'unknown'));
      assert.equal(proposed.availabilitySource.coverage, 'partial');
      assert.deepEqual(validateCurrentWeekProjectionArtifact(proposed, {
        expectedSeason: 2026, expectedWeek: 7, expectedGameIds: new Set(old.rows.map(row => row.gameId)),
      }), []);
      assert.deepEqual(paths.map(hash), before);
    } finally { unlinkSync(output); rmdirSync(directory); }
  });
});
