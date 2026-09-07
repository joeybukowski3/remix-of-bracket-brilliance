/**
 * Backtest the 2026 projected comparison metrics (EPA and success rate).
 *
 * Strict temporal integrity: every prediction for season Y uses only full
 * seasons that finished before Y, and every hyper-parameter is chosen by
 * leave-one-season-out cross-validation over the remaining target seasons, so
 * no target season contributes to its own fit.
 *
 * Reads only committed caches:
 *   data/nfl/nflverse/epa-team-game/      2020-2025 (EPA targets 2022-2025)
 *   data/nfl/nflverse/success-team-game/  2019-2025 (success targets 2021-2025)
 *
 * Targets:
 *   full    the whole next regular season
 *   first5  each team's first five games of the next regular season
 *
 * Usage: node scripts/research/nfl-projected-metrics-backtest.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EPA_DIR = join(ROOT, "data", "nfl", "nflverse", "epa-team-game");
const SUCCESS_DIR = join(ROOT, "data", "nfl", "nflverse", "success-team-game");

const EPA_METRICS = {
  "off.epaPerPlay": ["off_epa", "off_plays", 1, false],
  "off.epaPerPass": ["pass_epa", "pass_plays", 1, false],
  "off.epaPerRush": ["rush_epa", "rush_plays", 1, false],
  "def.epaPerPlayAllowed": ["off_epa", "off_plays", 1, true],
  "def.epaPerPassAllowed": ["pass_epa", "pass_plays", 1, true],
  "def.epaPerRushAllowed": ["rush_epa", "rush_plays", 1, true],
};
const SUCCESS_METRICS = {
  "off.successRate": ["off_success", "off_plays", 100, false],
  "off.passSuccessRate": ["pass_success", "pass_plays", 100, false],
  "off.rushSuccessRate": ["rush_success", "rush_plays", 100, false],
  "def.successRateAllowed": ["off_success", "off_plays", 100, true],
  "def.passSuccessRateAllowed": ["pass_success", "pass_plays", 100, true],
  "def.rushSuccessRateAllowed": ["rush_success", "rush_plays", 100, true],
};

const GROUPS = [
  { id: "epa", dir: EPA_DIR, prefix: "epa_team_game", metrics: EPA_METRICS, seasons: [2020, 2021, 2022, 2023, 2024, 2025] },
  { id: "success", dir: SUCCESS_DIR, prefix: "success_team_game", metrics: SUCCESS_METRICS, seasons: [2019, 2020, 2021, 2022, 2023, 2024, 2025] },
];

const FAMILY = (key) => `${key.startsWith("off.") ? "offense" : "defense"}-${/rush/i.test(key) ? "rushing" : "passing"}`;
const KGRID = Array.from({ length: 21 }, (_, index) => index / 20);
const WGRID = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

function readCompactCsv(path) {
  const lines = readFileSync(path, "utf-8").replace(/\r\n/g, "\n").split("\n").filter((line) => line !== "");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => Object.fromEntries(line.split(",").map((cell, index) => [header[index], cell])));
}

/** Season rates, optionally restricted to each team's first or last N games. */
function rates(rows, metrics, window) {
  const teams = [...new Set(rows.map((row) => row.team))].sort();
  const ordered = [...rows].sort((a, b) => Number(a.week) - Number(b.week) || a.game_id.localeCompare(b.game_id));
  const selected = new Map(teams.map((team) => {
    const games = ordered.filter((row) => row.team === team || row.opponent === team).map((row) => row.game_id);
    const unique = [...new Set(games)];
    const picked = window?.first ? unique.slice(0, window.first) : window?.last ? unique.slice(-window.last) : unique;
    return [team, new Set(picked)];
  }));
  const out = new Map(teams.map((team) => [team, {}]));
  for (const [key, [numeratorField, denominatorField, scale, isDefense]] of Object.entries(metrics)) {
    for (const team of teams) {
      const picked = rows.filter((row) =>
        (isDefense ? row.opponent : row.team) === team && selected.get(team).has(row.game_id));
      const numerator = picked.reduce((total, row) => total + Number(row[numeratorField]), 0);
      const denominator = picked.reduce((total, row) => total + Number(row[denominatorField]), 0);
      out.get(team)[key] = denominator > 0 ? (scale * numerator) / denominator : null;
    }
  }
  return out;
}

const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

function score(pairs) {
  const errors = pairs.map(([predicted, actual]) => predicted - actual);
  const predicted = pairs.map((pair) => pair[0]);
  const actual = pairs.map((pair) => pair[1]);
  const mp = mean(predicted);
  const ma = mean(actual);
  const covariance = mean(pairs.map(([p, a]) => (p - mp) * (a - ma)));
  const sp = Math.sqrt(mean(predicted.map((value) => (value - mp) ** 2)));
  const sa = Math.sqrt(mean(actual.map((value) => (value - ma) ** 2)));
  return {
    n: pairs.length,
    mae: mean(errors.map(Math.abs)),
    rmse: Math.sqrt(mean(errors.map((error) => error ** 2))),
    corr: covariance / (sp * sa),
  };
}

