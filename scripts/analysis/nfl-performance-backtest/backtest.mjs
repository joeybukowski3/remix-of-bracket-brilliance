/**
 * Performance Rating backtest — analysis-only. Reads team_game_metrics.csv +
 * final_scores.csv, builds team-season windows (full / half1 / half2 /
 * game-block1-4 / game-block5-8), computes the 9 candidate offense metrics
 * (+ 9 defense mirrors), opponent-adjusts them, and runs the correlation /
 * stability / out-of-sample predictive / Model A-E backtest described in the
 * Performance Model Backtest phase. Writes a JSON report and prints a
 * condensed summary to stdout. Never touches production code or data.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mean, pearson, zscores } from "./lib/stats.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_DIR = join(ROOT, "data", "nfl", "backtest-2026", "out");

function readCsv(path) {
  const text = readFileSync(path, "utf-8").trim();
  const lines = text.split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

const n = (v) => Number(v);

function loadTeamGames() {
  const raw = readCsv(join(OUT_DIR, "team_game_metrics.csv"));
  return raw.map((r) => {
    const side = (v) => ({
      offEpa: n(r[`${v}_offEpa`]), offPlays: n(r[`${v}_offPlays`]),
      successNum: n(r[`${v}_successNum`]), successDen: n(r[`${v}_successDen`]),
      epaPosNum: n(r[`${v}_epaPosNum`]), epaPosDen: n(r[`${v}_epaPosDen`]),
      earlyEpa: n(r[`${v}_earlyEpa`]), earlyPlays: n(r[`${v}_earlyPlays`]),
      earlySuccessNum: n(r[`${v}_earlySuccessNum`]), earlySuccessDen: n(r[`${v}_earlySuccessDen`]),
      passEpa: n(r[`${v}_passEpa`]), passPlays: n(r[`${v}_passPlays`]),
      passSuccessNum: n(r[`${v}_passSuccessNum`]), passSuccessDen: n(r[`${v}_passSuccessDen`]),
      rushEpa: n(r[`${v}_rushEpa`]), rushPlays: n(r[`${v}_rushPlays`]),
      rushSuccessNum: n(r[`${v}_rushSuccessNum`]), rushSuccessDen: n(r[`${v}_rushSuccessDen`]),
      explosivePass: n(r[`${v}_explosivePass`]), explosiveRush: n(r[`${v}_explosiveRush`]),
      thirdEpa: n(r[`${v}_thirdEpa`]), thirdPlays: n(r[`${v}_thirdPlays`]),
      thirdSuccessNum: n(r[`${v}_thirdSuccessNum`]), thirdSuccessDen: n(r[`${v}_thirdSuccessDen`]),
      thirdRawConvNum: n(r[`${v}_thirdRawConvNum`]), thirdRawConvDen: n(r[`${v}_thirdRawConvDen`]),
      sacks: n(r[`${v}_sacks`]), dropbacks: n(r[`${v}_dropbacks`]),
    });
    return {
      gameId: r.gameId, season: n(r.season), week: n(r.week), team: r.team, opponent: r.opponent,
      all: side("all"), filtered: side("filtered"),
      drivesOff: n(r.drivesOff), drivePointsOff: n(r.drivePointsOff),
      oppTouchdownAgainst: n(r.oppTouchdownAgainst), safetyAgainst: n(r.safetyAgainst),
    };
  });
}

function loadFinalScores() {
  const raw = readCsv(join(OUT_DIR, "final_scores.csv"));
  const map = new Map();
  for (const r of raw) map.set(`${r.gameId}|${r.team}`, { teamScore: n(r.teamScore), oppScore: n(r.oppScore) });
  return map;
}

const ratio = (num, den) => (den > 0 ? num / den : null);

/** Sum a side bucket across a list of team-game rows. */
function sumSide(rows, pick) {
  const out = {
    offEpa: 0, offPlays: 0, successNum: 0, successDen: 0, epaPosNum: 0, epaPosDen: 0,
    earlyEpa: 0, earlyPlays: 0, earlySuccessNum: 0, earlySuccessDen: 0,
    passEpa: 0, passPlays: 0, passSuccessNum: 0, passSuccessDen: 0,
    rushEpa: 0, rushPlays: 0, rushSuccessNum: 0, rushSuccessDen: 0,
    explosivePass: 0, explosiveRush: 0,
    thirdEpa: 0, thirdPlays: 0, thirdSuccessNum: 0, thirdSuccessDen: 0,
    thirdRawConvNum: 0, thirdRawConvDen: 0, sacks: 0, dropbacks: 0,
  };
  for (const row of rows) {
    const s = pick(row);
    for (const k of Object.keys(out)) out[k] += s[k];
  }
  return out;
}

