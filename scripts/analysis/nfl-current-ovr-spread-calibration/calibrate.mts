/**
 * CALIBRATION-ONLY analysis script. Not wired into any production pipeline,
 * not imported by any app code, not run in CI. Reconstructs the canonical
 * Current OVR board (src/lib/nfl/currentRating2026.ts +
 * src/lib/nfl/performanceComposite2026.ts) on a leakage-free walk-forward
 * basis for 2023-2025, fits ratingDiff -> expected margin, and compares
 * against the existing nfl-spread-v0.1.0 composite model on the same games.
 *
 * Run: npx tsx scripts/analysis/nfl-current-ovr-spread-calibration/calibrate.mts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv, buildNflverseTeamMap, NFL_GAMES_SOURCE_URL } from "../../lib/nfl-schedules-results-core.mjs";
import { aggregateSeason } from "../../lib/nfl-performance-metrics-core.mjs";
import { buildWindowInput } from "../../generate-nfl-team-performance-analytics.mts";
import {
  deriveTeamPerformanceMetrics,
} from "../../../src/lib/nfl/performanceMetricsCore2026.ts";
import {
  buildPerformanceRatingBoard,
  type TeamPerformanceSeasonEntry,
} from "../../../src/lib/nfl/performanceComposite2026.ts";
import {
  currentRatingWeightsFor,
  blendCurrentRating,
  clampRating,
} from "../../../src/lib/nfl/currentRating2026.ts";
import {
  SPREAD_HFA_POINTS,
  GAME_COMPLETION_MS,
  fitBeta,
  homeFieldFor,
} from "../../lib/nfl-spread-model.mjs";
import { loadSpreadDataset } from "../../lib/nfl-spread-dataset.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_DIR = join(ROOT, "scripts", "analysis", "nfl-current-ovr-spread-calibration", "out");

// ---------------------------------------------------------------------------
// Seasons: raw PBP with success-rate/explosive-rate/garbage-time detail is
// only cached for 2023-2025 (data/nfl/backtest-2026/raw). 2020-2022 are NOT
// reconstructable for the full approved composite without a fresh nflverse
// fetch, so this pass is scoped honestly to what's already cached.
// ---------------------------------------------------------------------------
const RECONSTRUCTABLE_SEASONS = [2023, 2024, 2025];
const FITTABLE_SEASONS = [2023, 2024, 2025];
const BACKTEST_SEASONS = [2024, 2025]; // 2023 has no strictly-earlier reconstructable season to fit on

const NEUTRAL_SITE_STADIUM_KEYWORDS = [
  "tottenham", "wembley", "allianz arena", "corinthians", "estadio", "azteca",
  "camp nou", "bernabeu", "santiago bernab", "croke park", "aviva stadium", "twickenham",
  "deutsche bank park", "olympiastadion",
];

const isFinite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// ---------------------------------------------------------------------------
// Load raw trimmed PBP + aggregate into per-team-per-game bundles (reuses the
// production performance-metrics engine: garbage-time filter, traditional
// success rate, explosive-play definition are all computed exactly as the
// live Current OVR pipeline computes them).
// ---------------------------------------------------------------------------
function loadTeamGamesForSeason(season: number, teamMap: Map<string, { abbr: string }>) {
  const path = join(ROOT, "data", "nfl", "backtest-2026", "raw", `pbp_${season}_reg_trimmed.csv`);
  const text = readFileSync(path, "utf-8");
  const records = parseCsv(text);
  return aggregateSeason(records, { season, teamMap });
}

function loadSeasonSchedule(season: number) {
  const dir = join(ROOT, "public", "data", "nfl", String(season));
  const games = readJson(join(dir, "games.json")).games ?? [];
  const results = readJson(join(dir, "results.json")).results ?? [];
  const preseason = readJson(join(dir, "preseason-power-ratings.json"));
  return { games, results, preseason };
}

function detectNeutralGames(games: any[]): Set<string> {
  const neutral = new Set<string>();
  for (const g of games) {
    const stadium = String(g.stadium ?? "").toLowerCase();
    if (NEUTRAL_SITE_STADIUM_KEYWORDS.some((kw) => stadium.includes(kw))) neutral.add(g.gameId);
  }
  return neutral;
}

// ---------------------------------------------------------------------------
// Walk-forward Current-OVR reconstruction for one season.
// ---------------------------------------------------------------------------
function reconstructSeason(season: number, teamGames: any[], schedule: ReturnType<typeof loadSeasonSchedule>) {
  const { games, results, preseason } = schedule;
  const kickoffByGameId = new Map<string, number>();
  for (const g of games) {
    if (g.seasonType !== "REG") continue;
    const t = g.dateUtc ? Date.parse(g.dateUtc) : NaN;
    if (Number.isFinite(t)) kickoffByGameId.set(g.gameId, t);
  }

  const finalByGameId = new Map<string, any>();
  for (const r of results) if (r.seasonType === "REG" && r.final === true) finalByGameId.set(r.gameId, r);

  const rowsByGameTeam = new Map<string, any>();
  for (const row of teamGames) rowsByGameTeam.set(`${row.gameId}|${row.team}`, row);
  const rowsByTeam = new Map<string, any[]>();
  for (const row of teamGames) {
    if (!rowsByTeam.has(row.team)) rowsByTeam.set(row.team, []);
    rowsByTeam.get(row.team)!.push(row);
  }
  for (const rows of rowsByTeam.values()) {
    rows.sort((a, b) => (kickoffByGameId.get(a.gameId) ?? 0) - (kickoffByGameId.get(b.gameId) ?? 0));
  }

  const preseasonByAbbr = new Map(preseason.ratings.map((r: any) => [r.abbr, r]));

  const boardCache = new Map<number, Map<string, { performanceRating: number | null; gamesPlayed: number; sampleGameIds: string[] }>>();

  function boardAt(cutoffMs: number) {
    if (boardCache.has(cutoffMs)) return boardCache.get(cutoffMs)!;

    const entries: TeamPerformanceSeasonEntry[] = [];
    const gamesPlayedByTeam = new Map<string, number>();
    const sampleGameIdsByTeam = new Map<string, string[]>();

    for (const [team, rows] of rowsByTeam) {
      const eligible = rows.filter((r) => {
        const kickoff = kickoffByGameId.get(r.gameId);
        return kickoff !== undefined && kickoff + GAME_COMPLETION_MS <= cutoffMs;
      });
      gamesPlayedByTeam.set(team, eligible.length);
      sampleGameIdsByTeam.set(team, eligible.map((r) => r.gameId));
      if (eligible.length === 0) continue;

      const windowInput = buildWindowInput(team, eligible, rowsByGameTeam);
      const metrics = deriveTeamPerformanceMetrics(windowInput);

      const margins = eligible.map((r) => {
        const res = finalByGameId.get(r.gameId);
        if (!res) return 0;
        const isHome = res.homeAbbr === team;
        return isHome ? res.homeScore - res.awayScore : res.awayScore - res.homeScore;
      });
      const pointDifferentialPerGame = margins.reduce((s, m) => s + m, 0) / margins.length;
      const opponents = eligible.map((r) => r.opponent);

      entries.push({ team, metrics, opponents, pointDifferentialPerGame });
    }

    const board = entries.length > 0 ? buildPerformanceRatingBoard(entries) : { rows: [] as any[] };
    const byTeam = new Map<string, { performanceRating: number | null; gamesPlayed: number; sampleGameIds: string[] }>();
    for (const team of rowsByTeam.keys()) {
      const row = board.rows.find((r) => r.team === team);
      byTeam.set(team, {
        performanceRating: row?.performanceRating ?? null,
        gamesPlayed: gamesPlayedByTeam.get(team) ?? 0,
        sampleGameIds: sampleGameIdsByTeam.get(team) ?? [],
      });
    }
    boardCache.set(cutoffMs, byTeam);
    return byTeam;
  }

  function ovrAt(team: string, cutoffMs: number) {
    const board = boardAt(cutoffMs);
    const state = board.get(team);
    const gamesPlayed = state?.gamesPlayed ?? 0;
    const weights = currentRatingWeightsFor(gamesPlayed);
    const preseasonRow: any = preseasonByAbbr.get(team);
    if (!preseasonRow) throw new Error(`missing preseason row for ${team} season ${season}`);
    const preseasonRating = preseasonRow.publicRating;

    if (weights.performanceWeight > 0) {
      const performanceRating = state?.performanceRating;
      if (!isFinite(performanceRating)) {
        throw new Error(`${team} season ${season}: gamesPlayed=${gamesPlayed} but performanceRating missing`);
      }
      return {
        rating: blendCurrentRating(preseasonRating, performanceRating as number, weights),
        gamesPlayed,
        sampleGameIds: state?.sampleGameIds ?? [],
      };
    }
    return { rating: clampRating(preseasonRating), gamesPlayed, sampleGameIds: state?.sampleGameIds ?? [] };
  }

  const neutralGameIds = detectNeutralGames(games);

  const observations: any[] = [];
  for (const g of games) {
    if (g.seasonType !== "REG") continue;
    const res = finalByGameId.get(g.gameId);
    if (!res) continue;
    const cutoffMs = kickoffByGameId.get(g.gameId);
    if (cutoffMs === undefined) continue;

    const home = ovrAt(res.homeAbbr, cutoffMs);
    const away = ovrAt(res.awayAbbr, cutoffMs);

    // No-leakage assertion: the target game must never appear in either
    // team's own completed-game sample.
    if (home.sampleGameIds.includes(g.gameId) || away.sampleGameIds.includes(g.gameId)) {
      throw new Error(`${g.gameId}: target game leaked into its own feature sample`);
    }

    observations.push({
      gameId: g.gameId,
      season,
      week: g.week,
      homeAbbr: res.homeAbbr,
      awayAbbr: res.awayAbbr,
      neutralSite: neutralGameIds.has(g.gameId),
      ovrHome: home.rating,
      ovrAway: away.rating,
      ratingDiff: home.rating - away.rating,
      gamesPlayedHome: home.gamesPlayed,
      gamesPlayedAway: away.gamesPlayed,
      minGamesPlayed: Math.min(home.gamesPlayed, away.gamesPlayed),
      margin: res.homeScore - res.awayScore,
    });
  }

  return { observations, neutralGameIds: [...neutralGameIds] };
}

// ---------------------------------------------------------------------------
// Small linear-regression helpers (closed-form normal equations, up to 3
// unknowns) — used for HFA/intercept comparisons beyond the single-parameter
// fitBeta() already provided by nfl-spread-model.mjs.
// ---------------------------------------------------------------------------
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-12) throw new Error("singular system");
    for (let c = col; c <= n; c++) M[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/** OLS fit of margin ~ features (each a fn(obs) -> number), no intercept unless included as a feature. */
