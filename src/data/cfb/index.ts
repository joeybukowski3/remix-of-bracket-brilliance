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
  CFB_AP_POLL_2026,
  CFB_CFP_POLL_2026,
  CFB_IS_CFP_POLL_ACTIVE,
  CFB_CONTEXT_BY_TEAM,
  CFB_GAMES_2026,
  CFB_GAMES_BY_ID,
  CFB_RECORDS_BY_TEAM,
  CFB_V1_MODEL_VERSION,
  CFB_V1_RATINGS_BY_TEAM,
  CFB_STATS_BY_TEAM,
  CFB_STATS_2026_HAS_DATA,
  getGamesForTeam,
  getGamesByWeek,
} from "./season2026";
import type {
  CfbConferenceId,
  CfbDataProvenance,
  CfbGame,
  CfbSeasonStats,
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
  CFB_STATS_PREVIOUS_SEASON_BY_TEAM,
  CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM,
  CFB_STATS_PREVIOUS_SEASON_YEAR,
  CFB_STATS_RANKS_BY_TEAM,
} from "./season2026";
export {
  CFB_AP_POLL_2026,
  CFB_AP_RANKS_2026,
  CFB_CFP_POLL_2026,
  CFB_CFP_RANKS_2026,
  CFB_IS_CFP_POLL_ACTIVE,
  CFB_OFFICIAL_RANKINGS_2026,
} from "./season2026";

export const CFB_SEASON = 2026;

/**
 * The single active official poll, chosen by one deterministic rule:
 * CFP once the selection committee has actually published rankings, otherwise
 * AP, otherwise none. JKB rank is a display fallback, never an "official" poll,
 * so it deliberately does not appear here.
 */
const ACTIVE_OFFICIAL_POLL = CFB_IS_CFP_POLL_ACTIVE ? CFB_CFP_POLL_2026 : CFB_AP_POLL_2026;
const ACTIVE_OFFICIAL_POLL_KIND: "ap" | "cfp" | null =
  CFB_IS_CFP_POLL_ACTIVE ? "cfp" : CFB_AP_POLL_2026 ? "ap" : null;

export const CFB_PROVENANCE: CfbDataProvenance = {
  season: CFB_SEASON,
  phase: "preseason",
  label: "2026 Preseason",
  ratingsSource: "generated-v1.1-market-anchor",
  scheduleSource: "live",
  // CFBD-derived (npm run cfb:build-season-stats), computed from raw
  // /games + /games/teams box scores rather than an external provider's own
  // aggregate — "derived" is the accurate CfbDataSourceStatus, not "api".
  // Honestly "unavailable" until the artifact reflects a completed game.
  statsSource: CFB_STATS_2026_HAS_DATA ? "derived" : "unavailable",
  rosterSource: "unavailable",
  oddsSource: "api",
  officialRankingsSource: ACTIVE_OFFICIAL_POLL ? "api" : "unavailable",
  officialRankingsPoll: {
    activePoll: ACTIVE_OFFICIAL_POLL?.pollName ?? null,
    activeKind: ACTIVE_OFFICIAL_POLL_KIND,
    week: ACTIVE_OFFICIAL_POLL?.week ?? null,
  },
  generatedAt: "2026-08-10T00:00:00.000Z",
  notes: [
    `JKB Preseason Power Ratings use ${CFB_V1_MODEL_VERSION}.`,
    "Schedule is sourced from the authenticated 2026 CFBD cache.",
    "Eight Pac-12 schedules remain provisional until the Week 13 flex opponents are assigned.",
    "SOS Played is null until games are completed.",
    CFB_STATS_2026_HAS_DATA
      ? "Season statistics are derived from the authenticated CFBD /games/teams box scores (npm run cfb:build-season-stats)."
      : "Season statistics are unavailable in preseason (no 2026 games completed yet).",
    "Model projections (power line, win probability) are intentionally null.",
    "Ratings are descriptive team-strength summaries, not betting predictions or picks.",
    "Market odds are sourced from the authenticated CFBD /lines endpoint (DraftKings/Bovada per game); not every game has posted odds, and coverage/provider mix changes as sportsbooks update lines.",
    ACTIVE_OFFICIAL_POLL
      ? `Official rankings shown as "#N" come from the ${ACTIVE_OFFICIAL_POLL.pollName} (week ${ACTIVE_OFFICIAL_POLL.week}) via the authenticated CFBD /rankings endpoint. Teams outside that poll are officially unranked and instead show a clearly labeled internal "JKB N" power rank.`
      : 'No official AP or CFP poll has been ingested yet, so every team shows the clearly labeled internal "JKB N" power rank. A JKB rank is never presented as an AP or CFP ranking.',
    "CFP selection-committee rankings take display priority over AP once the committee publishes them; before that AP is the official source. Neither poll is ever an input into JKB Power.",
  ],
};

function emptyRatings(teamId: string) {
  return {
    teamId,
    jkbRank: null,
    previousJkbRank: null,
    apRank: null,
    cfpRank: null,
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

function emptyStats(teamId: string): CfbSeasonStats {
  return {
    teamId,
    gamesPlayed: 0,
    pointsPerGame: null,
    yardsPerPlay: null,
    pointsPerPlay: null,
    rushYardsPerGame: null,
    yardsPerRush: null,
    passYardsPerGame: null,
    yardsPerPass: null,
    thirdDownPct: null,
    completionPct: null,
    turnovers: null,
    pointsAllowedPerGame: null,
    yardsPerPlayAllowed: null,
    opponentPointsPerPlay: null,
    rushYardsAllowedPerGame: null,
    yardsPerRushAllowed: null,
    passYardsAllowedPerGame: null,
    yardsPerPassAllowed: null,
    opponentThirdDownPct: null,
    opponentCompletionPct: null,
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
