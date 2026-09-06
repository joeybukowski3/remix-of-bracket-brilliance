/**
 * Leakage-safe coaching-signal research.
 *
 * Unit of analysis: coach-season. For season S we take the signal vector the
 * coach ENTERS S with (state through the end of S-1, target season excluded)
 * and score it against forward outcomes measured DURING S and S+1.
 *
 * Nothing here sets a rating or a weight. It reports persistence and forward
 * predictive value so a later work unit can decide weights from evidence.
 */

import { createCoachAccumulator, impliedWinProb, straightUpResult, atsResult, teamIsFavorite, toCoachGame } from "./nfl-coach-context.mjs";
import { buildCoachAppearances } from "./nfl-coach-core.mjs";

export function pearson(pairs) {
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const n = xs.length;
  if (n < 3) return { r: null, n };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return { r: null, n };
  return { r: Number((sxy / Math.sqrt(sxx * syy)).toFixed(4)), n };
}

/** Shrink an ATS win rate toward .500 by a pseudo-count k (Beta(k/2,k/2) prior). */
export function shrinkAtsRate(w, l, k) {
  const decided = w + l;
  if (decided + k === 0) return null;
  return Number(((w + 0.5 * k) / (decided + k)).toFixed(4));
}

/** Shrink a win-over-expectation-per-game mean toward 0 by pseudo-count k. */
export function shrinkMeanTowardZero(sum, n, k) {
  if (n + k === 0) return null;
  return Number((sum / (n + k)).toFixed(4));
}

/**
 * @param {object[]} rows  raw games.csv records (any season span)
 * @param {object}   opts  { aliases }
 * @returns {{ researchRows: object[], perGame: object[] }}
 */
