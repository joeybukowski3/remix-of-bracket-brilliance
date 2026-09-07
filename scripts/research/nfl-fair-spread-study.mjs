/**
 * Candidate JKB fair-spread models, evaluated against actual football margins.
 *
 * RESEARCH ONLY. Writes no production artifact, changes no production logic,
 * and is wired into no generator.
 *
 * The objective is not to beat the market. It is to produce the best
 * INDEPENDENT football estimate of a game's home margin, so that a later layer
 * can ask where that estimate disagrees with the market and why.
 *
 * MARKET INDEPENDENCE IS ABSOLUTE HERE. No spread, total, moneyline or
 * odds-derived quantity is a feature of any candidate, and the training target
 * is always the realised home margin. The market appears only after every
 * prediction exists, as a benchmark and as the second term of an edge.
 *
 * Production reconstruction caveat: the shipped model is
 * `0.24 * (currentOVR_home - currentOVR_away) + 2.0`, where Current OVR blends
 * a hand-curated 2026 v0.4 preseason anchor with live performance analytics.
 * That anchor exists only for 2026, so the shipped number cannot be replayed
 * for 2019-2025. Candidate B is therefore a faithful STRUCTURAL analogue -
 * one composite strength number, one fitted points coefficient, one home-field
 * constant - built from reconstructible inputs, and is labelled as such
 * throughout rather than being called "production".
 *
 * Usage:
 *   node scripts/research/nfl-fair-spread-study.mjs --external=<dir>
 *   node scripts/research/nfl-fair-spread-study.mjs --external=<dir> --json=<file>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canon, kickoff, mean, pick, preseasonPrior, pregameState, sd, seasonRates, teamGameRows,
  METRICS } from "./nfl-mispricing-state.mjs";
import { reportFairSpread } from "./nfl-fair-spread-report.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NFLVERSE = join(ROOT, "data", "nfl", "nflverse");

const RATE_SEASONS = Array.from({ length: 15 }, (_, index) => 2011 + index);
const GAME_SEASONS = Array.from({ length: 13 }, (_, index) => 2013 + index);
const TEST_SEASONS = [2023, 2024, 2025];

/** The shipped comparison fade: projection weight by that team's completed games. */
const FADE_CURVE = [1, 0.8, 0.6, 0.4, 0.2, 0];

function parseArgs(argv) {
  const args = { external: null, json: null };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--external=")) args.external = resolve(raw.slice(11));
    else if (raw.startsWith("--json=")) args.json = resolve(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!args.external) throw new Error("--external=<dir> is required");
  return args;
}

/**
 * Ridge with an UNPENALISED intercept.
 *
 * Every feature is a home-minus-away differential, so the intercept is the
 * home-field advantage in points and must not be shrunk toward zero.
 */
export function ridgeFit(X, y, lambda) {
  const n = X.length;
  const p = X[0].length;
  const design = X.map((row) => [1, ...row]);
  const size = p + 1;
  const A = Array.from({ length: size }, (_, i) => Array.from({ length: size + 1 }, (_, j) => {
    if (j === size) return design.reduce((total, row, r) => total + row[i] * y[r], 0);
    const penalty = i === j && i > 0 ? lambda : 0;
    return design.reduce((total, row) => total + row[i] * row[j], 0) + penalty;
  }));
  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < size; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    if (Math.abs(A[col][col]) < 1e-10) return { intercept: mean(y), beta: new Array(p).fill(0) };
    for (let r = 0; r < size; r += 1) {
      if (r === col) continue;
      const factor = A[r][col] / A[col][col];
      for (let c = col; c <= size; c += 1) A[r][c] -= factor * A[col][c];
    }
  }
  const solution = A.map((row, i) => row[size] / A[i][i]);
  if (n < size) return { intercept: mean(y), beta: new Array(p).fill(0) };
  return { intercept: solution[0], beta: solution.slice(1) };
}

