/**
 * NFL AI Picks v2, WU1 -- file loader for the deterministic form facts
 * (nfl-team-form-facts.ts). Reads only existing, already-maintained artifacts:
 *
 *   public/data/nfl/<season>/games.json                              schedule + kickoff
 *   public/data/nfl/<season>/results.json                            final scores
 *   data/nfl/nflverse/performance-team-game/performance_team_game_<season>.csv   EPA / success / explosive / sacks (PBP)
 *   data/nfl/nflverse/stats-team-week-current/stats_team_week_<season>.csv       yards / plays / turnovers (official team stats)
 *
 * No network, no writes, no generated artifact. See nfl-team-form-facts.ts for
 * every metric definition.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeNflTeamAbbr } from "../../src/lib/nfl/identity/identity";
import { sourceRef, type ProvenanceSourceRef } from "./nfl-full-game-context";
import { parsePerformanceCompactRow } from "./nfl-performance-metrics-core.mjs";
import { parseCsv } from "./nfl-schedules-results-core.mjs";
import {
  buildTeamFormFacts,
  type FormGameResult,
  type FormPerformanceRow,
  type FormPlaySums,
  type FormScheduleGame,
  type FormTeamWeekRow,
  type TeamFormFacts,
} from "./nfl-team-form-facts";

type CsvRecord = Record<string, string>;

/** Current-season cache first, then the historical cache (same schema). */
const TEAM_WEEK_DIRECTORIES = ["stats-team-week-current", "stats-team-week"] as const;

function readText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function readJson<T>(path: string): T | null {
  const text = readText(path);
  return text == null ? null : (JSON.parse(text) as T);
}

function toNumber(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTeam(value: string): string {
  return normalizeNflTeamAbbr(value) ?? value.toLowerCase();
}

export function parseFormPerformanceRows(csvText: string): FormPerformanceRow[] {
  return (parseCsv(csvText) as CsvRecord[]).map((record) => {
    const row = parsePerformanceCompactRow(record);
    const all = row.all as FormPlaySums;
    return { gameId: row.gameId as string, team: normalizeTeam(row.team as string), all };
  });
}

export function parseFormTeamWeekRows(csvText: string): FormTeamWeekRow[] {
  return (parseCsv(csvText) as CsvRecord[])
    .filter((r) => r.season_type === "REG")
    .map((r) => ({
      gameId: r.game_id,
      team: normalizeTeam(r.team),
      attempts: toNumber(r.attempts),
      carries: toNumber(r.carries),
      sacksSuffered: toNumber(r.sacks_suffered),
      passingYards: toNumber(r.passing_yards),
      rushingYards: toNumber(r.rushing_yards),
      passingInterceptions: toNumber(r.passing_interceptions),
      sackFumblesLost: toNumber(r.sack_fumbles_lost),
      rushingFumblesLost: toNumber(r.rushing_fumbles_lost),
      receivingFumblesLost: toNumber(r.receiving_fumbles_lost),
    }));
}

interface GamesFile {
  games: { gameId: string; season: number; week: number; seasonType: string; dateUtc: string; homeAbbr: string; awayAbbr: string; neutralSite: boolean | null }[];
}

interface ResultsFile {
  results: { gameId: string; homeAbbr: string; awayAbbr: string; homeScore: number | null; awayScore: number | null; final: boolean }[];
}

export interface LoadedMatchupFormFacts {
  status: "ok";
  home: TeamFormFacts;
  away: TeamFormFacts;
  sources: ProvenanceSourceRef[];
}

export type LoadMatchupFormFactsResult = LoadedMatchupFormFacts | { status: "error"; reason: "unknown_game" | "missing_schedule_or_results" };

export function loadMatchupFormFacts(input: { root: string; season: number; gameId: string }): LoadMatchupFormFactsResult {
  const { root, season, gameId } = input;
  const gamesPath = `public/data/nfl/${season}/games.json`;
  const resultsPath = `public/data/nfl/${season}/results.json`;
  const games = readJson<GamesFile>(join(root, gamesPath));
  const results = readJson<ResultsFile>(join(root, resultsPath));
  if (!games || !results) return { status: "error", reason: "missing_schedule_or_results" };

  const schedule: FormScheduleGame[] = games.games.map((g) => ({
    gameId: g.gameId,
    season: g.season,
    week: g.week,
    seasonType: g.seasonType,
    kickoffUtc: g.dateUtc,
    homeAbbr: normalizeTeam(g.homeAbbr),
    awayAbbr: normalizeTeam(g.awayAbbr),
    neutralSite: g.neutralSite ?? null,
  }));
  const matchup = schedule.find((g) => g.gameId === gameId);
  if (!matchup) return { status: "error", reason: "unknown_game" };

  const formResults: FormGameResult[] = results.results.map((r) => ({
    gameId: r.gameId,
    homeAbbr: normalizeTeam(r.homeAbbr),
    awayAbbr: normalizeTeam(r.awayAbbr),
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    final: r.final === true,
  }));

  const sources: ProvenanceSourceRef[] = [
    sourceRef("games", gamesPath, games, null),
    sourceRef("results", resultsPath, results, null),
  ];

  const performancePath = `data/nfl/nflverse/performance-team-game/performance_team_game_${season}.csv`;
  const performanceText = readText(join(root, performancePath));
  const performance = performanceText ? parseFormPerformanceRows(performanceText) : [];
  if (performanceText) sources.push(sourceRef("performance-team-game", performancePath, performanceText, null));

  let teamWeek: FormTeamWeekRow[] = [];
  for (const directory of TEAM_WEEK_DIRECTORIES) {
    const teamWeekPath = `data/nfl/nflverse/${directory}/stats_team_week_${season}.csv`;
    const text = readText(join(root, teamWeekPath));
    if (!text) continue;
    teamWeek = parseFormTeamWeekRows(text);
    sources.push(sourceRef("stats-team-week", teamWeekPath, text, null));
    break;
  }

  const shared = {
    matchup: { gameId: matchup.gameId, season: matchup.season, week: matchup.week, kickoffUtc: matchup.kickoffUtc },
    games: schedule,
    results: formResults,
    performance,
    teamWeek,
  };
  return {
    status: "ok",
    home: buildTeamFormFacts({ ...shared, team: matchup.homeAbbr }),
    away: buildTeamFormFacts({ ...shared, team: matchup.awayAbbr }),
    sources,
  };
}
