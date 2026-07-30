#!/usr/bin/env -S npx tsx
/**
 * Live-data MLB daily model card generator.
 *
 * Reads the frozen production artifact (public/data/mlb/hr-props-raw.json),
 * applies the exact same filtering and HR/K selection the website's Social
 * Media Tables use (see src/lib/mlb/hrPropSocialSelection.ts,
 * src/lib/mlb/mlbSocialSelection.ts, src/lib/mlb/kPropValueSorting.ts --
 * imported directly here, not reimplemented), adapts the selected rows into
 * the normalized card contract, then hands the result to the EXISTING
 * normalizer/renderer/writer (scripts/lib/social-cards/{mlb,render,write-social-card}.mjs).
 * This file never renders or writes anything itself, and never selects,
 * ranks, or filters rows on its own -- selection is entirely delegated to
 * the shared TypeScript modules above.
 *
 * A TypeScript entrypoint run directly via `tsx` (not compiled/spawned as a
 * second process) so it can import those `@/lib/mlb/*` modules with the
 * project's normal path alias, exactly like the website does.
 *
 * Usage:
 *   npx tsx scripts/generate-social-card-live.ts --edition=morning [--slate-date=YYYY-MM-DD] [--raw=...] [--preview] [--output-dir=...]
 *   npx tsx scripts/generate-social-card-live.ts --edition=confirmed [--preview] [--slate-date=YYYY-MM-DD] [--raw=...]
 *
 * Morning strikeout rows require at least one row to survive
 * selectTopSocialKRows (i.e. a real, currently VALID market line + workload-
 * confident projection somewhere on the slate). Without any, morning
 * generation blocks (exit 1) unless --preview is also passed, in which case
 * a partial card with an empty strikeout section is written.
 *
 * Confirmed strikeouts/values remain blocked by design in this phase -- see
 * docs/social-cards.md.
 */
import path from 'node:path';
import process from 'node:process';
import { getEasternDate } from './generate-mlb-hr-props.mjs';
import { buildMlbDailyConfirmedCardInput } from './lib/social-cards/adapters/build-confirmed.mjs';
import { buildMlbDailyMorningCardInput } from './lib/social-cards/adapters/build-morning.mjs';
import { resolveMlbDailyCardSource } from './lib/social-cards/adapters/resolve-source.mjs';
import { writeSocialCard } from './lib/social-cards/write-social-card.mjs';
import { buildTbdGameKeySet, buildPitcherStrikeoutRows } from '@/lib/mlb/mlbSocialSelection';
import { selectTopSocialHrRows } from '@/lib/mlb/hrPropSocialSelection';
import { selectTopSocialKRows } from '@/lib/mlb/kPropValueSorting';
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from '@/pages/MlbHrProps';

const MAX_HR_ROWS = 6;
const MAX_K_ROWS = 5;

type CliArgs = {
  edition?: string;
  'slate-date'?: string;
  raw?: string;
  'output-dir'?: string;
  preview: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { preview: false };
  for (const arg of argv) {
    if (arg === '--preview') {
      out.preview = true;
    } else if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      (out as Record<string, string>)[key] = rest.join('=');
    }
  }
  return out;
}

/** Normalized string check identical to the one guarding isStarterPlaceholder-driven filtering elsewhere. */
function isStarterPlaceholder(value: unknown): boolean {
  const normalized = (typeof value === 'string' ? value.trim() : '').toUpperCase();
  return !normalized || normalized === 'TBD' || normalized === 'TBA' || normalized === 'TO BE ANNOUNCED' || normalized === 'TO BE DETERMINED';
}

/**
 * Applies the exact same TBD-game / placeholder-starter exclusion
 * useMlbPropsData() applies client-side before any HR/K selection runs, so
 * the live CLI's candidate pool matches the website's exactly.
 */
function filterActiveSlate(raw: { games?: HrDashboardGame[]; pitchers?: HrDashboardPitcher[]; batters?: HrDashboardBatter[] }) {
  const allGames = raw.games ?? [];
  const allPitchers = raw.pitchers ?? [];
  const allBatters = raw.batters ?? [];
  const tbdGameKeys = buildTbdGameKeySet(allPitchers, allBatters);

  const games = allGames.filter((game) => !tbdGameKeys.has(game.gameKey));
  const pitchers = allPitchers.filter((p) => !tbdGameKeys.has(p.gameKey) && !isStarterPlaceholder(p.pitcher));
  const batters = allBatters.filter((b) => !tbdGameKeys.has(b.gameKey) && !isStarterPlaceholder(b.opposingPitcher));

  return { games, pitchers, batters };
}

const ROOT = process.cwd();
const DEFAULT_RAW_PATH = path.join(ROOT, 'public', 'data', 'mlb', 'hr-props-raw.json');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const edition = args.edition;
  if (edition !== 'morning' && edition !== 'confirmed') {
    throw new Error('--edition is required and must be "morning" or "confirmed"');
  }

  const slateDate = args['slate-date'] ?? getEasternDate();
  const rawPath = args.raw ? path.resolve(args.raw) : DEFAULT_RAW_PATH;
  const outputDir = args['output-dir'] ?? 'artifacts/social-cards';

  const { raw } = resolveMlbDailyCardSource({ edition, slateDate, rawPath });
  const { games, pitchers, batters } = filterActiveSlate(raw);

  const selectedHomeRuns = selectTopSocialHrRows(batters, { max: MAX_HR_ROWS });

  if (edition === 'morning') {
    const kCandidateRows = buildPitcherStrikeoutRows(batters, games, pitchers);
    const selectedStrikeouts = selectTopSocialKRows(kCandidateRows, MAX_K_ROWS);

    const { data, readiness, diagnostics } = buildMlbDailyMorningCardInput({
      raw,
      selectedHomeRuns,
      selectedStrikeouts,
      slateDate,
      preview: args.preview,
    });
    if (diagnostics.warnings.length) {
      console.warn(`[social-card-live] morning diagnostics: ${diagnostics.warnings.join(', ')}`);
    }
    if (!data) {
      console.error(JSON.stringify({ ready: false, ...readiness, diagnostics }, null, 2));
      process.exitCode = 1;
      return;
    }
    const result = await writeSocialCard({ template: 'mlb_daily_morning', input: data, outputDir });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const { data, readiness, diagnostics } = buildMlbDailyConfirmedCardInput({
    raw,
    selectedHomeRuns,
    slateDate,
    preview: args.preview,
  });
  console.warn(`[social-card-live] confirmed diagnostics: ${JSON.stringify(diagnostics)}`);

  if (!data) {
    console.error(JSON.stringify({ ready: false, ...readiness, diagnostics }, null, 2));
    process.exitCode = 1;
    return;
  }

  const result = await writeSocialCard({
    template: 'mlb_daily_confirmed',
    input: data,
    outputDir,
    preview: args.preview,
    valuesSourceAvailable: false,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
