/**
 * Phase H -- candidate residual-research features. Each candidate reuses
 * the same strictly-prior season-prior->priorSeason coalesce as the core
 * model (src/lib/nfl/research/total/genericWindow.ts) so it carries the
 * same leakage guarantees. These are NOT part of the core ridge (Phase E)
 * and are never auto-promoted -- see evaluate.ts's residual-feature
 * section for the independent + combined tests that decide promote/reject.
 */
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import { aggregateGenericWindow, buildGenericIndex, type GenericIndex } from "@/lib/nfl/research/total/genericWindow";
import type { NflTotalResearchCutoff } from "@/lib/nfl/research/total/types";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./loadData";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

type EpaRow = { season: number; week: number; team: string; opponent: string; passEpa: number; passPlays: number; rushEpa: number; rushPlays: number };

function loadEpaTeamGameSeason(season: number): EpaRow[] {
  const path = join(ROOT, "data", "nfl", "nflverse", "epa-team-game", `epa_team_game_${season}.csv`);
  if (!existsSync(path)) return [];
  const raw = parseCsv(readFileSync(path, "utf-8"));
  return raw.map((r) => ({
    season: Number(r.season),
    week: Number(r.week),
    team: normalizeNflTeamAbbr(r.team)!,
    opponent: normalizeNflTeamAbbr(r.opponent)!,
    passEpa: Number(r.pass_epa),
    passPlays: Number(r.pass_plays),
    rushEpa: Number(r.rush_epa),
    rushPlays: Number(r.rush_plays),
  }));
}

type PlayVolumeRow = { season: number; week: number; team: string; opponent: string; eligiblePlays: number; passPlays: number };

function loadPlayVolumeSeasonRaw(season: number): PlayVolumeRow[] {
  const path = join(ROOT, "data", "nfl", "nflverse", "play-volume-team-game", `play_volume_team_game_${season}.csv`);
  if (!existsSync(path)) return [];
  const raw = parseCsv(readFileSync(path, "utf-8"));
  return raw.map((r) => ({
    season: Number(r.season),
    week: Number(r.week),
    team: normalizeNflTeamAbbr(r.team)!,
    opponent: normalizeNflTeamAbbr(r.opponent)!,
    eligiblePlays: Number(r.eligible_plays),
    passPlays: Number(r.pass_plays),
  }));
}

type StatsRow = { season: number; week: number; team: string; opponent: string; giveaways: number; sacksSuffered: number };

function loadStatsSeasonRaw(season: number): StatsRow[] {
  const path = join(ROOT, "data", "nfl", "nflverse", "stats-team-week", `stats_team_week_${season}.csv`);
  if (!existsSync(path)) return [];
  const raw = parseCsv(readFileSync(path, "utf-8")).filter((r) => r.season_type === "REG");
  return raw.map((r) => ({
    season: Number(r.season),
    week: Number(r.week),
    team: normalizeNflTeamAbbr(r.team)!,
    opponent: normalizeNflTeamAbbr(r.opponent_team)!,
    giveaways: (Number(r.passing_interceptions) || 0) + (Number(r.fumbles_lost_total) || 0),
    sacksSuffered: Number(r.sacks_suffered) || 0,
  }));
}

export type ResidualFeatureIndexes = {
  passEpaIndex: GenericIndex;
  rushEpaIndex: GenericIndex;
  dropbackRateIndex: GenericIndex;
  paceIndex: GenericIndex;
  giveawayIndex: GenericIndex;
  sacksAllowedIndex: GenericIndex;
};

export function buildResidualFeatureIndexes(seasons: readonly number[]): ResidualFeatureIndexes {
  const epaRows = seasons.flatMap(loadEpaTeamGameSeason);
  const playVolumeRows = seasons.flatMap(loadPlayVolumeSeasonRaw);
  const statsRows = seasons.flatMap(loadStatsSeasonRaw);

  return {
    passEpaIndex: buildGenericIndex(epaRows, (r) => ({ numerator: r.passEpa, denominator: r.passPlays })),
    rushEpaIndex: buildGenericIndex(epaRows, (r) => ({ numerator: r.rushEpa, denominator: r.rushPlays })),
    dropbackRateIndex: buildGenericIndex(playVolumeRows, (r) => ({ numerator: r.passPlays, denominator: r.eligiblePlays })),
    paceIndex: buildGenericIndex(playVolumeRows, (r) => ({ numerator: r.eligiblePlays, denominator: 1 })),
    giveawayIndex: buildGenericIndex(statsRows, (r) => ({ numerator: r.giveaways, denominator: 1 })),
    sacksAllowedIndex: buildGenericIndex(statsRows, (r) => ({ numerator: r.sacksSuffered, denominator: 1 })),
  };
}

export type ResidualCandidateName =
  | "passMatchupDiff"
  | "rushMatchupDiff"
  | "dropbackRate"
  | "paceProxy"
  | "turnoverGiveawayRate"
  | "sacksAllowedRate";

/** Returns null when either side of the candidate is not resolvable (insufficient window) -- never zero-filled. */
export function computeResidualCandidate(
  name: ResidualCandidateName,
  indexes: ResidualFeatureIndexes,
  team: string,
  opponent: string,
  cutoff: NflTotalResearchCutoff,
): number | null {
  switch (name) {
    case "passMatchupDiff": {
      const off = aggregateGenericWindow(indexes.passEpaIndex.byTeam.get(team) ?? [], cutoff);
      const defAllowed = aggregateGenericWindow(indexes.passEpaIndex.byOpponent.get(opponent) ?? [], cutoff);
      if (off.rate === null || defAllowed.rate === null) return null;
      return off.rate - defAllowed.rate;
    }
    case "rushMatchupDiff": {
      const off = aggregateGenericWindow(indexes.rushEpaIndex.byTeam.get(team) ?? [], cutoff);
      const defAllowed = aggregateGenericWindow(indexes.rushEpaIndex.byOpponent.get(opponent) ?? [], cutoff);
      if (off.rate === null || defAllowed.rate === null) return null;
      return off.rate - defAllowed.rate;
    }
    case "dropbackRate": {
      const own = aggregateGenericWindow(indexes.dropbackRateIndex.byTeam.get(team) ?? [], cutoff);
      return own.rate;
    }
    case "paceProxy": {
      const own = aggregateGenericWindow(indexes.paceIndex.byTeam.get(team) ?? [], cutoff);
      return own.rate;
    }
    case "turnoverGiveawayRate": {
      const own = aggregateGenericWindow(indexes.giveawayIndex.byTeam.get(team) ?? [], cutoff);
      return own.rate;
    }
    case "sacksAllowedRate": {
      const own = aggregateGenericWindow(indexes.sacksAllowedIndex.byTeam.get(team) ?? [], cutoff);
      return own.rate;
    }
    default:
      return null;
  }
}