export function buildCoachResearch(rows, { aliases = {} } = {}) {
  const { appearances } = buildCoachAppearances(rows, { aliases });
  const apByGameSide = new Map();
  for (const ap of appearances) apByGameSide.set(`${ap.gameId}|${ap.isHome ? "H" : "A"}`, ap);

  const completed = rows
    .map((row) => ({ row, game: toCoachGame(row) }))
    .filter((e) => e.game != null)
    .sort((a, b) => sortKey(a.row).localeCompare(sortKey(b.row)));

  // per coach-season outcome aggregates (measured DURING the season)
  const seasonAgg = new Map(); // `${coachId}|${season}` -> agg
  const perGame = [];
  for (const { row, game } of completed) {
    for (const side of ["home", "away"]) {
      const isHome = side === "home";
      const ap = apByGameSide.get(`${game.gameId}|${isHome ? "H" : "A"}`);
      if (!ap) continue;
      const wl = straightUpResult(game, isHome);
      const ats = atsResult(game, isHome);
      const p = impliedWinProb(game, isHome);
      const woe = p == null ? null : (wl === "W" ? 1 : wl === "T" ? 0.5 : 0) - p;
      const fav = teamIsFavorite(game, isHome);
      const key = `${ap.coachId}|${game.season}`;
      if (!seasonAgg.has(key)) {
        seasonAgg.set(key, {
          coachId: ap.coachId, coachName: ap.coachName, season: game.season, team: ap.team,
          games: 0, wins: 0, losses: 0, ties: 0,
          atsW: 0, atsL: 0, atsP: 0,
          woeSum: 0, woeN: 0,
          favAtsW: 0, favAtsL: 0, dogAtsW: 0, dogAtsL: 0,
          pointsFor: 0, pointsAgainst: 0,
        });
      }
      const a = seasonAgg.get(key);
      a.games += 1;
      if (wl === "W") a.wins += 1; else if (wl === "L") a.losses += 1; else a.ties += 1;
      if (ats === "W") a.atsW += 1; else if (ats === "L") a.atsL += 1; else if (ats === "P") a.atsP += 1;
      if (woe != null) { a.woeSum += woe; a.woeN += 1; }
      if (fav === true && ats === "W") a.favAtsW += 1;
      if (fav === true && ats === "L") a.favAtsL += 1;
      if (fav === false && ats === "W") a.dogAtsW += 1;
      if (fav === false && ats === "L") a.dogAtsL += 1;
      a.pointsFor += isHome ? game.homeScore : game.awayScore;
      a.pointsAgainst += isHome ? game.awayScore : game.homeScore;
      perGame.push({ coachId: ap.coachId, season: game.season, week: game.week, wl, ats, woe });
    }
  }

  // pre-season signal snapshots: replay chronologically, snapshot each coach at
  // the FIRST game of each season (state through end of prior season).
  const accs = new Map();
  const seenSeason = new Map(); // coachId -> Set(seasons already snapshotted)
  const signalRows = new Map(); // `${coachId}|${season}` -> signal snapshot
  for (const { row, game } of completed) {
    for (const side of ["home", "away"]) {
      const isHome = side === "home";
      const ap = apByGameSide.get(`${game.gameId}|${isHome ? "H" : "A"}`);
      if (!ap) continue;
      if (!accs.has(ap.coachId)) { accs.set(ap.coachId, createCoachAccumulator()); seenSeason.set(ap.coachId, new Set()); }
      const acc = accs.get(ap.coachId);
      const seen = seenSeason.get(ap.coachId);
      if (!seen.has(game.season)) {
        seen.add(game.season);
        signalRows.set(`${ap.coachId}|${game.season}`, acc.snapshot({ season: game.season, team: ap.team }));
      }
    }
    for (const side of ["home", "away"]) {
      const isHome = side === "home";
      const ap = apByGameSide.get(`${game.gameId}|${isHome ? "H" : "A"}`);
      if (!ap) continue;
      accs.get(ap.coachId).record(game, {
        isHome, team: ap.team, opponent: ap.opponent, week: game.week,
        restDays: isHome ? game.homeRest : game.awayRest,
        qbName: null, teamIsDivisionGame: game.divGame,
      });
    }
  }

  // join into research rows
  const researchRows = [];
  for (const [key, agg] of seasonAgg) {
    const sig = signalRows.get(key);
    if (!sig || sig.career_games < 1) continue;
    const next = seasonAgg.get(`${agg.coachId}|${agg.season + 1}`);
    const outcomeWoe = agg.woeN > 0 ? agg.woeSum / agg.woeN : null;
    const outcomeAtsPct = agg.atsW + agg.atsL > 0 ? agg.atsW / (agg.atsW + agg.atsL) : null;
    const nextWoe = next && next.woeN > 0 ? next.woeSum / next.woeN : null;
    const nextAtsPct = next && next.atsW + next.atsL > 0 ? next.atsW / (next.atsW + next.atsL) : null;
    researchRows.push({
      coach_id: agg.coachId,
      coach_name: agg.coachName,
      season: agg.season,
      team: agg.team,
      entering: {
        career_games: sig.career_games,
        tenure_year: sig.tenure_year,
        first_year: sig.first_year,
        interim_prior: null,
        career_win_pct: sig.career_win_pct,
        career_ats_pct: sig.career_ats_pct,
        career_ats_w: sig.career_ats_wins, career_ats_l: sig.career_ats_losses,
        tenure_ats_pct: sig.tenure_ats_pct,
        last2_seasons_ats_pct: rateFromTuple(sig.last2_seasons_ats),
        last3_seasons_ats_pct: rateFromTuple(sig.last3_seasons_ats),
        last17_ats_pct: rateFromTuple(sig.last17_ats),
        favorite_ats_pct: rateFromTuple(sig.favorite_ats),
        underdog_ats_pct: rateFromTuple(sig.underdog_ats),
        after_bye_win_pct: wlRateFromTuple(sig.after_bye_wl),
        after_bye_ats_pct: rateFromTuple(sig.after_bye_ats),
        division_ats_pct: rateFromTuple(sig.division_ats),
        one_score_win_pct: wlRateFromTuple(sig.one_score_wl),
        win_over_expectation_per_game: sig.win_over_expectation_per_game,
        win_over_expectation_n: sig.win_over_expectation_n,
        playoff_games: sig.playoff_games,
        last1_season_win_pct: wlRateFromTuple(sig.last17_wl), // proxy; refined below
      },
      outcome_this_season: {
        games: agg.games, win_pct: (agg.wins + 0.5 * agg.ties) / agg.games,
        ats_pct: outcomeAtsPct, win_over_expectation_per_game: round4(outcomeWoe),
        ppg: round2(agg.pointsFor / agg.games),
      },
      outcome_next_season: next
        ? { games: next.games, win_pct: (next.wins + 0.5 * next.ties) / next.games,
            ats_pct: nextAtsPct, win_over_expectation_per_game: round4(nextWoe),
            ppg: round2(next.pointsFor / next.games) }
        : null,
    });
  }
  researchRows.sort((a, b) => a.season - b.season || a.coach_id.localeCompare(b.coach_id));
  return { researchRows, perGame };
}

