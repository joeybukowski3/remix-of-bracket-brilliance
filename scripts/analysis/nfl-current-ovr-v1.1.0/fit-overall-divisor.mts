/**
 * ANALYSIS-ONLY. Refits the OVERALL performance-composite scale divisor for
 * nfl-current-ovr-v1.1.0 (40/20/40 weights + leave-one-out opponent adjustment).
 *
 * Why a refit: the v1.0.0 divisor (0.7224159319378768) maps the 40/40/20
 * composite onto the public 50 +/- 15 scale. The 40/20/40 composite is wider,
 * so keeping that constant would silently widen every public rating. The task
 * rule "rating scale unchanged" is honoured by preserving the calibration the
 * old divisor had, not the literal constant:
 *
 *   new divisor = old divisor x SD(new composite) / SD(old composite)
 *
 * where each SD is the pooled population standard deviation of the overall
 * composite over the same 96 full-season team-seasons (2023-2025, 32 teams x 3),
 * each season standardized by the production board itself. The OLD composite
 * comes from the frozen legacy copy (scripts/analysis/
 * nfl-current-ovr-spread-calibration/legacy-performance-composite-v1.0.0.ts),
 * the NEW one from the production module.
 *
 * Inputs: raw trimmed nflverse play-by-play 2023-2025 (gitignored;
 * $NFL_PBP_RAW_DIR, default data/nfl/backtest-2026/raw) + public results.json.
 *
 * Run: NFL_PBP_RAW_DIR=... npx tsx scripts/analysis/nfl-current-ovr-v1.1.0/fit-overall-divisor.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv, buildNflverseTeamMap } from "../../lib/nfl-schedules-results-core.mjs";
import { aggregateSeason } from "../../lib/nfl-performance-metrics-core.mjs";
import { buildWindowInput } from "../../generate-nfl-team-performance-analytics.mts";
import { deriveTeamPerformanceMetrics } from "../../../src/lib/nfl/performanceMetricsCore2026.ts";
import {
  buildPerformanceRatingBoard,
  PERFORMANCE_SCALE_DIVISORS,
  type TeamPerformanceGameEvidence,
  type TeamPerformanceSeasonEntry,
} from "../../../src/lib/nfl/performanceComposite2026.ts";
import { buildPerformanceRatingBoard as buildLegacyBoard } from "../nfl-current-ovr-spread-calibration/legacy-performance-composite-v1.0.0.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const RAW_DIR = process.env.NFL_PBP_RAW_DIR ?? join(ROOT, "data", "nfl", "backtest-2026", "raw");
const OLD_OVERALL_DIVISOR = 0.7224159319378768; // v1.0.0 constant, fitted 2026-08-18
const SEASONS = [2023, 2024, 2025];

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf-8"));
const popStd = (values: number[]) => {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
};

function loadSeason(season: number, teamMap: Map<string, { abbr: string }>) {
  const rows: any[] = aggregateSeason(parseCsv(readFileSync(join(RAW_DIR, `pbp_${season}_reg_trimmed.csv`), "utf-8")), { season, teamMap });
  const results = (readJson(join(ROOT, "public", "data", "nfl", String(season), "results.json")).results as any[]).filter((r) => r.seasonType === "REG" && r.final === true);
  const resultById = new Map(results.map((r) => [r.gameId, r]));
  const byGameTeam = new Map(rows.map((r) => [`${r.gameId}|${r.team}`, r]));
  const byTeam = new Map<string, any[]>();
  for (const row of rows) {
    if (!byTeam.has(row.team)) byTeam.set(row.team, []);
    byTeam.get(row.team)!.push(row);
  }
  const current: TeamPerformanceSeasonEntry[] = [];
  const legacy: any[] = [];
  for (const [team, teamRows] of byTeam) {
    teamRows.sort((a, b) => a.week - b.week);
    const games: TeamPerformanceGameEvidence[] = teamRows.map((row) => {
      const result = resultById.get(row.gameId);
      const opponentRow = byGameTeam.get(`${row.gameId}|${row.opponent}`);
      if (!result || !opponentRow) throw new Error(`${season} ${team} ${row.gameId}: missing result or opponent row`);
      const margin = result.homeAbbr === team ? result.homeScore - result.awayScore : result.awayScore - result.homeScore;
      return { opponent: row.opponent, margin, offense: { all: row.all, filtered: row.filtered }, defenseAllowed: { all: opponentRow.all, filtered: opponentRow.filtered } };
    });
    const metrics = deriveTeamPerformanceMetrics(buildWindowInput(team, teamRows, byGameTeam));
    current.push({ team, metrics, games });
    legacy.push({ team, metrics, opponents: games.map((g) => g.opponent), pointDifferentialPerGame: games.reduce((s, g) => s + g.margin, 0) / games.length });
  }
  return { current, legacy };
}

function main() {
  const teamMap = buildNflverseTeamMap(readJson(join(ROOT, "public", "data", "nfl", "teams.json")));
  const oldComposites: number[] = [];
  const newComposites: number[] = [];
  const perSeason: Record<number, { old: number; new: number }> = {};
  for (const season of SEASONS) {
    const { current, legacy } = loadSeason(season, teamMap);
    const newBoard = buildPerformanceRatingBoard(current);
    const oldBoard = buildLegacyBoard(legacy);
    const n = newBoard.rows.map((r) => r.overallComposite as number);
    const o = oldBoard.rows.map((r) => r.overallComposite as number);
    if ([...n, ...o].some((v) => !Number.isFinite(v))) throw new Error(`${season}: non-finite composite`);
    newComposites.push(...n);
    oldComposites.push(...o);
    perSeason[season] = { old: popStd(o), new: popStd(n) };
  }
  const oldSd = popStd(oldComposites);
  const newSd = popStd(newComposites);
  const fitted = OLD_OVERALL_DIVISOR * (newSd / oldSd);
  const result = {
    generatedFor: "nfl-current-ovr-v1.1.0",
    method: "newDivisor = oldDivisor x pooledSD(new composite) / pooledSD(old composite), 96 full-season team-seasons 2023-2025",
    teamSeasons: newComposites.length,
    oldDivisor: OLD_OVERALL_DIVISOR,
    pooledSd: { old40_40_20_onePass: oldSd, new40_20_40_leaveOneOut: newSd },
    perSeasonSd: perSeason,
    fittedOverallDivisor: fitted,
    committedOverallDivisor: PERFORMANCE_SCALE_DIVISORS.overall,
    committedMatchesFit: Math.abs(fitted - PERFORMANCE_SCALE_DIVISORS.overall) < 1e-12,
  };
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "overall-divisor-fit.json"), `${JSON.stringify(result, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify(result, null, 2));
}

main();
