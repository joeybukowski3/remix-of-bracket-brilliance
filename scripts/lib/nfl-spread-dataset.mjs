/**
 * Walk-forward dataset for the JKB projected spread model (nfl-spread-v0.1.0).
 *
 * Loads the committed EPA cache and the repository's own schedules/results,
 * then exposes the one engine used by both the artifact generator and the
 * backtest regression tests. Sharing it means the numbers a test asserts are
 * produced by exactly the code that ships the artifact.
 *
 * NO MARKET DATA IS READ HERE. Nothing in this module opens the market artifact
 * or accepts a line, and no market value reaches the sample, the opponent
 * adjustment, the composite or the beta fit.
 *
 * Pure computation over local files — the network is never touched.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./nfl-schedules-results-core.mjs";
import { parseCompactRow } from "./nfl-epa-core.mjs";
import {
  SPREAD_HFA_POINTS,
  SPREAD_PRIOR_K,
  adjustOnePass,
  buildTeamGameLog,
  compositeStrength,
  fitBeta,
  homeFieldFor,
  indexLogByTeam,
  leagueSnapshot,
} from "./nfl-spread-model.mjs";

/** Seasons holding both an EPA cache and completed results, oldest first. */
export const HISTORY_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];

/**
 * Seasons that can be predicted. 2020 is absent because it has no cached prior
 * season to fall back on in week 1.
 */
export const FITTABLE_SEASONS = [2021, 2022, 2023, 2024, 2025];

/** Seasons reported by the backtest. 2021 exists only to fit 2022's beta. */
export const BACKTEST_SEASONS = [2022, 2023, 2024, 2025];

/** Minimum games behind a beta fit before it is trusted. */
export const MIN_FIT_OBSERVATIONS = 200;

/**
 * A league snapshot needs most of the league present before its z-scores mean
 * anything; below this the composite is refused rather than published thin.
 */
const MIN_TEAMS_IN_SNAPSHOT = 20;

const readJson = (path) => JSON.parse(readFileSync(path, "utf-8"));
const mean = (values) => values.reduce((s, v) => s + v, 0) / values.length;

export function loadEpaCache(root, seasons = HISTORY_SEASONS) {
  const byKey = new Map();
  for (const season of seasons) {
    const path = join(root, "data", "nfl", "nflverse", "epa-team-game", `epa_team_game_${season}.csv`);
    if (!existsSync(path)) {
      throw new Error(`Missing EPA cache for ${season} at ${path}; run refresh-nfl-epa-source-cache.mjs`);
    }
    for (const row of parseCsv(readFileSync(path, "utf-8")).map(parseCompactRow)) {
      byKey.set(`${row.gameId}|${row.team}`, row);
    }
  }
  if (byKey.size === 0) throw new Error("EPA cache produced no rows");
  return byKey;
}

export function loadSeason(root, season) {
  const dir = join(root, "public", "data", "nfl", String(season));
  const gamesPath = join(dir, "games.json");
  const resultsPath = join(dir, "results.json");
  if (!existsSync(gamesPath) || !existsSync(resultsPath)) return null;
  return {
    season,
    games: readJson(gamesPath).games ?? [],
    results: readJson(resultsPath).results ?? [],
  };
}

/**
 * Build the walk-forward engine.
 *
 * `strengthAt` is memoised per kickoff instant because a Sunday slate shares one
 * cutoff across up to a dozen games; recomputing 32 team samples for each would
 * dominate the run.
 */