/** Derive the rate-metric bundle from a summed side bucket. */
function deriveRates(s) {
  const epaPlay = ratio(s.offEpa, s.offPlays);
  const sr = ratio(s.successNum, s.successDen);
  const epaPosRate = ratio(s.epaPosNum, s.epaPosDen);
  const earlyEpaPlay = ratio(s.earlyEpa, s.earlyPlays);
  const earlySr = ratio(s.earlySuccessNum, s.earlySuccessDen);
  const passEpaPlay = ratio(s.passEpa, s.passPlays);
  const passSr = ratio(s.passSuccessNum, s.passSuccessDen);
  const rushEpaPlay = ratio(s.rushEpa, s.rushPlays);
  const rushSr = ratio(s.rushSuccessNum, s.rushSuccessDen);
  const explosiveRate = ratio(s.explosivePass + s.explosiveRush, s.offPlays);
  const thirdEpaPlay = ratio(s.thirdEpa, s.thirdPlays);
  const thirdSr = ratio(s.thirdSuccessNum, s.thirdSuccessDen);
  const thirdRawConv = ratio(s.thirdRawConvNum, s.thirdRawConvDen);
  const sackRate = ratio(s.sacks, s.dropbacks);
  return {
    epaPlay, sr, epaPosRate, earlyEpaPlay, earlySr, passEpaPlay, passSr,
    rushEpaPlay, rushSr, explosiveRate, thirdEpaPlay, thirdSr, thirdRawConv, sackRate,
    offPlays: s.offPlays, dropbacks: s.dropbacks,
  };
}

/** Build offense + defense(allowed) + PPD + scoring rate object for a window of team-game rows. */
function windowBundle(rows, indexByGameOpp, variant) {
  const off = deriveRates(sumSide(rows, (r) => r[variant]));
  const defRows = rows.map((r) => indexByGameOpp.get(`${r.gameId}|${r.opponent}`)).filter(Boolean);
  const def = deriveRates(sumSide(defRows, (r) => r[variant]));
  const drivesOff = rows.reduce((a, r) => a + r.drivesOff, 0);
  const pointsOff = rows.reduce((a, r) => a + r.drivePointsOff, 0);
  const ppdOff = ratio(pointsOff, drivesOff);
  const drivesDef = defRows.reduce((a, r) => a + r.drivesOff, 0);
  const pointsDef = defRows.reduce((a, r) => a + r.drivePointsOff, 0);
  const ppdAllowed = ratio(pointsDef, drivesDef);
  return { off, def, ppdOff, ppdAllowed, games: rows.length };
}

