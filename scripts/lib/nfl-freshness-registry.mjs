/**
 * What the NFL freshness check monitors. Kept separate from the check logic so
 * adding a dataset is a one-line registry change.
 *
 * kind:
 *   current-week       artifact carries a week and must equal the current week
 *   current-week-file  a per-week file that must exist for the current week
 *   through-week      artifact covers games through `_meta.throughWeek`
 *   age               rolling artifact: only its generatedAt age is limited
 *
 * maxAgeHours values follow each producing workflow's cadence plus slack, so a
 * single missed run warns but a stopped pipeline fails.
 */
const pad2 = (n) => String(n).padStart(2, "0");

export function artifactRegistry(season, currentWeek) {
  const nfl = "public/data/nfl";
  return [
    { id: "results", path: `${nfl}/${season}/results.json`, kind: "age", maxAgeHours: 36 },
    { id: "games", path: `${nfl}/${season}/games.json`, kind: "age", maxAgeHours: 36 },
    { id: "fantasy-points-allowed", path: `${nfl}/fantasy-points-allowed.json`, kind: "current-week", maxAgeHours: 96 },
    { id: "tds-allowed-by-position", path: `${nfl}/tds-allowed-by-position.json`, kind: "current-week", maxAgeHours: 96 },
    { id: "yards-vs-average-by-position", path: `${nfl}/yards-vs-average-by-position.json`, kind: "current-week", maxAgeHours: 96 },
    { id: "yardage-projections", path: `${nfl}/${season}/yardage-projections.json`, kind: "current-week", maxAgeHours: 96 },
    { id: "team-opportunity", path: `${nfl}/${season}/team-opportunity.json`, kind: "current-week", maxAgeHours: 96 },
    { id: "touchdown-preview", path: `${nfl}/${season}/touchdown-preview.json`, kind: "current-week", maxAgeHours: 96 },
    {
      id: "dfs-lineup-context",
      path: currentWeek == null ? null : `${nfl}/dfs/${season}/week-${pad2(currentWeek)}.json`,
      kind: "current-week-file",
      maxAgeHours: 168,
      note: "needs public/data/fantasy/projections/<season>/week-NN.json from the Tuesday fantasy workflow",
    },
    {
      id: "betting-splits-current",
      path: `${nfl}/betting-splits/current.json`,
      kind: "current-week",
      // Three scheduled refreshes a day; 48h tolerates the Tuesday gap before DraftKings posts next week's
      // lines. The publication gate (NFL_DK_SPLITS_LIVE_VERIFIED) has been satisfied since 2026-09-25, so a
      // stale or missing artifact is a real failure, not an expected one.
      maxAgeHours: 48,
    },
    { id: "team-stats", path: `${nfl}/${season}/team-stats.json`, kind: "age", maxAgeHours: 120 },
    { id: "power-ratings", path: `${nfl}/${season}/power-ratings.json`, kind: "age", maxAgeHours: 120 },
    { id: "matchup-projections", path: `${nfl}/matchup-projections.json`, kind: "age", maxAgeHours: 120 },
    { id: "matchup-metrics", path: `${nfl}/matchup-metrics.json`, kind: "age", maxAgeHours: 240 },
    { id: "matchup-epa", path: `${nfl}/matchup-epa.json`, kind: "age", maxAgeHours: 240 },
    { id: "team-performance-analytics", path: `${nfl}/${season}/team-performance-analytics.json`, kind: "through-week", maxAgeHours: 240 },
  ];
}

/** Artifacts to compare against what production serves (repo path -> URL path under the site root). */
export const PRODUCTION_ARTIFACT_IDS = [
  "results",
  "games",
  "fantasy-points-allowed",
  "yardage-projections",
  "tds-allowed-by-position",
  "betting-splits-current",
];

/**
 * Refresh workflows whose health is checked via the GitHub API. Excluded on
 * purpose: nfl-ai-handicap-v2 (skips by design behind an enable gate).
 */
export const CRITICAL_WORKFLOWS = [
  { name: "nfl-schedules-results.yml", maxAgeHours: 36 },
  { name: "nfl-yardage-projections.yml", maxAgeHours: 36 },
  { name: "nfl-allowed-by-position.yml", maxAgeHours: 96 },
  { name: "nfl-touchdown-preview.yml", maxAgeHours: 48 },
  { name: "nfl-matchup-projections.yml", maxAgeHours: 48 },
  { name: "nfl-matchup-market.yml", maxAgeHours: 48 },
  { name: "nfl-yardage-market.yml", maxAgeHours: 48 },
  { name: "nfl-betting-lines-daily.yml", maxAgeHours: 48 },
  { name: "nfl-betting-splits-refresh.yml", maxAgeHours: 36 },
  { name: "nfl-slot-wide-defense-context.yml", maxAgeHours: 72 },
  { name: "nfl-team-ratings.yml", maxAgeHours: 192 },
  { name: "nfl-matchup-metrics.yml", maxAgeHours: 192 },
  { name: "nfl-performance-analytics.yml", maxAgeHours: 192 },
  { name: "nfl-success-rates.yml", maxAgeHours: 192 },
  { name: "nfl-trench-metrics.yml", maxAgeHours: 192 },
  { name: "generate-fantasy-weekly-projections.yml", maxAgeHours: 192 },
];
