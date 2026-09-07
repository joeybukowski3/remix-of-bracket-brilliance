/**
 * Research: does JKB team strength predict LINE MOVEMENT and closing-line value?
 *
 * SIMULATION ONLY. Writes no production artifact, changes no production logic,
 * and is wired into no generator.
 *
 * The previous study found JKB adds nothing against the settled market line.
 * Its stated limitation was market data: one line per game, no opener, no
 * timestamps. This study asks the follow-up - whether JKB disagreement with an
 * EARLY line predicts where the line closes - using the only two early/late
 * line pairs that exist in a reproducible public source.
 *
 * DATASET A (primary) - SuperContest, 2013-2018, ~1,500 games
 *   early  nfldata sc_lines.csv, the Westgate SuperContest board, posted
 *          Wednesday of game week (a documented, uniform ~3-4 days to kickoff)
 *   close  nfldata closing_lines.csv
 *   Both are Westgate. This is a contest board, not a bettable market line, and
 *   it is 7-12 years before the seasons we actually care about.
 *
 * DATASET B (secondary) - lookahead, 2021, 272 games
 *   early  nfldata initial_lines.csv (Westgate, type SPREAD)
 *   close  nfldata games.csv spread_line, the settled line
 *   These are NOT weekly openers. Absolute movement grows monotonically with
 *   week (2.0 points in Week 1 to 4.7 in Week 18), which is the signature of
 *   season-long lookahead lines posted once before the season. Time to kickoff
 *   therefore varies from days to months and is unknown per game.
 *
 * NEITHER dataset covers 2022-2025, and neither carries a per-row timestamp, so
 * the requested checkpoint ladder (7d / 72h / 48h / 24h / 12h / 6h / 3h / 1h)
 * cannot be built. Nothing is interpolated to fake one.
 *
 * Orientation is home-margin throughout. nfldata line columns are conventional
 * (home line negative when the home team is favoured), so a home-margin value
 * is the negated home-side line, matching games.csv spread_line.
 *
 *   CLV            = closeHomeMargin - earlyHomeMargin
 *   JKB_EDGE_EARLY = jkbFairHomeMargin - earlyHomeMargin
 *
 * JKB pregame state is the shipped 0.6/0.4 prior with family shrinkage, faded
 * into season-to-date observed form on the shipped curve, using only games that
 * kicked off before this game. The EPA-to-points mapping is never assumed; it
 * is fitted by ridge on earlier seasons only, inside a rolling origin.
 *
 * Usage:
 *   node scripts/research/nfl-clv-line-movement-study.mjs --external=<dir>
 *   node scripts/research/nfl-clv-line-movement-study.mjs --external=<dir> --json=<file>
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reportClvDiagnostics } from "./nfl-clv-study-diagnostics.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NFLVERSE = join(ROOT, "data", "nfl", "nflverse");

/** Shipped projection constants, restated so this study scores the live formula. */
const RECENCY_WEIGHT = 0.6;
const SHIPPED_K = { "offense-passing": 0.55, "offense-rushing": 0.45, "defense-passing": 0.30, "defense-rushing": 0.20 };
const FADE_CURVE = [1, 0.8, 0.6, 0.4, 0.2, 0];

const DATASETS = {
  supercontest: { early: "sc_lines (Westgate SuperContest board, Wednesday of game week)", close: "closing_lines",
    rateSeasons: [2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018],
    gameSeasons: [2013, 2014, 2015, 2016, 2017, 2018], testSeasons: [2015, 2016, 2017, 2018] },
  // 2019-2020 carry no lookahead line; they exist only to fit the JKB-to-margin
  // mapping, which uses features and actual margins, never a line.
  lookahead: { early: "initial_lines (Westgate season-long lookahead, timing unknown)", close: "games.csv spread_line",
    rateSeasons: [2017, 2018, 2019, 2020, 2021], gameSeasons: [2019, 2020, 2021], testSeasons: [2021] },
};

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

const TEAM_ALIASES = { OAK: "lv", SD: "lac", STL: "lar", LA: "lar", WAS: "wsh", JAC: "jax" };
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
  if (!args.external) throw new Error("--external=<dir> is required: no line-history file is committed to this repo");
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

function pick(sources, label, committed, external) {
  if (committed && existsSync(committed)) {
    sources.push(`${label}: committed ${committed.slice(ROOT.length + 1).replace(/\\/g, "/")}`);
    return readCsv(committed);
  }
  if (external && existsSync(external)) {
    sources.push(`${label}: external ${external.split(/[\\/]/).at(-1)}`);
    return readCsv(external);
  }
  throw new Error(`Missing input for ${label}: neither ${committed} nor ${external}`);
}

