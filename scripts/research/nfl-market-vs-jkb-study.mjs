/**
 * Research: do JKB team-strength signals add anything beyond the closing spread?
 *
 * SIMULATION ONLY. Writes no production artifact, changes no production logic,
 * and is wired into no generator.
 *
 * The benchmark is the market, not an uninformed baseline. The primary target
 * is the continuous market error
 *
 *     marketError = actualHomeMargin - spreadLine
 *
 * where nfldata's `spread_line` is already the projected home margin (positive
 * means the home team is favoured). Over 2019-2025 the mean market error is
 * -0.06 points across 1,871 games, so the market is treated as unbiased and any
 * JKB coefficient has to earn its place against that.
 *
 * Pregame JKB strength is reconstructed exactly as production defines it:
 * the shipped 0.6/0.4 two-season prior with family shrinkage, faded into
 * season-to-date observed form on the shipped completed-game curve
 * [1, .8, .6, .4, .2, 0]. "Completed" means games whose kickoff precedes this
 * game's kickoff, never nominal week, so a Thursday game never sees Sunday.
 *
 * No margin is ever derived by subtracting ratings or EPA. Any EPA-to-points
 * mapping is fitted on earlier seasons only, inside the rolling origin.
 *
 * Older seasons are not fully committed here (2017-2019 EPA and 2017-2018
 * success team-game tables, the untrimmed schedules file carrying spread_line).
 * Point --external at a directory holding them; a committed cache always wins.
 *
 * Usage:
 *   node scripts/research/nfl-market-vs-jkb-study.mjs --external=<dir>
 *   node scripts/research/nfl-market-vs-jkb-study.mjs --external=<dir> --json=<file>
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMarketDiagnostics } from "./nfl-market-study-diagnostics.mjs";
import { coachAndQb, returningSnapShares } from "./nfl-roster-aware-projection-study.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NFLVERSE = join(ROOT, "data", "nfl", "nflverse");

/** Rate seasons start at 2017 so the earliest modelled target season (2019) has both priors. */
const RATE_SEASONS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const GAME_SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TEST_SEASONS = [2023, 2024, 2025];

/** Shipped projection constants, restated so this study scores the live formula. */
const RECENCY_WEIGHT = 0.6;
const SHIPPED_K = { "offense-passing": 0.55, "offense-rushing": 0.45, "defense-passing": 0.30, "defense-rushing": 0.20 };
const FADE_CURVE = [1, 0.8, 0.6, 0.4, 0.2, 0];

const METRICS = {
  "off.epaPerPlay": { cache: "epa", num: "off_epa", den: "off_plays", scale: 1, defense: false },
  "off.epaPerPass": { cache: "epa", num: "pass_epa", den: "pass_plays", scale: 1, defense: false },
  "off.epaPerRush": { cache: "epa", num: "rush_epa", den: "rush_plays", scale: 1, defense: false },
  "off.successRate": { cache: "success", num: "off_success", den: "off_plays", scale: 100, defense: false },
  "off.passSuccessRate": { cache: "success", num: "pass_success", den: "pass_plays", scale: 100, defense: false },
  "off.rushSuccessRate": { cache: "success", num: "rush_success", den: "rush_plays", scale: 100, defense: false },
  "def.epaPerPlayAllowed": { cache: "epa", num: "off_epa", den: "off_plays", scale: 1, defense: true },
  "def.epaPerPassAllowed": { cache: "epa", num: "pass_epa", den: "pass_plays", scale: 1, defense: true },
  "def.epaPerRushAllowed": { cache: "epa", num: "rush_epa", den: "rush_plays", scale: 1, defense: true },
  "def.successRateAllowed": { cache: "success", num: "off_success", den: "off_plays", scale: 100, defense: true },
  "def.passSuccessRateAllowed": { cache: "success", num: "pass_success", den: "pass_plays", scale: 100, defense: true },
  "def.rushSuccessRateAllowed": { cache: "success", num: "rush_success", den: "rush_plays", scale: 100, defense: true },
};
const isDefense = (key) => key.startsWith("def.");
const family = (key) => `${isDefense(key) ? "defense" : "offense"}-${/rush/i.test(key) ? "rushing" : "passing"}`;

const TEAM_ALIASES = { OAK: "lv", SD: "lac", STL: "lar", LA: "lar", WAS: "wsh" };
const canon = (abbr) => {
  const upper = String(abbr ?? "").trim().toUpperCase();
  return TEAM_ALIASES[upper] ?? upper.toLowerCase();
};

