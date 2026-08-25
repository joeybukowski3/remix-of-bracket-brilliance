import {
  CFB_CONFERENCES,
  CFB_CONFERENCE_ORDER,
  getConferenceBySlug,
  getConferenceMeta,
} from "./conferences";
import { getCfbTeamLogoUrl } from "./logos";
import {
  CFB_FBS_TEAM_COUNT,
  CFB_TEAM_METADATA,
  getTeamMetadataById,
  getTeamMetadataBySlug,
} from "./teamMetadata";
import {
  CFB_CONTEXT_BY_TEAM,
  CFB_GAMES_2026,
  CFB_GAMES_BY_ID,
  CFB_RECORDS_BY_TEAM,
  CFB_V1_MODEL_VERSION,
  CFB_V1_RATINGS_BY_TEAM,
  CFB_STATS_BY_TEAM,
  getGamesForTeam,
  getGamesByWeek,
} from "./season2026";
import type {
  CfbConferenceId,
  CfbDataProvenance,
  CfbGame,
  CfbTeam,
  CfbTeamMetadata,
} from "./types";

export * from "./types";
export * from "./conferences";
export * from "./logos";
export {
  CFB_FBS_TEAM_COUNT,
  CFB_TEAM_METADATA,
  getTeamMetadataById,
  getTeamMetadataBySlug,
} from "./teamMetadata";
export {
  CFB_GAMES_2026,
  CFB_GAMES_BY_ID,
  getGamesByWeek,
  getGamesForTeam,
} from "./season2026";

export const CFB_SEASON = 2026;

export const CFB_PROVENANCE: CfbDataProvenance = {
  season: CFB_SEASON,
  phase: "preseason",
  label: "2026 Preseason",
  ratingsSource: "generated-v1.1-market-anchor",
  scheduleSource: "live",
  statsSource: "unavailable",
  rosterSource: "unavailable",
  oddsSource: "api",
  generatedAt: "2026-08-10T00:00:00.000Z",
  notes: [
    `JKB Preseason Power Ratings use ${CFB_V1_MODEL_VERSION}.`,
    "Schedule is sourced from the authenticated 2026 CFBD cache.",
    "Eight Pac-12 schedules remain provisional until the Week 13 flex opponents are assigned.",
    "SOS Played is null until games are completed.",
    "Season statistics are unavailable in preseason.",
    "Model projections (power line, win probability) are intentionally null.",
    "Ratings are descriptive team-strength summaries, not betting predictions or picks.",
    "Market odds are sourced from the authenticated CFBD /lines endpoint (DraftKings/Bovada per game); not every game has posted odds, and coverage/provider mix changes as sportsbooks update lines.",
  ],
};

function emptyRatings(teamId: string) {
  return {
    teamId,
    jkbRank: null,
    previousJkbRank: null,
    apRank: null,
    jkbPowerRating: null,
    offensiveRating: null,
    defensiveRating: null,
    sosPlayedRating: null,
    sosPlayedRank: null,
    sosRemainingRating: null,
    sosRemainingRank: null,
  };
}

function emptyRecord(teamId: string) {
  return {
    teamId,
    wins: 0,
    losses: 0,
    ties: 0,
    conferenceWins: 0,
    conferenceLosses: 0,
    conferenceTies: 0,
    atsWins: null,
    atsLosses: null,
    overs: null,
    unders: null,
  };
}

function emptyContext(teamId: string) {
  return {
    teamId,
    headCoach: null,
    headCoachYear: null,
    startingQuarterback: null,
    returningQuarterback: null,
    returningOffensiveStarters: null,
    returningDefensiveStarters: null,
  };
}

function emptyStats(teamId: string) {
  return {
    teamId,
    pointsPerGame: null,
    yardsPerPlay: null,
    rushYardsPerGame: null,
    yardsPerRush: null,
    passYardsPerGame: null,
    yardsPerPass: null,
    turnovers: null,
    pointsAllowedPerGame: null,
    yardsPerPlayAllowed: null,
    rushYardsAllowedPerGame: null,
    yardsPerRushAllowed: null,
    passYardsAllowedPerGame: null,
    yardsPerPassAllowed: null,
    takeaways: null,
  };
}

/** Compose layered data into a UI-facing team object. */
export function composeTeam(meta: CfbTeamMetadata): CfbTeam {
  return {
    ...meta,
    logo: getCfbTeamLogoUrl(meta.espnId, meta.id),
    ratings: CFB_V1_RATINGS_BY_TEAM[meta.id] ?? emptyRatings(meta.id),
    record: CFB_RECORDS_BY_TEAM[meta.id] ?? emptyRecord(meta.id),
    context: CFB_CONTEXT_BY_TEAM[meta.id] ?? emptyContext(meta.id),
    stats: CFB_STATS_BY_TEAM[meta.id] ?? emptyStats(meta.id),
  };
}

export function getAllTeams(): CfbTeam[] {
  return CFB_TEAM_METADATA.map(composeTeam);
}

export function getTeamById(id: string): CfbTeam | undefined {
  const meta = getTeamMetadataById(id);
  return meta ? composeTeam(meta) : undefined;
}

export function getTeamBySlug(slug: string): CfbTeam | undefined {
  const meta = getTeamMetadataBySlug(slug);
  return meta ? composeTeam(meta) : undefined;
}

export function getTeamsByConference(conference: CfbConferenceId): CfbTeam[] {
  return getAllTeams().filter((t) => t.conference === conference);
}

export function getGameById(id: string): CfbGame | undefined {
  return CFB_GAMES_BY_ID[id];
}

export function getAvailableWeeks(): number[] {
  const weeks = new Set(CFB_GAMES_2026.map((g) => g.week));
  return [...weeks].sort((a, b) => a - b);
}

export function isPreseasonPhase(): boolean {
  return CFB_PROVENANCE.phase === "preseason";
}

export { CFB_CONFERENCES, CFB_CONFERENCE_ORDER, getConferenceBySlug, getConferenceMeta };
