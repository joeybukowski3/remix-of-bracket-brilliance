/**
 * RESEARCH ONLY -- study mlb-k-projection-v3-workload-model
 *
 * Assembles the evaluation dataset for the v3 workload model and attaches v3
 * projections to it. Nothing here is imported by production code.
 *
 * SOURCES
 *   pregame-archive.json      pregame v2 projections joined to graded outcomes
 *   season-bf-index.json      pregame season batters faced, for the alpha rule
 *   venue-split-index.json    pregame true season workload, by site
 *   start-log.json            league-wide completed-start log
 *
 * LEAKAGE CONTRACT
 *   - the clean sample is the SAME one the prior workload-dispersion study used
 *     (filterLeakageSafe + classifyRow + a recoverable league anchor), so v2 and
 *     v3 are scored on identical rows
 *   - a projection for slate D may read only starts strictly before D
 *   - the league starter level is an EXPANDING mean over starts before D, never
 *     a full-sample constant
 *   - the opponent league-centring constants are likewise EXPANDING: the
 *     constants used on slate D are computed from observations before D only
 *   - the market line never enters a projection, only the scoring
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { filterLeakageSafe } from "./mlb-k-research-helpers.mjs";
import { classifyRow, partitionByOutcomeValidity } from "./mlb-k-outcome-validity.mjs";
import { recoverLeagueAnchor } from "./mlb-k-shrinkage-helpers.mjs";

import { computeWorkloadProjectionV3 } from "../../mlb-k/compute-workload-projection-v3.mjs";
import { leagueBaseline, opponentObservations } from "../../mlb-k/mlb-k-opponent-sp-workload-v3.mjs";

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function loadSources(root = process.cwd()) {
  const base = path.join(root, "data", "mlb", "k-research", "high-line-calibration");
  const v3 = path.join(root, "data", "mlb", "k-research", "v3-workload-model");
  const read = (file) => JSON.parse(readFileSync(file, "utf8"));
  return {
    archive: read(path.join(base, "pregame-archive.json")),
    seasonBf: read(path.join(base, "shrinkage-experiment", "season-bf-index.json")),
    venue: read(path.join(v3, "venue-split-index.json")),
    startLog: read(path.join(v3, "start-log.json")),
  };
}

/**
 * Expanding league starter IP/start: for each date in the log, the mean innings
 * of every start STRICTLY BEFORE it. Built once and read by key, so no row can
 * see a future start through the league anchor.
 */
export function buildLeagueIpIndex(starts) {
  const sorted = [...starts].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  const index = new Map();
  const bfIndex = new Map();
  let total = 0;
  let count = 0;
  let bfTotal = 0;
  let ipTotal = 0;
  let cursor = 0;
  const dates = [...new Set(sorted.map((s) => s.date))].sort();
  for (const date of dates) {
    // everything strictly before `date` has already been folded in
    index.set(date, count > 0 ? total / count : null);
    bfIndex.set(date, ipTotal > 0 ? bfTotal / ipTotal : null);
    while (cursor < sorted.length && sorted[cursor].date === date) {
      const ip = finite(sorted[cursor].ip);
      const bf = finite(sorted[cursor].bf);
      if (ip !== null) {
        total += ip;
        count += 1;
        if (bf !== null && ip > 0) {
          bfTotal += bf;
          ipTotal += ip;
        }
      }
      cursor += 1;
    }
  }
  return {
    index,
    bfIndex,
    dates,
    finalMean: count > 0 ? total / count : null,
    finalBfPerIp: ipTotal > 0 ? bfTotal / ipTotal : null,
  };
}

/**
 * A pregame league value as known before `date`, from one of the expanding
 * indexes. Falls back to the nearest earlier date when the slate itself has no
 * starts in the log.
 */
function leagueValueAsOf(leagueIndex, date, key, fallbackKey) {
  const { dates } = leagueIndex;
  const index = leagueIndex[key];
  const fallback = leagueIndex[fallbackKey];
  if (index.has(date)) return index.get(date);
  let best = null;
  for (const d of dates) {
    if (d < date) best = d;
    else break;
  }
  if (best === null) return null;
  // The stored value for `best` excludes `best` itself; include it, plus every
  // date between, by falling through to the running mean at the next date.
  const nextIndex = dates.findIndex((d) => d > best);
  return nextIndex === -1 ? fallback : index.get(dates[nextIndex]);
}

/** League starter innings per start, as known before `date`. */
export function leagueIpAsOf(leagueIndex, date) {
  return leagueValueAsOf(leagueIndex, date, "index", "finalMean");
}

