/**
 * Phase 11A: time-based development/validation split. Generic over any
 * research rows carrying a `season` field -- callers decide which seasons
 * are "development" vs "validation" so the same helper works for a real
 * historical split (e.g. dev 2023-2024, validation 2025) or a live
 * paper-trading split (e.g. dev = weeks 1-N, validation = weeks N+1-M) by
 * passing week-tagged pseudo-seasons.
 */

export function splitByTime(rows, { developmentSeasons, validationSeasons }) {
  const devSet = new Set(developmentSeasons);
  const valSet = new Set(validationSeasons);
  const development = [];
  const validation = [];
  const excluded = [];
  for (const row of rows) {
    if (devSet.has(row.season)) development.push(row);
    else if (valSet.has(row.season)) validation.push(row);
    else excluded.push(row);
  }
  return { development, validation, excludedCount: excluded.length };
}