/** Year-to-year persistence + forward predictive value for one entering-signal path. */
export function summarizeSignal(researchRows, path, { minCareerGames = 0 } = {}) {
  const get = (row) => path.split(".").reduce((o, k) => (o == null ? null : o[k]), row);
  const eligible = researchRows.filter(
    (r) => r.entering.career_games >= minCareerGames && Number.isFinite(get(r))
  );

  // year-to-year: signal(S) vs signal(S+1) for same coach
  const bySeason = new Map(eligible.map((r) => [`${r.coach_id}|${r.season}`, r]));
  const yoyPairs = [];
  for (const r of eligible) {
    const nxt = bySeason.get(`${r.coach_id}|${r.season + 1}`);
    if (nxt && Number.isFinite(get(nxt))) yoyPairs.push([get(r), get(nxt)]);
  }

  // forward: entering signal(S) vs actual win-over-expectation DURING S
  const fwdWoe = eligible
    .filter((r) => r.outcome_this_season && Number.isFinite(r.outcome_this_season.win_over_expectation_per_game))
    .map((r) => [get(r), r.outcome_this_season.win_over_expectation_per_game]);
  // forward: entering signal(S) vs actual ATS% DURING S
  const fwdAts = eligible
    .filter((r) => r.outcome_this_season && Number.isFinite(r.outcome_this_season.ats_pct))
    .map((r) => [get(r), r.outcome_this_season.ats_pct]);
  // forward: entering signal(S) vs actual win-over-expectation DURING S+1
  const fwdNext = eligible
    .filter((r) => r.outcome_next_season && Number.isFinite(r.outcome_next_season.win_over_expectation_per_game))
    .map((r) => [get(r), r.outcome_next_season.win_over_expectation_per_game]);

  return {
    path,
    min_career_games: minCareerGames,
    coach_seasons: eligible.length,
    year_to_year: pearson(yoyPairs),
    forward_win_over_expectation_same_season: pearson(fwdWoe),
    forward_ats_pct_same_season: pearson(fwdAts),
    forward_win_over_expectation_next_season: pearson(fwdNext),
  };
}

/** Shrinkage sweep for career ATS rate as a forward predictor. */
export function atsShrinkageSweep(researchRows, ks = [0, 10, 25, 50, 100, 200], { minCareerGames = 0 } = {}) {
  const rows = researchRows.filter(
    (r) => r.entering.career_games >= minCareerGames &&
      Number.isFinite(r.entering.career_ats_w) && Number.isFinite(r.entering.career_ats_l)
  );
  const bySeason = new Map(rows.map((r) => [`${r.coach_id}|${r.season}`, r]));
  return ks.map((k) => {
    const shrunk = (r) => shrinkAtsRate(r.entering.career_ats_w, r.entering.career_ats_l, k);
    const yoy = [];
    for (const r of rows) {
      const nxt = bySeason.get(`${r.coach_id}|${r.season + 1}`);
      if (nxt) { const a = shrunk(r), b = shrunk(nxt); if (a != null && b != null) yoy.push([a, b]); }
    }
    const fwd = rows
      .filter((r) => r.outcome_this_season && Number.isFinite(r.outcome_this_season.ats_pct))
      .map((r) => [shrunk(r), r.outcome_this_season.ats_pct])
      .filter((p) => p[0] != null);
    const fwdNext = rows
      .filter((r) => r.outcome_next_season && Number.isFinite(r.outcome_next_season.ats_pct))
      .map((r) => [shrunk(r), r.outcome_next_season.ats_pct])
      .filter((p) => p[0] != null);
    return {
      k,
      coach_seasons: rows.length,
      year_to_year: pearson(yoy),
      forward_ats_same_season: pearson(fwd),
      forward_ats_next_season: pearson(fwdNext),
    };
  });
}