export function score(pairs) {
  const errors = pairs.map(([predicted, actual]) => predicted - actual);
  const predicted = pairs.map((pair) => pair[0]);
  const actual = pairs.map((pair) => pair[1]);
  const mp = mean(predicted);
  const ma = mean(actual);
  const covariance = mean(pairs.map(([p, a]) => (p - mp) * (a - ma)));
  const spread = sd(predicted) * sd(actual);
  // Calibration slope: regress actual on predicted. 1.0 means correctly scaled.
  const variance = mean(predicted.map((value) => (value - mp) ** 2));
  const slope = variance > 0 ? mean(pairs.map(([p, a]) => (p - mp) * (a - ma))) / variance : 0;
  return {
    n: pairs.length,
    mae: mean(errors.map(Math.abs)),
    rmse: Math.sqrt(mean(errors.map((error) => error ** 2))),
    corr: spread > 0 ? covariance / spread : 0,
    bias: mean(errors),
    slope,
    intercept: ma - slope * mp,
    residualSd: sd(errors),
  };
}

/** Blend the preseason prior into season-to-date form on the shipped fade curve. */
function blendedStrength(state, prior) {
  const weight = FADE_CURVE[Math.min(state.games, FADE_CURVE.length - 1)];
  const blend = (observed, priorKey) => {
    const priorValue = prior?.[priorKey] ?? null;
    if (priorValue === null) return observed;
    if (observed === null || weight >= 1) return priorValue;
    return weight * priorValue + (1 - weight) * observed;
  };
  return {
    offEpa: blend(state.offEpa, "off.epaPerPlay"), defEpa: blend(state.defEpa, "def.epaPerPlayAllowed"),
    offPassEpa: blend(state.offPassEpa, "off.epaPerPass"), defPassEpa: blend(state.defPassEpa, "def.epaPerPassAllowed"),
    offRushEpa: blend(state.offRushEpa, "off.epaPerRush"), defRushEpa: blend(state.defRushEpa, "def.epaPerRushAllowed"),
    offSucc: blend(state.offSucc, "off.successRate"), defSucc: blend(state.defSucc, "def.successRateAllowed"),
    offPassSucc: blend(state.offPassSucc, "off.passSuccessRate"), defPassSucc: blend(state.defPassSucc, "def.passSuccessRateAllowed"),
    offRushSucc: blend(state.offRushSucc, "off.rushSuccessRate"), defRushSucc: blend(state.defRushSucc, "def.rushSuccessRateAllowed"),
    pointDiff: state.pointDiff, games: state.games, projectionWeight: weight,
  };
}

