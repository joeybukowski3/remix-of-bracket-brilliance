/**
 * Guards against regressing back to the two selection-policy bugs this
 * architecture fixed:
 *   1. HR rows sourced from hr-props-best-bets.json ("bestBets"), a
 *      different selection than the website's Social Media Tables.
 *   2. K rows sourced from an in-adapter sort/filter over raw.pitchers
 *      (kVs-based ranking) or an external "K-plan" artifact, instead of the
 *      shared selectTopSocialKRows()/buildPitcherStrikeoutRows() the
 *      website itself uses.
 * These are source-text assertions (not behavior tests) because the whole
 * point is that this code must not exist in the live card path at all.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');

function readSource(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('no legacy selection policy remains in the live card path', () => {
  it('build-morning.mjs never references bestBets, a K-plan artifact, or performs any sort/filter/rank', () => {
    const source = readSource('scripts/lib/social-cards/adapters/build-morning.mjs');
    expect(source).not.toMatch(/bestBets/);
    expect(source).not.toMatch(/kPlan/i);
    expect(source).not.toMatch(/\.sort\(|\.filter\(/);
    // raw.pitchers/raw.batters/raw.games ARE read here, but only ever as a
    // plain .length count for the snapshot metrics -- never indexed,
    // mapped, or iterated to pick which rows appear on the card.
    expect(source).not.toMatch(/raw\.pitchers\.map|raw\?\.pitchers\.map|raw\.pitchers\.filter|raw\?\.pitchers\.filter/);
  });

  it('build-confirmed.mjs never references bestBets or a K-plan artifact', () => {
    const source = readSource('scripts/lib/social-cards/adapters/build-confirmed.mjs');
    expect(source).not.toMatch(/bestBets/);
    expect(source).not.toMatch(/kPlan/i);
  });

  it('resolve-source.mjs never references bestBets or a K-plan path', () => {
    const source = readSource('scripts/lib/social-cards/adapters/resolve-source.mjs');
    expect(source).not.toMatch(/bestBets/i);
    expect(source).not.toMatch(/kPlan/i);
  });

  it('the live CLI imports the same shared selectors the website uses, and never reads hr-props-best-bets.json', () => {
    const source = readSource('scripts/generate-social-card-live.ts');
    expect(source).toContain('@/lib/mlb/hrPropSocialSelection');
    expect(source).toContain('@/lib/mlb/kPropValueSorting');
    expect(source).toContain('@/lib/mlb/mlbSocialSelection');
    expect(source).not.toMatch(/hr-props-best-bets/);
    expect(source).not.toMatch(/k-plan/i);
  });

  it('mlb-source-mappers.mjs no longer exposes a bestBets join helper', () => {
    const source = readSource('scripts/lib/social-cards/adapters/mlb-source-mappers.mjs');
    expect(source).not.toMatch(/buildBatterLookup|normalizeJoinKey/);
  });
});
