/**
 * Systematic search for narrow, football-motivated conditions under which the
 * NFL spread may be mispriced.
 *
 * RESEARCH ONLY. Writes no production artifact, changes no production logic,
 * and is wired into no generator.
 *
 * Prior work established that no universal "JKB beats Vegas" formula exists, so
 * this stops looking for one and instead tests roughly fifty specific football
 * hypotheses, each of which has to predict MARKET ERROR after the spread has
 * been projected out. Predicting the game is not enough - the spread already
 * does that.
 *
 * Method:
 *   DISCOVERY     2013-2021. Every hypothesis is scored here; p-values go
 *                 through Benjamini-Hochberg at q = 0.10.
 *   CONFIRMATION  2022-2025, never touched during discovery, and the era we
 *                 actually care about. Survivors are re-tested here with no
 *                 threshold re-tuning of any kind.
 *
 * A hypothesis that only reaches significance on the discovery half is reported
 * as unconfirmed, not as an edge. Placebo permutation tests (market error
 * shuffled within season) bound how much of the discovery signal is search
 * artefact.
 *
 * Market benchmark is nfldata `spread_line`, the settled home-margin line, with
 * the timestamp limitation documented in earlier phases: one line per game, no
 * opener, no movement history, not a verified closing consensus.
 *
 * Usage:
 *   node scripts/research/nfl-market-mispricing-search.mjs --external=<dir>
 *   node scripts/research/nfl-market-mispricing-search.mjs --external=<dir> --json=<file>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canon, kickoff, pick, preseasonPrior, pregameState, seasonRates, teamGameRows } from "./nfl-mispricing-state.mjs";
import { buildConditions, buildDifferentials, consensusSignals, haversineKm } from "./nfl-mispricing-hypotheses.mjs";
import { benjaminiHochberg, bootstrapMeanCi, correlation, mean, median, partialCorrelation, permutationP,
  sd, segmentStats, wilson } from "./nfl-mispricing-stats.mjs";
import { reportMispricing } from "./nfl-mispricing-report.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NFLVERSE = join(ROOT, "data", "nfl", "nflverse");

const RATE_SEASONS = Array.from({ length: 15 }, (_, index) => 2011 + index);
const GAME_SEASONS = Array.from({ length: 13 }, (_, index) => 2013 + index);
const DISCOVERY = GAME_SEASONS.filter((season) => season <= 2021);
const HOLDOUT = GAME_SEASONS.filter((season) => season >= 2022);
const FDR_Q = 0.10;

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

/** Ridge, used only to fit the JKB fair spread on discovery seasons. */
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