/** Feature builders. Every value is home-minus-away, in the metric's own units. */
export const FEATURE_SETS = {
  B_strengthOnly: {
    label: "B  single composite strength + home field (structural analogue of production)",
    features: {
      netStrength: (g) => (g.hb.offEpa - g.hb.defEpa) - (g.ab.offEpa - g.ab.defEpa),
    },
  },
  C_coreEfficiency: {
    label: "C  core EPA + success differentials",
    features: {
      offEpaDiff: (g) => g.hb.offEpa - g.ab.offEpa,
      defEpaDiff: (g) => g.ab.defEpa - g.hb.defEpa,
      offSuccDiff: (g) => g.hb.offSucc - g.ab.offSucc,
      defSuccDiff: (g) => g.ab.defSucc - g.hb.defSucc,
    },
  },
  // Nested on C so this is a clean test of "do matchup terms add anything?".
  // The matchup terms must be SYMMETRIC — (homeOff vs awayDef) minus
  // (awayOff vs homeDef). Two separate one-sided terms cannot span the correct
  // defensive sign, which silently handicaps the model rather than testing it.
  D_matchupAware: {
    label: "D  core + symmetric matchup terms (nested on C)",
    features: {
      offEpaDiff: (g) => g.hb.offEpa - g.ab.offEpa,
      defEpaDiff: (g) => g.ab.defEpa - g.hb.defEpa,
      offSuccDiff: (g) => g.hb.offSucc - g.ab.offSucc,
      defSuccDiff: (g) => g.ab.defSucc - g.hb.defSucc,
      overallMatchup: (g) => (g.hb.offEpa - g.ab.defEpa) - (g.ab.offEpa - g.hb.defEpa),
      passMatchup: (g) => (g.hb.offPassEpa - g.ab.defPassEpa) - (g.ab.offPassEpa - g.hb.defPassEpa),
      rushMatchup: (g) => (g.hb.offRushEpa - g.ab.defRushEpa) - (g.ab.offRushEpa - g.hb.defRushEpa),
      passSuccMatchup: (g) => (g.hb.offPassSucc - g.ab.defPassSucc) - (g.ab.offPassSucc - g.hb.defPassSucc),
      rushSuccMatchup: (g) => (g.hb.offRushSucc - g.ab.defRushSucc) - (g.ab.offRushSucc - g.hb.defRushSucc),
    },
  },
  E_combined: {
    label: "E  regularised combined football model",
    features: {
      offEpaDiff: (g) => g.hb.offEpa - g.ab.offEpa,
      defEpaDiff: (g) => g.ab.defEpa - g.hb.defEpa,
      passMatchup: (g) => (g.hb.offPassEpa - g.ab.defPassEpa) - (g.ab.offPassEpa - g.hb.defPassEpa),
      rushMatchup: (g) => (g.hb.offRushEpa - g.ab.defRushEpa) - (g.ab.offRushEpa - g.hb.defRushEpa),
      offSuccDiff: (g) => g.hb.offSucc - g.ab.offSucc,
      defSuccDiff: (g) => g.ab.defSucc - g.hb.defSucc,
      passSuccMatchup: (g) => (g.hb.offPassSucc - g.ab.defPassSucc) - (g.ab.offPassSucc - g.hb.defPassSucc),
      rushSuccMatchup: (g) => (g.hb.offRushSucc - g.ab.defRushSucc) - (g.ab.offRushSucc - g.hb.defRushSucc),
      pointDiffDiff: (g) => (g.hb.pointDiff ?? 0) - (g.ab.pointDiff ?? 0),
      restDiff: (g) => g.restDiff,
    },
  },
};

/** F fits home and away points separately, then subtracts. Same inputs, different structure. */
export const SCORING_FEATURES = {
  ownOffEpa: (g, side) => (side === "home" ? g.hb.offEpa : g.ab.offEpa),
  oppDefEpa: (g, side) => (side === "home" ? g.ab.defEpa : g.hb.defEpa),
  ownOffSucc: (g, side) => (side === "home" ? g.hb.offSucc : g.ab.offSucc),
  oppDefSucc: (g, side) => (side === "home" ? g.ab.defSucc : g.hb.defSucc),
  ownPassEpa: (g, side) => (side === "home" ? g.hb.offPassEpa : g.ab.offPassEpa),
  oppPassDef: (g, side) => (side === "home" ? g.ab.defPassEpa : g.hb.defPassEpa),
  isHome: (g, side) => (side === "home" ? 1 : 0),
};

const LAMBDA_GRID = [0.3, 1, 3, 10, 30, 100, 300];

