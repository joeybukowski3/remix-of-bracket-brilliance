/** Offline, point-in-time NFL trench research. Run: node scripts/research/nfl-trench-advantage-study.mjs */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const output = join(root, "data/nfl/research/trench-advantage");
const read = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const trench = read("public/data/nfl/matchup-trench-metrics.json");
const market = read("public/data/nfl/matchup-market.json");
const results = read("public/data/nfl/2026/results.json").results;
const games = new Map(read("public/data/nfl/2026/games.json").games.map((g) => [g.gameId, g]));
const keys = { pbwr: "off.passBlockWinRate", rbwr: "off.runBlockWinRate", prwr: "def.passRushWinRate", rswr: "def.runStopWinRate" };
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = (a) => a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] / 2 + [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] / 2 : null;
const round = (n, d = 3) => n == null || !Number.isFinite(n) ? null : Number(n.toFixed(d));
function csv(path) {
  const [header, ...body] = readFileSync(join(root, path), "utf8").trim().split(/\r?\n/);
  const names = header.split(",");
  return body.map((line) => Object.fromEntries(line.split(",").map((value, i) => [names[i], value])));
}
function writeCsv(name, rows) {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => v == null ? "" : `"${String(v).replaceAll('"', '""')}"`;
  writeFileSync(join(output, name), [columns.join(","), ...rows.map((r) => columns.map((k) => cell(r[k])).join(","))].join("\n") + "\n");
}
function mapCsv(path) {
  return new Map(csv(path).map((r) => [`${r.game_id}:${r.team.toLowerCase()}`, r]));
}
const performance = mapCsv("data/nfl/nflverse/performance-team-game/performance_team_game_2026.csv");
const volume = mapCsv("data/nfl/nflverse/play-volume-team-game/play_volume_team_game_2026.csv");
const weekly = mapCsv("data/nfl/nflverse/stats-team-week-current/stats_team_week_2026.csv");
const num = (r, k) => r && r[k] !== "" && r[k] != null ? Number(r[k]) : null;
const ratio = (a, b) => finite(a) && finite(b) && b > 0 ? a / b : null;
const bucket = (e) => e <= 0 ? "<=0" : e <= 4 ? "1-4" : e <= 9 ? "5-9" : e <= 14 ? "10-14" : e <= 19 ? "15-19" : "20+";
const rank = (season, team, key) => trench.seasons[String(season)].teams[team]?.metrics[keys[key]];
const pct = (rankValue) => (32 - rankValue) / 31;
function rawPercentile(season, key, value) {
  const all = Object.values(trench.seasons[String(season)].teams).map((t) => t.metrics[keys[key]].valuePct);
  return (all.filter((v) => v < value).length + all.filter((v) => v === value).length / 2) / all.length;
}
const rows = [];
const exclusions = [];

