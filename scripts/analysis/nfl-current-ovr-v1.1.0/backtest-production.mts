/**
 * ANALYSIS-ONLY. Walk-forward backtest of Current OVR -> 0.24 x dOVR + HFA spread, run through the ACTUAL
 * production implementation (buildPerformanceRatingBoard, blendCurrentRating, currentRatingWeightsFor,
 * homeFieldAdvantageFor) rather than the audit's JavaScript reimplementation.
 *
 *   OLD  nfl-current-ovr-v1.0.0: frozen legacy composite (scripts/analysis/nfl-current-ovr-spread-calibration/
 *        legacy-performance-composite-v1.0.0.ts): 40/40/20, one-pass opponent adjustment, divisor 0.7224.
 *   NEW  nfl-current-ovr-v1.1.0: src/lib/nfl/performanceComposite2026.ts as committed.
 *
 * No look-ahead: a team's rating before a game uses only games whose kickoff + 3.5h <= this game's kickoff
 * (the production completed-game rule), and each season's preseason anchor is the artifact published before
 * that season (v0.3.1 preseason publicRating; there is no historical v0.4). Spread transform is unchanged.
 *
 * Inputs: raw trimmed nflverse play-by-play (gitignored; $NFL_PBP_RAW_DIR, default data/nfl/backtest-2026/raw),
 * public/data/nfl/<season>/{games,results,preseason-power-ratings}.json.
 *
 * Run: NFL_PBP_RAW_DIR=... npx tsx scripts/analysis/nfl-current-ovr-v1.1.0/backtest-production.mts [--json-out=<path>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv, buildNflverseTeamMap } from "../../lib/nfl-schedules-results-core.mjs";
import { aggregateSeason } from "../../lib/nfl-performance-metrics-core.mjs";
import { GAME_COMPLETION_MS } from "../../lib/nfl-spread-model.mjs";
import { buildWindowInput } from "../../generate-nfl-team-performance-analytics.mts";
import { deriveTeamPerformanceMetrics } from "../../../src/lib/nfl/performanceMetricsCore2026.ts";
import {
  buildPerformanceRatingBoard,
  type TeamPerformanceGameEvidence,
  type TeamPerformanceSeasonEntry,
} from "../../../src/lib/nfl/performanceComposite2026.ts";
import { buildPerformanceRatingBoard as buildLegacyBoard } from "../nfl-current-ovr-spread-calibration/legacy-performance-composite-v1.0.0.ts";
import { blendCurrentRating, currentRatingWeightsFor, clampRating } from "../../../src/lib/nfl/currentRating2026.ts";
import { OVR_TO_POINTS_COEFFICIENT, homeFieldAdvantageFor } from "../../../src/lib/nfl/jkbPowerNumber2026.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const RAW_DIR = process.env.NFL_PBP_RAW_DIR ?? join(ROOT, "data", "nfl", "backtest-2026", "raw");
const SEASONS = [2023, 2024, 2025];
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf-8"));
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

type Obs = { season: number; week: number; gameNo: number; oldPred: number; newPred: number; margin: number; neutral: boolean };

function backtestSeason(season: number, teamMap: Map<string, { abbr: string }>): Obs[] {
  const dir = join(ROOT, "public", "data", "nfl", String(season));
  const games = (readJson(join(dir, "games.json")).games as any[]).filter((g) => g.seasonType === "REG");
  const results = (readJson(join(dir, "results.json")).results as any[]).filter((r) => r.seasonType === "REG" && r.final === true);
  const preseason = new Map((readJson(join(dir, "preseason-power-ratings.json")).ratings as any[]).map((r) => [r.abbr, r.publicRating as number]));
  const rows: any[] = aggregateSeason(parseCsv(readFileSync(join(RAW_DIR, `pbp_${season}_reg_trimmed.csv`), "utf-8")), { season, teamMap });

  const kickoff = new Map<string, number>(games.map((g) => [g.gameId, Date.parse(g.dateUtc)]));
  const resultById = new Map(results.map((r) => [r.gameId, r]));
  const byGameTeam = new Map(rows.map((r) => [`${r.gameId}|${r.team}`, r]));
  const rowsByTeam = new Map<string, any[]>();
  for (const row of rows) { if (!rowsByTeam.has(row.team)) rowsByTeam.set(row.team, []); rowsByTeam.get(row.team)!.push(row); }
  for (const list of rowsByTeam.values()) list.sort((a, b) => kickoff.get(a.gameId)! - kickoff.get(b.gameId)!);

  const boardCache = new Map<number, { gp: Map<string, number>; oldPerf: Map<string, number>; newPerf: Map<string, number> }>();
  function boardsAt(cutoff: number) {
    const hit = boardCache.get(cutoff);
    if (hit) return hit;
    const current: TeamPerformanceSeasonEntry[] = [];
    const legacy: any[] = [];
    const gp = new Map<string, number>();
    for (const [team, list] of rowsByTeam) {
      const eligible = list.filter((r) => kickoff.get(r.gameId)! + GAME_COMPLETION_MS <= cutoff);
      gp.set(team, eligible.length);
      if (eligible.length === 0) continue;
      const evidence: TeamPerformanceGameEvidence[] = eligible.map((row) => {
        const result = resultById.get(row.gameId);
        const opponentRow = byGameTeam.get(`${row.gameId}|${row.opponent}`);
        if (!result || !opponentRow) throw new Error(`${season} ${team} ${row.gameId}: missing result/opponent row`);
        const margin = result.homeAbbr === team ? result.homeScore - result.awayScore : result.awayScore - result.homeScore;
        return { opponent: row.opponent, margin, offense: { all: row.all, filtered: row.filtered }, defenseAllowed: { all: opponentRow.all, filtered: opponentRow.filtered } };
      });
      const metrics = deriveTeamPerformanceMetrics(buildWindowInput(team, eligible, byGameTeam));
      current.push({ team, metrics, games: evidence });
      legacy.push({ team, metrics, opponents: evidence.map((g) => g.opponent), pointDifferentialPerGame: mean(evidence.map((g) => g.margin)) });
    }
    const perfOf = (board: { rows: any[] }) => new Map<string, number>(board.rows.map((r) => [r.team, r.performanceRating as number]));
    const value = { gp, newPerf: current.length ? perfOf(buildPerformanceRatingBoard(current)) : new Map(), oldPerf: legacy.length ? perfOf(buildLegacyBoard(legacy)) : new Map() };
    boardCache.set(cutoff, value);
    return value;
  }

  function ovr(team: string, perf: Map<string, number>, gp: Map<string, number>): number {
    const anchor = preseason.get(team)!;
    const weights = currentRatingWeightsFor(gp.get(team) ?? 0);
    return weights.performanceWeight > 0 ? blendCurrentRating(anchor, perf.get(team)!, weights) : clampRating(anchor);
  }

  const out: Obs[] = [];
  for (const g of games) {
    const result = resultById.get(g.gameId);
    if (!result) continue;
    const b = boardsAt(kickoff.get(g.gameId)!);
    const hfa = homeFieldAdvantageFor(g.neutralSite === true);
    const home = g.homeAbbr as string;
    const away = g.awayAbbr as string;
    const predict = (perf: Map<string, number>) => OVR_TO_POINTS_COEFFICIENT * (ovr(home, perf, b.gp) - ovr(away, perf, b.gp)) + hfa;
    out.push({
      season, week: g.week, gameNo: Math.min(b.gp.get(home) ?? 0, b.gp.get(away) ?? 0) + 1,
      oldPred: predict(b.oldPerf), newPred: predict(b.newPerf), margin: result.homeScore - result.awayScore, neutral: g.neutralSite === true,
    });
  }
  return out;
}

function stats(obs: Obs[], pick: "oldPred" | "newPred") {
  const n = obs.length;
  const err = obs.map((o) => o[pick] - o.margin);
  const decided = obs.filter((o) => o.margin !== 0 && o[pick] !== 0);
  const corr = (() => {
    const x = obs.map((o) => o[pick]); const y = obs.map((o) => o.margin);
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i += 1) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    return sxy / Math.sqrt(sxx * syy);
  })();
  return {
    n, mae: mean(err.map(Math.abs)), rmse: Math.sqrt(mean(err.map((e) => e * e))), corr,
    su: decided.filter((o) => Math.sign(o[pick]) === Math.sign(o.margin)).length / decided.length, bias: mean(err),
  };
}
const stage = (o: Obs) => (o.gameNo <= 2 ? "Weeks 1-2 (game 1-2)" : o.gameNo <= 5 ? "Weeks 3-5 (game 3-5)" : "Weeks 6+ (game 6+)");

function main() {
  const teamMap = buildNflverseTeamMap(readJson(join(ROOT, "public", "data", "nfl", "teams.json")));
  const all: Obs[] = SEASONS.flatMap((s) => backtestSeason(s, teamMap));
  const row = (label: string, subset: Obs[]) => {
    const o = stats(subset, "oldPred"), n = stats(subset, "newPred");
    const d = subset.map((x) => Math.abs(x.newPred - x.margin) - Math.abs(x.oldPred - x.margin));
    const dm = mean(d), se = Math.sqrt(d.reduce((s, v) => s + (v - dm) ** 2, 0) / (d.length - 1)) / Math.sqrt(d.length);
    return { label, n: o.n, old: o, new: n, paired: { meanAbsErrDiff: dm, ci95: [dm - 1.96 * se, dm + 1.96 * se] } };
  };
  const test = all.filter((o) => o.season >= 2024);
  const report = {
    generatedFor: "nfl-current-ovr-v1.1.0",
    note: "fixed 0.24 x dOVR + HFA; anchors = v0.3.1 preseason publicRating; production libraries via tsx",
    primary_2024_25: row("2024-25 (n=544)", test),
    all_2023_25: row("2023-25 (n=816)", all),
    bySeason: SEASONS.map((s) => row(String(s), all.filter((o) => o.season === s))),
    byStage_2024_25: ["Weeks 1-2 (game 1-2)", "Weeks 3-5 (game 3-5)", "Weeks 6+ (game 6+)"].map((st) => row(st, test.filter((o) => stage(o) === st))),
    byStage_2023_25: ["Weeks 1-2 (game 1-2)", "Weeks 3-5 (game 3-5)", "Weeks 6+ (game 6+)"].map((st) => row(st, all.filter((o) => stage(o) === st))),
  };
  const p = (v: number, d = 3) => v.toFixed(d);
  const show = (r: ReturnType<typeof row>) =>
    `${r.label.padEnd(24)} n=${String(r.n).padEnd(4)} OLD MAE ${p(r.old.mae)} RMSE ${p(r.old.rmse)} r ${p(r.old.corr)} SU ${(r.old.su * 100).toFixed(1)}% | NEW MAE ${p(r.new.mae)} RMSE ${p(r.new.rmse)} r ${p(r.new.corr)} SU ${(r.new.su * 100).toFixed(1)}% | dMAE ${p(r.paired.meanAbsErrDiff)} [${p(r.paired.ci95[0])}, ${p(r.paired.ci95[1])}]`;
  console.log([report.primary_2024_25, report.all_2023_25, ...report.bySeason, ...report.byStage_2024_25].map(show).join("\n"));
  const out = process.argv.find((a) => a.startsWith("--json-out="))?.slice(11);
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
}

main();