function main() {
  const args = parseArgs(process.argv);
  const sources = [];
  const rates = {};
  for (const season of RATE_SEASONS) {
    const rows = teamGameRows(sources, ROOT, NFLVERSE, season, args.external);
    rates[season] = { rows, table: seasonRates(rows) };
  }
  const priors = {};
  for (const season of [...GAME_SEASONS, 2026]) {
    priors[season] = preseasonPrior(rates[season - 1].table, rates[season - 2].table);
  }
  const allGames = pick(sources, ROOT, "schedules (kickoff, scores, settled line)",
    null, join(args.external, "games_full.csv"));

  const games = [];
  for (const season of GAME_SEASONS) {
    const list = allGames.filter((game) => game.game_type === "REG" && Number(game.season) === season
      && game.home_score !== "" && game.away_score !== "");
    list.sort((a, b) => kickoff(a) - kickoff(b) || a.game_id.localeCompare(b.game_id));
    const kickoffByGame = new Map(list.map((game) => [game.game_id, kickoff(game)]));
    const results = list.map((game) => ({
      home: canon(game.home_team), away: canon(game.away_team), kick: kickoffByGame.get(game.game_id),
      homeMargin: Number(game.home_score) - Number(game.away_score),
      homePoints: Number(game.home_score), awayPoints: Number(game.away_score),
    }));
    const played = rates[season].rows;
    const prior = priors[season];
    for (const game of list) {
      const home = canon(game.home_team);
      const away = canon(game.away_team);
      if (!prior.has(home) || !prior.has(away)) continue;
      const cutoff = kickoffByGame.get(game.game_id);
      const before = (team) => played.filter((row) => (row.team === team || row.opponent === team)
        && (kickoffByGame.get(row.game) ?? Infinity) < cutoff);
      const stateFor = (team) => pregameState({
        team, prior: prior.get(team), priorTable: rates[season - 1].table, twoBackTable: rates[season - 2].table,
        playedRows: before(team), results, cutoff,
      });
      const homeState = stateFor(home);
      const awayState = stateFor(away);
      games.push({
        season, week: Number(game.week), gameId: game.game_id, home, away,
        neutral: (game.location ?? "Home") !== "Home",
        homeMargin: Number(game.home_score) - Number(game.away_score),
        homePoints: Number(game.home_score), awayPoints: Number(game.away_score),
        // Market is carried for EVALUATION ONLY and is never a model input.
        marketSpread: game.spread_line === "" ? null : Number(game.spread_line),
        restDiff: Number(game.home_rest) - Number(game.away_rest),
        hb: blendedStrength(homeState, prior.get(home)),
        ab: blendedStrength(awayState, prior.get(away)),
      });
    }
  }

  // Any game whose blended state is incomplete is dropped rather than defaulted.
  const usable = games.filter((game) => Object.values(FEATURE_SETS).every((set) =>
    Object.values(set.features).every((fn) => Number.isFinite(fn(game)))));

  /** Rolling origin: a season is predicted only by models fitted on earlier seasons. */
  const fitAndPredict = (setId) => {
    const set = FEATURE_SETS[setId];
    const names = Object.keys(set.features);
    const predictions = new Map();
    const fits = new Map();
    for (const testSeason of TEST_SEASONS) {
      const train = usable.filter((game) => game.season < testSeason);
      const test = usable.filter((game) => game.season === testSeason);
      const raw = names.map((name) => train.map((game) => set.features[name](game)));
      const centres = raw.map(mean);
      const scales = raw.map((column) => sd(column) || 1);
      const design = (subset) => subset.map((game) =>
        names.map((name, i) => (set.features[name](game) - centres[i]) / scales[i]));
      const y = train.map((game) => game.homeMargin);
      // Inner rolling origin for lambda; never touches the test season.
      const trainSeasons = [...new Set(train.map((game) => game.season))].sort();
      let best = null;
      for (const lambda of LAMBDA_GRID) {
        const inner = [];
        for (let index = Math.max(1, trainSeasons.length - 4); index < trainSeasons.length; index += 1) {
          const innerTrain = train.filter((game) => game.season < trainSeasons[index]);
          const innerTest = train.filter((game) => game.season === trainSeasons[index]);
          if (innerTrain.length < 100) continue;
          const fit = ridgeFit(design(innerTrain), innerTrain.map((game) => game.homeMargin), lambda);
          design(innerTest).forEach((row, i) => inner.push([
            fit.intercept + row.reduce((total, value, j) => total + value * fit.beta[j], 0),
            innerTest[i].homeMargin]));
        }
        if (inner.length === 0) continue;
        const rmse = score(inner).rmse;
        if (best === null || rmse < best.rmse) best = { rmse, lambda };
      }
      const lambda = best?.lambda ?? 10;
      const fit = ridgeFit(design(train), y, lambda);
      fits.set(testSeason, { lambda, intercept: fit.intercept,
        beta: Object.fromEntries(names.map((name, i) => [name, fit.beta[i]])), centres, scales, names });
      design(test).forEach((row, i) => {
        const contributions = Object.fromEntries(names.map((name, j) => [name, row[j] * fit.beta[j]]));
        // Neutral sites get no home-field term; the intercept IS home field.
        const homeField = test[i].neutral ? 0 : fit.intercept;
        predictions.set(test[i].gameId, {
          value: homeField + row.reduce((total, value, j) => total + value * fit.beta[j], 0),
          contributions, homeField,
        });
      });
    }
    return { predictions, fits, names, label: set.label };
  };

  const models = new Map(Object.keys(FEATURE_SETS).map((setId) => [setId, fitAndPredict(setId)]));

  // ---- F: separate scoring model, home and away points fitted then subtracted
  const scoringNames = Object.keys(SCORING_FEATURES);
  const fPredictions = new Map();
  for (const testSeason of TEST_SEASONS) {
    const train = usable.filter((game) => game.season < testSeason);
    const test = usable.filter((game) => game.season === testSeason);
    const rows = [];
    const targets = [];
    for (const game of train) {
      rows.push(scoringNames.map((name) => SCORING_FEATURES[name](game, "home")));
      targets.push(game.homePoints);
      rows.push(scoringNames.map((name) => SCORING_FEATURES[name](game, "away")));
      targets.push(game.awayPoints);
    }
    const centres = scoringNames.map((_, i) => mean(rows.map((row) => row[i])));
    const scales = scoringNames.map((_, i) => sd(rows.map((row) => row[i])) || 1);
    const scaled = rows.map((row) => row.map((value, i) => (value - centres[i]) / scales[i]));
    const fit = ridgeFit(scaled, targets, 10);
    const predictSide = (game, side) => {
      const row = scoringNames.map((name, i) => (SCORING_FEATURES[name](game, side) - centres[i]) / scales[i]);
      return fit.intercept + row.reduce((total, value, j) => total + value * fit.beta[j], 0);
    };
    for (const game of test) {
      fPredictions.set(game.gameId, { value: predictSide(game, "home") - predictSide(game, "away"), contributions: {}, homeField: null });
    }
  }
  models.set("F_scoringModel", { predictions: fPredictions, fits: new Map(), names: scoringNames,
    label: "F  separate home/away scoring model, then subtract" });

  // ---------------------------------------------------- 2026 forward slate
  const slate2026 = allGames.filter((game) => game.game_type === "REG" && Number(game.season) === 2026)
    .sort((a, b) => kickoff(a) - kickoff(b));
  const prior2026 = priors[2026];
  const forward = [];
  for (const game of slate2026) {
    const home = canon(game.home_team);
    const away = canon(game.away_team);
    if (!prior2026.has(home) || !prior2026.has(away)) continue;
    const emptyState = (team) => pregameState({
      team, prior: prior2026.get(team), priorTable: rates[2025].table, twoBackTable: rates[2024].table,
      playedRows: [], results: [], cutoff: 0,
    });
    forward.push({
      season: 2026, week: Number(game.week), gameId: game.game_id, home, away,
      neutral: (game.location ?? "Home") !== "Home",
      marketSpread: game.spread_line === "" ? null : Number(game.spread_line),
      restDiff: Number(game.home_rest) - Number(game.away_rest),
      hb: blendedStrength(emptyState(home), prior2026.get(home)),
      ab: blendedStrength(emptyState(away), prior2026.get(away)),
    });
  }

  const production = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "matchup-projections.json"), "utf-8"));

  const report = { sources, seasons: GAME_SEASONS, testSeasons: TEST_SEASONS };
  reportFairSpread({ usable, models, forward, production, report,
    helpers: { mean, sd, score, ridgeFit, FEATURE_SETS, TEST_SEASONS, LAMBDA_GRID } });

  if (args.json) {
    writeFileSync(args.json, `${JSON.stringify(report, null, 1)}\n`, "utf-8");
    console.log(`\nwrote ${args.json}`);
  }
}

main();