function main() {
  const cache = new Map();
  const teamsByGroup = new Map();
  for (const group of GROUPS) {
    for (const season of group.seasons) {
      const rows = readCompactCsv(join(group.dir, `${group.prefix}_${season}.csv`));
      cache.set(`${group.id}|${season}`, {
        full: rates(rows, group.metrics, null),
        last8: rates(rows, group.metrics, { last: 8 }),
        first5: rates(rows, group.metrics, { first: 5 }),
      });
    }
    teamsByGroup.set(group.id, [...cache.get(`${group.id}|2025`).full.keys()].sort());
  }

  /** Candidate predictors, all built from seasons strictly before the target. */
  const CANDIDATES = [
    { id: "A prior season", build: (id, Y, team, key) => cache.get(`${id}|${Y - 1}`).full.get(team)[key] },
    ...WGRID.filter((w) => w < 1).map((w) => ({
      id: `B two-season w=${w}`,
      build: (id, Y, team, key) => w * cache.get(`${id}|${Y - 1}`).full.get(team)[key]
        + (1 - w) * cache.get(`${id}|${Y - 2}`).full.get(team)[key],
    })),
    ...WGRID.filter((w) => w < 1).map((w) => ({
      id: `C final-eight w=${w}`,
      build: (id, Y, team, key) => w * cache.get(`${id}|${Y - 1}`).full.get(team)[key]
        + (1 - w) * cache.get(`${id}|${Y - 1}`).last8.get(team)[key],
    })),
  ];

  const predict = (group, candidate, k, Y, key) => {
    const teams = teamsByGroup.get(group.id);
    const predictor = new Map(teams.map((team) => [team, candidate.build(group.id, Y, team, key)]));
    const anchor = mean(teams.map((team) => cache.get(`${group.id}|${Y - 1}`).full.get(team)[key]));
    const centre = mean([...predictor.values()]);
    return new Map(teams.map((team) => [team, anchor + k * (predictor.get(team) - centre)]));
  };
  const pairsFor = (group, candidate, k, Y, key, target) => {
    const predicted = predict(group, candidate, k, Y, key);
    const actual = cache.get(`${group.id}|${Y}`)[target === "full" ? "full" : "first5"];
    return teamsByGroup.get(group.id).map((team) => [predicted.get(team), actual.get(team)[key]]);
  };
  /** Family score: RMSE relative to the league-mean baseline, averaged over the family's metrics. */
  const familyScore = (group, candidate, k, seasons, keys, target) => mean(keys.map((key) =>
    score(seasons.flatMap((Y) => pairsFor(group, candidate, k, Y, key, target))).rmse
      / score(seasons.flatMap((Y) => pairsFor(group, candidate, 0, Y, key, target))).rmse));

  for (const target of ["full", "first5"]) {
    console.log(`\n================ TARGET: ${target} ================`);
    for (const group of GROUPS) {
      const targets = group.seasons.slice(2);
      const families = [...new Set(Object.keys(group.metrics).map(FAMILY))];
      console.log(`\n--- ${group.id} cache, target seasons ${targets.join(", ")} ---`);
      for (const family of families) {
        const keys = Object.keys(group.metrics).filter((key) => FAMILY(key) === family);
        const picks = [];
        const pooled = new Map(keys.map((key) => [key, []]));
        for (const Y of targets) {
          const others = targets.filter((season) => season !== Y);
          let best = null;
          for (const candidate of CANDIDATES) {
            for (const k of KGRID) {
              const value = familyScore(group, candidate, k, others, keys, target);
              if (best === null || value < best.value) best = { value, candidate, k };
            }
          }
          picks.push(`${Y}<-${best.candidate.id}|k=${best.k}`);
          for (const key of keys) pooled.get(key).push(...pairsFor(group, best.candidate, best.k, Y, key, target));
        }
        // The shipped configuration, held fixed across every fold.
        const shipped = CANDIDATES.find((candidate) => candidate.id === "B two-season w=0.6");
        const shippedK = { "offense-passing": 0.55, "offense-rushing": 0.45, "defense-passing": 0.3, "defense-rushing": 0.2 }[family];
        console.log(`\n[${family}] CV picks: ${picks.join("  ")}   shipped: two-season w=0.6, k=${shippedK}`);
        for (const key of keys) {
          const cv = score(pooled.get(key));
          const ship = score(targets.flatMap((Y) => pairsFor(group, shipped, shippedK, Y, key, target)));
          const baseline = score(targets.flatMap((Y) => pairsFor(group, shipped, 0, Y, key, target)));
          const noShrink = score(targets.flatMap((Y) => pairsFor(group, CANDIDATES[0], 1, Y, key, target)));
          console.log(`  ${key.padEnd(28)} shipped MAE=${ship.mae.toFixed(4)} RMSE=${ship.rmse.toFixed(4)} r=${ship.corr.toFixed(3)}`
            + ` | CV-selected RMSE=${cv.rmse.toFixed(4)} | league mean RMSE=${baseline.rmse.toFixed(4)}`
            + ` | unshrunk prior RMSE=${noShrink.rmse.toFixed(4)} | skill vs mean ${(100 * (1 - ship.rmse / baseline.rmse)).toFixed(1)}%`);
        }
      }
    }
  }
}

main();
