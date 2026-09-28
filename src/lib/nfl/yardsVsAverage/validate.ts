/**
 * Fail-closed checks for public/data/nfl/yards-vs-average-by-position.json.
 * Every problem returned here is a hard failure; provider lag between the
 * schedule and the player-week cache is reported separately as warnings by
 * scripts/lib/nfl-allowed-by-position-coverage.mjs.
 */

import type { HistoricalPlayerWeek } from "@/lib/fantasy/weekly/history";
import { offenseGameKey } from "./gameLog";
import {
  YARDS_VS_AVERAGE_METRIC_KEYS,
  YARDS_VS_AVERAGE_PCT_MIN_BASELINE_PER_GAME,
  YARDS_VS_AVERAGE_PCT_SUPPRESSED_METRICS,
  YARDS_VS_AVERAGE_SAMPLE_KEYS,
  YARDS_VS_AVERAGE_SCHEMA_VERSION,
  type YardsVsAverageArtifact,
} from "./types";

const MAX_PROBLEMS = 50;

/** Paths of every non-finite number (NaN/Infinity cannot survive JSON, but a hand-built object can carry them). */
function nonFiniteNumbers(value: unknown, path = "$", out: string[] = []): string[] {
  if (typeof value === "number" && !Number.isFinite(value)) out.push(path);
  else if (Array.isArray(value)) value.forEach((item, index) => nonFiniteNumbers(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) nonFiniteNumbers(item, `${path}.${key}`, out);
  return out;
}

/** First path where two JSON values differ, or null when equal. */
export function firstDifference(actual: unknown, expected: unknown, path = "$"): string | null {
  if (Object.is(actual, expected)) return null;
  if (typeof actual !== typeof expected || actual === null || expected === null || typeof actual !== "object") {
    return `${path}: ${JSON.stringify(actual)} != expected ${JSON.stringify(expected)}`;
  }
  if (Array.isArray(actual) !== Array.isArray(expected)) return `${path}: array/object mismatch`;
  const keys = new Set([...Object.keys(actual as object), ...Object.keys(expected as object)]);
  for (const key of keys) {
    const diff = firstDifference((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

/** Distinct offense-games per (defense, season) straight from the rows -- independent of position grouping. */
function cacheDefenseGameCounts(rows: readonly HistoricalPlayerWeek[], seasons: readonly number[]): Map<string, number> {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!seasons.includes(row.season)) continue;
    const key = offenseGameKey(row.season, row.week, row.team);
    if (seen.has(key)) continue;
    seen.add(key);
    const countKey = `${row.opponent}|${row.season}`;
    counts.set(countKey, (counts.get(countKey) ?? 0) + 1);
  }
  return counts;
}

export function validateYardsVsAverageArtifact(
  artifact: YardsVsAverageArtifact,
  context: { expected: YardsVsAverageArtifact; rows: readonly HistoricalPlayerWeek[]; teams: readonly string[]; season: number },
): string[] {
  const problems: string[] = [];
  if (!artifact || typeof artifact !== "object") return ["artifact is not an object"];
  if (artifact.schemaVersion !== YARDS_VS_AVERAGE_SCHEMA_VERSION) problems.push(`schemaVersion ${artifact.schemaVersion} != ${YARDS_VS_AVERAGE_SCHEMA_VERSION}`);
  if (artifact.season !== context.season) problems.push(`artifact season ${artifact.season} != ${context.season}`);
  if (!Number.isInteger(artifact.week) || (artifact.week as number) < 1) problems.push(`artifact week ${artifact.week} is not a positive integer`);
  if (!Array.isArray(artifact.rows) || !Array.isArray(artifact.games)) return [...problems, "rows/games must be arrays"];

  const nonFinite = nonFiniteNumbers(artifact);
  if (nonFinite.length) problems.push(`non-finite numbers at ${nonFinite.slice(0, 5).join(", ")}`);

  const rowTeams = artifact.rows.map((row) => row?.team);
  if (artifact.rows.length !== context.teams.length) problems.push(`expected ${context.teams.length} team rows, found ${artifact.rows.length}`);
  if (new Set(rowTeams).size !== rowTeams.length) problems.push("duplicate team rows");
  const missingTeams = context.teams.filter((team) => !rowTeams.includes(team));
  if (missingTeams.length) problems.push(`missing team rows: ${missingTeams.join(", ")}`);

  // Games: unique, complete metric coverage (zero-production groups are 0, never absent).
  const seenKeys = new Set<string>();
  const seenDefenseWeeks = new Set<string>();
  const artifactCounts = new Map<string, number>();
  for (const game of artifact.games) {
    if (seenKeys.has(game.key)) problems.push(`duplicate game key ${game.key}`);
    seenKeys.add(game.key);
    const defenseWeek = `${game.season}|${game.week}|${game.defense}`;
    if (seenDefenseWeeks.has(defenseWeek)) problems.push(`duplicate defense-game ${defenseWeek}`);
    seenDefenseWeeks.add(defenseWeek);
    for (const metric of YARDS_VS_AVERAGE_METRIC_KEYS) {
      if (typeof game.actual?.[metric] !== "number") problems.push(`${game.key}: actual.${metric} missing (dropped position group?)`);
      if (game.baseline && typeof game.baseline[metric] !== "number") problems.push(`${game.key}: baseline.${metric} missing`);
    }
    if (Math.abs(game.priorWeight + game.currentWeight - 1) > 1e-9) problems.push(`${game.key}: blend weights do not sum to 1`);
    const countKey = `${game.defense}|${game.season}`;
    artifactCounts.set(countKey, (artifactCounts.get(countKey) ?? 0) + 1);
  }
  const cacheCounts = cacheDefenseGameCounts(context.rows, [context.season - 1, context.season]);
  for (const team of context.teams) {
    for (const season of [context.season - 1, context.season]) {
      const key = `${team}|${season}`;
      const inCache = cacheCounts.get(key) ?? 0;
      const inArtifact = artifactCounts.get(key) ?? 0;
      if (inCache !== inArtifact) problems.push(`${team} ${season}: artifact has ${inArtifact} defense-games, player-week cache has ${inCache}`);
    }
  }

  // Samples: consistency counts and % rules.
  for (const row of artifact.rows) {
    for (const sampleKey of YARDS_VS_AVERAGE_SAMPLE_KEYS) {
      for (const metric of YARDS_VS_AVERAGE_METRIC_KEYS) {
        const label = `${row.team} ${sampleKey}/${metric}`;
        const sample = row.samples?.[sampleKey]?.[metric];
        if (!sample) { problems.push(`${label}: missing sample`); continue; }
        if (sample.gamesAbove + sample.gamesBelow > sample.gamesSampled) problems.push(`${label}: above+below exceeds games sampled`);
        if ((sample.gamesSampled === 0) !== (sample.deltaYds == null)) problems.push(`${label}: deltaYds/gamesSampled mismatch`);
        if (YARDS_VS_AVERAGE_PCT_SUPPRESSED_METRICS.includes(metric) && (sample.deltaPct != null || sample.rankPct != null)) {
          problems.push(`${label}: % must be suppressed`);
        }
        if ((sample.deltaPct == null) !== (sample.rankPct == null)) problems.push(`${label}: deltaPct/rankPct nullability mismatch`);
      }
    }
  }
  if (!(artifact.percent?.minBaselinePerGame === YARDS_VS_AVERAGE_PCT_MIN_BASELINE_PER_GAME)) problems.push("percent.minBaselinePerGame does not match the code constant");

  // Source-of-truth check: the artifact must equal a fresh rebuild from the same cache.
  const diff = firstDifference({ ...artifact, generatedAt: null }, { ...context.expected, generatedAt: null });
  if (diff) problems.push(`artifact does not match a rebuild from the player-week cache: ${diff}`);

  return problems.slice(0, MAX_PROBLEMS);
}