function main() {
  const args = parseArgs(process.argv);
  const sources = [];
  const rates = {};
  for (const season of RATE_SEASONS) {
    const rows = teamGameRows(sources, ROOT, NFLVERSE, season, args.external);
    rates[season] = { rows, table: seasonRates(rows) };
  }
  const priors = {};
  for (const season of GAME_SEASONS) priors[season] = preseasonPrior(rates[season - 1].table, rates[season - 2].table);
  const allGames = pick(sources, ROOT, "schedules (kickoff, scores, settled line, rest, venue)",
    null, join(args.external, "games_full.csv"));
  // teams.json carries stadium coordinates, which the travel hypotheses need.
  const teams = JSON.parse(readFileSync(join(ROOT, "public", "data", "nfl", "teams.json"), "utf-8")).teams;
  const venue = new Map(teams.map((team) => [team.abbr, { lat: team.latitude, lon: team.longitude }]));

  // ---------------------------------------------------------------- game table
  const coverage = { eligible: 0, noSpread: 0, noPrior: 0, built: 0 };
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
    // Road-trip and rematch context, both strictly backward-looking.
    const roadStreak = new Map();
    const meetings = new Map();
    for (const game of list) {
      coverage.eligible += 1;
      const home = canon(game.home_team);
      const away = canon(game.away_team);
      const cutoff = kickoffByGame.get(game.game_id);
      const awayConsecutiveRoad = (roadStreak.get(away) ?? 0) + 1;
      roadStreak.set(away, awayConsecutiveRoad);
      roadStreak.set(home, 0);
      const pairKey = [home, away].sort().join("|");
      const firstMeeting = meetings.get(pairKey) ?? null;
      meetings.set(pairKey, firstMeeting ?? { home, away, margin: Number(game.home_score) - Number(game.away_score) });
      if (game.spread_line === "" || !Number.isFinite(Number(game.spread_line))) { coverage.noSpread += 1; continue; }
      if (!prior.has(home) || !prior.has(away)) { coverage.noPrior += 1; continue; }
      const before = (team) => played
        .filter((row) => (row.team === team || row.opponent === team) && (kickoffByGame.get(row.game) ?? Infinity) < cutoff);
      const stateFor = (team) => pregameState({
        team, prior: prior.get(team), priorTable: rates[season - 1].table, twoBackTable: rates[season - 2].table,
        playedRows: before(team), results, cutoff,
      });
      const homeVenue = venue.get(home);
      const awayVenue = venue.get(away);
      const spread = Number(game.spread_line);
      const homeMargin = Number(game.home_score) - Number(game.away_score);
      // A rematch backs whoever lost the first meeting, oriented to this game.
      let rematchLoser = null;
      if (firstMeeting) {
        const loser = firstMeeting.margin > 0 ? firstMeeting.away : (firstMeeting.margin < 0 ? firstMeeting.home : null);
        if (loser) rematchLoser = loser === home ? 1 : -1;
      }
      games.push({
        season, week: Number(game.week), gameId: game.game_id, kick: cutoff, home, away,
        spread, homeMargin, marketError: homeMargin - spread,
        homeRest: Number(game.home_rest), awayRest: Number(game.away_rest),
        restDiff: Number(game.home_rest) - Number(game.away_rest),
        divGame: game.div_game === "1",
        travelKmAway: homeVenue && awayVenue ? haversineKm(awayVenue, homeVenue) : 0,
        longitudeSwingAway: homeVenue && awayVenue ? Math.abs(homeVenue.lon - awayVenue.lon) : 0,
        awayConsecutiveRoad, rematchLoser,
        state: { home: stateFor(home), away: stateFor(away) },
        jkbFair: null,
      });
      coverage.built += 1;
    }
  }

  // ------------------------------------- standardisation from discovery only
  const discoveryGames = games.filter((game) => DISCOVERY.includes(game.season));
  const holdoutGames = games.filter((game) => HOLDOUT.includes(game.season));
  const statFields = Object.keys(discoveryGames[0].state.home);
  const zStats = new Map();
  for (const field of statFields) {
    const values = discoveryGames.flatMap((game) => [game.state.home[field], game.state.away[field]])
      .filter((value) => typeof value === "number" && Number.isFinite(value));
    zStats.set(field, { mean: mean(values), sd: sd(values) });
  }
  const z = { mean: (field) => zStats.get(field)?.mean ?? 0, sd: (field) => zStats.get(field)?.sd ?? 1 };

  // ------------------------------------ JKB fair spread, fitted on discovery
  const fairFeatures = ["netEpa", "offEpa", "defEpa", "offPassEpa", "defPassEpa", "offRushEpa", "defRushEpa",
    "offSucc", "defSucc", "priorNetEpa"];
  const fairRow = (game) => fairFeatures.map((field) => {
    const home = game.state.home[field];
    const away = game.state.away[field];
    if (home === null || away === null) return 0;
    return (home - away) / (z.sd(field) || 1);
  });
  const trainY = discoveryGames.map((game) => game.homeMargin);
  const yCentre = mean(trainY);
  const beta = ridgeFit(discoveryGames.map(fairRow), trainY.map((value) => value - yCentre), 300);
  for (const game of games) {
    game.jkbFair = yCentre + fairRow(game).reduce((total, value, index) => total + value * beta[index], 0);
  }

  // ------------------------------------------------- evaluate all hypotheses
  const evaluateSet = (subset) => {
    const rows = subset.map((game) => ({
      game,
      differentials: buildDifferentials(game, z),
      conditions: buildConditions(game, z),
      consensus: consensusSignals(game),
    }));
    return rows;
  };
  const discovery = evaluateSet(discoveryGames);
  const holdout = evaluateSet(holdoutGames);

  const differentialNames = Object.keys(discovery[0].differentials);
  const conditionNames = Object.keys(discovery[0].conditions);

  const scoreDifferential = (rows, name) => {
    const usable = rows.filter((row) => Number.isFinite(row.differentials[name]));
    if (usable.length < 50) return { kind: "differential", name, n: usable.length, r: 0, p: 1, insufficient: true };
    const values = usable.map((row) => row.differentials[name]);
    const target = usable.map((row) => row.game.marketError);
    const control = usable.map((row) => row.game.spread);
    const partial = partialCorrelation(values, target, control);
    return {
      kind: "differential", name, n: partial.n, r: partial.r, p: partial.p,
      rMargin: correlation(values, usable.map((row) => row.game.homeMargin)),
      rSpread: correlation(values, control),
      seasons: [...new Set(usable.map((row) => row.game.season))].length,
    };
  };
  const scoreCondition = (rows, name) => {
    const signs = rows.map((row) => row.conditions[name]);
    const errors = rows.map((row) => row.game.marketError);
    const stats = segmentStats(signs, errors);
    return { kind: "condition", name, ...stats,
      seasons: [...new Set(rows.filter((row, i) => signs[i] !== 0).map((row) => row.game.season))].length };
  };

  const discoveryResults = [
    ...differentialNames.map((name) => scoreDifferential(discovery, name)),
    ...conditionNames.map((name) => scoreCondition(discovery, name)),
  ].filter((entry) => !entry.insufficient);
  const ranked = benjaminiHochberg(discoveryResults, FDR_Q);

  const holdoutFor = (entry) => (entry.kind === "differential"
    ? scoreDifferential(holdout, entry.name) : scoreCondition(holdout, entry.name));

  // Placebo: how extreme is each surviving statistic against a within-season shuffle?
  for (const entry of ranked) {
    if (!entry.survivesFdr) continue;
    if (entry.kind === "differential") {
      const usable = discovery.filter((row) => Number.isFinite(row.differentials[entry.name]));
      entry.permutationP = permutationP(
        (values, target) => partialCorrelation(values, target, usable.map((row) => row.game.spread)).r,
        usable.map((row) => row.differentials[entry.name]),
        usable.map((row) => row.game.marketError),
        usable.map((row) => row.game.season), 1000,
      );
    } else {
      const usable = discovery.filter((row) => row.conditions[entry.name] !== 0);
      entry.permutationP = permutationP(
        (signs, target) => mean(signs.map((sign, i) => sign * target[i])),
        usable.map((row) => row.conditions[entry.name]),
        usable.map((row) => row.game.marketError),
        usable.map((row) => row.game.season), 1000,
      );
    }
  }

  const report = { sources, coverage, discoverySeasons: DISCOVERY, holdoutSeasons: HOLDOUT, fdrQ: FDR_Q };
  reportMispricing({ ranked, holdoutFor, discovery, holdout, games, discoveryGames, holdoutGames, report,
    helpers: { mean, sd, median, correlation, segmentStats, wilson, bootstrapMeanCi, partialCorrelation,
      DISCOVERY, HOLDOUT, differentialNames, conditionNames } });

  if (args.json) {
    writeFileSync(args.json, `${JSON.stringify(report, null, 1)}\n`, "utf-8");
    console.log(`\nwrote ${args.json}`);
  }
}

main();
