/**
 * Generate public/data/nfl/2026/projected-matchup-metrics.json.
 *
 * Publishes the twelve EPA and success-rate metrics of the 2026 Projection
 * lens. Nothing else in the comparison contract is produced here: conventional,
 * trench and market metrics stay unavailable, and the JKB Power Rating stays
 * model-managed by the canonical Current Rating board.
 *
 * Method (selected by the backtest in
 * scripts/research/nfl-projected-metrics-backtest.mjs — see
 * docs/features/nfl-projected-comparison.md for the full result table):
 *
 *   x_t = 0.6 * v_t(2025) + 0.4 * v_t(2024)        two-season recency blend
 *   p_t = mu(2025) + k_family * (x_t - mean_t x)   regression to the league mean
 *
 * v is the raw, opponent-unadjusted full-season rate, defined exactly as the
 * observed lens defines it, so a projected value and an observed value are the
 * same quantity and the Blended lens may mix them linearly. Opponent-adjusted
 * predictors were tested and did not beat this out of sample.
 *
 * The projection never reads, converts or is calibrated against the 0-99 Power
 * Rating, and it never reads a 2026 observed artifact.
 *
 * Usage:
 *   node scripts/generate-nfl-projected-matchup-metrics.mjs
 *   node scripts/generate-nfl-projected-matchup-metrics.mjs --dry-run
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EPA_CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "epa-team-game");
const SUCCESS_CACHE_DIR = join(ROOT, "data", "nfl", "nflverse", "success-team-game");
const TEAMS_PATH = join(ROOT, "public", "data", "nfl", "teams.json");
const GAMES_PATH = join(ROOT, "public", "data", "nfl", "2025", "games.json");
const OUTPUT_PATH = join(ROOT, "public", "data", "nfl", "2026", "projected-matchup-metrics.json");

export const PROJECTION_VERSION = "nfl-projected-comparison-v1.0";
export const PRIOR_SEASON = 2025;
export const SECOND_PRIOR_SEASON = 2024;
/** Weight on the most recent prior season; the remainder goes to the season before it. */
export const RECENCY_WEIGHT = 0.6;

/**
 * Regression-to-the-mean coefficients, one per stability family.
 *
 * Fitted by leave-one-season-out cross-validation over the 2021-2025 target
 * seasons. Metrics are grouped rather than fitted individually so twelve
 * coefficients are not read off five seasons of data; within a family the
 * per-metric optima differed by less than 0.05.
 */
export const SHRINKAGE_BY_FAMILY = Object.freeze({
  "offense-passing": 0.55,
  "offense-rushing": 0.45,
  "defense-passing": 0.30,
  "defense-rushing": 0.20,
});

/** Metric key -> [cache, numerator, denominator, scale, family]. */
const METRICS = Object.freeze({
  "off.epaPerPlay": ["epa", "off_epa", "off_plays", 1, "offense-passing"],
  "off.epaPerPass": ["epa", "pass_epa", "pass_plays", 1, "offense-passing"],
  "off.epaPerRush": ["epa", "rush_epa", "rush_plays", 1, "offense-rushing"],
  "off.successRate": ["success", "off_success", "off_plays", 100, "offense-passing"],
  "off.passSuccessRate": ["success", "pass_success", "pass_plays", 100, "offense-passing"],
  "off.rushSuccessRate": ["success", "rush_success", "rush_plays", 100, "offense-rushing"],
  "def.epaPerPlayAllowed": ["epa", "off_epa", "off_plays", 1, "defense-passing"],
  "def.epaPerPassAllowed": ["epa", "pass_epa", "pass_plays", 1, "defense-passing"],
  "def.epaPerRushAllowed": ["epa", "rush_epa", "rush_plays", 1, "defense-rushing"],
  "def.successRateAllowed": ["success", "off_success", "off_plays", 100, "defense-passing"],
  "def.passSuccessRateAllowed": ["success", "pass_success", "pass_plays", 100, "defense-passing"],
  "def.rushSuccessRateAllowed": ["success", "rush_success", "rush_plays", 100, "defense-rushing"],
});

/** Rank direction, mirroring src/lib/nfl/matchupMetrics.ts. Restated so the generator has no TS dependency. */
const DIRECTIONS = Object.freeze(Object.fromEntries(
  Object.keys(METRICS).map((key) => [key, key.startsWith("def.") ? "lower-is-better" : "higher-is-better"]),
));

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

/** Compact caches are plain unquoted CSV; anything else is a corrupted cache. */
function readCompactCsv(path) {
  const text = readFileSync(path, "utf-8");
  if (text.includes('"')) throw new Error(`${path}: unexpected quoted field in a compact cache`);
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line !== "");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    if (cells.length !== header.length) throw new Error(`${path}: malformed row "${line}"`);
    return Object.fromEntries(header.map((column, index) => [column, cells[index]]));
  });
}

const number = (row, field, path) => {
  const value = Number(row[field]);
  if (!Number.isFinite(value)) throw new Error(`${path}: ${field} "${row[field]}" is not finite`);
  return value;
};

/**
 * Full-season raw rates for one season, both sides of the ball.
 *
 * Offence sums a team's own rows; defence sums the rows where the team is the
 * opponent, which is exactly how the observed EPA and success artifacts define
 * "allowed". Rates are computed once from season sums, never averaged per game.
 */
