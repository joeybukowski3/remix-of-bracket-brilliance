import { normalizeNflTeamAbbr, resolveCanonicalPlayerIdentity, type FantasyExternalIds } from "@/lib/fantasy/weekly/identity";
import {
  calculateFullPprFantasyPoints,
  FANTASY_SCORING_VERSION,
  FULL_PPR_SCORING,
} from "@/lib/fantasy/weekly/scoring";
import { normalizeWeeklyUsage, type WeeklyFantasyUsage } from "@/lib/fantasy/weekly/usage";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

export const PLAYER_WEEK_HISTORY_SCHEMA_VERSION = "fantasy-player-week-history-v1" as const;

export type HistoricalPlayerWeek = {
  season: number;
  week: number;
  playerId: string;
  playerName: string;
  position: FantasyPosition;
  team: string;
  opponent: string;
  externalIds: FantasyExternalIds;
  actualFantasyPoints: number;
  stats: {
    passAttempts: number;
    completions: number;
    passingYards: number;
    passingTouchdowns: number;
    interceptions: number;
    rushAttempts: number;
    rushingYards: number;
    rushingTouchdowns: number;
    receptions: number;
    targets: number;
    receivingYards: number;
    receivingTouchdowns: number;
    sackFumblesLost: number;
    rushingFumblesLost: number;
    receivingFumblesLost: number;
    fumblesLost: number;
    passingTwoPointConversions: number;
    rushingTwoPointConversions: number;
    receivingTwoPointConversions: number;
    specialTeamsTouchdowns: number;
  };
  usage: WeeklyFantasyUsage;
  provenance: {
    source: "nflverse stats_player weekly" | "nflverse weekly roster eligible zero";
    sourceSeason: number;
    sourceWeek: number;
    scoringVersion: typeof FANTASY_SCORING_VERSION;
    snapSource: "nflverse/PFR snap_counts" | null;
  };
};

export type HistoricalPlayerWeekSource = Record<string, string | number | null | undefined>;

export function historicalSnapJoinKey(
  season: number,
  week: number,
  pfrId: string,
  team: string,
): string {
  const normalizedTeam = normalizeNflTeamAbbr(team);
  if (!Number.isInteger(season) || !Number.isInteger(week) || !pfrId.trim() || !normalizedTeam) {
    throw new Error("Historical snap join requires season, week, PFR ID, and team.");
  }
  return `${season}|${week}|${pfrId.trim()}|${normalizedTeam}`;
}

function requiredNumber(source: HistoricalPlayerWeekSource, key: string): number {
  const value = Number(source[key]);
  if (source[key] === "" || source[key] == null || !Number.isFinite(value) || value < 0) {
    throw new Error(`Historical player-week row has invalid ${key}.`);
  }
  return value;
}

function requiredSignedNumber(source: HistoricalPlayerWeekSource, key: string): number {
  const value = Number(source[key]);
  if (source[key] === "" || source[key] == null || !Number.isFinite(value)) {
    throw new Error(`Historical player-week row has invalid ${key}.`);
  }
  return value;
}