// ------------------------------------------------------- team-game rate plumbing

function teamGameRows(sources, season, external) {
  const epa = pick(sources, `epa ${season}`,
    join(NFLVERSE, "epa-team-game", `epa_team_game_${season}.csv`),
    join(external, `epa_team_game_${season}.csv`));
  const success = pick(sources, `success ${season}`,
    join(NFLVERSE, "success-team-game", `success_team_game_${season}.csv`),
    join(external, `success_team_game_${season}.csv`));
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
  const teams = new Set(joined.map((row) => row.team));
  if (teams.size !== 32) throw new Error(`${season}: joined team-game table has ${teams.size} teams, expected 32`);
  return joined;
}

const denominatorField = (key) => (METRICS[key].cache === "epa" ? `${METRICS[key].den}_epa` : METRICS[key].den);

function rateOver(rows, key) {
  const spec = METRICS[key];
  const numerator = rows.reduce((total, row) => total + row[spec.num], 0);
  const denominator = rows.reduce((total, row) => total + row[denominatorField(key)], 0);
  return denominator > 0 ? (spec.scale * numerator) / denominator : null;
}

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

function pregameStrength(prior, playedRows) {
  const completed = new Set(playedRows.map((row) => row.game)).size;
  const weight = FADE_CURVE[Math.min(completed, FADE_CURVE.length - 1)];
  const out = { completed, projectionWeight: weight };
  for (const key of Object.keys(METRICS)) {
    const side = (row) => (isDefense(key) ? row.opponentSide : row.ownSide);
    const observed = weight < 1 ? rateOver(playedRows.filter(side), key) : null;
    out[key] = weight >= 1 || observed === null ? prior[key] : weight * prior[key] + (1 - weight) * observed;
  }
  return out;
}

/**
 * One row per game with an early line, a closing line and an actual margin.
 *
 * The observed side of JKB strength is limited to games that kicked off before
 * this game. For the SuperContest board that is slightly generous - the board
 * is posted Wednesday, so a Monday game from the same week is already counted
 * and a Thursday game is not - which biases in favour of finding signal, not
 * against, and is recorded as a limitation rather than silently ignored.
 */
function buildGames({ config, games, rates, priors, early, close, coverage }) {
  const rows = [];
  for (const season of config.gameSeasons) {
    const list = games.filter((game) => game.game_type === "REG" && Number(game.season) === season
      && game.home_score !== "" && game.away_score !== "");
    list.sort((a, b) => kickoff(a) - kickoff(b) || a.game_id.localeCompare(b.game_id));
    const kickoffByGame = new Map(list.map((game) => [game.game_id, kickoff(game)]));
    const played = rates[season].rows;
    const prior = priors[season];
    for (const game of list) {
      coverage.games += 1;
      const earlyHomeMargin = early.get(game.game_id);
      const closeHomeMargin = close.get(game.game_id);
      if (earlyHomeMargin === undefined) { coverage.missingEarly += 1; continue; }
      if (closeHomeMargin === undefined) { coverage.missingClose += 1; continue; }
      const home = canon(game.home_team);
      const away = canon(game.away_team);
      if (!prior.has(home) || !prior.has(away)) { coverage.missingPrior += 1; continue; }
      const before = (team) => played
        .filter((row) => (row.team === team || row.opponent === team)
          && (kickoffByGame.get(row.game) ?? Infinity) < kickoffByGame.get(game.game_id))
        .map((row) => ({ ...row, ownSide: row.team === team, opponentSide: row.opponent === team }));
      rows.push({
        season, week: Number(game.week), gameId: game.game_id, kickoff: kickoffByGame.get(game.game_id),
        home, away, earlyHomeMargin, closeHomeMargin,
        homeMargin: Number(game.home_score) - Number(game.away_score),
        clv: closeHomeMargin - earlyHomeMargin,
        strength: { home: pregameStrength(prior.get(home), before(home)), away: pregameStrength(prior.get(away), before(away)) },
        preseason: { home: prior.get(home), away: prior.get(away) },
        lastEight: { home: rates[season - 1].table.get(home)?.last8, away: rates[season - 1].table.get(away)?.last8 },
      });
    }
  }
  return rows.sort((a, b) => a.kickoff - b.kickoff);
}

// --------------------------------------------------------------------- features

