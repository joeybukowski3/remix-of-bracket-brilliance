/**
 * Pregame team state for the market-mispricing hypothesis search.
 *
 * RESEARCH ONLY. Loads committed and external nflverse-derived caches, rebuilds
 * the shipped JKB preseason prior, and produces - for every team in every game
 * - a flat object of quantities that were knowable before that game kicked off.
 *
 * Temporal integrity is the whole point of this module: "season to date" means
 * games whose kickoff strictly precedes this game's kickoff, never nominal
 * week, so a Thursday game never sees the following Sunday.
 *
 * Split from the search itself to keep each file inside the repository's file
 * size guidance.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Shipped projection constants, restated so the search scores the live formula. */
export const RECENCY_WEIGHT = 0.6;
export const SHIPPED_K = { "offense-passing": 0.55, "offense-rushing": 0.45, "defense-passing": 0.30, "defense-rushing": 0.20 };

export const METRICS = {
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
export const canon = (abbr) => {
  const upper = String(abbr ?? "").trim().toUpperCase();
  return TEAM_ALIASES[upper] ?? upper.toLowerCase();
};

export const mean = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0);
export const sd = (values) => {
  if (values.length < 2) return 0;
  const centre = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - centre) ** 2)));
};

export function readCsv(path) {
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

export function pick(sources, root, label, committed, external) {
  if (committed && existsSync(committed)) {
    sources.push(`${label}: committed ${committed.slice(root.length + 1).replace(/\\/g, "/")}`);
    return readCsv(committed);
  }
  if (external && existsSync(external)) {
    sources.push(`${label}: external ${external.split(/[\\/]/).at(-1)}`);
    return readCsv(external);
  }
  throw new Error(`Missing input for ${label}`);
}

/** One row per team-game, joining EPA, success and the extras cache. */
export function teamGameRows(sources, root, nflverse, season, external) {
  const epa = pick(sources, root, `epa ${season}`,
    join(nflverse, "epa-team-game", `epa_team_game_${season}.csv`), join(external, `epa_team_game_${season}.csv`));
  const success = pick(sources, root, `success ${season}`,
    join(nflverse, "success-team-game", `success_team_game_${season}.csv`), join(external, `success_team_game_${season}.csv`));
  const extras = pick(sources, root, `extras ${season}`, null, join(external, `extras_team_game_${season}.csv`));
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
  for (const row of extras) {
    const entry = byKey.get(`${row.game_id}|${row.team}`);
    if (!entry) continue;
    entry.turnovers = Number(row.turnovers);
    entry.explosive20 = Number(row.explosive20);
    entry.thirdConv = Number(row.third_conv); entry.thirdAtt = Number(row.third_att);
    entry.rzTrips = Number(row.rz_trips); entry.rzTds = Number(row.rz_tds);
    entry.returnTds = Number(row.return_tds);
  }
  const joined = [...byKey.values()].filter((row) => row.off_success !== undefined && row.turnovers !== undefined);
  const teams = new Set(joined.map((row) => row.team));
  if (teams.size !== 32) throw new Error(`${season}: joined team-game table has ${teams.size} teams, expected 32`);
  return joined;
}

const denominatorField = (key) => (METRICS[key].cache === "epa" ? `${METRICS[key].den}_epa` : METRICS[key].den);

export function rateOver(rows, key) {
  const spec = METRICS[key];
  const numerator = rows.reduce((total, row) => total + row[spec.num], 0);
  const denominator = rows.reduce((total, row) => total + row[denominatorField(key)], 0);
  return denominator > 0 ? (spec.scale * numerator) / denominator : null;
}

/** Full-season and final-eight rate tables for a completed season. */
export function seasonRates(rows) {
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

/** The shipped preseason prior: 0.6/0.4 two-season blend, shrunk to the Y-1 league mean. */
export function preseasonPrior(priorTable, twoBackTable) {
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

export const kickoff = (game) => Date.parse(`${game.gameday}T${game.gametime || "13:00"}:00-04:00`);

const ratio = (numerator, denominator) => (denominator > 0 ? numerator / denominator : null);

/**
 * Everything knowable about one team before one kickoff.
 *
 * Season-to-date aggregates come from that team's own earlier games only.
 * Prior-season and preseason quantities are fixed before the season starts.
 * Values are null, never zero, when a team has not played enough to define
 * them - a zero would silently masquerade as a real measurement.
 */
export function pregameState({ team, prior, priorTable, twoBackTable, playedRows, results, cutoff }) {
  const own = playedRows.filter((row) => row.team === team);
  const against = playedRows.filter((row) => row.opponent === team);
  const games = own.length;
  const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] ?? 0), 0);
  const last = (rows, count) => rows.slice(-count);

  const rate = (rows, key) => (rows.length ? rateOver(rows, key) : null);
  const netEpa = (offRows, defRows) => {
    const off = rate(offRows, "off.epaPerPlay");
    const def = rate(defRows, "def.epaPerPlayAllowed");
    return off === null || def === null ? null : off - def;
  };

  const priorResults = results.filter((game) => game.kick < cutoff
    && (game.home === team || game.away === team));
  const record = priorResults.map((game) => {
    const margin = game.home === team ? game.homeMargin : -game.homeMargin;
    return { margin, points: game.home === team ? game.homePoints : game.awayPoints,
      allowed: game.home === team ? game.awayPoints : game.homePoints, home: game.home === team };
  });
  const wins = record.filter((entry) => entry.margin > 0).length;
  const close = record.filter((entry) => Math.abs(entry.margin) <= 7);

  const priorFull = priorTable?.get(team)?.full;
  const priorLast8 = priorTable?.get(team)?.last8;
  const twoBackFull = twoBackTable?.get(team)?.full;

  return {
    team, games,
    // Season-to-date efficiency
    offEpa: rate(own, "off.epaPerPlay"), defEpa: rate(against, "def.epaPerPlayAllowed"),
    offPassEpa: rate(own, "off.epaPerPass"), defPassEpa: rate(against, "def.epaPerPassAllowed"),
    offRushEpa: rate(own, "off.epaPerRush"), defRushEpa: rate(against, "def.epaPerRushAllowed"),
    offSucc: rate(own, "off.successRate"), defSucc: rate(against, "def.successRateAllowed"),
    offPassSucc: rate(own, "off.passSuccessRate"), defPassSucc: rate(against, "def.passSuccessRateAllowed"),
    offRushSucc: rate(own, "off.rushSuccessRate"), defRushSucc: rate(against, "def.rushSuccessRateAllowed"),
    netEpa: netEpa(own, against),
    passRate: ratio(sum(own, "pass_plays_epa"), sum(own, "off_plays_epa")),
    // Recent form
    last5NetEpa: games >= 5 ? netEpa(last(own, 5), last(against, 5)) : null,
    last5WinPct: record.length >= 5 ? ratio(last(record, 5).filter((entry) => entry.margin > 0).length, 5) : null,
    last5PointDiff: record.length >= 5 ? mean(last(record, 5).map((entry) => entry.margin)) : null,
    // Results
    winPct: record.length ? wins / record.length : null,
    pointDiff: record.length ? mean(record.map((entry) => entry.margin)) : null,
    pointsFor: record.length ? mean(record.map((entry) => entry.points)) : null,
    pointsAgainst: record.length ? mean(record.map((entry) => entry.allowed)) : null,
    closeWinPct: close.length >= 3 ? ratio(close.filter((entry) => entry.margin > 0).length, close.length) : null,
    homeSplit: (() => {
      const homeGames = record.filter((entry) => entry.home);
      const roadGames = record.filter((entry) => !entry.home);
      return homeGames.length >= 2 && roadGames.length >= 2
        ? mean(homeGames.map((entry) => entry.margin)) - mean(roadGames.map((entry) => entry.margin)) : null;
    })(),
    // Regression candidates
    turnoverMargin: games ? (sum(against, "turnovers") - sum(own, "turnovers")) / games : null,
    explosiveRate: ratio(sum(own, "explosive20"), sum(own, "off_plays_epa")),
    explosiveAllowed: ratio(sum(against, "explosive20"), sum(against, "off_plays_epa")),
    thirdDownConv: ratio(sum(own, "thirdConv"), sum(own, "thirdAtt")),
    thirdDownAllowed: ratio(sum(against, "thirdConv"), sum(against, "thirdAtt")),
    rzTdRate: sum(own, "rzTrips") >= 8 ? ratio(sum(own, "rzTds"), sum(own, "rzTrips")) : null,
    rzTdAllowed: sum(against, "rzTrips") >= 8 ? ratio(sum(against, "rzTds"), sum(against, "rzTrips")) : null,
    returnTdMargin: games ? (sum(own, "returnTds") - sum(against, "returnTds")) / games : null,
    // Preseason and prior season
    priorNetEpa: prior ? prior["off.epaPerPlay"] - prior["def.epaPerPlayAllowed"] : null,
    priorNetSucc: prior ? prior["off.successRate"] - prior["def.successRateAllowed"] : null,
    priorPassEpa: prior?.["off.epaPerPass"] ?? null, priorPassDef: prior?.["def.epaPerPassAllowed"] ?? null,
    priorRushEpa: prior?.["off.epaPerRush"] ?? null, priorRushDef: prior?.["def.epaPerRushAllowed"] ?? null,
    y1NetEpa: priorFull ? priorFull["off.epaPerPlay"] - priorFull["def.epaPerPlayAllowed"] : null,
    y2NetEpa: twoBackFull ? twoBackFull["off.epaPerPlay"] - twoBackFull["def.epaPerPlayAllowed"] : null,
    y1Last8NetEpa: priorLast8 ? priorLast8["off.epaPerPlay"] - priorLast8["def.epaPerPlayAllowed"] : null,
    y1Last8PassDef: priorLast8?.["def.epaPerPassAllowed"] ?? null,
  };
}
