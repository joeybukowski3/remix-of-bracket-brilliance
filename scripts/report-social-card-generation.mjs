#!/usr/bin/env node
/**
 * Thin CLI wrapper around scripts/lib/social-cards/workflow-summary.mjs for
 * the MLB X Editions workflow: reads a captured stdout/stderr pair from a
 * scripts/generate-social-card-live.ts invocation plus the source artifact's
 * embedded date, and prints a GitHub-Flavored-Markdown summary block to
 * stdout (the caller redirects it into $GITHUB_STEP_SUMMARY).
 *
 * Usage:
 *   node scripts/report-social-card-generation.mjs \
 *     --edition=morning --slate-date=2026-07-30 \
 *     --source-path=public/data/mlb/hr-props-raw.json \
 *     --exit-code=0 --stdout-file=card-morning-stdout.log --stderr-file=card-morning-stderr.log
 */
import { readFileSync, existsSync } from 'node:fs';
import { formatCardGenerationSummary, summarizeCardGeneration } from './lib/social-cards/workflow-summary.mjs';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    out[key] = rest.join('=');
  }
  return out;
}

function readIfExists(filePath) {
  if (!filePath || !existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf8');
}

function readSourceEmbeddedDate(sourcePath) {
  if (!sourcePath || !existsSync(sourcePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(sourcePath, 'utf8'));
    return typeof parsed?.date === 'string' ? parsed.date : null;
  } catch {
    return null;
  }
}

const args = parseArgs(process.argv.slice(2));
const row = summarizeCardGeneration({
  edition: args.edition ?? 'unknown',
  slateDate: args['slate-date'] ?? 'unknown',
  sourcePath: args['source-path'] ?? 'unknown',
  sourceEmbeddedDate: readSourceEmbeddedDate(args['source-path']),
  exitCode: Number(args['exit-code'] ?? '1'),
  stdout: readIfExists(args['stdout-file']),
  stderr: readIfExists(args['stderr-file']),
});

process.stdout.write(formatCardGenerationSummary(row));
