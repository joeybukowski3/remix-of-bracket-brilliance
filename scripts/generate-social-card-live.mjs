#!/usr/bin/env node
/**
 * Live-data MLB daily model card generator.
 *
 * Reads the frozen production artifacts (public/data/mlb/hr-props-raw.json,
 * public/data/mlb/hr-props-best-bets.json), adapts them into the normalized
 * card contract, then passes through the EXISTING normalizer/renderer/writer
 * (scripts/lib/social-cards/{mlb,render,write-social-card}.mjs) -- this file
 * never renders or writes anything itself.
 *
 * Usage:
 *   node scripts/generate-social-card-live.mjs --edition=morning [--slate-date=YYYY-MM-DD] [--raw=...] [--best-bets=...] [--k-plan=...] [--preview] [--output-dir=...]
 *   node scripts/generate-social-card-live.mjs --edition=confirmed [--preview] [--slate-date=YYYY-MM-DD] [--raw=...] [--best-bets=...]
 *
 * Morning strikeout rows require an explicit --k-plan=<path> pointing at an
 * already-selected, already-ordered K artifact ({ edition, slateDate,
 * strikeouts: [...] }). No such artifact exists in production today -- see
 * docs/social-cards.md for the proposed schema/producer. Without --k-plan,
 * morning generation blocks (exit 1) unless --preview is also passed, in
 * which case a partial card with an empty strikeout section is written.
 *
 * No network posting, no leases, no receipts, no workflow changes -- see
 * docs/social-cards.md for the Phase 1 boundary.
 */
import path from 'node:path';
import process from 'node:process';
import { getEasternDate } from './generate-mlb-hr-props.mjs';
import { buildMlbDailyConfirmedCardInput } from './lib/social-cards/adapters/build-confirmed.mjs';
import { buildMlbDailyMorningCardInput } from './lib/social-cards/adapters/build-morning.mjs';
import { resolveMlbDailyCardSource } from './lib/social-cards/adapters/resolve-source.mjs';
import { writeSocialCard } from './lib/social-cards/write-social-card.mjs';

function parseArgs(argv) {
  const out = { preview: false };
  for (const arg of argv) {
    if (arg === '--preview') {
      out.preview = true;
    } else if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      out[key] = rest.join('=');
    }
  }
  return out;
}

const ROOT = process.cwd();
const DEFAULT_RAW_PATH = path.join(ROOT, 'public', 'data', 'mlb', 'hr-props-raw.json');
const DEFAULT_BEST_BETS_PATH = path.join(ROOT, 'public', 'data', 'mlb', 'hr-props-best-bets.json');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const edition = args.edition;
  if (edition !== 'morning' && edition !== 'confirmed') {
    throw new Error('--edition is required and must be "morning" or "confirmed"');
  }

  const slateDate = args['slate-date'] ?? getEasternDate();
  const rawPath = args.raw ? path.resolve(args.raw) : DEFAULT_RAW_PATH;
  const bestBetsPath = args['best-bets'] ? path.resolve(args['best-bets']) : DEFAULT_BEST_BETS_PATH;
  const kPlanPath = args['k-plan'] ? path.resolve(args['k-plan']) : null;
  const outputDir = args['output-dir'] ?? 'artifacts/social-cards';

  const { raw, bestBets, kPlan } = resolveMlbDailyCardSource({ edition, slateDate, rawPath, bestBetsPath, kPlanPath });

  if (edition === 'morning') {
    const { data, readiness, diagnostics } = buildMlbDailyMorningCardInput({ raw, bestBets, kPlan, slateDate, preview: args.preview });
    if (diagnostics.warnings.length) {
      console.warn(`[social-card-live] morning diagnostics: ${diagnostics.warnings.join(', ')}`);
    }
    if (diagnostics.droppedHomeRuns.length) {
      console.warn(`[social-card-live] dropped HR rows: ${JSON.stringify(diagnostics.droppedHomeRuns)}`);
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
    bestBets,
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
