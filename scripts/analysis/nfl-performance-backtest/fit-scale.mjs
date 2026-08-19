/**
 * Fit the 1-99 public-scale pooled divisor for the approved Performance
 * Rating composite (Model C: EPA + Traditional SR + Explosive Rate, equal
 * weight per side, 40/40/20 OFF/DEF/PointDiff overall) from the actual
 * 2023-2025 historical distribution. Mirrors the v0.3.1 pattern in
 * scripts/lib/nfl-power-v03-metrics.mjs (composite of z-scored inputs,
 * divided by an empirically-fit pooled divisor, then 50 + 15*unitZ clamped
 * to [1,99]) — never a paraphrase, the same formula family.
 *
 * Garbage-time treatment (approved from the backtest, §6/§22):
 *   EPA/Play        -> garbage-time FILTERED
 *   Success Rate     -> garbage-time FILTERED
 *   Explosive Rate    -> UNFILTERED (filtering hurt its predictive power)
 *
 * Opponent adjustment (approved, §7/§21): full-season only, v0.3.1-style
 * (raw - (opponentMean - leagueMean)), applied to OFF EPA/SR/Explosive, the
 * DEF mirrors, and point differential per game. Never applied at L4/L8.
 *
 * Analysis-only. Writes data/nfl/backtest-2026/out/scale-fit.json, which the
 * production TS module's fitted constants are read off of by hand (the
 * constants are committed as literals in src/lib/nfl/performanceScale2026.ts,
 * exactly like NFL_POWER_V03_POOLED_DIVISOR is a committed literal, not a
 * runtime import from this analysis script).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mean, std } from "./lib/stats.mjs";

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
const ratio = (num, den) => (den > 0 ? num / den : null);

function loadTeamGames() {
  const raw = readCsv(join(OUT_DIR, "team_game_metrics.csv"));
  return raw.map((r) => {
    const side = (v) => ({
      offEpa: n(r[`${v}_offEpa`]), offPlays: n(r[`${v}_offPlays`]),
      successNum: n(r[`${v}_successNum`]), successDen: n(r[`${v}_successDen`]),
      explosivePass: n(r[`${v}_explosivePass`]), explosiveRush: n(r[`${v}_explosiveRush`]),
    });
    return {
      gameId: r.gameId, season: n(r.season), week: n(r.week), team: r.team, opponent: r.opponent,
      all: side("all"), filtered: side("filtered"),
    };
  });
}
function loadFinalScores() {
  const raw = readCsv(join(OUT_DIR, "final_scores.csv"));
  const map = new Map();
  for (const r of raw) map.set(`${r.gameId}|${r.team}`, { teamScore: n(r.teamScore), oppScore: n(r.oppScore) });
  return map;
}

function deriveEpaSr(s) {
  return { epaPlay: ratio(s.offEpa, s.offPlays), sr: ratio(s.successNum, s.successDen) };
}
function deriveExplosive(s) {
  return ratio(s.explosivePass + s.explosiveRush, s.offPlays);
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

  // Full-season raw (pre-adjustment) bundle per team-season.
  const teamSeasons = [];
  for (const [key, games] of byTeamSeason) {
    const [team, seasonStr] = key.split("|");
    const season = Number(seasonStr);
    const sumAll = { offEpa: 0, offPlays: 0, successNum: 0, successDen: 0, explosivePass: 0, explosiveRush: 0 };
    const sumFiltered = { ...sumAll };
    for (const g of games) {
      for (const k of Object.keys(sumAll)) { sumAll[k] += g.all[k]; sumFiltered[k] += g.filtered[k]; }
    }
    const off = {
      epaPlayFiltered: deriveEpaSr(sumFiltered).epaPlay,
      srFiltered: deriveEpaSr(sumFiltered).sr,
      explosiveUnfiltered: deriveExplosive(sumAll),
    };
    const margin = mean(games.map((g) => g.teamScore - g.oppScore));
    teamSeasons.push({ team, season, games, off, margin });
  }

  // Defense-allowed mirrors: opponent's offense numbers for the same games.
  for (const ts of teamSeasons) {
    const sumAll = { offEpa: 0, offPlays: 0, successNum: 0, successDen: 0, explosivePass: 0, explosiveRush: 0 };
    const sumFiltered = { ...sumAll };
    for (const g of ts.games) {
      const oppRow = indexByGameTeam.get(`${g.gameId}|${g.opponent}`);
      if (!oppRow) continue;
      for (const k of Object.keys(sumAll)) { sumAll[k] += oppRow.all[k]; sumFiltered[k] += oppRow.filtered[k]; }
    }
    ts.def = {
      epaPlayFiltered: deriveEpaSr(sumFiltered).epaPlay,
      srFiltered: deriveEpaSr(sumFiltered).sr,
      explosiveUnfiltered: deriveExplosive(sumAll),
    };
  }

  // League z-score helper (population).
  function zAll(path) {
    const vals = teamSeasons.map(path);
    const m = mean(vals), s = std(vals) || 1;
    return teamSeasons.map((_, i) => (vals[i] - m) / s);
  }

  // Full-season opponent adjustment (v0.3.1-style), applied to OFF/DEF EPA,
  // SR, and Explosive before standardization -- mirrors scripts/lib/
  // nfl-power-v03-metrics.mjs adjustOffensiveEpaPerPlay/adjustDefensiveEpaPerPlay.
  const bySeasonTeamPre = new Map(teamSeasons.map((t) => [`${t.season}|${t.team}`, t]));
  function opponentAdjust(ts, ownPath, opponentComparisonPath) {
    const opponents = ts.games.map((g) => bySeasonTeamPre.get(`${ts.season}|${g.opponent}`)).filter(Boolean);
    const oppMean = mean(opponents.map(opponentComparisonPath));
    const leagueMean = mean(teamSeasons.filter((t) => t.season === ts.season).map(opponentComparisonPath));
    return ownPath(ts) - (oppMean - leagueMean);
  }
  for (const ts of teamSeasons) {
    ts.offAdj = {
      epaPlay: opponentAdjust(ts, (t) => t.off.epaPlayFiltered, (t) => t.def.epaPlayFiltered),
      sr: opponentAdjust(ts, (t) => t.off.srFiltered, (t) => t.def.srFiltered),
      explosive: opponentAdjust(ts, (t) => t.off.explosiveUnfiltered, (t) => t.def.explosiveUnfiltered),
    };
    ts.defAdj = {
      epaPlay: opponentAdjust(ts, (t) => t.def.epaPlayFiltered, (t) => t.off.epaPlayFiltered),
      sr: opponentAdjust(ts, (t) => t.def.srFiltered, (t) => t.off.srFiltered),
      explosive: opponentAdjust(ts, (t) => t.def.explosiveUnfiltered, (t) => t.off.explosiveUnfiltered),
    };
  }

  const zOffEpa = zAll((t) => t.offAdj.epaPlay);
  const zOffSr = zAll((t) => t.offAdj.sr);
  const zOffExp = zAll((t) => t.offAdj.explosive);
  const zDefEpaInv = zAll((t) => -t.defAdj.epaPlay);
  const zDefSrInv = zAll((t) => -t.defAdj.sr);
  const zDefExpInv = zAll((t) => -t.defAdj.explosive);

  teamSeasons.forEach((t, i) => {
    t.offComposite = mean([zOffEpa[i], zOffSr[i], zOffExp[i]]);
    t.defComposite = mean([zDefEpaInv[i], zDefSrInv[i], zDefExpInv[i]]);
  });

  // Full-season opponent-adjusted point differential (v0.3.1-style), then z.
  const bySeasonTeam = new Map(teamSeasons.map((t) => [`${t.season}|${t.team}`, t]));
  for (const ts of teamSeasons) {
    const opponents = ts.games.map((g) => bySeasonTeam.get(`${ts.season}|${g.opponent}`)).filter(Boolean);
    const oppMean = mean(opponents.map((o) => o.margin));
    const leagueMean = mean(teamSeasons.filter((t) => t.season === ts.season).map((t) => t.margin));
    ts.pointDiffAdj = ts.margin - (oppMean - leagueMean);
  }
  const zPointDiffAdj = zAll((t) => t.pointDiffAdj);

  // OFF/DEF composites are already population z's of themselves by construction
  // (variance ~ but not exactly 1, since they're an average of correlated z's,
  // not re-standardized) -- re-standardize them too, mirroring how v0.3
  // standardizes each input before the 40/40/20 blend.
  function stdOf(path) { return std(teamSeasons.map(path)); }
  const offStd = stdOf((t) => t.offComposite);
  const defStd = stdOf((t) => t.defComposite);
  const offZ = teamSeasons.map((t) => t.offComposite / offStd);
  const defZ = teamSeasons.map((t) => t.defComposite / defStd);

  teamSeasons.forEach((t, i) => {
    t.offZ = offZ[i];
    t.defZ = defZ[i];
    t.overallComposite = 0.4 * offZ[i] + 0.4 * defZ[i] + 0.2 * zPointDiffAdj[i];
  });

  const overallStd = stdOf((t) => t.overallComposite);

  function scaleRating(unitZ) { return Math.max(1, Math.min(99, 50 + 15 * unitZ)); }

  const distBySeasonKind = {};
  for (const kind of ["offZ", "defZ"]) {
    distBySeasonKind[kind] = {};
    for (const season of [2023, 2024, 2025, "pooled"]) {
      const rows = season === "pooled" ? teamSeasons : teamSeasons.filter((t) => t.season === season);
      const ratings = rows.map((t) => scaleRating(t[kind]));
      distBySeasonKind[kind][season] = summarize(ratings);
    }
  }
  const overallRatings = {};
  for (const season of [2023, 2024, 2025, "pooled"]) {
    const rows = season === "pooled" ? teamSeasons : teamSeasons.filter((t) => t.season === season);
    const ratings = rows.map((t) => scaleRating(t.overallComposite / overallStd));
    overallRatings[season] = summarize(ratings);
  }

  function summarize(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[Math.floor(mid)];
    return {
      n: values.length,
      mean: mean(values),
      median,
      stdev: std(values),
      min: Math.min(...values),
      max: Math.max(...values),
      pctAt1: values.filter((v) => v <= 1.001).length / values.length,
      pctAt99: values.filter((v) => v >= 98.999).length / values.length,
    };
  }

  const topOverall = [...teamSeasons].sort((a, b) => b.overallComposite - a.overallComposite).slice(0, 5)
    .map((t) => ({ team: t.team, season: t.season, rating: scaleRating(t.overallComposite / overallStd) }));
  const bottomOverall = [...teamSeasons].sort((a, b) => a.overallComposite - b.overallComposite).slice(0, 5)
    .map((t) => ({ team: t.team, season: t.season, rating: scaleRating(t.overallComposite / overallStd) }));

  const out = {
    teamSeasonCount: teamSeasons.length,
    offStd, defStd, overallStd,
    offDivisor: offStd, // OFF public rating divides offComposite by this (== re-standardizing it)
    defDivisor: defStd,
    overallDivisor: overallStd,
    distributions: { off: distBySeasonKind.offZ, def: distBySeasonKind.defZ, overall: overallRatings },
    topOverall, bottomOverall,
  };
  writeFileSync(join(OUT_DIR, "scale-fit.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log(JSON.stringify(out, null, 2));
}

main();