const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;
const sd = (values) => {
  const centre = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - centre) ** 2)));
};

// ------------------------------------------------------------------ input layer

function parseArgs(argv) {
  const args = { external: null, json: null };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--external=")) args.external = resolve(raw.slice(11));
    else if (raw.startsWith("--json=")) args.json = resolve(raw.slice(7));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function readCsv(path) {
  const text = readFileSync(path, "utf-8").replace(/\r\n/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).filter((cells) => cells.length === header.length)
    .map((cells) => Object.fromEntries(header.map((column, index) => [column, cells[index]])));
}

function pick(sources, label, committed, external, required = []) {
  if (committed && existsSync(committed)) {
    const rows = readCsv(committed);
    const missing = required.filter((column) => !(column in (rows[0] ?? {})));
    if (missing.length === 0) {
      sources.push(`${label}: committed ${committed.slice(ROOT.length + 1).replace(/\\/g, "/")}`);
      return rows;
    }
    sources.push(`${label}: committed copy lacks ${missing.join(", ")}; using external`);
  }
  if (external && existsSync(external)) {
    sources.push(`${label}: external ${external.split(/[\\/]/).at(-1)}`);
    return readCsv(external);
  }
  throw new Error(`Missing input for ${label}: neither ${committed} nor ${external}`);
}

// ------------------------------------------------------- team-game rate plumbing

/** One row per team-game with both caches' numerators and denominators joined. */
function teamGameRows(sources, season, external) {
  const epa = pick(sources, `epa ${season}`,
    join(NFLVERSE, "epa-team-game", `epa_team_game_${season}.csv`),
    external && join(external, `epa_team_game_${season}.csv`));
  const success = pick(sources, `success ${season}`,
    join(NFLVERSE, "success-team-game", `success_team_game_${season}.csv`),
    external && join(external, `success_team_game_${season}.csv`));
  const byKey = new Map();
  for (const row of epa) {
    byKey.set(`${row.game_id}|${row.team}`, {
      game: row.game_id, season, week: Number(row.week), team: row.team, opponent: row.opponent,
      off_epa: Number(row.off_epa), off_plays_epa: Number(row.off_plays),
      pass_epa: Number(row.pass_epa), pass_plays_epa: Number(row.pass_plays),
      rush_epa: Number(row.rush_epa), rush_plays_epa: Number(row.rush_plays),
    });
  }
  for (const row of success) {
    const entry = byKey.get(`${row.game_id}|${row.team}`);
    if (!entry) continue;
    entry.off_success = Number(row.off_success); entry.off_plays = Number(row.off_plays);
    entry.pass_success = Number(row.pass_success); entry.pass_plays = Number(row.pass_plays);
    entry.rush_success = Number(row.rush_success); entry.rush_plays = Number(row.rush_plays);
  }
  const joined = [...byKey.values()].filter((row) => row.off_success !== undefined);
  // A silently empty or half-joined season would drop a whole year of games
  // without failing, so the shape is asserted rather than assumed.
  const teams = new Set(joined.map((row) => row.team));
  if (teams.size !== 32) throw new Error(`${season}: joined team-game table has ${teams.size} teams, expected 32`);
  return joined;
}

const denominatorField = (key) => (METRICS[key].cache === "epa" ? `${METRICS[key].den}_epa` : METRICS[key].den);

/** Rate over an explicit set of team-game rows. Sums first, divides once. */
function rateOver(rows, key) {
  const spec = METRICS[key];
  const numerator = rows.reduce((total, row) => total + row[spec.num], 0);
  const denominator = rows.reduce((total, row) => total + row[denominatorField(key)], 0);
  return denominator > 0 ? (spec.scale * numerator) / denominator : null;
}

/** Season table: full-season and final-eight rates, offence from own rows, defence from opponents'. */
function seasonRates(rows) {
  const teams = [...new Set(rows.map((row) => row.team))].sort();
  const ordered = [...rows].sort((a, b) => a.week - b.week || a.game.localeCompare(b.game));
  const out = new Map(teams.map((team) => [team, { full: {}, last8: {} }]));
  for (const team of teams) {
    const games = [...new Set(ordered.filter((row) => row.team === team || row.opponent === team).map((row) => row.game))];
    const lastEight = new Set(games.slice(-8));
    for (const key of Object.keys(METRICS)) {
      const side = (row) => (isDefense(key) ? row.opponent : row.team) === team;
      out.get(team).full[key] = rateOver(ordered.filter(side), key);
      out.get(team).last8[key] = rateOver(ordered.filter((row) => side(row) && lastEight.has(row.game)), key);
    }
  }
  return out;
}

/** The shipped preseason prior: 0.6/0.4 two-season blend, shrunk toward the Y-1 league mean. */
function preseasonPrior(priorTable, twoBackTable) {
  const teams = [...priorTable.keys()].filter((team) => twoBackTable.has(team)).sort();
  const out = new Map(teams.map((team) => [team, {}]));
  for (const key of Object.keys(METRICS)) {
    const blended = new Map(teams.map((team) =>
      [team, RECENCY_WEIGHT * priorTable.get(team).full[key] + (1 - RECENCY_WEIGHT) * twoBackTable.get(team).full[key]]));
    const anchor = mean(teams.map((team) => priorTable.get(team).full[key]));
    const centre = mean([...blended.values()]);
    const k = SHIPPED_K[family(key)];
    for (const team of teams) out.get(team)[key] = anchor + k * (blended.get(team) - centre);
  }
  return out;
}

// ------------------------------------------------------------- game construction

const kickoff = (game) => Date.parse(`${game.gameday}T${game.gametime || "13:00"}:00-04:00`);

/**
 * Pregame blended strength for one team, using only its games that kicked off
 * earlier in this same season. The fade curve and the completed-game count are
 * the shipped ones; five or more completed games means the prior is gone.
 */
function pregameStrength(prior, playedRows) {
  const completed = new Set(playedRows.map((row) => row.game)).size;
  const weight = FADE_CURVE[Math.min(completed, FADE_CURVE.length - 1)];
  const out = { completed, projectionWeight: weight };
  for (const key of Object.keys(METRICS)) {
    const side = (row) => (isDefense(key) ? row.opponentSide : row.ownSide);
    const observed = weight < 1 ? rateOver(playedRows.filter(side), key) : null;
    out[key] = weight >= 1 || observed === null
      ? prior[key]
      : weight * prior[key] + (1 - weight) * observed;
  }
  return out;
}

function buildGames(context) {
  const { games, rates, priors, coverage } = context;
  const rows = [];
  const seasonGames = new Map();
  for (const game of games) {
    if (game.game_type !== "REG" || !GAME_SEASONS.includes(Number(game.season))) continue;
    if (game.home_score === "" || game.away_score === "" || game.spread_line === "") continue;
    const season = Number(game.season);
    if (!seasonGames.has(season)) seasonGames.set(season, []);
    seasonGames.get(season).push(game);
  }
  for (const [season, list] of seasonGames) {
    const prior = priors[season];
    const played = rates[season].rows;
    list.sort((a, b) => kickoff(a) - kickoff(b) || a.game_id.localeCompare(b.game_id));
    const kickoffByGame = new Map(list.map((game) => [game.game_id, kickoff(game)]));
    for (const game of list) {
      const home = canon(game.home_team);
      const away = canon(game.away_team);
      coverage.games += 1;
      if (!prior.has(home) || !prior.has(away)) { coverage.missingPrior += 1; continue; }
      const before = (team) => played
        .filter((row) => (row.team === team || row.opponent === team)
          && (kickoffByGame.get(row.game) ?? Infinity) < kickoffByGame.get(game.game_id))
        .map((row) => ({ ...row, ownSide: row.team === team, opponentSide: row.opponent === team }));
      rows.push({
        season, week: Number(game.week), gameId: game.game_id, kickoff: kickoffByGame.get(game.game_id),
        home, away,
        spread: Number(game.spread_line),
        homeMargin: Number(game.home_score) - Number(game.away_score),
        strength: { home: pregameStrength(prior.get(home), before(home)), away: pregameStrength(prior.get(away), before(away)) },
        preseason: { home: prior.get(home), away: prior.get(away) },
        lastEight: { home: rates[season - 1].table.get(home)?.last8, away: rates[season - 1].table.get(away)?.last8 },
      });
    }
  }
  return rows.sort((a, b) => a.kickoff - b.kickoff);
}

// --------------------------------------------------------------------- features

/**
 * Every feature is a home-minus-away differential in the metric's own units.
 * Nothing here is asserted to equal points; the mapping is fitted downstream.
 */
const FEATURES = {
  netEpa: (row) => (row.strength.home["off.epaPerPlay"] - row.strength.home["def.epaPerPlayAllowed"])
    - (row.strength.away["off.epaPerPlay"] - row.strength.away["def.epaPerPlayAllowed"]),
  offEpaDiff: (row) => row.strength.home["off.epaPerPlay"] - row.strength.away["off.epaPerPlay"],
  defEpaDiff: (row) => row.strength.away["def.epaPerPlayAllowed"] - row.strength.home["def.epaPerPlayAllowed"],
  passEpaDiff: (row) => row.strength.home["off.epaPerPass"] - row.strength.away["off.epaPerPass"],
  rushEpaDiff: (row) => row.strength.home["off.epaPerRush"] - row.strength.away["off.epaPerRush"],
  passDefDiff: (row) => row.strength.away["def.epaPerPassAllowed"] - row.strength.home["def.epaPerPassAllowed"],
  rushDefDiff: (row) => row.strength.away["def.epaPerRushAllowed"] - row.strength.home["def.epaPerRushAllowed"],
  successDiff: (row) => row.strength.home["off.successRate"] - row.strength.away["off.successRate"],
  successAllowedDiff: (row) => row.strength.away["def.successRateAllowed"] - row.strength.home["def.successRateAllowed"],
  passSuccessDiff: (row) => row.strength.home["off.passSuccessRate"] - row.strength.away["off.passSuccessRate"],
  rushSuccessDiff: (row) => row.strength.home["off.rushSuccessRate"] - row.strength.away["off.rushSuccessRate"],
  // Matchup form: each offence against the defence it actually faces.
  homeOffVsAwayDef: (row) => row.strength.home["off.epaPerPlay"] - row.strength.away["def.epaPerPlayAllowed"],
  awayOffVsHomeDef: (row) => row.strength.away["off.epaPerPlay"] - row.strength.home["def.epaPerPlayAllowed"],
  // Preseason prior only, no in-season observation at all.
  priorNetEpa: (row) => (row.preseason.home["off.epaPerPlay"] - row.preseason.home["def.epaPerPlayAllowed"])
    - (row.preseason.away["off.epaPerPlay"] - row.preseason.away["def.epaPerPlayAllowed"]),
  priorNetSuccess: (row) => (row.preseason.home["off.successRate"] - row.preseason.home["def.successRateAllowed"])
    - (row.preseason.away["off.successRate"] - row.preseason.away["def.successRateAllowed"]),
};

/** The isolated defensive-recency candidate from the previous study. */
const DEF_RECENCY = {
  lastEightDefEpaDiff: (row) => (row.lastEight.away?.["def.epaPerPlayAllowed"] ?? 0) - (row.lastEight.home?.["def.epaPerPlayAllowed"] ?? 0),
  lastEightDefPassEpaDiff: (row) => (row.lastEight.away?.["def.epaPerPassAllowed"] ?? 0) - (row.lastEight.home?.["def.epaPerPassAllowed"] ?? 0),
};

const JKB_FEATURES = Object.keys(FEATURES);
const ALL_FEATURES = { ...FEATURES, ...DEF_RECENCY };

const MODELS = {
  MARKET: [],
  JKB: JKB_FEATURES,
  "MARKET+JKB": JKB_FEATURES,
  "MARKET+JKB+DEFREC": [...JKB_FEATURES, ...Object.keys(DEF_RECENCY)],
};
/** JKB-only ignores the spread entirely and must predict the margin from scratch. */
const usesMarket = (id) => id !== "JKB";

// --------------------------------------------------------------- model machinery

function ridgeFit(X, y, lambda) {
  const p = X[0].length;
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p + 1 }, (_, j) =>
    (j === p
      ? X.reduce((total, row, r) => total + row[i] * y[r], 0)
      : X.reduce((total, row) => total + row[i] * row[j], 0) + (i === j ? lambda : 0))));
  for (let col = 0; col < p; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < p; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    if (Math.abs(A[col][col]) < 1e-10) return new Array(p).fill(0);
    for (let r = 0; r < p; r += 1) {
      if (r === col) continue;
      const factor = A[r][col] / A[col][col];
      for (let c = col; c <= p; c += 1) A[r][c] -= factor * A[col][c];
    }
  }
  return A.map((row, i) => row[p] / A[i][i]);
}

