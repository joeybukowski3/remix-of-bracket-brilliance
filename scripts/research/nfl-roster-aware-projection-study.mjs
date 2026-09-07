/**
 * Research: would a roster/coaching-aware preseason model beat the shipped
 * historical-only 2026 projection baseline?
 *
 * SIMULATION ONLY. Writes no production artifact, changes no production logic,
 * and is wired into no generator. It answers one question: across the
 * 2021->2022, 2022->2023, 2023->2024 and 2024->2025 transitions, does adding
 * offseason continuity information to the shipped
 *
 *     x = 0.6 * (Y-1) + 0.4 * (Y-2), then shrink toward the (Y-1) league mean
 *
 * baseline improve out-of-sample prediction of the next season's EPA and
 * success-rate metrics, especially over Weeks 1-4 and Weeks 1-6?
 *
 * Temporal integrity: every predictor for target season Y comes from seasons
 * that finished before Y, plus offseason facts known before Y's first kickoff
 * (Week 1 roster, Week 1 starting quarterback, Week 1 head coach). Coefficients
 * are fitted by rolling origin - a fold testing Y trains only on transitions
 * whose target season precedes Y - so no fold ever sees its own future.
 *
 * Some inputs are not committed here (2020-2022 snap counts, 2021-2022 weekly
 * rosters, 2020-2021 player weeks, the untrimmed schedules file with coach and
 * quarterback columns). Point --external at a directory holding those nflverse
 * release files. A committed cache always wins over an external copy, and the
 * report states which source each input came from.
 *
 * Usage:
 *   node scripts/research/nfl-roster-aware-projection-study.mjs --external=<dir>
 *   node scripts/research/nfl-roster-aware-projection-study.mjs --external=<dir> --json=<file>
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runDiagnostics } from "./nfl-roster-study-diagnostics.mjs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NFLVERSE = join(ROOT, "data", "nfl", "nflverse");

const TARGET_SEASONS = [2022, 2023, 2024, 2025];
const RATE_SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];
const HORIZONS = ["weeks1-4", "weeks1-6", "full-season"];

/** Shipped family shrinkage and recency weight, restated so this study can score the live baseline. */
const SHIPPED_K = { "offense-passing": 0.55, "offense-rushing": 0.45, "defense-passing": 0.30, "defense-rushing": 0.20 };
const RECENCY_WEIGHT = 0.6;

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

const SNAP_GROUPS = {
  ol: ["T", "G", "C", "OL", "LT", "RT", "LG", "RG", "OT", "OG"],
  skill: ["WR", "TE", "RB", "FB", "HB"],
  dl: ["DE", "DT", "NT", "DL", "EDGE"],
  lb: ["LB", "ILB", "OLB", "MLB"],
  db: ["CB", "S", "FS", "SS", "DB"],
};

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

/** RFC-4180-ish reader: nflverse rosters and schedules do carry quoted fields. */
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

