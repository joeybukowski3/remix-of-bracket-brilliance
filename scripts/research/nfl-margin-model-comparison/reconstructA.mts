/**
 * RESEARCH-ONLY. Method A (JKB Power Rating fair spread) historical
 * reconstruction, 2023-2025 REG.
 *
 * Method lifted verbatim from
 * scripts/analysis/nfl-current-ovr-spread-calibration/calibrate.mts's
 * reconstructSeason -- the repo's own leakage-free walk-forward Current OVR
 * reconstruction. Nothing here is wired into production.
 */
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCsv, buildNflverseTeamMap } from "../../lib/nfl-schedules-results-core.mjs";
import { aggregateSeason } from "../../lib/nfl-performance-metrics-core.mjs";
import { buildWindowInput } from "../../generate-nfl-team-performance-analytics.mts";
import { deriveTeamPerformanceMetrics } from "../../../src/lib/nfl/performanceMetricsCore2026.ts";
import { buildPerformanceRatingBoard, type TeamPerformanceSeasonEntry } from "../../../src/lib/nfl/performanceComposite2026.ts";
import { currentRatingWeightsFor, blendCurrentRating, clampRating } from "../../../src/lib/nfl/currentRating2026.ts";
import { GAME_COMPLETION_MS } from "../../lib/nfl-spread-model.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const NEUTRAL_SITE_STADIUM_KEYWORDS = [
  "tottenham", "wembley", "allianz arena", "corinthians", "estadio", "azteca",
  "camp nou", "bernabeu", "santiago bernab", "croke park", "aviva stadium", "twickenham",
  "deutsche bank park", "olympiastadion",
];

const isFin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const readJson = (p: string): any => JSON.parse(readFileSync(p, "utf-8"));

export type MethodAObservation = {
  gameId: string; season: number; week: number;
  homeAbbr: string; awayAbbr: string; neutralSite: boolean;
  ovrHome: number; ovrAway: number; ratingDiff: number;
  gamesPlayedHome: number; gamesPlayedAway: number; minGamesPlayed: number;
  homeScore: number; awayScore: number; margin: number;
};

function loadTeamGamesForSeason(season: number, teamMap: Map<string, { abbr: string }>) {
  const path = join(ROOT, "data", "nfl", "backtest-2026", "raw", `pbp_${season}_reg_trimmed.csv`);
  return aggregateSeason(parseCsv(readFileSync(path, "utf-8")), { season, teamMap });
}

function loadSeasonSchedule(season: number) {
  const dir = join(ROOT, "public", "data", "nfl", String(season));
  return {
    games: readJson(join(dir, "games.json")).games ?? [],
    results: readJson(join(dir, "results.json")).results ?? [],
    preseason: readJson(join(dir, "preseason-power-ratings.json")),
  };
}

function detectNeutralGames(games: any[]): Set<string> {
  const neutral = new Set<string>();
  for (const g of games) {
    const stadium = String(g.stadium ?? "").toLowerCase();
    if (NEUTRAL_SITE_STADIUM_KEYWORDS.some((kw) => stadium.includes(kw))) neutral.add(g.gameId);
  }
  return neutral;
}

function reconstructSeason(season: number, teamGames: any[], schedule: ReturnType<typeof loadSeasonSchedule>): MethodAObservation[] {
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
      const eligible = rows.filter((r: any) => {
        const kickoff = kickoffByGameId.get(r.gameId);
        return kickoff !== undefined && kickoff + GAME_COMPLETION_MS <= cutoffMs;
      });
      gamesPlayedByTeam.set(team, eligible.length);
      sampleGameIdsByTeam.set(team, eligible.map((r: any) => r.gameId));
      if (eligible.length === 0) continue;
      const metrics = deriveTeamPerformanceMetrics(buildWindowInput(team, eligible, rowsByGameTeam));
      const margins = eligible.map((r: any) => {
        const res = finalByGameId.get(r.gameId);
        if (!res) return 0;
        return res.homeAbbr === team ? res.homeScore - res.awayScore : res.awayScore - res.homeScore;
      });
      entries.push({
        team, metrics,
        opponents: eligible.map((r: any) => r.opponent),
        pointDifferentialPerGame: margins.reduce((s: number, m: number) => s + m, 0) / margins.length,
      });
    }
    const board = entries.length > 0 ? buildPerformanceRatingBoard(entries) : { rows: [] as any[] };
    const byTeam = new Map<string, { performanceRating: number | null; gamesPlayed: number; sampleGameIds: string[] }>();
    for (const team of rowsByTeam.keys()) {
      const row = board.rows.find((r: any) => r.team === team);
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
    const state = boardAt(cutoffMs).get(team);
    const gamesPlayed = state?.gamesPlayed ?? 0;
    const weights = currentRatingWeightsFor(gamesPlayed);
    const preseasonRow: any = preseasonByAbbr.get(team);
    if (!preseasonRow) throw new Error(`missing preseason row for ${team} season ${season}`);
    if (weights.performanceWeight > 0) {
      const pr = state?.performanceRating;
      if (!isFin(pr)) throw new Error(`${team} ${season}: gamesPlayed=${gamesPlayed} but performanceRating missing`);
      return { rating: blendCurrentRating(preseasonRow.publicRating, pr, weights), gamesPlayed, sampleGameIds: state?.sampleGameIds ?? [] };
    }
    return { rating: clampRating(preseasonRow.publicRating), gamesPlayed, sampleGameIds: state?.sampleGameIds ?? [] };
  }

  const neutralGameIds = detectNeutralGames(games);
  const observations: MethodAObservation[] = [];
  for (const g of games) {
    if (g.seasonType !== "REG") continue;
    const res = finalByGameId.get(g.gameId);
    if (!res) continue;
    const cutoffMs = kickoffByGameId.get(g.gameId);
    if (cutoffMs === undefined) continue;
    const home = ovrAt(res.homeAbbr, cutoffMs);
    const away = ovrAt(res.awayAbbr, cutoffMs);
    if (home.sampleGameIds.includes(g.gameId) || away.sampleGameIds.includes(g.gameId)) {
      throw new Error(`${g.gameId}: target game leaked into its own feature sample`);
    }
    observations.push({
      gameId: g.gameId, season, week: g.week,
      homeAbbr: res.homeAbbr, awayAbbr: res.awayAbbr,
      neutralSite: neutralGameIds.has(g.gameId),
      ovrHome: home.rating, ovrAway: away.rating, ratingDiff: home.rating - away.rating,
      gamesPlayedHome: home.gamesPlayed, gamesPlayedAway: away.gamesPlayed,
      minGamesPlayed: Math.min(home.gamesPlayed, away.gamesPlayed),
      homeScore: res.homeScore, awayScore: res.awayScore,
      margin: res.homeScore - res.awayScore,
    });
  }
  return observations;
}

export function reconstructMethodA(seasons: readonly number[]): Map<number, MethodAObservation[]> {
  const teamMap = buildNflverseTeamMap(readJson(join(ROOT, "public", "data", "nfl", "teams.json")));
  const out = new Map<number, MethodAObservation[]>();
  for (const season of seasons) {
    process.stderr.write(`[A] reconstructing ${season}...\n`);
    out.set(season, reconstructSeason(season, loadTeamGamesForSeason(season, teamMap), loadSeasonSchedule(season)));
    process.stderr.write(`[A]   ${season}: ${out.get(season)!.length} games\n`);
  }
  return out;
}