for (const game of results.filter((r) => r.seasonType === "REG" && r.final)) {
  const schedule = games.get(game.gameId);
  const line = market.currentMarket[game.gameId];
  const ratingSeason = game.week === 1 ? 2025 : game.week === 2 ? 2026 : null;
  if (!ratingSeason || !schedule || !line || !finite(line.spread?.home)) {
    exclusions.push({ gameId: game.gameId, reason: "missing supported rating snapshot, kickoff, or market line" });
    continue;
  }
  const snapshot = trench.seasons[String(ratingSeason)];
  if (ratingSeason === 2026 && (snapshot.throughWeek !== 1 || Date.parse(snapshot.sourceLastModified) >= Date.parse(schedule.dateUtc))) {
    throw new Error(`2026 snapshot is not pregame for ${game.gameId}`);
  }
  if (ratingSeason === 2025 && (snapshot.throughWeek !== 18 || Date.parse(snapshot.sourceLastModified) >= Date.parse(schedule.dateUtc))) {
    throw new Error(`2025 snapshot is not pregame for ${game.gameId}`);
  }
  if (game.homeAbbr !== line.homeAbbr || game.awayAbbr !== line.awayAbbr || game.homeAbbr !== schedule.homeAbbr || game.awayAbbr !== schedule.awayAbbr || line.spread.away !== -line.spread.home) {
    throw new Error(`identity/spread mismatch: ${game.gameId}`);
  }
  for (const side of ["home", "away"]) {
    const team = game[`${side}Abbr`], opponent = game[`${side === "home" ? "away" : "home"}Abbr`];
    const teamPoints = game[`${side}Score`], opponentPoints = game[`${side === "home" ? "away" : "home"}Score`];
    const metrics = {};
    for (const [label, abbr] of [["team", team], ["opponent", opponent]]) {
      for (const key of Object.keys(keys)) {
        const value = rank(ratingSeason, abbr, key);
        if (!value || !finite(value.valuePct) || !finite(value.espnRank)) throw new Error(`missing ${key} for ${game.gameId}:${abbr}`);
        metrics[`${label}_${key}_pct`] = value.valuePct;
        metrics[`${label}_${key}_rank`] = value.espnRank;
      }
    }
    const passRushEdge = metrics.opponent_pbwr_rank - metrics.team_prwr_rank;
    const passProtectionEdge = metrics.opponent_prwr_rank - metrics.team_pbwr_rank;
    const runBlockEdge = metrics.opponent_rswr_rank - metrics.team_rbwr_rank;
    const runStopEdge = metrics.opponent_rbwr_rank - metrics.team_rswr_rank;
    const edges = [passRushEdge, passProtectionEdge, runBlockEdge, runStopEdge];
    const scoreMargin = teamPoints - opponentPoints;
    const teamSpread = line.spread[side];
    const atsMargin = scoreMargin + teamSpread;
    const p = performance.get(`${game.gameId}:${team}`), op = performance.get(`${game.gameId}:${opponent}`);
    const v = volume.get(`${game.gameId}:${opponent}`), w = weekly.get(`${game.gameId}:${team}`);
    const passRushPercentileEdge = pct(metrics.team_prwr_rank) - pct(metrics.opponent_pbwr_rank);
    rows.push({
      season: 2026, week: game.week, game_id: game.gameId, kickoff_utc: schedule.dateUtc,
      rating_season: ratingSeason, rating_through_week: snapshot.throughWeek, rating_as_of: snapshot.sourceLastModified,
      cohort: game.week === 1 ? "prior-season Week 1" : "same-season Week 2", team, opponent,
      venue: schedule.neutralSite ? "neutral" : side, team_spread: teamSpread, market_line_status: "untimestamped settled-line proxy",
      implied_team_total: finite(line.total) ? (line.total - teamSpread) / 2 : null,
      team_points: teamPoints, opponent_points: opponentPoints, score_margin: scoreMargin,
      ats_margin: atsMargin, ats_result: atsMargin > 0 ? "W" : atsMargin < 0 ? "L" : "P",
      su_result: scoreMargin > 0 ? "W" : scoreMargin < 0 ? "L" : "T",
      market_role: teamSpread < 0 ? "favorite" : teamSpread > 0 ? "underdog" : "pickem",
      spread_size: Math.abs(teamSpread) <= 3 ? "0-3" : Math.abs(teamSpread) <= 6.5 ? "3.5-6.5" : "7+",
      ...metrics, pass_rush_edge: passRushEdge, pass_protection_edge: passProtectionEdge,
      run_block_edge: runBlockEdge, run_stop_edge: runStopEdge,
      pass_rush_percentile_edge: round(passRushPercentileEdge),
      pass_protection_percentile_edge: round(pct(metrics.team_pbwr_rank) - pct(metrics.opponent_prwr_rank)),
      run_block_percentile_edge: round(pct(metrics.team_rbwr_rank) - pct(metrics.opponent_rswr_rank)),
      run_stop_percentile_edge: round(pct(metrics.team_rswr_rank) - pct(metrics.opponent_rbwr_rank)),
      pass_rush_raw_percentile_edge: round(rawPercentile(ratingSeason, "prwr", metrics.team_prwr_pct) - rawPercentile(ratingSeason, "pbwr", metrics.opponent_pbwr_pct)),
      pass_protection_raw_percentile_edge: round(rawPercentile(ratingSeason, "pbwr", metrics.team_pbwr_pct) - rawPercentile(ratingSeason, "prwr", metrics.opponent_prwr_pct)),
      run_block_raw_percentile_edge: round(rawPercentile(ratingSeason, "rbwr", metrics.team_rbwr_pct) - rawPercentile(ratingSeason, "rswr", metrics.opponent_rswr_pct)),
      run_stop_raw_percentile_edge: round(rawPercentile(ratingSeason, "rswr", metrics.team_rswr_pct) - rawPercentile(ratingSeason, "rbwr", metrics.opponent_rbwr_pct)),
      trench_wins: edges.filter((e) => e > 0).length, trench_composite_rank_gap: edges.reduce((a, b) => a + b, 0),
      pass_composite_rank_gap: passRushEdge + passProtectionEdge,
      pass_rush_bucket: bucket(passRushEdge), pass_protection_bucket: bucket(passProtectionEdge),
      run_block_bucket: bucket(runBlockEdge), run_stop_bucket: bucket(runStopEdge),
      offense_pass_epa_per_play: ratio(num(p, "all_passEpa"), num(p, "all_passPlays")),
      offense_pass_success_rate: ratio(num(p, "all_passSuccessNum"), num(p, "all_passSuccessDen")),
      offense_explosive_pass_rate: ratio(num(p, "all_explosivePass"), num(p, "all_passPlays")),
      offense_sack_rate: ratio(num(p, "all_sacks"), num(p, "all_dropbacks")),
      offense_turnover_rate: ratio((num(w, "passing_interceptions") ?? 0) + (num(w, "fumbles_lost_total") ?? 0), num(p, "all_offPlays")),
      offense_rush_epa_per_play: ratio(num(p, "all_rushEpa"), num(p, "all_rushPlays")),
      offense_rush_success_rate: ratio(num(p, "all_rushSuccessNum"), num(p, "all_rushSuccessDen")),
      offense_explosive_run_rate: ratio(num(p, "all_explosiveRush"), num(p, "all_rushPlays")),
      offense_yards_per_carry: ratio(num(w, "rushing_yards"), num(w, "carries")),
      defense_opponent_pass_epa_per_play: ratio(num(op, "all_passEpa"), num(op, "all_passPlays")),
      defense_opponent_pass_success_rate: ratio(num(op, "all_passSuccessNum"), num(op, "all_passSuccessDen")),
      defense_opponent_explosive_pass_rate: ratio(num(op, "all_explosivePass"), num(op, "all_passPlays")),
      defense_sack_rate: ratio(num(op, "all_sacks"), num(op, "all_dropbacks")),
      defense_opponent_turnover_rate: ratio((num(w, "def_interceptions") ?? 0) + (num(w, "fumble_recovery_opp") ?? 0), num(op, "all_offPlays")),
      opponent_pregame_pass_rate: game.week === 2 ? ratio(num(v, "pass_plays"), num(v, "eligible_plays")) : null,
      opponent_pregame_proe: null,
    });
  }
}
if (rows.length !== 64 || new Set(rows.map((r) => `${r.game_id}:${r.team}`)).size !== rows.length) throw new Error("unexpected row count or duplicates");
for (const row of rows) {
  const peer = rows.find((r) => r.game_id === row.game_id && r.team === row.opponent);
  if (!peer || row.ats_margin !== -peer.ats_margin || row.score_margin !== -peer.score_margin) throw new Error(`opposite-side grading mismatch: ${row.game_id}`);
}
// A Week 2 game's prior-week pass rate is available from the Week 1 game, not its own outcome.
for (const row of rows.filter((r) => r.week === 2)) {
  const prior = rows.find((r) => r.week === 1 && r.team === row.opponent);
  if (prior) {
    const priorVolume = volume.get(`${prior.game_id}:${row.opponent}`);
    row.opponent_pregame_pass_rate = ratio(num(priorVolume, "pass_plays"), num(priorVolume, "eligible_plays"));
    row.opponent_pregame_proe = ratio(num(priorVolume, "pass_oe_sum"), num(priorVolume, "pass_oe_count"));
  } else row.opponent_pregame_pass_rate = null;
}