function main() {
  const teamGames = loadTeamGames();
  const scores = loadFinalScores();
  const indexByGameTeam = new Map(teamGames.map((r) => [`${r.gameId}|${r.team}`, r]));

  for (const r of teamGames) {
    const s = scores.get(`${r.gameId}|${r.team}`);
    r.teamScore = s ? s.teamScore : null;
    r.oppScore = s ? s.oppScore : null;
  }

  const byTeamSeason = new Map();
  for (const r of teamGames) {
    const key = `${r.team}|${r.season}`;
    if (!byTeamSeason.has(key)) byTeamSeason.set(key, []);
    byTeamSeason.get(key).push(r);
  }
  for (const games of byTeamSeason.values()) games.sort((a, b) => a.week - b.week);

  // --- Build per-team-season window bundles ---
  const teamSeasons = [];
  for (const [key, games] of byTeamSeason) {
    const [team, seasonStr] = key.split("|");
    const season = Number(seasonStr);
    const half1 = games.filter((g) => g.week <= 9);
    const half2 = games.filter((g) => g.week >= 10);
    const block1 = games.slice(0, 4);
    const block2 = games.slice(4, 8);
    const wins2 = half2.filter((g) => g.teamScore > g.oppScore).length;
    const marginFull = mean(games.map((g) => g.teamScore - g.oppScore));
    const marginHalf1 = half1.length ? mean(half1.map((g) => g.teamScore - g.oppScore)) : null;
    const marginHalf2 = half2.length ? mean(half2.map((g) => g.teamScore - g.oppScore)) : null;

    teamSeasons.push({
      team, season, gameCount: games.length,
      games,
      marginFull, marginHalf1, marginHalf2,
      winRateHalf2: half2.length ? wins2 / half2.length : null,
      full: { all: windowBundle(games, indexByGameTeam, "all"), filtered: windowBundle(games, indexByGameTeam, "filtered") },
      half1: half1.length >= 4 ? { all: windowBundle(half1, indexByGameTeam, "all"), filtered: windowBundle(half1, indexByGameTeam, "filtered") } : null,
      half2: half2.length >= 4 ? { all: windowBundle(half2, indexByGameTeam, "all"), filtered: windowBundle(half2, indexByGameTeam, "filtered") } : null,
      block1: block1.length === 4 ? { all: windowBundle(block1, indexByGameTeam, "all") } : null,
      block2: block2.length === 4 ? { all: windowBundle(block2, indexByGameTeam, "all") } : null,
    });
  }

  // --- Opponent adjustment (v0.3.1 style: raw - (oppMean - leagueMean)) ---
  // Computed at full-season level, per season, using each team's full-season
  // opponents' full-season raw metric (post-hoc; documented as retrospective,
  // matches the production v0.3.1 methodology which also uses season-long
  // opponent context rather than a live/causal-only adjustment).
  const bySeasonTeamFull = new Map();
  for (const ts of teamSeasons) bySeasonTeamFull.set(`${ts.season}|${ts.team}`, ts.full.all.off);

  function opponentAdjust(ts, metricPath, leagueMeanBySeasonId) {
    const opponents = ts.games.map((g) => bySeasonTeamFull.get(`${ts.season}|${g.opponent}`)).filter(Boolean);
    if (opponents.length === 0) return null;
    const oppVals = opponents.map((o) => metricPath(o)).filter((v) => v !== null && Number.isFinite(v));
    if (oppVals.length === 0) return null;
    const oppMean = mean(oppVals);
    const leagueMean = leagueMeanBySeasonId(ts.season);
    const raw = metricPath(ts.full.all.off);
    if (raw === null) return null;
    return raw - (oppMean - leagueMean);
  }

  function leagueMeanFor(season, metricPath) {
    const vals = teamSeasons.filter((t) => t.season === season).map((t) => metricPath(t.full.all.off)).filter((v) => v !== null);
    return mean(vals);
  }

  const adjustableMetrics = {
    epaPlay: (o) => o.epaPlay,
    sr: (o) => o.sr,
    explosiveRate: (o) => o.explosiveRate,
  };
  for (const ts of teamSeasons) {
    ts.adjusted = {};
    for (const [name, path] of Object.entries(adjustableMetrics)) {
      ts.adjusted[name] = opponentAdjust(ts, path, (season) => leagueMeanFor(season, path));
    }
    // PPD and sack rate adjustment (raw vs adjusted comparison targets)
    ts.adjusted.ppdOff = opponentAdjust(ts, (o) => ts.full.all.ppdOff, (season) => {
      const vals = teamSeasons.filter((t) => t.season === season).map((t) => t.full.all.ppdOff);
      return mean(vals);
    });
  }

  // --- Combined (standardized) composites: Early Down, Passing, Rushing, Third Down ---
  // Standardize each raw component across the pooled full-season sample (96 team-seasons).
  const pool = teamSeasons; // 3 seasons x 32 teams = 96 (subject to data availability)
  function poolZ(path) {
    const vals = pool.map((t) => path(t));
    const z = zscores(vals);
    pool.forEach((t, i) => { t.__z = t.__z || {}; });
    return z;
  }
  function assignZ(name, path) {
    const z = poolZ((t) => path(t.full.all.off));
    pool.forEach((t, i) => { t.__z[name] = z[i]; });
  }
  pool.forEach((t) => { t.__z = {}; });
  assignZ("epaPlay", (o) => o.epaPlay);
  assignZ("sr", (o) => o.sr);
  assignZ("earlyEpaPlay", (o) => o.earlyEpaPlay);
  assignZ("earlySr", (o) => o.earlySr);
  assignZ("passEpaPlay", (o) => o.passEpaPlay);
  assignZ("passSr", (o) => o.passSr);
  assignZ("rushEpaPlay", (o) => o.rushEpaPlay);
  assignZ("rushSr", (o) => o.rushSr);
  assignZ("explosiveRate", (o) => o.explosiveRate);
  assignZ("thirdEpaPlay", (o) => o.thirdEpaPlay);
  assignZ("thirdSr", (o) => o.thirdSr);
  assignZ("sackRate", (o) => o.sackRate); // higher = worse for offense
  pool.forEach((t) => {
    t.__z.ppdOff = null; // filled below after computing pooled zscore of ppdOff
  });
  {
    const z = poolZ((t) => t.full.all.ppdOff);
    pool.forEach((t, i) => { t.__z.ppdOff = z[i]; });
  }

  pool.forEach((t) => {
    t.combined = {
      earlyDownEff: mean([t.__z.earlyEpaPlay, t.__z.earlySr]),
      passingEff: mean([t.__z.passEpaPlay, t.__z.passSr]),
      rushingEff: mean([t.__z.rushEpaPlay, t.__z.rushSr]),
      thirdDownEff: mean([t.__z.thirdEpaPlay, t.__z.thirdSr]),
    };
  });

  // --- Correlation matrix among the 9 offense candidates (pooled full-season) ---
  const metricSeries = {
    epaPlay: pool.map((t) => t.full.all.off.epaPlay),
    sr: pool.map((t) => t.full.all.off.sr),
    earlyDownEff: pool.map((t) => t.combined.earlyDownEff),
    passingEff: pool.map((t) => t.combined.passingEff),
    rushingEff: pool.map((t) => t.combined.rushingEff),
    explosiveRate: pool.map((t) => t.full.all.off.explosiveRate),
    ppd: pool.map((t) => t.full.all.ppdOff),
    thirdDownEff: pool.map((t) => t.combined.thirdDownEff),
    sackRateOff: pool.map((t) => t.full.all.off.sackRate),
  };
  const metricNames = Object.keys(metricSeries);
  const corrMatrix = {};
  for (const a of metricNames) {
    corrMatrix[a] = {};
    for (const b of metricNames) corrMatrix[a][b] = pearson(metricSeries[a], metricSeries[b]);
  }

  // --- Stability: block1 vs block2 (games 1-4 vs 5-8), half1 vs half2 ---
  const stabilityBlocks = pool.filter((t) => t.block1 && t.block2);
  const stability = {};
  for (const [name, path] of [
    ["epaPlay", (b) => b.all.off.epaPlay],
    ["sr", (b) => b.all.off.sr],
    ["explosiveRate", (b) => b.all.off.explosiveRate],
    ["ppd", (b) => b.all.ppdOff],
    ["sackRateOff", (b) => b.all.off.sackRate],
  ]) {
    const x = stabilityBlocks.map((t) => path(t.block1));
    const y = stabilityBlocks.map((t) => path(t.block2));
    stability[name] = { blockToBlock: pearson(x, y), n: x.length };
  }
  const halfPairs = pool.filter((t) => t.half1 && t.half2);
  for (const [name, path] of [
    ["epaPlay", (b) => b.all.off.epaPlay],
    ["sr", (b) => b.all.off.sr],
    ["explosiveRate", (b) => b.all.off.explosiveRate],
    ["ppd", (b) => b.all.ppdOff],
    ["sackRateOff", (b) => b.all.off.sackRate],
  ]) {
    const x = halfPairs.map((t) => path(t.half1));
    const y = halfPairs.map((t) => path(t.half2));
    stability[name].halfToHalf = pearson(x, y);
    stability[name].halfToHalfN = x.length;
  }

  // --- Out-of-sample predictive: half1 metric -> half2 targets ---
  const predSample = pool.filter((t) => t.half1 && t.half2);
  const targets = {
    pointDiffRaw: predSample.map((t) => t.marginHalf2),
    winRate: predSample.map((t) => t.winRateHalf2),
    epaDiff: predSample.map((t) => t.half2.all.off.epaPlay - t.half2.all.def.epaPlay),
  };
  // opponent-adjusted point diff (half2): raw half2 margin minus opponents' full-season margin vs league mean
  targets.pointDiffAdj = predSample.map((t) => {
    const opponents = t.games.filter((g) => g.week >= 10).map((g) => teamSeasons.find((o) => o.team === g.opponent && o.season === t.season)).filter(Boolean);
    if (opponents.length === 0) return t.marginHalf2;
    const oppMean = mean(opponents.map((o) => o.marginFull));
    const leagueMean = mean(teamSeasons.filter((o) => o.season === t.season).map((o) => o.marginFull));
    return t.marginHalf2 - (oppMean - leagueMean);
  });

  function predictiveFor(path) {
    const x = predSample.map((t) => path(t));
    const out = {};
    for (const [tname, y] of Object.entries(targets)) out[tname] = pearson(x, y);
    return out;
  }

  const predictive = {
    epaPlay_raw: predictiveFor((t) => t.half1.all.off.epaPlay),
    sr_raw: predictiveFor((t) => t.half1.all.off.sr),
    epaPosRate_diag: predictiveFor((t) => t.half1.all.off.epaPosRate),
    explosiveRate_raw: predictiveFor((t) => t.half1.all.off.explosiveRate),
    ppd_raw: predictiveFor((t) => t.half1.all.ppdOff),
    sackRateOff_raw: predictiveFor((t) => -t.half1.all.off.sackRate),
    earlyDownEff: predictiveFor((t) => mean([
      zscores(predSample.map((s) => s.half1.all.off.earlyEpaPlay))[predSample.indexOf(t)],
      zscores(predSample.map((s) => s.half1.all.off.earlySr))[predSample.indexOf(t)],
    ])),
    passingEff: predictiveFor((t) => mean([
      zscores(predSample.map((s) => s.half1.all.off.passEpaPlay))[predSample.indexOf(t)],
      zscores(predSample.map((s) => s.half1.all.off.passSr))[predSample.indexOf(t)],
    ])),
    rushingEff: predictiveFor((t) => mean([
      zscores(predSample.map((s) => s.half1.all.off.rushEpaPlay))[predSample.indexOf(t)],
      zscores(predSample.map((s) => s.half1.all.off.rushSr))[predSample.indexOf(t)],
    ])),
    thirdDownEff: predictiveFor((t) => mean([
      zscores(predSample.map((s) => s.half1.all.off.thirdEpaPlay))[predSample.indexOf(t)],
      zscores(predSample.map((s) => s.half1.all.off.thirdSr))[predSample.indexOf(t)],
    ])),
    thirdDownRawConv_diag: predictiveFor((t) => t.half1.all.off.thirdRawConv),
  };

  // filtered (garbage-time-removed) comparison, half1->half2, primary target pointDiffAdj
  const predictiveFiltered = {
    epaPlay: predictiveFor((t) => t.half1.filtered.off.epaPlay),
    sr: predictiveFor((t) => t.half1.filtered.off.sr),
    explosiveRate: predictiveFor((t) => t.half1.filtered.off.explosiveRate),
  };

  // --- Models A-E (unweighted average of z-scored half1 components -> half2 targets) ---
  function zOf(getRaw) {
    const vals = predSample.map(getRaw);
    return zscores(vals);
  }
  const zEpa = zOf((t) => t.half1.all.off.epaPlay);
  const zSr = zOf((t) => t.half1.all.off.sr);
  const zExp = zOf((t) => t.half1.all.off.explosiveRate);
  const zPpd = zOf((t) => t.half1.all.ppdOff);
  const zSackInv = zOf((t) => -t.half1.all.off.sackRate);
  const zEarly = zOf((t, i) => 0); // placeholder, computed below properly
  const zEarlyEpa = zOf((t) => t.half1.all.off.earlyEpaPlay);
  const zEarlySr = zOf((t) => t.half1.all.off.earlySr);
  const zPassEpa = zOf((t) => t.half1.all.off.passEpaPlay);
  const zPassSr = zOf((t) => t.half1.all.off.passSr);
  const zRushEpa = zOf((t) => t.half1.all.off.rushEpaPlay);
  const zRushSr = zOf((t) => t.half1.all.off.rushSr);
  const zThirdEpa = zOf((t) => t.half1.all.off.thirdEpaPlay);
  const zThirdSr = zOf((t) => t.half1.all.off.thirdSr);
  const zEarlyComb = predSample.map((_, i) => mean([zEarlyEpa[i], zEarlySr[i]]));
  const zPassComb = predSample.map((_, i) => mean([zPassEpa[i], zPassSr[i]]));
  const zRushComb = predSample.map((_, i) => mean([zRushEpa[i], zRushSr[i]]));
  const zThirdComb = predSample.map((_, i) => mean([zThirdEpa[i], zThirdSr[i]]));

  function modelScore(weights) {
    return predSample.map((_, i) => {
      let sum = 0, wsum = 0;
      for (const [z, w] of weights) { sum += z[i] * w; wsum += w; }
      return sum / wsum;
    });
  }
  const models = {
    A_epaOnly: modelScore([[zEpa, 1]]),
    B_epaSr: modelScore([[zEpa, 1], [zSr, 1]]),
    C_epaSrExp: modelScore([[zEpa, 1], [zSr, 1], [zExp, 1]]),
    D_epaSrExpPpd: modelScore([[zEpa, 1], [zSr, 1], [zExp, 1], [zPpd, 1]]),
    E_plusSmallSack: modelScore([[zEpa, 1], [zSr, 1], [zExp, 1], [zPpd, 1], [zSackInv, 0.3]]),
    E_plusEarlyDown: modelScore([[zEpa, 1], [zSr, 1], [zExp, 1], [zPpd, 1], [zSackInv, 0.3], [zEarlyComb, 1]]),
    E_plusPassing: modelScore([[zEpa, 1], [zSr, 1], [zExp, 1], [zPpd, 1], [zSackInv, 0.3], [zPassComb, 1]]),
    E_plusRushing: modelScore([[zEpa, 1], [zSr, 1], [zExp, 1], [zPpd, 1], [zSackInv, 0.3], [zRushComb, 1]]),
    E_plusThirdDown: modelScore([[zEpa, 1], [zSr, 1], [zExp, 1], [zPpd, 1], [zSackInv, 0.3], [zThirdComb, 1]]),
  };
  const modelResults = {};
  for (const [name, series] of Object.entries(models)) {
    const out = {};
    for (const [tname, y] of Object.entries(targets)) out[tname] = pearson(series, y);
    modelResults[name] = out;
  }

  // --- Opponent-adjusted half1 predictive test (half1 adj metric -> half2 targets) ---
  // Adjust half1 raw value using each opponent's FULL-SEASON metric relative to
  // league full-season mean (same v0.3.1-style adjustment, applied to the
  // predictive half1 window instead of full season).
  function adjustHalf1(t, metricPathOnOff) {
    const opponents = t.games.filter((g) => g.week <= 9).map((g) => bySeasonTeamFull.get(`${t.season}|${g.opponent}`)).filter(Boolean);
    if (opponents.length === 0 || !t.half1) return null;
    const oppMean = mean(opponents.map((o) => metricPathOnOff(o)).filter((v) => v !== null));
    const leagueMean = leagueMeanFor(t.season, metricPathOnOff);
    const raw = metricPathOnOff(t.half1.all.off);
    if (raw === null || !Number.isFinite(oppMean)) return null;
    return raw - (oppMean - leagueMean);
  }
  const predictiveAdjusted = {
    epaPlay: predictiveFor((t) => adjustHalf1(t, (o) => o.epaPlay)),
    sr: predictiveFor((t) => adjustHalf1(t, (o) => o.sr)),
    explosiveRate: predictiveFor((t) => adjustHalf1(t, (o) => o.explosiveRate)),
  };

  // --- Cross-season forward test (season N -> season N+1), EPA & Model-E composite ---
  const crossSeason = [];
  for (const t of teamSeasons) {
    const next = teamSeasons.find((o) => o.team === t.team && o.season === t.season + 1);
    if (next) crossSeason.push({ team: t.team, seasonFrom: t.season, epaFrom: t.full.all.off.epaPlay, marginTo: next.marginFull, winRateNextFull: null });
  }
  const crossEpaCorr = pearson(crossSeason.map((c) => c.epaFrom), crossSeason.map((c) => c.marginTo));

  const report = {
    meta: {
      seasons: [2023, 2024, 2025],
      teamSeasonCount: pool.length,
      predSampleCount: predSample.length,
      crossSeasonPairCount: crossSeason.length,
      garbageTimePctPlaysRemoved: null,
    },
    corrMatrix, metricNames,
    stability,
    predictive,
    predictiveFiltered,
    predictiveAdjusted,
    modelResults,
    crossEpaCorr,
    sample: {
      leagueEpaPlay2025: mean(pool.filter((t) => t.season === 2025).map((t) => t.full.all.off.epaPlay)),
    },
  };

  writeFileSync(join(OUT_DIR, "backtest-report.json"), JSON.stringify(report, null, 2), "utf-8");
  console.log(JSON.stringify(report, null, 2));
}

main();