function score(pairs) {
  const errors = pairs.map(([predicted, actual]) => predicted - actual);
  const predicted = pairs.map((pair) => pair[0]);
  const actual = pairs.map((pair) => pair[1]);
  const mp = mean(predicted);
  const ma = mean(actual);
  const covariance = mean(pairs.map(([p, a]) => (p - mp) * (a - ma)));
  const spread = sd(predicted) * sd(actual);
  return {
    n: pairs.length,
    mae: mean(errors.map(Math.abs)),
    rmse: Math.sqrt(mean(errors.map((error) => error ** 2))),
    corr: spread > 0 ? covariance / spread : 0,
  };
}

const LAMBDA_GRID = [10, 30, 100, 300, 1000, 3000, 10000];

/**
 * Rolling origin over seasons. A model tested on season Y is fitted only on
 * games from strictly earlier seasons, and lambda is chosen inside that
 * training block by an inner rolling origin, never on the test season.
 */
function evaluate(rows, modelId) {
  const names = MODELS[modelId];
  const market = usesMarket(modelId);
  const predictions = [];
  const coefficients = new Map();
  for (const testSeason of TEST_SEASONS) {
    const train = rows.filter((row) => row.season < testSeason);
    const test = rows.filter((row) => row.season === testSeason);
    if (modelId === "MARKET") {
      for (const row of test) predictions.push({ row, predicted: row.spread, edge: 0 });
      continue;
    }
    // Standardise on the training block only, so the test season contributes nothing.
    const columns = names.map((name) => train.map((row) => ALL_FEATURES[name](row)));
    const centres = columns.map(mean);
    const spreads = columns.map((column) => sd(column) || 1);
    const design = (subset) => subset.map((row) =>
      names.map((name, i) => (ALL_FEATURES[name](row) - centres[i]) / spreads[i]));
    // Market models predict the market's error; the JKB-only model predicts the margin itself.
    const response = (subset) => subset.map((row) => (market ? row.homeMargin - row.spread : row.homeMargin));
    const trainY = response(train);
    const yCentre = mean(trainY);
    const centred = trainY.map((value) => value - yCentre);
    const Xtrain = design(train);
    const trainSeasons = [...new Set(train.map((row) => row.season))].sort();
    let lambda = LAMBDA_GRID[LAMBDA_GRID.length - 1];
    if (trainSeasons.length >= 2) {
      let best = null;
      for (const candidate of LAMBDA_GRID) {
        const inner = [];
        for (let index = 1; index < trainSeasons.length; index += 1) {
          const innerTrain = train.filter((row) => row.season < trainSeasons[index]);
          const innerTest = train.filter((row) => row.season === trainSeasons[index]);
          if (innerTrain.length === 0) continue;
          const innerY = response(innerTrain);
          const innerCentre = mean(innerY);
          const beta = ridgeFit(design(innerTrain), innerY.map((value) => value - innerCentre), candidate);
          const innerTestY = response(innerTest);
          design(innerTest).forEach((features, i) => inner.push([
            innerCentre + features.reduce((total, value, j) => total + value * beta[j], 0), innerTestY[i]]));
        }
        if (inner.length === 0) continue;
        const rmse = score(inner).rmse;
        if (best === null || rmse < best.rmse) best = { rmse, lambda: candidate };
      }
      if (best) lambda = best.lambda;
    }
    const beta = ridgeFit(Xtrain, centred, lambda);
    coefficients.set(testSeason, { lambda, beta: Object.fromEntries(names.map((name, i) => [name, beta[i]])) });
    design(test).forEach((features, index) => {
      const fitted = yCentre + features.reduce((total, value, j) => total + value * beta[j], 0);
      const row = test[index];
      predictions.push({ row, predicted: market ? row.spread + fitted : fitted, edge: market ? fitted : fitted - row.spread });
    });
  }
  return { predictions, coefficients };
}

