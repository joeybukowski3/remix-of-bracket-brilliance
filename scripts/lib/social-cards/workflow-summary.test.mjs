import { describe, expect, it } from 'vitest';

import { extractTrailingJson, formatCardGenerationSummary, summarizeCardGeneration } from './workflow-summary.mjs';

describe('extractTrailingJson', () => {
  it('returns null for empty input', () => {
    expect(extractTrailingJson('')).toBeNull();
    expect(extractTrailingJson(undefined)).toBeNull();
  });

  it('returns null when no JSON object is present', () => {
    expect(extractTrailingJson('some crash trace with no braces')).toBeNull();
  });

  it('parses a pure JSON stdout blob', () => {
    expect(extractTrailingJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses the JSON object trailing a non-JSON warning line, as the CLI prints on stderr', () => {
    const text = '[social-card-live] confirmed diagnostics: {"reasons":["X"]}\n{"ready":false,"reasons":["Y"]}';
    expect(extractTrailingJson(text)).toEqual({ ready: false, reasons: ['Y'] });
  });
});

describe('summarizeCardGeneration', () => {
  const base = {
    edition: 'morning',
    slateDate: '2026-07-30',
    sourcePath: 'public/data/mlb/hr-props-raw.json',
    sourceEmbeddedDate: '2026-07-30',
  };

  it('reports PUBLISH_READY from a successful CLI stdout result', () => {
    const stdout = JSON.stringify({
      publishReady: true,
      readiness: { ready: true, reasons: [], counts: { homeRuns: 6, strikeouts: 5 } },
      jsonPath: 'artifacts/social-cards/mlb/2026-07-30/mlb-daily-morning.json',
      svgPath: 'artifacts/social-cards/mlb/2026-07-30/mlb-daily-morning.svg',
      pngPath: 'artifacts/social-cards/mlb/2026-07-30/mlb-daily-morning.png',
    });
    const row = summarizeCardGeneration({ ...base, exitCode: 0, stdout, stderr: '' });
    expect(row.status).toBe('PUBLISH_READY');
    expect(row.hrRowCount).toBe(6);
    expect(row.kRowCount).toBe(5);
    expect(row.filenames).toBe('mlb-daily-morning.json, mlb-daily-morning.svg, mlb-daily-morning.png');
  });

  it('reports PREVIEW_ONLY when the CLI writes preview output', () => {
    const stdout = JSON.stringify({
      publishReady: false,
      readiness: { ready: false, reasons: ['CONFIRMED_VALUES_SOURCE_UNAVAILABLE'], counts: { homeRuns: 6, strikeouts: 0 } },
      jsonPath: 'artifacts/social-cards/mlb/2026-07-30/mlb-daily-confirmed-preview.json',
      svgPath: 'artifacts/social-cards/mlb/2026-07-30/mlb-daily-confirmed-preview.svg',
      pngPath: 'artifacts/social-cards/mlb/2026-07-30/mlb-daily-confirmed-preview.png',
    });
    const row = summarizeCardGeneration({ ...base, edition: 'confirmed', exitCode: 0, stdout, stderr: '' });
    expect(row.status).toBe('PREVIEW_ONLY');
    expect(row.reasons).toBe('CONFIRMED_VALUES_SOURCE_UNAVAILABLE');
  });

  it('reports FAILED and surfaces readiness reasons from a non-zero exit', () => {
    const stderr = '{"ready":false,"reasons":["MORNING_K_ROWS_UNAVAILABLE"],"counts":{"homeRuns":6,"strikeouts":0}}';
    const row = summarizeCardGeneration({ ...base, exitCode: 1, stdout: '', stderr });
    expect(row.status).toBe('FAILED');
    expect(row.reasons).toBe('MORNING_K_ROWS_UNAVAILABLE');
    expect(row.filenames).toBe('—');
  });

  it('reports FAILED with no reasons when the CLI crashed before printing any JSON', () => {
    const row = summarizeCardGeneration({ ...base, exitCode: 1, stdout: '', stderr: 'Error: ENOENT: no such file' });
    expect(row.status).toBe('FAILED');
    expect(row.reasons).toBe('—');
    expect(row.hrRowCount).toBe('—');
  });
});

describe('formatCardGenerationSummary', () => {
  it('renders a markdown block with the required fields', () => {
    const row = summarizeCardGeneration({
      edition: 'morning',
      slateDate: '2026-07-30',
      sourcePath: 'public/data/mlb/hr-props-raw.json',
      sourceEmbeddedDate: '2026-07-30',
      exitCode: 0,
      stdout: JSON.stringify({
        publishReady: true,
        readiness: { ready: true, reasons: [], counts: { homeRuns: 6, strikeouts: 5 } },
        jsonPath: 'a/mlb-daily-morning.json',
        svgPath: 'a/mlb-daily-morning.svg',
        pngPath: 'a/mlb-daily-morning.png',
      }),
      stderr: '',
    });
    const markdown = formatCardGenerationSummary(row);
    expect(markdown).toContain('morning card — 2026-07-30');
    expect(markdown).toContain('public/data/mlb/hr-props-raw.json');
    expect(markdown).toContain('PUBLISH_READY');
    expect(markdown).toContain('HR rows: 6 | K rows: 5');
  });
});