export function seasonRates(season) {
  const sources = {
    epa: readCompactCsv(join(EPA_CACHE_DIR, `epa_team_game_${season}.csv`)),
    success: readCompactCsv(join(SUCCESS_CACHE_DIR, `success_team_game_${season}.csv`)),
  };
  const teams = [...new Set(sources.epa.map((row) => row.team))].sort();
  if (teams.length !== 32) throw new Error(`${season}: expected 32 teams in the EPA cache, got ${teams.length}`);
  const rates = new Map(teams.map((team) => [team, {}]));
  for (const [key, [cacheId, numeratorField, denominatorField]] of Object.entries(METRICS)) {
    const rows = sources[cacheId];
    const isDefense = key.startsWith("def.");
    const scale = METRICS[key][3];
    for (const team of teams) {
      const selected = rows.filter((row) => (isDefense ? row.opponent : row.team) === team);
      const numerator = selected.reduce((total, row) => total + number(row, numeratorField, cacheId), 0);
      const denominator = selected.reduce((total, row) => total + number(row, denominatorField, cacheId), 0);
      if (denominator <= 0) throw new Error(`${season}: ${team} ${key} has no eligible plays`);
      rates.get(team)[key] = (scale * numerator) / denominator;
    }
  }
  return rates;
}

const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

/** Competition ranks from unrounded values, matching rankProjectedMetric in the app. */
export function rankValues(values, direction) {
  const sorted = [...values].sort((a, b) =>
    (direction === "lower-is-better" ? a[1] - b[1] : b[1] - a[1]) || a[0].localeCompare(b[0]));
  let rank = 0;
  return new Map(sorted.map(([abbr, value], index) => {
    if (index === 0 || value !== sorted[index - 1][1]) rank = index + 1;
    return [abbr, rank];
  }));
}

/** p = mu(prior season) + k * (blended predictor - its own league mean). */
export function projectMetric(key, prior, secondPrior, teams) {
  const predictor = new Map(teams.map((team) =>
    [team, RECENCY_WEIGHT * prior.get(team)[key] + (1 - RECENCY_WEIGHT) * secondPrior.get(team)[key]]));
  const anchor = mean(teams.map((team) => prior.get(team)[key]));
  const centre = mean([...predictor.values()]);
  const shrinkage = SHRINKAGE_BY_FAMILY[METRICS[key][4]];
  return new Map(teams.map((team) => [team, anchor + shrinkage * (predictor.get(team) - centre)]));
}

/** Latest completed regular-season kickoff of the prior season: the newest fact the projection uses. */
function priorSeasonCutoff() {
  const games = JSON.parse(readFileSync(GAMES_PATH, "utf-8")).games
    .filter((game) => game.seasonType === "REG" && game.status === "final" && game.dateUtc);
  if (games.length === 0) throw new Error("No completed 2025 regular-season games found");
  return games.map((game) => game.dateUtc).sort().at(-1);
}

function metricProvenance(key) {
  const [cacheId, , , , family] = METRICS[key];
  const definition = cacheId === "epa"
    ? "Projected 2026 raw EPA per play (sum EPA / sum eligible plays), opponent-unadjusted, defined as the observed lens defines it."
    : "Projected 2026 raw success rate in percent (successful eligible plays / eligible plays), opponent-unadjusted, defined as the observed lens defines it.";
  return {
    source: cacheId === "epa"
      ? "data/nfl/nflverse/epa-team-game (nflverse / nflfastR)"
      : "data/nfl/nflverse/success-team-game (nflverse / nflfastR)",
    producer: "scripts/generate-nfl-projected-matchup-metrics.mjs",
    modelVersion: `${PROJECTION_VERSION}; ${RECENCY_WEIGHT}/${(1 - RECENCY_WEIGHT).toFixed(1)} ${PRIOR_SEASON}/${SECOND_PRIOR_SEASON} blend, k=${SHRINKAGE_BY_FAMILY[family]} (${family})`,
    definition,
    opponentAdjusted: false,
    dependsOnPowerRating: false,
  };
}

export function buildArtifact({ teams, prior, secondPrior, generatedAt, asOf }) {
  const abbrs = teams.map((team) => team.abbr);
  const projected = new Map(Object.keys(METRICS).map((key) => [key, projectMetric(key, prior, secondPrior, abbrs)]));
  const ranks = new Map(Object.keys(METRICS).map((key) =>
    [key, rankValues(projected.get(key), DIRECTIONS[key])]));
  return {
    schemaVersion: "nfl-projected-matchup-metrics-v1",
    season: 2026,
    horizon: "regular-season",
    generatedAt,
    asOf,
    projectionVersion: PROJECTION_VERSION,
    metrics: Object.fromEntries(Object.keys(METRICS).map((key) => [key, metricProvenance(key)])),
    teams: teams.map((team) => ({
      teamId: team.id,
      abbr: team.abbr,
      metrics: Object.fromEntries(Object.keys(METRICS).map((key) =>
        [key, { value: projected.get(key).get(team.abbr), rank: ranks.get(key).get(team.abbr) }])),
    })),
  };
}

function main() {
  const args = parseArgs(process.argv);
  const teams = JSON.parse(readFileSync(TEAMS_PATH, "utf-8")).teams;
  if (teams.length !== 32) throw new Error("teams.json is malformed: expected 32 canonical teams");
  const artifact = buildArtifact({
    teams,
    prior: seasonRates(PRIOR_SEASON),
    secondPrior: seasonRates(SECOND_PRIOR_SEASON),
    generatedAt: new Date().toISOString(),
    asOf: priorSeasonCutoff(),
  });
  if (args.dryRun) {
    console.log(JSON.stringify(artifact.teams.find((team) => team.abbr === "bal"), null, 2));
    return;
  }
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf-8");
  console.log(`[nfl:projected-metrics] wrote ${OUTPUT_PATH}`);
  console.log(`[nfl:projected-metrics] ${artifact.teams.length} teams x ${Object.keys(METRICS).length} metrics, asOf ${artifact.asOf}`);
}

main();
