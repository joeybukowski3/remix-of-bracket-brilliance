/**
 * Research-only data loaders for the NFL total-model harness. Reads
 * public/data/nfl/<season>/results.json (production outcome artifact,
 * read-only) and the compact scoring-support cache this research build
 * generated (data/nfl/research/nfl-total-model/). Never reads
 * matchup-metrics.json or any other presentation artifact.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import type { NflTotalResearchGameOutcome, NflTotalResearchScoringSupportRow } from "@/lib/nfl/research/total/types";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

type RawResultRow = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
  totalPoints: number | null;
  final: boolean;
};

/** Loads completed REG-season games for one season from the production results artifact. */
export function loadSeasonOutcomes(season: number): NflTotalResearchGameOutcome[] {
  const path = join(ROOT, "public", "data", "nfl", String(season), "results.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as { results: RawResultRow[] };
  const outcomes: NflTotalResearchGameOutcome[] = [];
  for (const row of raw.results) {
    if (row.seasonType !== "REG" || row.final !== true) continue;
    if (row.homeScore == null || row.awayScore == null || row.totalPoints == null) continue;
    const homeAbbr = normalizeNflTeamAbbr(row.homeAbbr);
    const awayAbbr = normalizeNflTeamAbbr(row.awayAbbr);
    if (!homeAbbr || !awayAbbr) throw new Error(`Unresolved team code in ${season} game ${row.gameId}`);
    outcomes.push({
      gameId: row.gameId,
      season: row.season,
      week: row.week,
      seasonType: row.seasonType,
      homeAbbr,
      awayAbbr,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      totalPoints: row.totalPoints,
    });
  }
  return outcomes;
}

export function loadOutcomesForSeasons(seasons: readonly number[]): NflTotalResearchGameOutcome[] {
  return seasons.flatMap((s) => loadSeasonOutcomes(s));
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

/** Loads the research-only scoring-support cache (EPA/success/explosive sums) for one season, if present. */
export function loadScoringSupportSeason(season: number): NflTotalResearchScoringSupportRow[] {
  const path = join(ROOT, "data", "nfl", "research", "nfl-total-model", `scoring_support_team_game_${season}.csv`);
  if (!existsSync(path)) return [];
  const raw = parseCsv(readFileSync(path, "utf-8"));
  return raw.map((r) => ({
    gameId: r.game_id,
    season: Number(r.season),
    week: Number(r.week),
    team: normalizeNflTeamAbbr(r.team)!,
    opponent: normalizeNflTeamAbbr(r.opponent)!,
    eligiblePlays: Number(r.eligible_plays),
    offEpaSum: Number(r.off_epa_sum),
    successNum: Number(r.success_num),
    successDen: Number(r.success_den),
    explosiveCount: Number(r.explosive_count),
  }));
}

export function loadScoringSupportForSeasons(seasons: readonly number[]): NflTotalResearchScoringSupportRow[] {
  return seasons.flatMap((s) => loadScoringSupportSeason(s));
}

/** Loads the production play-volume-team-game cache for one season (Phase H pace/tendency candidates only). */
export function loadPlayVolumeSeason(season: number): { gameId: string; season: number; week: number; team: string; opponent: string; eligiblePlays: number; passPlays: number; rushPlays: number }[] {
  const path = join(ROOT, "data", "nfl", "nflverse", "play-volume-team-game", `play_volume_team_game_${season}.csv`);
  if (!existsSync(path)) return [];
  const raw = parseCsv(readFileSync(path, "utf-8"));
  return raw.map((r) => ({
    gameId: r.game_id,
    season: Number(r.season),
    week: Number(r.week),
    team: normalizeNflTeamAbbr(r.team)!,
    opponent: normalizeNflTeamAbbr(r.opponent)!,
    eligiblePlays: Number(r.eligible_plays),
    passPlays: Number(r.pass_plays),
    rushPlays: Number(r.rush_plays),
  }));
}

/** Loads the production stats-team-week cache for one season (Phase H turnovers/sacks candidates only). Team codes are uppercase in this source. */
export function loadStatsTeamWeekSeason(season: number): { gameId: string; season: number; week: number; team: string; opponent: string; interceptionsThrown: number; fumblesLost: number; takeawaysInterceptions: number; takeawaysFumbles: number; sacksSuffered: number; sacksGenerated: number }[] {
  const path = join(ROOT, "data", "nfl", "nflverse", "stats-team-week", `stats_team_week_${season}.csv`);
  if (!existsSync(path)) return [];
  const raw = parseCsv(readFileSync(path, "utf-8"));
  return raw
    .filter((r) => r.season_type === "REG")
    .map((r) => ({
      gameId: r.game_id,
      season: Number(r.season),
      week: Number(r.week),
      team: normalizeNflTeamAbbr(r.team)!,
      opponent: normalizeNflTeamAbbr(r.opponent_team)!,
      interceptionsThrown: Number(r.passing_interceptions) || 0,
      fumblesLost: Number(r.fumbles_lost_total) || 0,
      takeawaysInterceptions: Number(r.def_interceptions) || 0,
      takeawaysFumbles: (Number(r.fumble_recovery_opp) || 0),
      sacksSuffered: Number(r.sacks_suffered) || 0,
      sacksGenerated: Number(r.def_sacks) || 0,
    }));
}