/**
 * Offseason continuity, reused verbatim from the roster study as home-minus-away
 * differentials. Diagnostic only: these are correlated against market error and
 * discarded if nothing survives. Snap counts and Week 1 rosters cover the
 * 2022-2025 transitions, which spans every test season.
 */
function rosterDiagnosticFeatures(sources, games, external) {
  const players = pick(sources, "players (gsis -> pfr id map)", join(NFLVERSE, "players", "players.csv"), null);
  const gsisToPfr = new Map(players.filter((row) => row.gsis_id && row.pfr_id && row.pfr_id !== "NA")
    .map((row) => [row.gsis_id, row.pfr_id]));
  const coachQb = coachAndQb(games);
  const shares = {};
  for (const season of [2022, 2023, 2024, 2025]) {
    const priorSnaps = pick(sources, `snaps ${season - 1}`,
      join(NFLVERSE, "snap-counts", `snap_counts_${season - 1}.csv`),
      external && join(external, `snap_counts_${season - 1}.csv`));
    const roster = pick(sources, `roster ${season}`,
      join(NFLVERSE, "weekly-rosters", `roster_weekly_${season}.csv`),
      external && join(external, `roster_weekly_${season}.csv`));
    const week1 = roster.filter((row) => Number(row.week) === 1 && (row.game_type ?? "REG") === "REG");
    shares[season] = returningSnapShares(priorSnaps, week1.length > 0 ? week1 : roster, gsisToPfr);
  }
  const change = (row, side, kind) => {
    const prior = coachQb.get(`${row.season - 1}|${row[side]}`);
    const target = coachQb.get(`${row.season}|${row[side]}`);
    const before = kind === "qb" ? prior?.modalQb : prior?.modalCoach;
    const after = kind === "qb" ? target?.week1Qb : target?.week1Coach;
    return before && after && before === after ? 0 : 1;
  };
  // NaN outside the covered transitions, so those games drop out of the correlation.
  const share = (row, side, bucket) => (shares[row.season] ? shares[row.season].get(row[side])?.[bucket] ?? 0.72 : NaN);
  return {
    qbChangeDiff: (row) => (shares[row.season] ? change(row, "home", "qb") - change(row, "away", "qb") : NaN),
    hcChangeDiff: (row) => (shares[row.season] ? change(row, "home", "hc") - change(row, "away", "hc") : NaN),
    offReturnDiff: (row) => share(row, "home", "offense") - share(row, "away", "offense"),
    olReturnDiff: (row) => share(row, "home", "ol") - share(row, "away", "ol"),
    defReturnDiff: (row) => share(row, "home", "defense") - share(row, "away", "defense"),
    dbReturnDiff: (row) => share(row, "home", "db") - share(row, "away", "db"),
  };
}