function olsFit(rows: any[], featureFns: ((o: any) => number)[]): number[] {
  const k = featureFns.length;
  const XtX = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty = Array(k).fill(0);
  for (const row of rows) {
    const x = featureFns.map((f) => f(row));
    for (let i = 0; i < k; i++) {
      Xty[i] += x[i] * row.margin;
      for (let j = 0; j < k; j++) XtX[i][j] += x[i] * x[j];
    }
  }
  return solveLinearSystem(XtX, Xty);
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

function summarize(rows: { predicted: number; actual: number }[]) {
  const n = rows.length;
  const errors = rows.map((r) => r.predicted - r.actual);
  const decided = rows.filter((r) => r.actual !== 0);
  const correct = decided.filter((r) => Math.sign(r.predicted) === Math.sign(r.actual)).length;
  const mx = rows.reduce((s, r) => s + r.predicted, 0) / n;
  const my = rows.reduce((s, r) => s + r.actual, 0) / n;
  const sxx = rows.reduce((s, r) => s + (r.predicted - mx) ** 2, 0);
  const slope = sxx > 0 ? rows.reduce((s, r) => s + (r.predicted - mx) * (r.actual - my), 0) / sxx : NaN;
  return {
    n,
    mae: errors.reduce((s, e) => s + Math.abs(e), 0) / n,
    rmse: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n),
    bias: errors.reduce((s, e) => s + e, 0) / n,
    correlation: n > 1 ? pearson(rows.map((r) => r.predicted), rows.map((r) => r.actual)) : NaN,
    winnerAccuracy: decided.length > 0 ? correct / decided.length : NaN,
    calibrationSlope: slope,
    calibrationIntercept: my - slope * mx,
  };
}