/** Home-minus-away differentials in each metric's own units. Nothing is asserted to equal points. */
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
  priorNetEpa: (row) => (row.preseason.home["off.epaPerPlay"] - row.preseason.home["def.epaPerPlayAllowed"])
    - (row.preseason.away["off.epaPerPlay"] - row.preseason.away["def.epaPerPlayAllowed"]),
  priorNetSuccess: (row) => (row.preseason.home["off.successRate"] - row.preseason.home["def.successRateAllowed"])
    - (row.preseason.away["off.successRate"] - row.preseason.away["def.successRateAllowed"]),
  lastEightDefEpaDiff: (row) => (row.lastEight.away?.["def.epaPerPlayAllowed"] ?? 0) - (row.lastEight.home?.["def.epaPerPlayAllowed"] ?? 0),
  lastEightDefPassEpaDiff: (row) => (row.lastEight.away?.["def.epaPerPassAllowed"] ?? 0) - (row.lastEight.home?.["def.epaPerPassAllowed"] ?? 0),
};
const FEATURE_NAMES = Object.keys(FEATURES);
/**
 * Requested family split, plus a preseason-only set.
 *
 * preseasonOnly exists for the lookahead dataset: a season-long line posted
 * before the season could only ever have been bet on preseason information, so
 * scoring it against JKB's blended kickoff-time strength would credit the model
 * with in-season knowledge it did not have when the line was available.
 */
const FEATURE_SETS = {
  epaOnly: FEATURE_NAMES.filter((name) => /Epa/.test(name)),
  successOnly: FEATURE_NAMES.filter((name) => /[Ss]uccess/.test(name)),
  combined: FEATURE_NAMES,
  preseasonOnly: ["priorNetEpa", "priorNetSuccess"],
};

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

const LAMBDA_GRID = [3, 10, 30, 100, 300, 1000, 3000];

/**
 * JKB fair spread by rolling origin.
 *
 * The margin mapping is learned, never assumed: ridge on standardised feature
 * differentials against the actual home margin, fitted on earlier seasons only.
 * The intercept absorbs home-field advantage, since every feature is a
 * home-minus-away differential and the response is the home margin.
 */
function fairSpreads(rows, config, featureNames) {
  const out = new Map();
  const coefficients = new Map();
  for (const testSeason of config.testSeasons) {
    const train = rows.filter((row) => row.season < testSeason);
    const test = rows.filter((row) => row.season === testSeason);
    if (train.length === 0) continue;
    const columns = featureNames.map((name) => train.map((row) => FEATURES[name](row)));
    const centres = columns.map(mean);
    const spreads = columns.map((column) => sd(column) || 1);
    const design = (subset) => subset.map((row) =>
      featureNames.map((name, i) => (FEATURES[name](row) - centres[i]) / spreads[i]));
    const trainY = train.map((row) => row.homeMargin);
    const yCentre = mean(trainY);
    const centred = trainY.map((value) => value - yCentre);
    const trainSeasons = [...new Set(train.map((row) => row.season))].sort();
    let lambda = LAMBDA_GRID.at(-1);
    if (trainSeasons.length >= 2) {
      let best = null;
      for (const candidate of LAMBDA_GRID) {
        const inner = [];
        for (let index = 1; index < trainSeasons.length; index += 1) {
          const innerTrain = train.filter((row) => row.season < trainSeasons[index]);
          const innerTest = train.filter((row) => row.season === trainSeasons[index]);
          if (innerTrain.length === 0) continue;
          const innerY = innerTrain.map((row) => row.homeMargin);
          const innerCentre = mean(innerY);
          const beta = ridgeFit(design(innerTrain), innerY.map((value) => value - innerCentre), candidate);
          design(innerTest).forEach((features, i) => inner.push([
            innerCentre + features.reduce((total, value, j) => total + value * beta[j], 0), innerTest[i].homeMargin]));
        }
        if (inner.length === 0) continue;
        const rmse = score(inner).rmse;
        if (best === null || rmse < best.rmse) best = { rmse, lambda: candidate };
      }
      if (best) lambda = best.lambda;
    }
    const beta = ridgeFit(design(train), centred, lambda);
    coefficients.set(testSeason, { lambda, beta: Object.fromEntries(featureNames.map((name, i) => [name, beta[i]])) });
    design(test).forEach((features, index) => {
      out.set(test[index].gameId, yCentre + features.reduce((total, value, j) => total + value * beta[j], 0));
    });
  }
  return { fair: out, coefficients };
}

// --------------------------------------------------------------------- datasets