// -------------------------------------------------------------------- reporting

const HORIZONS = [["weeks1-2", 2], ["weeks1-4", 4], ["weeks1-6", 6], ["weeks1-8", 8], ["full-season", 99]];
const BUCKETS = [["<1", 0, 1], ["1-2", 1, 2], ["2-3", 2, 3], ["3-4", 3, 4], ["4+", 4, Infinity]];

/** Wilson interval, so a 12-game bucket is not read as if it were 500. */
function wilson(wins, total) {
  if (total === 0) return [0, 0];
  const p = wins / total;
  const z = 1.96;
  const denominator = 1 + (z * z) / total;
  const centre = (p + (z * z) / (2 * total)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return [centre - half, centre + half];
}

function main() {
  const args = parseArgs(process.argv);
  const sources = [];
  const rates = {};
  for (const season of RATE_SEASONS) {
    const rows = teamGameRows(sources, season, args.external);
    rates[season] = { rows, table: seasonRates(rows) };
  }
  const priors = {};
  for (const season of GAME_SEASONS) priors[season] = preseasonPrior(rates[season - 1].table, rates[season - 2].table);
  const games = pick(sources, "schedules with spread_line", null,
    args.external && join(args.external, "games_full.csv"), ["spread_line", "home_score", "gameday"]);
  const coverage = { games: 0, missingPrior: 0 };
  const rows = buildGames({ games, rates, priors, coverage });

  console.log("=== inputs ===");
  for (const source of sources) console.log(`  ${source}`);
  console.log(`\n=== dataset ===`);
  console.log(`  eligible regular-season games ${coverage.games}, modelled ${rows.length}, dropped for missing prior ${coverage.missingPrior}`);
  for (const season of GAME_SEASONS) {
    const group = rows.filter((row) => row.season === season);
    console.log(`  ${season}: ${group.length} games, mean market error ${mean(group.map((row) => row.homeMargin - row.spread)).toFixed(3)}`
      + `, market RMSE ${Math.sqrt(mean(group.map((row) => (row.homeMargin - row.spread) ** 2))).toFixed(3)}`);
  }
  console.log(`  test seasons ${TEST_SEASONS.join(", ")} (${rows.filter((row) => TEST_SEASONS.includes(row.season)).length} games), earlier seasons train`);

  const evaluations = new Map(Object.keys(MODELS).map((id) => [id, evaluate(rows, id)]));
  const report = { sources, coverage, horizons: {}, buckets: {}, coefficients: {}, seasons: {} };

  for (const [label, maxWeek] of HORIZONS) {
    console.log(`\n\n######## ${label} ########`);
    report.horizons[label] = {};
    const marketPairs = evaluations.get("MARKET").predictions
      .filter((entry) => entry.row.week <= maxWeek).map((entry) => [entry.predicted, entry.row.homeMargin]);
    const marketScore = score(marketPairs);
    for (const id of Object.keys(MODELS)) {
      const entries = evaluations.get(id).predictions.filter((entry) => entry.row.week <= maxWeek);
      const value = score(entries.map((entry) => [entry.predicted, entry.row.homeMargin]));
      const errorPairs = entries.map((entry) => [entry.edge, entry.row.homeMargin - entry.row.spread]);
      const errorCorr = id === "MARKET" ? 0 : score(errorPairs).corr;
      report.horizons[label][id] = { ...value, errorCorr };
      console.log(`  ${id.padEnd(20)} n=${String(value.n).padStart(4)} MAE=${value.mae.toFixed(3)} RMSE=${value.rmse.toFixed(3)}`
        + ` r(margin)=${value.corr.toFixed(3)}`
        + `  vs market ${(100 * (1 - value.rmse / marketScore.rmse) >= 0 ? "+" : "")}${(100 * (1 - value.rmse / marketScore.rmse)).toFixed(2)}%`
        + `  r(edge, market error)=${errorCorr.toFixed(3)}`);
    }
  }

  console.log(`\n\n######## ATS by pre-specified edge bucket (full season, test seasons only) ########`);
  for (const id of ["MARKET+JKB", "MARKET+JKB+DEFREC"]) {
    console.log(`\n-- ${id} --`);
    console.log(`  bucket   games   W-L-P        cover%   [95% CI]          mean predicted edge   mean realised error in model direction`);
    report.buckets[id] = {};
    for (const [label, low, high] of BUCKETS) {
      const entries = evaluations.get(id).predictions
        .filter((entry) => Math.abs(entry.edge) >= low && Math.abs(entry.edge) < high);
      let wins = 0;
      let losses = 0;
      let pushes = 0;
      for (const entry of entries) {
        const error = entry.row.homeMargin - entry.row.spread;
        if (error === 0) pushes += 1;
        else if (Math.sign(error) === Math.sign(entry.edge)) wins += 1;
        else losses += 1;
      }
      const decided = wins + losses;
      const [low95, high95] = wilson(wins, decided);
      const realised = entries.length
        ? mean(entries.map((entry) => Math.sign(entry.edge) * (entry.row.homeMargin - entry.row.spread))) : 0;
      report.buckets[id][label] = { games: entries.length, wins, losses, pushes, cover: decided ? wins / decided : 0, realised };
      console.log(`  ${label.padEnd(9)}${String(entries.length).padStart(5)}   ${`${wins}-${losses}-${pushes}`.padEnd(12)}`
        + ` ${decided ? (100 * wins / decided).toFixed(1) : "n/a"}%    `
        + `[${(100 * low95).toFixed(1)}%, ${(100 * high95).toFixed(1)}%]`.padEnd(18)
        + `  ${entries.length ? mean(entries.map((entry) => Math.abs(entry.edge))).toFixed(2) : "n/a"}`.padEnd(22)
        + `  ${realised.toFixed(2)}`);
    }
  }

  runMarketDiagnostics(rows, evaluations, {
    mean, sd, score, ridgeFit, ALL_FEATURES, JKB_FEATURES, DEF_RECENCY, TEST_SEASONS, HORIZONS, BUCKETS, report,
    rosterFeatures: rosterDiagnosticFeatures(sources, games, args.external),
  });

  for (const id of Object.keys(MODELS)) {
    if (id === "MARKET") continue;
    report.coefficients[id] = Object.fromEntries(evaluations.get(id).coefficients);
  }
  if (args.json) {
    writeFileSync(args.json, `${JSON.stringify(report, null, 1)}\n`, "utf-8");
    console.log(`\nwrote ${args.json}`);
  }
}

main();