function optionalNumber(source: HistoricalPlayerWeekSource, key: string): number | null {
  if (source[key] === "" || source[key] == null) return null;
  const value = Number(source[key]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Historical player-week row has invalid ${key}.`);
  return value;
}

function optionalSignedNumber(source: HistoricalPlayerWeekSource, key: string): number | null {
  if (source[key] === "" || source[key] == null) return null;
  const value = Number(source[key]);
  if (!Number.isFinite(value)) throw new Error(`Historical player-week row has invalid ${key}.`);
  return value;
}

export function normalizeHistoricalPlayerWeek(
  source: HistoricalPlayerWeekSource,
  crosswalk?: { pfrId?: string | null; espnId?: string | number | null },
  snap?: { offensiveSnaps: number; snapShare: number } | null,
): HistoricalPlayerWeek | null {
  if (String(source.season_type ?? "").toUpperCase() !== "REG") return null;
  const identity = resolveCanonicalPlayerIdentity({
    gsisId: String(source.player_id ?? ""),
    pfrId: crosswalk?.pfrId,
    espnId: crosswalk?.espnId,
    playerName: String(source.player_display_name || source.player_name || ""),
    position: String(source.position ?? ""),
  });
  if (!identity.resolved) return null;

  const season = requiredNumber(source, "season");
  const week = requiredNumber(source, "week");
  const team = normalizeNflTeamAbbr(String(source.recent_team ?? ""));
  const opponent = normalizeNflTeamAbbr(String(source.opponent_team ?? ""));
  if (!team || !opponent) throw new Error("Historical player-week row has an unresolved team or opponent.");

  const passingYards = requiredSignedNumber(source, "passing_yards");
  const passAttempts = requiredNumber(source, "attempts");
  const completions = requiredNumber(source, "completions");
  const passingTouchdowns = requiredNumber(source, "passing_tds");
  const interceptions = requiredNumber(source, "interceptions");
  const rushAttempts = requiredNumber(source, "carries");
  const rushingYards = requiredSignedNumber(source, "rushing_yards");
  const rushingTouchdowns = requiredNumber(source, "rushing_tds");
  const receptions = requiredNumber(source, "receptions");
  const targets = requiredNumber(source, "targets");
  const receivingYards = requiredSignedNumber(source, "receiving_yards");
  const receivingTouchdowns = requiredNumber(source, "receiving_tds");
  const sackFumblesLost = requiredNumber(source, "sack_fumbles_lost");
  const rushingFumblesLost = requiredNumber(source, "rushing_fumbles_lost");
  const receivingFumblesLost = requiredNumber(source, "receiving_fumbles_lost");
  const fumblesLost = sackFumblesLost + rushingFumblesLost + receivingFumblesLost;
  const passingTwoPointConversions = requiredNumber(source, "passing_2pt_conversions");
  const rushingTwoPointConversions = requiredNumber(source, "rushing_2pt_conversions");
  const receivingTwoPointConversions = requiredNumber(source, "receiving_2pt_conversions");
  const specialTeamsTouchdowns = requiredNumber(source, "special_teams_tds");

  const actualFantasyPoints = calculateFullPprFantasyPoints({
    passingYards: Math.max(0, passingYards), passingTouchdowns, interceptions,
    rushingYards: Math.max(0, rushingYards), rushingTouchdowns,
    receptions, receivingYards: Math.max(0, receivingYards), receivingTouchdowns, fumblesLost,
    passingTwoPointConversions, rushingTwoPointConversions, receivingTwoPointConversions,
    specialTeamsTouchdowns,
  }) +
    Math.min(0, passingYards) * FULL_PPR_SCORING.passingYard +
    Math.min(0, rushingYards) * FULL_PPR_SCORING.rushingYard +
    Math.min(0, receivingYards) * FULL_PPR_SCORING.receivingYard;

  return {
    season,
    week,
    playerId: identity.identity.playerId,
    playerName: identity.identity.playerName,
    position: identity.identity.position,
    team,
    opponent,
    externalIds: identity.identity.externalIds,
    actualFantasyPoints,
    stats: {
      passAttempts, completions, passingYards, passingTouchdowns, interceptions,
      rushAttempts, rushingYards, rushingTouchdowns, receptions, targets,
      receivingYards, receivingTouchdowns, sackFumblesLost, rushingFumblesLost,
      receivingFumblesLost, fumblesLost, passingTwoPointConversions,
      rushingTwoPointConversions, receivingTwoPointConversions, specialTeamsTouchdowns,
    },
    usage: normalizeWeeklyUsage({
      offensiveSnaps: snap?.offensiveSnaps ?? null,
      snapShare: snap?.snapShare ?? null,
      passAttempts,
      completions,
      rushAttempts,
      targets,
      receptions,
      receivingAirYards: optionalSignedNumber(source, "receiving_air_yards"),
      targetShare: optionalNumber(source, "target_share"),
      airYardsShare: optionalSignedNumber(source, "air_yards_share"),
    }),
    provenance: {
      source: "nflverse stats_player weekly",
      sourceSeason: season,
      sourceWeek: week,
      scoringVersion: FANTASY_SCORING_VERSION,
      snapSource: snap ? "nflverse/PFR snap_counts" : null,
    },
  };
}