/** League starter batters faced per inning, as known before `date`. */
export function leagueBfPerIpAsOf(leagueIndex, date) {
  return leagueValueAsOf(leagueIndex, date, "bfIndex", "finalBfPerIp");
}

/**
 * The clean evaluation sample: the prior study's 944 rows, enriched with the
 * pregame season BF, the venue split, and the pitcher's own start log.
 */
export function buildEvaluationRows({ archive, seasonBf, venue, startLog }) {
  const bfByKey = new Map(seasonBf.entries.map((e) => [`${e.slateDate}|${e.pitcherId}`, e]));
  const venueByKey = new Map(venue.entries.map((e) => [`${e.slateDate}|${e.pitcherId}`, e]));

  const logByPitcher = new Map();
  for (const start of startLog.starts) {
    if (!logByPitcher.has(start.pitcherId)) logByPitcher.set(start.pitcherId, []);
    logByPitcher.get(start.pitcherId).push(start);
  }
  const leagueIndex = buildLeagueIpIndex(startLog.starts);

  const leakageSafe = filterLeakageSafe(archive.rows);
  const { kept, excluded } = partitionByOutcomeValidity(leakageSafe, { classify: classifyRow });

  const rows = kept
    .map((row) => {
      const key = `${row.slateDate}|${row.pitcherId}`;
      const bfEntry = bfByKey.get(key) ?? null;
      const venueEntry = venueByKey.get(key) ?? null;
      return {
        ...row,
        leagueAnchor: recoverLeagueAnchor(row.v2OpponentEnvRate, row.v2MatchupAdjustment),
        seasonBattersFaced: bfEntry ? bfEntry.seasonBattersFaced : null,
        seasonGamesStarted: bfEntry ? bfEntry.seasonGamesStarted : null,
        seasonSplit: venueEntry,
        pitcherLog: logByPitcher.get(row.pitcherId) ?? [],
        leagueIpPerStart: leagueIpAsOf(leagueIndex, row.slateDate),
        leagueBfPerIp: leagueBfPerIpAsOf(leagueIndex, row.slateDate),
      };
    })
    .filter(
      (row) =>
        row.leagueAnchor !== null &&
        Number.isFinite(row.v2PitcherSkillRate) &&
        Number.isFinite(row.v2ProjectedBF),
    )
    .sort((a, b) => (a.slateDate < b.slateDate ? -1 : a.slateDate > b.slateDate ? 1 : 0));

  return { rows, excluded, logByPitcher, leagueIndex, startLog: startLog.starts };
}

/**
 * Pregame league-centring constants per slate date.
 *
 * The opponent delta estimator carries a small league-wide offset (measured at
 * +0.094 IP on this archive) that says nothing about any offense. Centring
 * removes it. The constants for slate D are computed from observations strictly
 * before D, over every team, so no row can see its own game or any later one.
 *
 * Computed once per (dates x teams) and cached, because it is the expensive
 * part of the attach loop and it does not depend on the configuration under
 * test -- only on the start log.
 */
export function buildLeagueCentreIndex({ rows, startLog, logByPitcher, leagueIndex }) {
  const teams = [...new Set(startLog.map((s) => s.opponent).filter(Boolean))];
  const dates = [...new Set(rows.map((row) => row.slateDate))].sort();
  const index = new Map();
  for (const date of dates) {
    const leagueIp = leagueIpAsOf(leagueIndex, date);
    const observations = teams.flatMap((team) =>
      opponentObservations({ team, asOfDate: date, startLog, logByPitcher, leagueIpPerStart: leagueIp }),
    );
    index.set(date, leagueBaseline(observations));
  }
  return index;
}

/**
 * Attaches a v3 workload projection to every row under one configuration.
 * Pure: the same rows and config always produce the same output.
 */
export function attachV3Workload(rows, { startLog, logByPitcher, config, opponentConfig, leagueCentreIndex }) {
  const centres = leagueCentreIndex ?? new Map();
  return rows.map((row) => {
    const v3 = computeWorkloadProjectionV3({
      asOfDate: row.slateDate,
      pitcherId: row.pitcherId,
      pitcherIsHome: row.pitcherIsHome === true,
      opponent: row.opponent,
      seasonSplit: row.seasonSplit,
      pitcherLog: row.pitcherLog,
      startLog,
      logByPitcher,
      leagueIpPerStart: row.leagueIpPerStart,
      leagueBfPerIp: row.leagueBfPerIp,
      leagueCentre: centres.get(row.slateDate) ?? null,
      config,
      opponentConfig,
    });
    return { ...row, v3 };
  });
}