export function loadSpreadDataset(root) {
  const teams = readJson(join(root, "public", "data", "nfl", "teams.json")).teams.map((t) => t.abbr).sort();
  if (teams.length !== 32) throw new Error(`teams.json must supply 32 teams, got ${teams.length}`);

  const epaByKey = loadEpaCache(root);
  const log = [];
  for (const season of HISTORY_SEASONS) {
    const s = loadSeason(root, season);
    if (!s) throw new Error(`Missing schedule/results for ${season}`);
    log.push(...buildTeamGameLog({ games: s.games, results: s.results, epaByKey }));
  }
  if (log.length === 0) throw new Error("no completed history rows; refusing to continue");
  const byTeam = indexLogByTeam(log);

  const snapshotCache = new Map();
  function strengthAt(cutoffMs, season) {
    const key = `${season}|${cutoffMs}`;
    if (snapshotCache.has(key)) return snapshotCache.get(key);
    const snapshot = leagueSnapshot(byTeam, teams, { cutoffMs, season, k: SPREAD_PRIOR_K });
    const value = snapshot.size >= MIN_TEAMS_IN_SNAPSHOT ? compositeStrength(adjustOnePass(snapshot)) : null;
    snapshotCache.set(key, value);
    return value;
  }

  /**
   * Every completed game of a season paired with the strength difference that
   * was knowable before its kickoff. Throws if a game ever appears inside its
   * own feature sample.
   */
  function observationsFor(season) {
    const s = loadSeason(root, season);
    if (!s) return [];
    const finals = new Map(
      s.results.filter((r) => r.seasonType === "REG" && r.final === true).map((r) => [r.gameId, r])
    );
    const out = [];
    for (const g of s.games) {
      if (g.seasonType !== "REG") continue;
      const res = finals.get(g.gameId);
      if (!res) continue;
      const kickoff = g.dateUtc ? Date.parse(g.dateUtc) : Number.NaN;
      if (!Number.isFinite(kickoff)) continue;
      const strength = strengthAt(kickoff, season);
      if (!strength) continue;
      const home = strength.get(res.homeAbbr);
      const away = strength.get(res.awayAbbr);
      if (!home || !away) continue;
      assertNoLeakage(g.gameId, home, away);
      out.push({
        gameId: g.gameId,
        season,
        week: g.week,
        neutralSite: g.neutralSite === true,
        strengthDiff: home.compositeZ - away.compositeZ,
        margin: res.homeScore - res.awayScore,
        homeAbbr: res.homeAbbr,
        awayAbbr: res.awayAbbr,
      });
    }
    return out;
  }

  const observationsBySeason = new Map(FITTABLE_SEASONS.map((s) => [s, observationsFor(s)]));

  /** Beta for a target season, fitted only on strictly earlier seasons. */
  function betaFor(targetSeason) {
    const fitSeasons = FITTABLE_SEASONS.filter((s) => s < targetSeason);
    const obs = fitSeasons.flatMap((s) => observationsBySeason.get(s) ?? []);
    if (obs.length < MIN_FIT_OBSERVATIONS) {
      throw new Error(
        `beta fit for ${targetSeason} has only ${obs.length} observations (min ${MIN_FIT_OBSERVATIONS})`
      );
    }
    const { beta, observations } = fitBeta(obs, SPREAD_HFA_POINTS);
    return { beta, observations, fitSeasons };
  }

  return { teams, byTeam, strengthAt, observationsBySeason, betaFor };
}

/** Throws if the game being projected is inside either team's own sample. */
export function assertNoLeakage(gameId, home, away) {
  if (home.sampleGameIds.includes(gameId) || away.sampleGameIds.includes(gameId)) {
    throw new Error(`${gameId}: target game leaked into its own feature sample`);
  }
}

function summarize(rows) {
  const errors = rows.map((r) => r.predicted - r.actual);
  const decided = rows.filter((r) => r.actual !== 0);
  const correct = decided.filter((r) => Math.sign(r.predicted) === Math.sign(r.actual)).length;
  const mx = mean(rows.map((r) => r.predicted));
  const my = mean(rows.map((r) => r.actual));
  const sxx = rows.reduce((s, r) => s + (r.predicted - mx) ** 2, 0);
  const slope = sxx > 0 ? rows.reduce((s, r) => s + (r.predicted - mx) * (r.actual - my), 0) / sxx : Number.NaN;
  return {
    n: rows.length,
    mae: mean(errors.map(Math.abs)),
    rmse: Math.sqrt(mean(errors.map((e) => e * e))),
    bias: mean(errors),
    winnerAccuracy: correct / decided.length,
    calibrationSlope: slope,
    calibrationIntercept: my - slope * mx,
  };
}

/**
 * Walk-forward backtest over BACKTEST_SEASONS.
 *
 * Every season is predicted with a beta fitted only on strictly earlier
 * seasons, so no result is ever in scope for the parameter that predicts it.
 */
export function runBacktest(dataset, seasons = BACKTEST_SEASONS) {
  const bySeason = new Map();
  const pooledRows = [];
  for (const season of seasons) {
    const { beta } = dataset.betaFor(season);
    const rows = (dataset.observationsBySeason.get(season) ?? []).map((o) => ({
      gameId: o.gameId,
      predicted: beta * o.strengthDiff + homeFieldFor(o.neutralSite),
      actual: o.margin,
    }));
    bySeason.set(season, { beta, ...summarize(rows) });
    pooledRows.push(...rows);
  }
  return { bySeason, pooled: summarize(pooledRows) };
}