async function fetchHistoricalMarket(): Promise<Map<string, number> | null> {
  try {
    const res = await fetch(NFL_GAMES_SOURCE_URL, { headers: { "User-Agent": "jkb-calibration/1.0" } });
    if (!res.ok) return null;
    const text = await res.text();
    const rows = parseCsv(text);
    if (rows.length === 0 || !("game_id" in rows[0]) || !("spread_line" in rows[0])) return null;
    const map = new Map<string, number>();
    for (const r of rows as any[]) {
      const gameId = r.game_id;
      const spread = Number(r.spread_line);
      if (gameId && Number.isFinite(spread)) map.set(gameId, spread);
    }
    return map;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("[calibration] loading teams.json + nflverse team map");
  const teamsJson = readJson(join(ROOT, "public", "data", "nfl", "teams.json"));
  const teamMap = buildNflverseTeamMap(teamsJson);

  const seasonData: Record<number, { observations: any[]; neutralGameIds: string[] }> = {};
  for (const season of RECONSTRUCTABLE_SEASONS) {
    console.log(`[calibration] reconstructing Current OVR walk-forward for ${season}...`);
    const teamGames = loadTeamGamesForSeason(season, teamMap);
    const schedule = loadSeasonSchedule(season);
    seasonData[season] = reconstructSeason(season, teamGames, schedule);
    console.log(`[calibration]   ${season}: ${seasonData[season].observations.length} games, ${seasonData[season].neutralGameIds.length} neutral-site`);
  }

  const allObs = RECONSTRUCTABLE_SEASONS.flatMap((s) => seasonData[s].observations);

  // --- HFA grid + joint fit, walk-forward per BACKTEST_SEASONS -------------
  const hfaGrid = [0, 1.5, 2.0, 2.5];
  const hfaGridResults: any[] = [];
  for (const hfa of hfaGrid) {
    const pooled: { predicted: number; actual: number }[] = [];
    const bySeason: Record<number, any> = {};
    for (const season of BACKTEST_SEASONS) {
      const trainSeasons = FITTABLE_SEASONS.filter((s) => s < season);
      const trainObs = trainSeasons.flatMap((s) => seasonData[s].observations);
      const { beta } = fitBeta(trainObs.map((o) => ({ strengthDiff: o.ratingDiff, margin: o.margin, neutralSite: o.neutralSite })), hfa);
      const rows = seasonData[season].observations.map((o) => ({
        predicted: beta * o.ratingDiff + homeFieldFor(o.neutralSite, hfa),
        actual: o.margin,
      }));
      bySeason[season] = { beta, ...summarize(rows) };
      pooled.push(...rows);
    }
    hfaGridResults.push({ hfa, pooled: summarize(pooled), bySeason });
  }

  // Jointly fit beta + HFA (2-param OLS, non-neutral games only feel HFA;
  // neutral games get an explicit 0 column so HFA is never applied there).
  const jointFitBySeason: Record<number, any> = {};
  const jointPooled: { predicted: number; actual: number }[] = [];
  for (const season of BACKTEST_SEASONS) {
    const trainSeasons = FITTABLE_SEASONS.filter((s) => s < season);
    const trainObs = trainSeasons.flatMap((s) => seasonData[s].observations);
    const [beta, hfa] = olsFit(trainObs, [(o) => o.ratingDiff, (o) => (o.neutralSite ? 0 : 1)]);
    const rows = seasonData[season].observations.map((o) => ({
      predicted: beta * o.ratingDiff + (o.neutralSite ? 0 : hfa),
      actual: o.margin,
    }));
    jointFitBySeason[season] = { beta, hfa, ...summarize(rows) };
    jointPooled.push(...rows);
  }

  // Pick best fixed-grid HFA by pooled out-of-sample MAE.
  const bestGrid = [...hfaGridResults].sort((a, b) => a.pooled.mae - b.pooled.mae)[0];

  // --- Intercept test at bestGrid.hfa ---------------------------------------
  const interceptBySeason: Record<number, any> = {};
  const interceptPooled: { predicted: number; actual: number }[] = [];
  for (const season of BACKTEST_SEASONS) {
    const trainSeasons = FITTABLE_SEASONS.filter((s) => s < season);
    const trainObs = trainSeasons.flatMap((s) => seasonData[s].observations);
    // beta + intercept, HFA fixed at bestGrid.hfa and subtracted from target first
    const [beta, intercept] = olsFit(
      trainObs.map((o) => ({ ...o, margin: o.margin - homeFieldFor(o.neutralSite, bestGrid.hfa) })),
      [(o) => o.ratingDiff, () => 1]
    );
    const rows = seasonData[season].observations.map((o) => ({
      predicted: beta * o.ratingDiff + intercept + homeFieldFor(o.neutralSite, bestGrid.hfa),
      actual: o.margin,
    }));
    interceptBySeason[season] = { beta, intercept, ...summarize(rows) };
    interceptPooled.push(...rows);
  }

  // --- Rating-difference bucket calibration (pooled BACKTEST_SEASONS, using bestGrid model) ---
  const bestGridBySeason = bestGrid.bySeason;
  const bestGridBetaBySeason: Record<number, number> = {};
  for (const s of BACKTEST_SEASONS) bestGridBetaBySeason[s] = bestGridBySeason[s].beta;
  const backtestObsWithPred = BACKTEST_SEASONS.flatMap((season) =>
    seasonData[season].observations.map((o) => ({
      ...o,
      predicted: bestGridBetaBySeason[season] * o.ratingDiff + homeFieldFor(o.neutralSite, bestGrid.hfa),
    }))
  );
  const bucketEdges = [0, 3, 6, 10, 16, Infinity];
  const bucketLabels = ["very close (0-3)", "small (3-6)", "moderate (6-10)", "large (10-16)", "very large (16+)"];
  const buckets = bucketLabels.map((label, i) => {
    const rows = backtestObsWithPred.filter((o) => Math.abs(o.ratingDiff) >= bucketEdges[i] && Math.abs(o.ratingDiff) < bucketEdges[i + 1]);
    if (rows.length === 0) return { label, n: 0 };
    // Oriented toward the team the MODEL favors, so signed averages don't cancel
    // out across home-favored and away-favored games in the same bucket.
    const avgAbsDiff = rows.reduce((s, r) => s + Math.abs(r.ratingDiff), 0) / rows.length;
    const avgPredicted = rows.reduce((s, r) => s + Math.abs(r.predicted), 0) / rows.length;
    const avgActual = rows.reduce((s, r) => s + Math.sign(r.predicted || 1) * r.margin, 0) / rows.length;
    const mae = rows.reduce((s, r) => s + Math.abs(r.predicted - r.margin), 0) / rows.length;
    const bias = rows.reduce((s, r) => s + (r.predicted - r.margin), 0) / rows.length;
    return { label, n: rows.length, avgAbsRatingDiff: avgAbsDiff, avgPredictedMargin: avgPredicted, avgActualMargin: avgActual, mae, bias };
  });

  // --- Linearity diagnostic: quadratic term d*|d| added, in-sample only ---
  const [linBeta] = olsFit(backtestObsWithPred.map((o) => ({ ...o, margin: o.margin - homeFieldFor(o.neutralSite, bestGrid.hfa) })), [(o) => o.ratingDiff]);
  const [quadBeta, quadGamma] = olsFit(
    backtestObsWithPred.map((o) => ({ ...o, margin: o.margin - homeFieldFor(o.neutralSite, bestGrid.hfa) })),
    [(o) => o.ratingDiff, (o) => o.ratingDiff * Math.abs(o.ratingDiff)]
  );
  const linRows = backtestObsWithPred.map((o) => ({ predicted: linBeta * o.ratingDiff + homeFieldFor(o.neutralSite, bestGrid.hfa), actual: o.margin }));
  const quadRows = backtestObsWithPred.map((o) => ({
    predicted: quadBeta * o.ratingDiff + quadGamma * o.ratingDiff * Math.abs(o.ratingDiff) + homeFieldFor(o.neutralSite, bestGrid.hfa),
    actual: o.margin,
  }));
  const linearityDiagnostic = { linear: summarize(linRows), quadratic: { gamma: quadGamma, ...summarize(quadRows) } };

  // --- Early-season breakdown (Games 1-2 / 3-5 / 6+) using minGamesPlayed ---
  function stageOf(minGames: number): string {
    if (minGames <= 2) return "games1-2";
    if (minGames <= 5) return "games3-5";
    return "games6plus";
  }
  const stages = ["games1-2", "games3-5", "games6plus"];
  const stageResults: Record<string, any> = {};
  for (const stage of stages) {
    const rows = backtestObsWithPred.filter((o) => stageOf(o.minGamesPlayed) === stage);
    if (rows.length === 0) { stageResults[stage] = { n: 0 }; continue; }
    stageResults[stage] = summarize(rows.map((r) => ({ predicted: r.predicted, actual: r.margin })));
    // Diagnostic-only stage-specific beta (report only, not adopted)
    const [stageBeta] = olsFit(rows.map((o) => ({ ...o, margin: o.margin - homeFieldFor(o.neutralSite, bestGrid.hfa) })), [(o) => o.ratingDiff]);
    stageResults[stage].n = rows.length;
    stageResults[stage].diagnosticBeta = stageBeta;
  }

  // --- Compare against existing nfl-spread-v0.1.0 on the SAME games -------
  console.log("[calibration] loading existing nfl-spread-v0.1.0 dataset for comparison...");
  const existingDataset = loadSpreadDataset(ROOT);
  const existingComparisonBySeason: Record<number, any> = {};
  const existingPooled: { predicted: number; actual: number }[] = [];
  const ourPooledForComparison: { predicted: number; actual: number }[] = [];
  for (const season of BACKTEST_SEASONS) {
    const { beta: existingBeta } = existingDataset.betaFor(season);
    const existingObsByGame = new Map((existingDataset.observationsBySeason.get(season) ?? []).map((o: any) => [o.gameId, o]));
    const neutralSet = new Set(seasonData[season].neutralGameIds);
    const ourRows: any[] = [];
    const existingRows: any[] = [];
    for (const o of seasonData[season].observations) {
      const ex = existingObsByGame.get(o.gameId);
      if (!ex) continue; // only compare on games present in both feature sets
      const neutral = neutralSet.has(o.gameId);
      ourRows.push({
        predicted: bestGridBetaBySeason[season] * o.ratingDiff + homeFieldFor(neutral, bestGrid.hfa),
        actual: o.margin,
      });
      existingRows.push({
        predicted: existingBeta * (ex as any).strengthDiff + homeFieldFor(neutral, SPREAD_HFA_POINTS),
        actual: o.margin,
      });
    }
    existingComparisonBySeason[season] = {
      n: ourRows.length,
      ovrModel: summarize(ourRows),
      existingSpreadModel: summarize(existingRows),
    };
    ourPooledForComparison.push(...ourRows);
    existingPooled.push(...existingRows);
  }
  const existingComparisonPooled = {
    ovrModel: summarize(ourPooledForComparison),
    existingSpreadModel: summarize(existingPooled),
  };

  // --- Market benchmark (best-effort network fetch of nflverse games.csv) -
  console.log("[calibration] attempting historical market fetch (nflverse games.csv)...");
  const marketByGameId = await fetchHistoricalMarket();
  let marketBenchmark: any = null;
  if (marketByGameId) {
    const marketRows: { predicted: number; actual: number }[] = [];
    let atsCorrect = 0, atsTotal = 0, atsCorrectModel = 0;
    for (const season of BACKTEST_SEASONS) {
      for (const o of seasonData[season].observations) {
        const spreadLine = marketByGameId.get(o.gameId);
        if (spreadLine === undefined) continue;
        marketRows.push({ predicted: spreadLine, actual: o.margin });
        const modelPredicted = bestGridBetaBySeason[season] * o.ratingDiff + homeFieldFor(o.neutralSite, bestGrid.hfa);
        const actualVsLine = o.margin - spreadLine;
        if (actualVsLine !== 0) {
          atsTotal += 1;
          const modelVsLine = modelPredicted - spreadLine;
          if (Math.sign(modelVsLine) === Math.sign(actualVsLine)) atsCorrectModel += 1;
        }
      }
    }
    marketBenchmark = {
      n: marketRows.length,
      market: summarize(marketRows),
      modelAtsAccuracyVsMarketLine: atsTotal > 0 ? atsCorrectModel / atsTotal : null,
      atsSampleSize: atsTotal,
    };
  } else {
    console.log("[calibration] market fetch failed/unavailable — skipping market benchmark");
  }

  const results = {
    generatedAt: new Date().toISOString(),
    seasons: { reconstructable: RECONSTRUCTABLE_SEASONS, fittable: FITTABLE_SEASONS, backtest: BACKTEST_SEASONS },
    gameCounts: Object.fromEntries(RECONSTRUCTABLE_SEASONS.map((s) => [s, seasonData[s].observations.length])),
    neutralSiteGames: Object.fromEntries(RECONSTRUCTABLE_SEASONS.map((s) => [s, seasonData[s].neutralGameIds])),
    hfaGrid: hfaGridResults,
    bestGridHfa: bestGrid.hfa,
    jointFit: { bySeason: jointFitBySeason, pooled: summarize(jointPooled) },
    intercept: { bySeason: interceptBySeason, pooled: summarize(interceptPooled), hfaUsed: bestGrid.hfa },
    bucketCalibration: buckets,
    linearityDiagnostic,
    stageResults,
    existingModelComparison: { bySeason: existingComparisonBySeason, pooled: existingComparisonPooled },
    marketBenchmark,
  };

  writeFileSync(join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
  console.log(`[calibration] wrote ${join(OUT_DIR, "results.json")}`);

  console.log("\n=== SUMMARY ===");
  console.log("HFA grid (pooled out-of-sample MAE):", hfaGridResults.map((r) => `${r.hfa}=${r.pooled.mae.toFixed(3)}`).join(", "));
  console.log("Best fixed-grid HFA:", bestGrid.hfa, "MAE:", bestGrid.pooled.mae.toFixed(3));
  console.log("Joint-fit (pooled):", JSON.stringify(jointFitBySeason, null, 2));
  console.log("Intercept model (pooled):", results.intercept.pooled);
  console.log("No-intercept model (bestGrid, pooled):", bestGrid.pooled);
  console.log("Existing model comparison (pooled):", JSON.stringify(existingComparisonPooled, null, 2));
  if (marketBenchmark) console.log("Market benchmark (pooled):", JSON.stringify(marketBenchmark, null, 2));
}

main().catch((err) => {
  console.error("[calibration] FAILED:", err);
  process.exit(1);
});
