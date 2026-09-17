/** Data completion only: canonical nflverse parser, scoped merge, no model invocation. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv, buildNflverseTeamMap, transformSeasonRows } from '../lib/nfl-schedules-results-core.mjs';
import { buildNflMeta, toNflJsonFileString } from '../lib/nfl-data-meta.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = /^--(input|generated-at)=(.+)$/.exec(arg);
  if (!match) throw new Error(`Unknown argument: ${arg}`);
  return [match[1], match[2]];
}));
if (!args.input || !args['generated-at']) throw new Error('Required --input=<captured nflverse Week 1 CSV> --generated-at=<UTC>');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const raw = parseCsv(readFileSync(resolve(args.input), 'utf8'));
if (raw.length !== 16 || raw.some(r => Number(r.season) !== 2026 || Number(r.week) !== 1 || r.game_type !== 'REG')) throw new Error('Expected exactly the 16 canonical 2026 Week 1 REG rows');
const normalized = transformSeasonRows(raw, 2026, buildNflverseTeamMap(json('public/data/nfl/teams.json')));
const gamesPath = 'public/data/nfl/2026/games.json', resultsPath = 'public/data/nfl/2026/results.json';
const games = json(gamesPath), results = json(resultsPath);
for (const incoming of normalized.games) {
  const existing = games.games.find(g => g.gameId === incoming.gameId);
  if (!existing || ['homeAbbr','awayAbbr','dateUtc','neutralSite','season','week'].some(k => existing[k] !== incoming[k])) throw new Error(`Identity/kickoff mismatch: ${incoming.gameId}`);
  if (existing.status === 'final' && incoming.status !== 'final') throw new Error(`Final regression: ${incoming.gameId}`);
}
const ids = new Set(normalized.games.map(g => g.gameId));
games.games = games.games.map(g => normalized.games.find(n => n.gameId === g.gameId) ?? g);
results.results = [...results.results.filter(r => !ids.has(r.gameId)), ...normalized.results].sort((a,b) => a.week-b.week || a.gameId.localeCompare(b.gameId));
for (const artifact of [games, results]) artifact._meta = buildNflMeta({ ...artifact._meta, generatedAt: args['generated-at'], notes: [...new Set([...artifact._meta.notes, 'Week 1 data completed from a captured 16-row nflverse/nfldata games.csv subset; all other season rows preserved.'])] });
writeFileSync(gamesPath, toNflJsonFileString(games));
writeFileSync(resultsPath, toNflJsonFileString(results));
console.log(JSON.stringify({ games: normalized.games.length, finals: normalized.results.length, missing: normalized.games.filter(g => g.status !== 'final').map(g => g.gameId), files: [gamesPath, resultsPath] }));