function wilson(w, l) {
  const n = w + l;
  if (!n) return [null, null];
  const z = 1.96, p = w / n, base = 1 + z * z / n;
  const mid = (p + z * z / (2 * n)) / base;
  const rad = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / base;
  return [round(mid - rad), round(mid + rad)];
}
function summary(window, signal, group, subset) {
  const w = subset.filter((r) => r.ats_result === "W").length, l = subset.filter((r) => r.ats_result === "L").length;
  const p = subset.length - w - l, sw = subset.filter((r) => r.su_result === "W").length, sl = subset.filter((r) => r.su_result === "L").length;
  const ci = wilson(w, l);
  return { window, signal, group, n: subset.length, games: new Set(subset.map((r) => r.game_id)).size,
    ats_w: w, ats_l: l, ats_p: p, ats_cover_rate: round(ratio(w, w + l)), ats_wilson_low: ci[0], ats_wilson_high: ci[1],
    mean_ats_margin: round(mean(subset.map((r) => r.ats_margin))), median_ats_margin: round(median(subset.map((r) => r.ats_margin))),
    su_w: sw, su_l: sl, su_t: subset.length - sw - sl, su_win_rate: round(ratio(sw, sw + sl)),
    mean_score_margin: round(mean(subset.map((r) => r.score_margin))), median_score_margin: round(median(subset.map((r) => r.score_margin))),
    opponent_points_mean: round(mean(subset.map((r) => r.opponent_points))),
    opponent_pass_epa_per_play_mean: round(mean(subset.map((r) => r.defense_opponent_pass_epa_per_play).filter(finite))),
    opponent_pass_success_rate_mean: round(mean(subset.map((r) => r.defense_opponent_pass_success_rate).filter(finite))),
    defense_sack_rate_mean: round(mean(subset.map((r) => r.defense_sack_rate).filter(finite))),
    offense_pass_epa_per_play_mean: round(mean(subset.map((r) => r.offense_pass_epa_per_play).filter(finite))),
    offense_pass_success_rate_mean: round(mean(subset.map((r) => r.offense_pass_success_rate).filter(finite))),
    offense_rush_epa_per_play_mean: round(mean(subset.map((r) => r.offense_rush_epa_per_play).filter(finite))),
    offense_rush_success_rate_mean: round(mean(subset.map((r) => r.offense_rush_success_rate).filter(finite))) };
}
function correlation(a, b) {
  const x = mean(a), y = mean(b), sx = Math.sqrt(a.reduce((s, v) => s + (v - x) ** 2, 0)), sy = Math.sqrt(b.reduce((s, v) => s + (v - y) ** 2, 0));
  return sx && sy ? a.reduce((s, v, i) => s + (v - x) * (b[i] - y), 0) / sx / sy : null;
}
function midranks(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => (sorted.indexOf(v) + sorted.lastIndexOf(v)) / 2 + 1);
}
function slope(x, y) {
  const xm = mean(x), ym = mean(y), den = x.reduce((s, v) => s + (v - xm) ** 2, 0);
  return den ? x.reduce((s, v, i) => s + (v - xm) * (y[i] - ym), 0) / den : null;
}
function solve(matrix, vector) {
  const a = matrix.map((row, i) => [...row, vector[i]]), n = vector.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let r = 0; r < n; r++) if (r !== col) {
      const factor = a[r][col];
      for (let j = col; j <= n; j++) a[r][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}
function ols(rows0, field, controlled) {
  const xs = rows0.map((r) => controlled ? [1, r[field], r.team_spread, r.venue === "home" ? 1 : 0] : [1, r[field]]);
  const n = xs[0]?.length;
  if (!n) return null;
  const xx = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => xs.reduce((sum, x) => sum + x[i] * x[j], 0)));
  const xy = Array.from({ length: n }, (_, i) => xs.reduce((sum, x, j) => sum + x[i] * rows0[j].ats_margin, 0));
  return solve(xx, xy)?.[1] ?? null;
}
function clusterInterval(cohort, field, controlled) {
  const ids = [...new Set(cohort.map((r) => r.game_id))];
  let state = 38291;
  const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
  const draws = [];
  for (let i = 0; i < 1500; i++) {
    const sample = Array.from({ length: ids.length }, () => ids[Math.floor(random() * ids.length)]).flatMap((id) => cohort.filter((r) => r.game_id === id));
    const estimate = ols(sample, field, controlled);
    if (finite(estimate)) draws.push(estimate);
  }
  draws.sort((a, b) => a - b);
  return { low: round(draws[Math.floor(draws.length * .025)]), high: round(draws[Math.floor(draws.length * .975)]), valid_draws: draws.length };
}
function clusterMeanDifference(cohort, field, cutoff) {
  const estimate = (sample) => {
    const high = sample.filter((r) => r[field] >= cutoff).map((r) => r.ats_margin);
    const low = sample.filter((r) => r[field] < cutoff).map((r) => r.ats_margin);
    return high.length && low.length ? mean(high) - mean(low) : null;
  };
  const ids = [...new Set(cohort.map((r) => r.game_id))];
  let state = 67231;
  const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
  const draws = [];
  for (let i = 0; i < 1500; i++) {
    const sample = Array.from({ length: ids.length }, () => ids[Math.floor(random() * ids.length)]).flatMap((id) => cohort.filter((r) => r.game_id === id));
    const value = estimate(sample);
    if (finite(value)) draws.push(value);
  }
  draws.sort((a, b) => a - b);
  return { estimate: round(estimate(cohort)), low: round(draws[Math.floor(draws.length * .025)]), high: round(draws[Math.floor(draws.length * .975)]), valid_draws: draws.length };
}
const windows = { "2026 Week 1 prior-season": rows.filter((r) => r.week === 1), "2026 Week 2 same-season": rows.filter((r) => r.week === 2) };
const summaries = [], continuous = [], meanDifferences = [];
for (const [window, cohort] of Object.entries(windows)) {
  for (const [signal, field] of Object.entries({ pass_rush: "pass_rush_edge", pass_protection: "pass_protection_edge", run_block: "run_block_edge", run_stop: "run_stop_edge" })) {
    summaries.push(summary(window, signal, "all", cohort));
    for (const label of ["<=0", "1-4", "5-9", "10-14", "15-19", "20+"]) summaries.push(summary(window, signal, label, cohort.filter((r) => bucket(r[field]) === label)));
    for (const cutoff of [5, 10, 15, 20]) summaries.push(summary(window, signal, `${cutoff}+`, cohort.filter((r) => r[field] >= cutoff)));
    for (const cutoff of [5, 10, 15, 20]) summaries.push(summary(window, `${signal}_raw_percentile`, `${cutoff}/31+`, cohort.filter((r) => r[`${signal}_raw_percentile_edge`] >= cutoff / 31)));
    meanDifferences.push({ window, signal, contrast: "10+ vs below 10", ...clusterMeanDifference(cohort, field, 10) });
    const x = cohort.map((r) => r[field]), a = cohort.map((r) => r.ats_margin), s = cohort.map((r) => r.score_margin);
    const simpleCi = clusterInterval(cohort, field, false), controlledCi = clusterInterval(cohort, field, true);
    continuous.push({ window, signal, n: cohort.length, games: cohort.length / 2,
      pearson_ats: round(correlation(x, a)), spearman_ats: round(correlation(midranks(x), midranks(a))),
      pearson_score: round(correlation(x, s)), spearman_score: round(correlation(midranks(x), midranks(s))),
      ols_ats_points_per_rank: round(slope(x, a)), ols_score_points_per_rank: round(slope(x, s)),
      ols_ats_cluster_bootstrap_95: simpleCi, ols_market_home_adjusted_points_per_rank: round(ols(cohort, field, true)),
      ols_market_home_adjusted_cluster_bootstrap_95: controlledCi,
      raw_percentile_pearson_ats: round(correlation(cohort.map((r) => r[`${signal}_raw_percentile_edge`]), a)) });
  }
  for (const n of [5, 8, 10, 12]) summaries.push(summary(window, "elite_prwr_poor_pbwr", `top${n}_bottom${n}`, cohort.filter((r) => r.team_prwr_rank <= n && r.opponent_pbwr_rank >= 33 - n)));
  for (const n of [0, 1, 2, 3, 4]) summaries.push(summary(window, "trench_wins", `${n}/4`, cohort.filter((r) => r.trench_wins === n)));
  for (const n of [3, 4]) summaries.push(summary(window, "trench_wins", `${n}+/4`, cohort.filter((r) => r.trench_wins >= n)));
  for (const [name, fn] of Object.entries({ both_positive: (r) => r.pass_rush_edge > 0 && r.pass_protection_edge > 0,
    both_10_plus: (r) => r.pass_rush_edge >= 10 && r.pass_protection_edge >= 10,
    one_15_other_positive: (r) => r.pass_rush_edge > 0 && r.pass_protection_edge > 0 && Math.max(r.pass_rush_edge, r.pass_protection_edge) >= 15,
    top_quartile_composite: (r) => r.pass_composite_rank_gap >= [...cohort].map((a) => a.pass_composite_rank_gap).sort((a,b) => a-b)[Math.floor(cohort.length * .75)] })) {
    summaries.push(summary(window, "pass_composite", name, cohort.filter(fn)));
  }
  for (const signal of ["pass_rush", "pass_protection", "run_block", "run_stop"]) {
    const subset = cohort.filter((r) => r[`${signal}_edge`] >= 10);
    for (const role of ["favorite", "underdog", "pickem"]) summaries.push(summary(window, `${signal}_10plus_market`, role, subset.filter((r) => r.market_role === role)));
    for (const venue of ["home", "away", "neutral"]) summaries.push(summary(window, `${signal}_10plus_market`, venue, subset.filter((r) => r.venue === venue)));
    for (const role of ["favorite", "underdog"]) for (const size of ["0-3", "3.5-6.5", "7+"]) summaries.push(summary(window, `${signal}_10plus_market`, `${role}_${size}`, subset.filter((r) => r.market_role === role && r.spread_size === size)));
  }
  summaries.push(summary(window, "pass_rush_volume", "10plus_opponent_pregame_pass_rate_above_median", cohort.filter((r) => r.pass_rush_edge >= 10 && finite(r.opponent_pregame_pass_rate) && r.opponent_pregame_pass_rate >= median(cohort.map((r) => r.opponent_pregame_pass_rate).filter(finite)))));
}
const audit = rows.filter((r) => r.week === 2 && r.pass_rush_edge >= 10).sort((a, b) => b.pass_rush_edge - a.pass_rush_edge).map((r) => ({ week: r.week, team: r.team, opponent: r.opponent, prwr_rank: r.team_prwr_rank, opponent_pbwr_rank: r.opponent_pbwr_rank, pass_rush_edge: r.pass_rush_edge, team_spread: r.team_spread, final_score: `${r.team_points}-${r.opponent_points}`, ats_result: r.ats_result, ats_margin: r.ats_margin, su_result: r.su_result }));
mkdirSync(output, { recursive: true });
writeCsv("team_games.csv", rows);
writeCsv("summaries.csv", summaries);
writeCsv("major_pass_rush_2026.csv", audit);
writeFileSync(join(output, "analysis.json"), JSON.stringify({ schemaVersion: "nfl-trench-advantage-research-v1", sourceGeneratedAt: { trench: trench.generatedAt, market: market._meta.generatedAt }, sample: Object.fromEntries(Object.entries(windows).map(([k,v]) => [k, { teamGames: v.length, games: v.length / 2, weeks: [...new Set(v.map((r) => r.week))] }])), historical: { "2021-2025": { validGames: 0, reason: "no pregame weekly ESPN trench snapshots" }, "2023-2025": { validGames: 0, reason: "no pregame weekly ESPN trench snapshots" }, "full available historical": { validGames: 0, reason: "no pregame weekly ESPN trench snapshots" } }, exclusions, continuous, meanDifferences, summaries, majorPassRushAudit: audit, unavailable: ["pressure rate", "verified closing line and price", "weekly historical trench snapshots"] }, null, 2) + "\n");
console.log(`Wrote ${rows.length} team-games, ${summaries.length} summaries, ${audit.length} major Week 2 pass-rush examples`);