/** Committed cache first, external download second; records which was used. */
function pick(sources, label, committed, external, required = []) {
  if (committed && existsSync(committed)) {
    const rows = readCsv(committed);
    // Several committed caches are column subsets of their upstream release.
    // Skip one that lacks a column this study needs instead of silently
    // producing an empty feature.
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

// --------------------------------------------------------- historical team rates

/** Season rates from summed numerators and denominators, never averaged per game. */
function rateTable(rows, window) {
  const teams = [...new Set(rows.map((row) => row.team))].sort();
  const selection = new Map(teams.map((team) => {
    const own = rows.filter((row) => row.team === team || row.opponent === team)
      .sort((a, b) => Number(a.week) - Number(b.week));
    if (window?.throughWeek) {
      return [team, new Set(own.filter((row) => Number(row.week) <= window.throughWeek).map((row) => row.game_id))];
    }
    const games = [...new Set(own.map((row) => row.game_id))];
    return [team, new Set(window?.lastGames ? games.slice(-window.lastGames) : games)];
  }));
  const out = new Map(teams.map((team) => [team, {}]));
  for (const [key, spec] of Object.entries(METRICS)) {
    for (const team of teams) {
      const picked = rows.filter((row) =>
        (spec.defense ? row.opponent : row.team) === team && selection.get(team).has(row.game_id));
      const numerator = picked.reduce((total, row) => total + Number(row[spec.num]), 0);
      const denominator = picked.reduce((total, row) => total + Number(row[spec.den]), 0);
      out.get(team)[key] = denominator > 0 ? (spec.scale * numerator) / denominator : null;
    }
  }
  return out;
}

function loadRates(sources, external) {
  const tables = {};
  for (const season of RATE_SEASONS) {
    const epaRows = pick(sources, `epa ${season}`,
      join(NFLVERSE, "epa-team-game", `epa_team_game_${season}.csv`),
      external && join(external, `epa_team_game_${season}.csv`));
    const successRows = pick(sources, `success ${season}`,
      join(NFLVERSE, "success-team-game", `success_team_game_${season}.csv`),
      external && join(external, `success_team_game_${season}.csv`));
    const merge = (window) => {
      const epa = rateTable(epaRows, window);
      const success = rateTable(successRows, window);
      return new Map([...epa.keys()].map((team) => [team, Object.fromEntries(Object.keys(METRICS).map((key) =>
        [key, METRICS[key].cache === "epa" ? epa.get(team)[key] : success.get(team)[key]]))]));
    };
    tables[season] = {
      full: merge(null),
      last8: merge({ lastGames: 8 }),
      "weeks1-4": merge({ throughWeek: 4 }),
      "weeks1-6": merge({ throughWeek: 6 }),
    };
    tables[season]["full-season"] = tables[season].full;
  }
  return tables;
}

// ------------------------------------------------------------ offseason features

/** Modal and Week 1 head coach and starting quarterback per team-season. */
export function coachAndQb(games) {
  const seasons = new Map();
  for (const game of games) {
    if (game.game_type !== "REG") continue;
    for (const side of ["home", "away"]) {
      const key = `${Number(game.season)}|${canon(game[`${side}_team`])}`;
      if (!seasons.has(key)) seasons.set(key, { coach: new Map(), qb: new Map(), week1: null, games: 0 });
      const entry = seasons.get(key);
      const week = Number(game.week);
      const coach = game[`${side}_coach`] || null;
      const qb = game[`${side}_qb_id`] || null;
      if (coach) entry.coach.set(coach, (entry.coach.get(coach) ?? 0) + 1);
      if (qb) entry.qb.set(qb, (entry.qb.get(qb) ?? 0) + 1);
      entry.games += 1;
      if (entry.week1 === null || week < entry.week1.week) entry.week1 = { week, coach, qb };
    }
  }
  const modal = (counts) => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return new Map([...seasons].map(([key, entry]) => [key, {
    modalCoach: modal(entry.coach), modalQb: modal(entry.qb),
    week1Coach: entry.week1?.coach ?? null, week1Qb: entry.week1?.qb ?? null,
    qbStarts: entry.qb, games: entry.games,
  }]));
}

/** Points scored minus allowed per game. */
function pointDifferential(games, season) {
  const out = new Map();
  for (const game of games) {
    if (game.game_type !== "REG" || Number(game.season) !== season) continue;
    const homeScore = Number(game.home_score);
    const awayScore = Number(game.away_score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    for (const [team, diff] of [[canon(game.home_team), homeScore - awayScore], [canon(game.away_team), awayScore - homeScore]]) {
      if (!out.has(team)) out.set(team, { total: 0, games: 0 });
      out.get(team).total += diff;
      out.get(team).games += 1;
    }
  }
  return new Map([...out].map(([team, value]) => [team, value.total / value.games]));
}

/**
 * Share of a team's prior-season snaps, by unit, played by men on its Week 1
 * roster of the target season. Measured against the same team, so a player who
 * left counts as departed even though he is on someone else's roster.
 */
export function returningSnapShares(priorSnaps, week1Roster, gsisToPfr) {
  const rosterByTeam = new Map();
  for (const row of week1Roster) {
    const team = canon(row.team);
    if (!rosterByTeam.has(team)) rosterByTeam.set(team, new Set());
    // Weekly rosters leave pfr_id blank for a large share of players - every
    // offensive lineman, in some seasons - so gsis_id is mapped through the
    // players table rather than trusted as present.
    const pfr = row.pfr_id && row.pfr_id !== "NA" ? row.pfr_id : gsisToPfr.get(row.gsis_id);
    if (pfr) rosterByTeam.get(team).add(pfr);
  }
  const totals = new Map();
  const bump = (team, bucket, snaps, returning) => {
    if (!totals.has(team)) totals.set(team, {});
    const entry = (totals.get(team)[bucket] ??= { all: 0, back: 0 });
    entry.all += snaps;
    if (returning) entry.back += snaps;
  };
  for (const row of priorSnaps) {
    if (row.game_type !== "REG") continue;
    const team = canon(row.team);
    const returning = rosterByTeam.get(team)?.has(row.pfr_player_id) ?? false;
    const offense = Number(row.offense_snaps) || 0;
    const defense = Number(row.defense_snaps) || 0;
    const position = String(row.position ?? "").toUpperCase();
    if (offense > 0) {
      bump(team, "offense", offense, returning);
      if (SNAP_GROUPS.ol.includes(position)) bump(team, "ol", offense, returning);
      if (SNAP_GROUPS.skill.includes(position)) bump(team, "skill", offense, returning);
    }
    if (defense > 0) {
      bump(team, "defense", defense, returning);
      if (SNAP_GROUPS.dl.includes(position)) bump(team, "dl", defense, returning);
      if (SNAP_GROUPS.lb.includes(position)) bump(team, "lb", defense, returning);
      if (SNAP_GROUPS.db.includes(position)) bump(team, "db", defense, returning);
    }
  }
  return new Map([...totals].map(([team, buckets]) => [team, Object.fromEntries(
    Object.entries(buckets).map(([bucket, value]) => [bucket, value.all > 0 ? value.back / value.all : null]))]));
}

/** Prior-season passing EPA per dropback, for quarterbacks with real volume. */
function qbEfficiency(playerWeeks) {
  const totals = new Map();
  for (const row of playerWeeks) {
    if (row.season_type !== "REG") continue;
    const attempts = Number(row.attempts) || 0;
    const sacks = Number(row.sacks ?? row.sacks_suffered) || 0;
    const epa = Number(row.passing_epa);
    if (attempts <= 0 || !Number.isFinite(epa)) continue;
    const entry = totals.get(row.player_id) ?? { epa: 0, dropbacks: 0 };
    entry.epa += epa;
    entry.dropbacks += attempts + sacks;
    totals.set(row.player_id, entry);
  }
  return new Map([...totals].filter(([, value]) => value.dropbacks >= 100)
    .map(([id, value]) => [id, value.epa / value.dropbacks]));
}

// -------------------------------------------------------------------- row table

function buildRows(context) {
  const { rates, snapShares, qbEpa, coachQb, pointDiff, coverage } = context;
  const rows = [];
  for (const season of TARGET_SEASONS) {
    for (const team of [...rates[season].full.keys()].sort()) {
      const priorInfo = coachQb.get(`${season - 1}|${team}`);
      const targetInfo = coachQb.get(`${season}|${team}`);
      const shares = snapShares[season]?.get(team) ?? {};
      const oldQb = priorInfo?.modalQb ?? null;
      const newQb = targetInfo?.week1Qb ?? null;
      const priorEpa = qbEpa[season - 1];
      const bothKnown = Boolean(newQb && oldQb && priorEpa.has(newQb) && priorEpa.has(oldQb));
      for (const field of ["offense", "ol", "skill", "defense", "dl", "db"]) {
        coverage[field] = (coverage[field] ?? 0) + (Number.isFinite(shares[field]) ? 1 : 0);
      }
      coverage.qbEpaKnown = (coverage.qbEpaKnown ?? 0) + (bothKnown ? 1 : 0);
      coverage.rows = (coverage.rows ?? 0) + 1;
      rows.push({
        season, team,
        history: {
          prior: rates[season - 1].full.get(team),
          twoBack: rates[season - 2].full.get(team),
          last8: rates[season - 1].last8.get(team),
          pointDiff: pointDiff[season - 1].get(team) ?? 0,
        },
        offseason: {
          qbChange: oldQb && newQb && oldQb === newQb ? 0 : 1,
          qbReturnShare: newQb && priorInfo ? (priorInfo.qbStarts.get(newQb) ?? 0) / Math.max(1, priorInfo.games) : 0,
          qbEpaDelta: bothKnown ? priorEpa.get(newQb) - priorEpa.get(oldQb) : 0,
          // An incoming starter with no real prior-season volume (rookie, career
          // backup) gets a neutral delta plus this flag, so the model can price
          // the unknown rather than assume continuity.
          qbUnknown: bothKnown ? 0 : 1,
          hcChange: priorInfo?.modalCoach && targetInfo?.week1Coach
            && priorInfo.modalCoach === targetInfo.week1Coach ? 0 : 1,
          offReturn: shares.offense, olReturn: shares.ol, skillReturn: shares.skill,
          defReturn: shares.defense, dlReturn: shares.dl, dbReturn: shares.db,
        },
        actual: Object.fromEntries(HORIZONS.map((horizon) => [horizon, rates[season][horizon].get(team)])),
      });
    }
  }
  return rows;
}

/** Raw (pre-standardisation) feature value. Continuity shares default to the league norm when absent. */
function rawFeature(row, metric, name) {
  const off = row.offseason;
  switch (name) {
    case "h1": return row.history.prior[metric];
    case "h2": return row.history.twoBack[metric];
    case "h8": return row.history.last8[metric];
    case "pd": return row.history.pointDiff * (isDefense(metric) ? -1 : 1);
    case "qbChange": return off.qbChange;
    case "qbReturnShare": return off.qbReturnShare;
    case "qbEpaDelta": return off.qbEpaDelta;
    case "qbUnknown": return off.qbUnknown;
    case "hcChange": return off.hcChange;
    case "offReturn": return off.offReturn ?? 0.72;
    case "olReturn": return off.olReturn ?? 0.72;
    case "skillReturn": return off.skillReturn ?? 0.72;
    case "defReturn": return off.defReturn ?? 0.72;
    case "dlReturn": return off.dlReturn ?? 0.72;
    case "dbReturn": return off.dbReturn ?? 0.72;
    default: throw new Error(`Unknown feature ${name}`);
  }
}

/**
 * Standardise every column inside its own target season.
 *
 * Cross-sectional z-scores per season remove league-wide drift from both sides
 * of the fit and, critically, use no information from outside that season's own
 * pre-season inputs.
 */
function standardise(rows, metric, names) {
  const bySeason = new Map();
  for (const row of rows) {
    if (!bySeason.has(row.season)) bySeason.set(row.season, []);
    bySeason.get(row.season).push(row);
  }
  const out = new Map();
  for (const group of bySeason.values()) {
    for (const name of names) {
      const column = group.map((row) => rawFeature(row, metric, name));
      const centre = mean(column);
      const spread = sd(column) || 1;
      group.forEach((row, index) => out.set(`${row.season}|${row.team}|${name}`, (column[index] - centre) / spread));
    }
  }
  return out;
}

/** Interaction columns are built from already-standardised parents, then re-standardised per season. */
function withInteractions(rows, values, metric, pairs) {
  const bySeason = new Map();
  for (const row of rows) {
    if (!bySeason.has(row.season)) bySeason.set(row.season, []);
    bySeason.get(row.season).push(row);
  }
  for (const [a, b] of pairs) {
    const name = `${a}:${b}`;
    for (const group of bySeason.values()) {
      const column = group.map((row) =>
        values.get(`${row.season}|${row.team}|${a}`) * values.get(`${row.season}|${row.team}|${b}`));
      const centre = mean(column);
      const spread = sd(column) || 1;
      group.forEach((row, index) => values.set(`${row.season}|${row.team}|${name}`, (column[index] - centre) / spread));
    }
  }
  return values;
}

// --------------------------------------------------------------- model machinery

/** Ridge on centred, unit-variance columns; y is centred, so no intercept term. */
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

/** Feature sets. Offence and defence are treated separately throughout. */
const HISTORY_ONLY = ["h1", "h2", "h8", "pd"];
const OFFENSE_CHANGE = ["qbChange", "qbEpaDelta", "qbUnknown", "hcChange", "offReturn", "olReturn", "skillReturn"];
const DEFENSE_CHANGE = ["hcChange", "defReturn", "dlReturn", "dbReturn"];
const OFFENSE_INTERACTIONS = [["h1", "qbChange"], ["h2", "offReturn"], ["h8", "offReturn"]];
const DEFENSE_INTERACTIONS = [["h1", "defReturn"], ["h2", "defReturn"]];

function modelSpecs(metric) {
  const change = isDefense(metric) ? DEFENSE_CHANGE : OFFENSE_CHANGE;
  const interactions = isDefense(metric) ? DEFENSE_INTERACTIONS : OFFENSE_INTERACTIONS;
  return [
    { id: "A shipped 60/40 + family k", kind: "shipped" },
    { id: "B full/final-8 + fitted k", kind: "blendLast8" },
    { id: "H ridge history only", kind: "ridge", features: HISTORY_ONLY, interactions: [] },
    { id: "C ridge Y-1 + offseason", kind: "ridge", features: ["h1", ...change], interactions: [] },
    { id: "D ridge Y-1,Y-2 + offseason", kind: "ridge", features: ["h1", "h2", ...change], interactions: [] },
    { id: "E ridge full + interactions", kind: "ridge", features: [...HISTORY_ONLY, ...change], interactions },
    // F is the practical form of the hypothesis: keep the shipped baseline and
    // let a regularised model learn only the offseason correction on top of it.
    { id: "F shipped + offseason correction", kind: "residual", features: change, interactions },
    // G asks whether the Y-2 weight itself should move with roster continuity.
    { id: "G shipped, continuity-tilted Y-2", kind: "tilt" },
  ];
}

const LAMBDA_GRID = [1, 3, 10, 30, 100, 300, 1000];

/**
 * Rolling origin: a fold testing season Y fits on transitions ending before Y.
 * 2022 has no earlier transition, so fitted models are scored on 2023-2025 and
 * the two closed-form baselines are scored on all four.
 */
function evaluate(rows, metric, horizon) {
  const anchorBySeason = new Map(TARGET_SEASONS.map((season) =>
    [season, mean(rows.filter((row) => row.season === season).map((row) => row.history.prior[metric]))]));
  const anchor = (season) => anchorBySeason.get(season);
  const results = new Map();
  const coefficients = new Map();
  for (const spec of modelSpecs(metric)) {
    const names = spec.kind === "ridge" || spec.kind === "residual"
      ? [...spec.features, ...spec.interactions.map(([a, b]) => `${a}:${b}`)] : [];
    let values = null;
    if (spec.kind === "ridge" || spec.kind === "residual") {
      values = standardise(rows, metric, [...new Set([...spec.features, ...spec.interactions.flat()])]);
      values = withInteractions(rows, values, metric, spec.interactions);
    }
    const pairs = [];
    for (const testSeason of TARGET_SEASONS) {
      const train = rows.filter((row) => row.season < testSeason);
      const test = rows.filter((row) => row.season === testSeason);
      const mu = anchor(testSeason);
      if (spec.kind === "shipped") {
        const k = SHIPPED_K[family(metric)];
        const blended = test.map((row) =>
          RECENCY_WEIGHT * row.history.prior[metric] + (1 - RECENCY_WEIGHT) * row.history.twoBack[metric]);
        const centre = mean(blended);
        test.forEach((row, index) => pairs.push([mu + k * (blended[index] - centre), row.actual[horizon][metric]]));
        continue;
      }
      if (spec.kind === "tilt") {
        if (train.length === 0) continue;
        const k = SHIPPED_K[family(metric)];
        const continuity = isDefense(metric) ? "defReturn" : "offReturn";
        const tiltValues = standardise(rows, metric, [continuity]);
        const blend = (row, c) => {
          const z = tiltValues.get(`${row.season}|${row.team}|${continuity}`);
          const w2 = Math.min(0.8, Math.max(0, (1 - RECENCY_WEIGHT) + c * z));
          return (1 - w2) * row.history.prior[metric] + w2 * row.history.twoBack[metric];
        };
        let best = null;
        for (let c = -0.25; c <= 0.2501; c += 0.025) {
          const trainPairs = [];
          for (const season of [...new Set(train.map((row) => row.season))]) {
            const group = train.filter((row) => row.season === season);
            const centre = mean(group.map((row) => blend(row, c)));
            for (const row of group) trainPairs.push([anchor(season) + k * (blend(row, c) - centre), row.actual[horizon][metric]]);
          }
          const rmse = score(trainPairs).rmse;
          if (best === null || rmse < best.rmse) best = { rmse, c };
        }
        const centre = mean(test.map((row) => blend(row, best.c)));
        coefficients.set(`${spec.id}|${testSeason}`, { continuityTilt: best.c });
        for (const row of test) pairs.push([mu + k * (blend(row, best.c) - centre), row.actual[horizon][metric]]);
        continue;
      }
      if (spec.kind === "blendLast8") {
        if (train.length === 0) continue;
        const predictorOf = (row) => 0.6 * row.history.prior[metric] + 0.4 * row.history.last8[metric];
        let best = null;
        for (let k = 0; k <= 1.0001; k += 0.05) {
          const trainPairs = [];
          for (const season of [...new Set(train.map((row) => row.season))]) {
            const group = train.filter((row) => row.season === season);
            const centre = mean(group.map(predictorOf));
            const seasonMu = anchor(season);
            for (const row of group) trainPairs.push([seasonMu + k * (predictorOf(row) - centre), row.actual[horizon][metric]]);
          }
          const rmse = score(trainPairs).rmse;
          if (best === null || rmse < best.rmse) best = { rmse, k };
        }
        const centre = mean(test.map(predictorOf));
        for (const row of test) pairs.push([mu + best.k * (predictorOf(row) - centre), row.actual[horizon][metric]]);
        continue;
      }
      if (train.length === 0) continue;
      const design = (subset) => subset.map((row) => names.map((name) => values.get(`${row.season}|${row.team}|${name}`)));
      const baselineOf = (row) => {
        const group = rows.filter((other) => other.season === row.season);
        const blended = group.map((other) =>
          RECENCY_WEIGHT * other.history.prior[metric] + (1 - RECENCY_WEIGHT) * other.history.twoBack[metric]);
        const own = RECENCY_WEIGHT * row.history.prior[metric] + (1 - RECENCY_WEIGHT) * row.history.twoBack[metric];
        return anchor(row.season) + SHIPPED_K[family(metric)] * (own - mean(blended));
      };
      const offset = spec.kind === "residual" ? baselineOf : (row) => anchor(row.season);
      const responses = (subset) => subset.map((row) => row.actual[horizon][metric] - offset(row));
      const Xtrain = design(train);
      const ytrain = responses(train);
      const yCentre = mean(ytrain);
      const centred = ytrain.map((value) => value - yCentre);
      // Inner rolling-origin choice of lambda; a single training season falls back to strong regularisation.
      let lambda = 100;
      const trainSeasons = [...new Set(train.map((row) => row.season))].sort();
      if (trainSeasons.length >= 2) {
        let best = null;
        for (const candidate of LAMBDA_GRID) {
          const inner = [];
          for (let index = 1; index < trainSeasons.length; index += 1) {
            const innerTrain = train.filter((row) => row.season < trainSeasons[index]);
            const innerTest = train.filter((row) => row.season === trainSeasons[index]);
            const innerY = responses(innerTrain);
            const innerCentre = mean(innerY);
            const beta = ridgeFit(design(innerTrain), innerY.map((value) => value - innerCentre), candidate);
            design(innerTest).forEach((features, i) => inner.push([
              innerCentre + features.reduce((total, value, j) => total + value * beta[j], 0),
              responses(innerTest)[i],
            ]));
          }
          const rmse = score(inner).rmse;
          if (best === null || rmse < best.rmse) best = { rmse, lambda: candidate };
        }
        lambda = best.lambda;
      }
      const beta = ridgeFit(Xtrain, centred, lambda);
      coefficients.set(`${spec.id}|${testSeason}`, Object.fromEntries(names.map((name, i) => [name, beta[i]])));
      design(test).forEach((features, index) => pairs.push([
        offset(test[index]) + yCentre + features.reduce((total, value, j) => total + value * beta[j], 0),
        test[index].actual[horizon][metric],
      ]));
    }
    results.set(spec.id, { ...score(pairs), names });
  }
  // Comparable baselines restricted to the fitted models' 2023-2025 test window.
  const fittedSeasons = TARGET_SEASONS.slice(1);
  const restricted = (predictor) => {
    const pairs = [];
    for (const season of fittedSeasons) {
      const test = rows.filter((row) => row.season === season);
      const mu = anchor(season);
      const centre = mean(test.map(predictor));
      const k = SHIPPED_K[family(metric)];
      for (const row of test) pairs.push([mu + k * (predictor(row) - centre), row.actual[horizon][metric]]);
    }
    return score(pairs);
  };
  const leagueMean = (() => {
    const pairs = [];
    for (const season of fittedSeasons) {
      const mu = anchor(season);
      for (const row of rows.filter((r) => r.season === season)) pairs.push([mu, row.actual[horizon][metric]]);
    }
    return score(pairs);
  })();
  return {
    results,
    coefficients,
    reference: {
      shipped2325: restricted((row) => RECENCY_WEIGHT * row.history.prior[metric] + (1 - RECENCY_WEIGHT) * row.history.twoBack[metric]),
      leagueMean2325: leagueMean,
    },
  };
}

// --------------------------------------------------------------------- reporting

function main() {
  const args = parseArgs(process.argv);
  const sources = [];
  const rates = loadRates(sources, args.external);
  const games = pick(sources, "schedules (coaches, starting QBs)",
    null, args.external && join(args.external, "games_full.csv"));
  const coachQb = coachAndQb(games);
  const pointDiff = Object.fromEntries(RATE_SEASONS.map((season) => [season, pointDifferential(games, season)]));
  const players = pick(sources, "players (gsis -> pfr id map)", join(NFLVERSE, "players", "players.csv"), null);
  const gsisToPfr = new Map(players.filter((row) => row.gsis_id && row.pfr_id && row.pfr_id !== "NA")
    .map((row) => [row.gsis_id, row.pfr_id]));
  const qbEpa = {};
  const snapShares = {};
  for (const season of TARGET_SEASONS) {
    const priorSnaps = pick(sources, `snaps ${season - 1}`,
      join(NFLVERSE, "snap-counts", `snap_counts_${season - 1}.csv`),
      args.external && join(args.external, `snap_counts_${season - 1}.csv`));
    const roster = pick(sources, `roster ${season}`,
      join(NFLVERSE, "weekly-rosters", `roster_weekly_${season}.csv`),
      args.external && join(args.external, `roster_weekly_${season}.csv`));
    const week1 = roster.filter((row) => Number(row.week) === 1 && (row.game_type ?? "REG") === "REG");
    snapShares[season] = returningSnapShares(priorSnaps, week1.length > 0 ? week1 : roster, gsisToPfr);
    qbEpa[season - 1] = qbEfficiency(pick(sources, `player weeks ${season - 1}`,
      join(NFLVERSE, "stats-player-week", `stats_player_week_${season - 1}.csv`),
      args.external && join(args.external, `stats_player_week_${season - 1}.csv`),
      ["passing_epa", "attempts"]));
  }
  const coverage = {};
  const rows = buildRows({ rates, snapShares, qbEpa, coachQb, pointDiff, coverage });

  console.log("=== inputs ===");
  for (const source of sources) console.log(`  ${source}`);
  console.log(`\n=== transitions ===\n  ${TARGET_SEASONS.map((s) => `${s - 1}->${s}`).join(", ")}  (${rows.length} team-seasons)`);
  console.log("\n=== offseason feature coverage (rows with a real value) ===");
  for (const [field, count] of Object.entries(coverage)) {
    if (field === "rows") continue;
    console.log(`  ${field.padEnd(14)} ${count}/${coverage.rows}`);
  }
  console.log(`  ${"qbChange".padEnd(14)} ${rows.length}/${rows.length}   ${"hcChange".padEnd(14)} ${rows.length}/${rows.length}`);
  console.log("\n  change rates: "
    + `QB changed ${rows.filter((row) => row.offseason.qbChange === 1).length}/${rows.length}, `
    + `HC changed ${rows.filter((row) => row.offseason.hcChange === 1).length}/${rows.length}`);
  const shareStat = (field) => {
    const values = rows.map((row) => row.offseason[field]).filter(Number.isFinite);
    return values.length ? `${mean(values).toFixed(3)} +/- ${sd(values).toFixed(3)}` : "n/a";
  };
  for (const field of ["offReturn", "olReturn", "skillReturn", "defReturn", "dlReturn", "dbReturn"]) {
    console.log(`  ${field.padEnd(14)} mean ${shareStat(field)}`);
  }

  runDiagnostics(rows, {
    mean, sd, standardise, ridgeFit, rawFeature, family, isDefense,
    METRICS, HORIZONS, SHIPPED_K, RECENCY_WEIGHT, TARGET_SEASONS, OFFENSE_CHANGE, DEFENSE_CHANGE,
  });

  const report = { sources, coverage, horizons: {} };
  for (const horizon of HORIZONS) {
    console.log(`\n\n################ HORIZON: ${horizon} ################`);
    report.horizons[horizon] = {};
    for (const metric of Object.keys(METRICS)) {
      const { results, coefficients, reference } = evaluate(rows, metric, horizon);
      report.horizons[horizon][metric] = {
        results: Object.fromEntries([...results].map(([id, value]) => [id, value])),
        reference,
        coefficients: Object.fromEntries(coefficients),
      };
      console.log(`\n-- ${metric} (${family(metric)}) --`);
      console.log(`   reference on the 2023-2025 fitted window: shipped RMSE=${reference.shipped2325.rmse.toFixed(4)}`
        + `  league mean RMSE=${reference.leagueMean2325.rmse.toFixed(4)}`);
      for (const [id, value] of results) {
        const window = id.startsWith("A ") ? "2022-2025" : "2023-2025";
        const versusShipped = 100 * (1 - value.rmse / reference.shipped2325.rmse);
        const versusMean = 100 * (1 - value.rmse / reference.leagueMean2325.rmse);
        console.log(`   ${id.padEnd(30)} [${window}] n=${String(value.n).padStart(3)}`
          + ` MAE=${value.mae.toFixed(4)} RMSE=${value.rmse.toFixed(4)} r=${value.corr.toFixed(3)}`
          + (id.startsWith("A ") ? "" : `  vs shipped ${versusShipped >= 0 ? "+" : ""}${versusShipped.toFixed(1)}%`
            + `  vs mean ${versusMean >= 0 ? "+" : ""}${versusMean.toFixed(1)}%`));
      }
      const stability = new Map();
      for (const [key, beta] of coefficients) {
        if (!key.startsWith("E ")) continue;
        for (const [name, value] of Object.entries(beta)) {
          if (!stability.has(name)) stability.set(name, []);
          stability.get(name).push(value);
        }
      }
      if (stability.size > 0) {
        const line = [...stability].map(([name, values]) => {
          const flips = new Set(values.map((value) => Math.sign(Math.round(value * 1000)))).size > 1;
          return `${name}=${mean(values).toFixed(3)}${flips ? "*" : ""}`;
        }).join("  ");
        console.log(`   model E mean standardised coefficients (* = sign flipped across folds): ${line}`);
      }
    }
  }
  if (args.json) {
    writeFileSync(args.json, `${JSON.stringify(report, null, 1)}\n`, "utf-8");
    console.log(`\nwrote ${args.json}`);
  }
}

// Importable: the market study reuses coachAndQb and returningSnapShares, and
// must not trigger a full study run by importing them.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