/** sc_lines: Wednesday SuperContest board. Home-margin = negated home-side line. */
function supercontestEarly(rows, homeByGame) {
  const out = new Map();
  const byGame = new Map();
  for (const row of rows) {
    if (!byGame.has(row.game_id)) byGame.set(row.game_id, []);
    byGame.get(row.game_id).push(row);
  }
  for (const [numericId, sides] of byGame) {
    const altId = homeByGame.numericToAlt.get(numericId);
    if (!altId) continue;
    const home = homeByGame.homeAbbr.get(altId);
    const homeSide = sides.find((row) => canon(row.side) === home);
    if (!homeSide || homeSide.line === "") continue;
    out.set(altId, -Number(homeSide.line));
  }
  return out;
}

function closingLines(rows, homeByGame) {
  const out = new Map();
  const byGame = new Map();
  for (const row of rows) {
    if (row.type !== "SPREAD" || !row.alt_game_id) continue;
    if (!byGame.has(row.alt_game_id)) byGame.set(row.alt_game_id, []);
    byGame.get(row.alt_game_id).push(row);
  }
  for (const [altId, sides] of byGame) {
    const home = homeByGame.homeAbbr.get(altId);
    const homeSide = sides.find((row) => canon(row.side) === home);
    if (!homeSide || homeSide.line === "") continue;
    out.set(altId, -Number(homeSide.line));
  }
  return out;
}

function lookaheadEarly(rows, homeByGame) {
  const out = new Map();
  for (const row of rows) {
    if (row.type !== "SPREAD") continue;
    const home = homeByGame.homeAbbr.get(row.about);
    if (canon(row.side) !== home || row.line === "") continue;
    out.set(row.about, -Number(row.line));
  }
  return out;
}

// -------------------------------------------------------------------- reporting

function runDataset(name, config, sources, args, games, homeByGame) {
  const rates = {};
  for (const season of config.rateSeasons) {
    const rows = teamGameRows(sources, season, args.external);
    rates[season] = { rows, table: seasonRates(rows) };
  }
  const priors = {};
  for (const season of config.gameSeasons) priors[season] = preseasonPrior(rates[season - 1].table, rates[season - 2].table);

  let early;
  let close;
  if (name === "supercontest") {
    early = supercontestEarly(pick(sources, "sc_lines (early)", null, join(args.external, "sc_lines.csv")), homeByGame);
    close = closingLines(pick(sources, "closing_lines (close)", null, join(args.external, "closing_lines.csv")), homeByGame);
  } else {
    early = lookaheadEarly(pick(sources, "initial_lines (early)", null, join(args.external, "initial_lines.csv")), homeByGame);
    close = new Map(games.filter((game) => game.spread_line !== "" && config.gameSeasons.includes(Number(game.season)))
      .map((game) => [game.game_id, Number(game.spread_line)]));
    // Mapping-only seasons have no lookahead line; give them the settled line so
    // they survive the join. Their CLV is zero by construction and they are
    // never in a test season, so they contribute to the fit and nothing else.
    for (const [gameId, line] of close) if (!early.has(gameId)) early.set(gameId, line);
  }
  const coverage = { games: 0, missingEarly: 0, missingClose: 0, missingPrior: 0 };
  const rows = buildGames({ config, games, rates, priors, early, close, coverage });
  const models = new Map(Object.entries(FEATURE_SETS).map(([id, names]) => [id, fairSpreads(rows, config, names)]));
  return { rows, coverage, models, config };
}

function main() {
  const args = parseArgs(process.argv);
  const sources = [];
  const games = pick(sources, "schedules (kickoff, scores, settled line)", null, join(args.external, "games_full.csv"));
  const homeByGame = {
    homeAbbr: new Map(games.map((game) => [game.game_id, canon(game.home_team)])),
    numericToAlt: new Map(games.filter((game) => game.old_game_id).map((game) => [game.old_game_id, game.game_id])),
  };
  const report = { sources, datasets: {} };
  const results = {};
  for (const [name, config] of Object.entries(DATASETS)) {
    results[name] = runDataset(name, config, sources, args, games, homeByGame);
  }

  console.log("=== inputs ===");
  for (const source of sources) console.log(`  ${source}`);

  reportClvDiagnostics(results, DATASETS, {
    mean, sd, score, FEATURES, FEATURE_NAMES, FEATURE_SETS, report,
  });

  if (args.json) {
    writeFileSync(args.json, `${JSON.stringify(report, null, 1)}\n`, "utf-8");
    console.log(`\nwrote ${args.json}`);
  }
}

main();
