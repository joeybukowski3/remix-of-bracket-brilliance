import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeConfirmed, normalizeMorning, evaluateConfirmedReadiness } from '../scripts/lib/social-cards/mlb.mjs';
import { renderCard } from '../scripts/lib/social-cards/render.mjs';
const load=(n)=>JSON.parse(readFileSync(new URL(`../scripts/fixtures/${n}`,import.meta.url),'utf8'));
describe('MLB daily cards',()=>{
 it('normalizes morning without odds and preserves order',()=>{const n=normalizeMorning(load('mlb-daily-morning.json'));expect(n.homeRuns).toHaveLength(6);expect(n.strikeouts).toHaveLength(5);expect(n.homeRuns[0].player).toBe('James Wood');expect(JSON.stringify(n)).not.toContain('odds');});
 it('renders exact SVG dimensions and required notes',()=>{const svg=renderCard(normalizeMorning(load('mlb-daily-morning.json')));expect(svg).toContain('width="1080" height="1350"');expect(svg).toContain('Lineups not confirmed. Odds may not yet be available.');expect(svg).not.toMatch(/https?:\/\//);expect(svg).not.toMatch(/undefined|NaN|null/);});
 it('formats confirmed markets and edges',()=>{const n=normalizeConfirmed(load('mlb-daily-confirmed.json'));expect(n.homeRuns[0].odds).toBe('+340');expect(n.strikeouts[0].line).toBe('O 6.5');expect(n.values[1].edge).toBe('+9.4%');expect(n.publishReady).toBe(true);});
 it('fails readiness below minimums',()=>{const x=load('mlb-daily-confirmed-partial.json');const r=evaluateConfirmedReadiness(x);expect(r.ready).toBe(false);expect(r.reasons).toContain('INSUFFICIENT_CONFIRMED_VALUE_ROWS');});
 it('requires explicit preview for partial confirmed',()=>{const x=load('mlb-daily-confirmed-partial.json');expect(()=>normalizeConfirmed(x)).toThrow(/not ready/);const n=normalizeConfirmed(x,{preview:true,valuesSourceAvailable:false});expect(n.preview).toBe(true);expect(n.publishReady).toBe(false);expect(n.readiness.reasons).toContain('CONFIRMED_VALUES_SOURCE_UNAVAILABLE');});
 it('truncates long names deterministically',()=>{const n=normalizeMorning(load('mlb-daily-long-names.json'));expect(n.homeRuns[0].player.endsWith('…')).toBe(true);expect(n.homeRuns[0].player.length).toBeLessThanOrEqual(24);});
 it('renders a missing-logo abbreviation fallback',()=>{const n=normalizeMorning(load('mlb-daily-missing-logo.json'));expect(renderCard(n)).toContain('ZZZ');});
 it('derives documented snapshot leaders from supplied rows',()=>{const input=load('mlb-daily-morning.json');const n=normalizeMorning(input);expect(n.snapshot.modeledHitters).toBe(input.snapshot.modeledHitters);expect(n.snapshot.highestHrScore.value).toBe(78);expect(n.snapshot.highestProjectedK.value).toBe(7.6);});
});
