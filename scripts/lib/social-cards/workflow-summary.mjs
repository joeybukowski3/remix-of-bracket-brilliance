/**
 * Parses the live daily-card CLI's own stdout/stderr JSON (already printed by
 * scripts/generate-social-card-live.ts on both the success and blocked paths)
 * into the handful of fields the MLB X Editions workflow summary needs.
 * Never re-derives readiness, counts, or filenames itself -- it only reads
 * what the CLI already reported.
 */

/**
 * The CLI's final, authoritative JSON result is always the last thing it
 * prints (earlier lines, e.g. the confirmed-diagnostics warning, may embed
 * their own unrelated JSON-looking text). Tries each '{' from the rightmost
 * backwards and returns the first slice-to-end-of-text that parses cleanly,
 * so a leading warning line's braces never get mistaken for the real result.
 *
 * @param {string|null|undefined} text
 * @returns {object|null} the trailing JSON object in `text`, or null if
 *   `text` is empty or contains no parseable trailing JSON object (e.g. a
 *   crash before the CLI printed anything).
 */
export function extractTrailingJson(text) {
  if (!text) return null;
  for (let i = text.lastIndexOf('{'); i !== -1; i = text.lastIndexOf('{', i - 1)) {
    try {
      return JSON.parse(text.slice(i));
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * @param {object} params
 * @param {'morning'|'confirmed'} params.edition
 * @param {string} params.slateDate
 * @param {string} params.sourcePath        path to hr-props-raw.json
 * @param {string|null} params.sourceEmbeddedDate  hr-props-raw.json's own `.date` field
 * @param {number} params.exitCode          the CLI process's exit code
 * @param {string} params.stdout            captured stdout
 * @param {string} params.stderr            captured stderr
 * @returns {{edition: string, slateDate: string, sourcePath: string,
 *   sourceEmbeddedDate: string, status: string, publishReady: boolean,
 *   reasons: string, hrRowCount: string|number, kRowCount: string|number,
 *   filenames: string}}
 */
export function summarizeCardGeneration({ edition, slateDate, sourcePath, sourceEmbeddedDate, exitCode, stdout, stderr }) {
  const success = exitCode === 0 ? extractTrailingJson(stdout) : null;
  const failure = exitCode !== 0 ? extractTrailingJson(stderr) : null;
  const readiness = success?.readiness ?? failure ?? null;
  const counts = readiness?.counts ?? {};

  const status = success ? (success.publishReady ? 'PUBLISH_READY' : 'PREVIEW_ONLY') : 'FAILED';
  const reasons = readiness?.reasons?.length ? readiness.reasons.join('; ') : '—';
  const filenames = success
    ? [success.jsonPath, success.svgPath, success.pngPath]
        .filter(Boolean)
        .map((filePath) => filePath.split(/[\\/]/).pop())
        .join(', ')
    : '—';

  return {
    edition,
    slateDate,
    sourcePath,
    sourceEmbeddedDate: sourceEmbeddedDate ?? '—',
    status,
    publishReady: Boolean(success?.publishReady),
    reasons,
    hrRowCount: counts.homeRuns ?? '—',
    kRowCount: counts.strikeouts ?? '—',
    filenames,
  };
}

/**
 * @param {ReturnType<typeof summarizeCardGeneration>} row
 * @returns {string} a GitHub-Flavored-Markdown bullet block for the step summary
 */
export function formatCardGenerationSummary(row) {
  return [
    `### ${row.edition} card — ${row.slateDate}`,
    '',
    `- Source: \`${row.sourcePath}\` (embedded date: ${row.sourceEmbeddedDate})`,
    `- Status: **${row.status}**${row.status === 'FAILED' ? '' : ` (publishReady: ${row.publishReady})`}`,
    `- Readiness reasons: ${row.reasons}`,
    `- HR rows: ${row.hrRowCount} | K rows: ${row.kRowCount}`,
    `- Files: ${row.filenames}`,
    '',
  ].join('\n');
}