/** Cohort breakdown by career-game sample-size band. */
export function sampleSizeBands(researchRows, path) {
  const bands = [
    { label: "0-16 (first year)", lo: 0, hi: 16 },
    { label: "17-49", lo: 17, hi: 49 },
    { label: "50-99", lo: 50, hi: 99 },
    { label: "100-159", lo: 100, hi: 159 },
    { label: "160+", lo: 160, hi: Infinity },
  ];
  const get = (row) => path.split(".").reduce((o, k) => (o == null ? null : o[k]), row);
  return bands.map((band) => {
    const rows = researchRows.filter(
      (r) => r.entering.career_games >= band.lo && r.entering.career_games <= band.hi
    );
    const bySeason = new Map(rows.map((r) => [`${r.coach_id}|${r.season}`, r]));
    const yoy = [];
    for (const r of rows) {
      const nxt = bySeason.get(`${r.coach_id}|${r.season + 1}`);
      if (nxt && Number.isFinite(get(r)) && Number.isFinite(get(nxt))) yoy.push([get(r), get(nxt)]);
    }
    const fwd = rows
      .filter((r) => r.outcome_this_season && Number.isFinite(get(r)) && Number.isFinite(r.outcome_this_season.win_over_expectation_per_game))
      .map((r) => [get(r), r.outcome_this_season.win_over_expectation_per_game]);
    return { band: band.label, coach_seasons: rows.length, year_to_year: pearson(yoy), forward_woe_same_season: pearson(fwd) };
  });
}

/**
 * Split-half persistence: within each coach's career game log, split games into
 * odd/even index halves and correlate the two halves' rates across coaches.
 * This is an autocorrelation-free skill-persistence estimate (unlike the
 * year-to-year r of a CUMULATIVE career metric, which is inflated by window
 * overlap). Spearman-Brown corrected r is also returned.
 *
 * @param {object[]} perGame  rows from buildCoachResearch().perGame
 */
export function splitHalfPersistence(perGame, { minGames = 30 } = {}) {
  const byCoach = new Map();
  for (const g of perGame) {
    if (!byCoach.has(g.coachId)) byCoach.set(g.coachId, []);
    byCoach.get(g.coachId).push(g);
  }
  const atsPairs = [];
  const woePairs = [];
  const wlPairs = [];
  for (const [, games] of byCoach) {
    if (games.length < minGames) continue;
    const odd = games.filter((_, i) => i % 2 === 0);
    const even = games.filter((_, i) => i % 2 === 1);
    const atsRate = (list) => {
      const w = list.filter((g) => g.ats === "W").length;
      const l = list.filter((g) => g.ats === "L").length;
      return w + l >= 8 ? w / (w + l) : null;
    };
    const woeMean = (list) => {
      const v = list.map((g) => g.woe).filter((x) => x != null);
      return v.length >= 8 ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const wlRate = (list) => {
      const w = list.filter((g) => g.wl === "W").length;
      const t = list.filter((g) => g.wl === "T").length;
      return list.length >= 8 ? (w + 0.5 * t) / list.length : null;
    };
    const a1 = atsRate(odd), a2 = atsRate(even);
    if (a1 != null && a2 != null) atsPairs.push([a1, a2]);
    const w1 = woeMean(odd), w2 = woeMean(even);
    if (w1 != null && w2 != null) woePairs.push([w1, w2]);
    const l1 = wlRate(odd), l2 = wlRate(even);
    if (l1 != null && l2 != null) wlPairs.push([l1, l2]);
  }
  const sb = (r) => (r == null ? null : Number(((2 * r) / (1 + r)).toFixed(4)));
  const ats = pearson(atsPairs);
  const woe = pearson(woePairs);
  const wl = pearson(wlPairs);
  return {
    min_games: minGames,
    ats_pct: { ...ats, spearman_brown: sb(ats.r) },
    win_over_expectation: { ...woe, spearman_brown: sb(woe.r) },
    win_pct: { ...wl, spearman_brown: sb(wl.r) },
  };
}

function sortKey(row) {
  const gameday = String(row.gameday ?? "").trim() || "9999-99-99";
  const gametime = String(row.gametime ?? "").trim() || "00:00";
  const week = String(Number(row.week) || 0).padStart(2, "0");
  return `${gameday}T${gametime}|${week}|${String(row.game_id).trim()}`;
}
function rateFromTuple(t) {
  if (!Array.isArray(t)) return null;
  const [w, l] = t;
  return w + l > 0 ? Number((w / (w + l)).toFixed(4)) : null;
}
function wlRateFromTuple(t) {
  if (!Array.isArray(t)) return null;
  const [w, l, tie = 0] = t;
  const d = w + l + tie;
  return d > 0 ? Number(((w + 0.5 * tie) / d).toFixed(4)) : null;
}
function round4(x) { return x == null ? null : Number(x.toFixed(4)); }
function round2(x) { return x == null ? null : Number(x.toFixed(2)); }
