/**
 * College Football data contracts.
 *
 * Layers are intentionally separate so future APIs can replace each independently:
 * - teamMetadata (static identity)
 * - jkbRatings (model)
 * - seasonRecords / seasonStats / teamContext (season)
 * - schedule / odds (games & market)
 *
 * Higher rating values = better for all JKB rating fields.
 * Null means unavailable — never treat null as 0 unless 0 is the real value.
 */

export type CfbConferenceId =
  | "acc"
  | "american"
  | "big-12"
  | "big-ten"
  | "conference-usa"
  | "mac"
  | "mountain-west"
  | "pac-12"
  | "sec"
  | "sun-belt"
  | "independents";

export type CfbGameStatus = "scheduled" | "in_progress" | "final" | "postponed" | "canceled";

export type CfbSeasonPhase = "preseason" | "regular" | "postseason";

/** Static identity — rarely changes mid-season. */
export type CfbTeamMetadata = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  abbreviation: string;
  mascot: string;
  conference: CfbConferenceId;
  /** ESPN team id used for logo CDN mapping. */
  espnId: number;
  primaryColor: string;
  secondaryColor: string;
};

/** JKB model ratings layer (higher = better). */
export type CfbJkbRatings = {
  teamId: string;
  jkbRank: number | null;
  previousJkbRank: number | null;
  /**
   * Official AP Top 25 rank (1-25) or null when officially unranked.
   * Independent poll reference; never an input into JKB Power.
   */
  apRank: number | null;
  /**
   * Official CFP selection-committee rank (1-25) or null. Null for the whole
   * field until the committee publishes its first poll of the season — that is
   * a normal state, not missing data. Never an input into JKB Power.
   */
  cfpRank: number | null;
  jkbPowerRating: number | null;
  offensiveRating: number | null;
  defensiveRating: number | null;
  sosPlayedRating: number | null;
  sosPlayedRank: number | null;
  sosRemainingRating: number | null;
  sosRemainingRank: number | null;
};

/** Season record layer. */
export type CfbSeasonRecord = {
  teamId: string;
  wins: number;
  losses: number;
  ties: number;
  conferenceWins: number;
  conferenceLosses: number;
  conferenceTies: number;
  atsWins: number | null;
  atsLosses: number | null;
  overs: number | null;
  unders: number | null;
};

/** Team context / personnel layer. */
export type CfbTeamContext = {
  teamId: string;
  headCoach: string | null;
  headCoachYear: number | null;
  startingQuarterback: string | null;
  returningQuarterback: boolean | null;
  returningOffensiveStarters: number | null;
  returningDefensiveStarters: number | null;
};

/** Basic box-score style season stats (null until available). */
export type CfbSeasonStats = {
  teamId: string;
  /** Completed games contributing to these totals (0 in preseason). */
  gamesPlayed: number;
  // Offense
  pointsPerGame: number | null;
  yardsPerPlay: number | null;
  pointsPerPlay: number | null;
  rushYardsPerGame: number | null;
  yardsPerRush: number | null;
  passYardsPerGame: number | null;
  yardsPerPass: number | null;
  thirdDownPct: number | null;
  completionPct: number | null;
  turnovers: number | null;
  // Defense (opponent offensive production against this team)
  pointsAllowedPerGame: number | null;
  yardsPerPlayAllowed: number | null;
  opponentPointsPerPlay: number | null;
  rushYardsAllowedPerGame: number | null;
  yardsPerRushAllowed: number | null;
  passYardsAllowedPerGame: number | null;
  yardsPerPassAllowed: number | null;
  opponentThirdDownPct: number | null;
  opponentCompletionPct: number | null;
  takeaways: number | null;
};

/** Market odds for a game (null when not posted). */
export type CfbGameOdds = {
  /** Point spreads are stored from the home team's perspective. */
  openingSpread: number | null;
  /** Point spreads are stored from the home team's perspective. */
  currentSpread: number | null;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  openingTotal: number | null;
  currentTotal: number | null;
};

/** Model projection placeholders — do not invent values in Phase 1. */
export type CfbGameModelProjections = {
  jkbProjectedSpread: number | null;
  jkbProjectedTotal: number | null;
  homeWinProbability: number | null;
  awayWinProbability: number | null;
  neutralPowerDifference: number | null;
  homeFieldAdjustment: number | null;
  jkbPowerLine: number | null;
};

export type CfbGame = {
  id: string;
  season: number;
  week: number;
  date: string; // YYYY-MM-DD
  time: string | null; // UTC HH:mm derived from the canonical scheduled timestamp
  awayTeamId: string;
  homeTeamId: string;
  /** Source names/classification support non-FBS opponents without fabricating JKB metadata. */
  awayTeamName?: string;
  homeTeamName?: string;
  awayClassification?: string | null;
  homeClassification?: string | null;
  neutralSite: boolean;
  venue: string | null;
  /** Verified venue city, joined by CFBD venue ID. Never inferred from a team's home city. */
  venueCity: string | null;
  /** Verified venue state/region, joined by CFBD venue ID. Empty for non-US venues (e.g. Dublin, London). */
  venueState: string | null;
  tvNetwork: string | null;
  gameStatus: CfbGameStatus;
  awayScore: number | null;
  homeScore: number | null;
  odds: CfbGameOdds;
  model: CfbGameModelProjections;
};

/** Composed view model used by UI. */
export type CfbTeam = CfbTeamMetadata & {
  logo: string;
  ratings: CfbJkbRatings;
  record: CfbSeasonRecord;
  context: CfbTeamContext;
  stats: CfbSeasonStats;
};

export type CfbConferenceMeta = {
  id: CfbConferenceId;
  slug: string;
  name: string;
  shortName: string;
  /** Full official conference name, e.g. "Southeastern Conference". */
  fullName: string;
  /** Conference logo URL, or null when no verified asset exists (renders name-only). */
  logo: string | null;
};

/**
 * Generic dataset source/status marker used across CFB provenance fields.
 * - sample: hand-authored placeholder data for UI demonstration only
 * - derived: computed by a JKB model/engine from other in-repo data
 * - manual: manually curated/imported by a human (e.g. coaching changes)
 * - api: sourced live from an external data provider
 * - unavailable: no data exists yet for this dataset
 */
export type CfbDataSourceStatus = "sample" | "derived" | "manual" | "api" | "unavailable";

export type CfbDataProvenance = {
  season: number;
  phase: CfbSeasonPhase;
  label: string;
  ratingsSource: "generated-v1" | "generated-v1.1-market-anchor" | "live";
  scheduleSource: "live";
  /** Season statistics dataset status (points/yards per play, etc). */
  statsSource: CfbDataSourceStatus;
  /** Roster / returning production / recruiting-talent dataset status. */
  rosterSource: CfbDataSourceStatus;
  /** Market odds dataset status. */
  oddsSource: CfbDataSourceStatus;
  /**
   * Official poll (AP / CFP) dataset status. Describes ONLY the official polls
   * ingested from the rankings endpoint — never the internal JKB power rank,
   * which is always reported via ratingsSource.
   */
  officialRankingsSource: CfbDataSourceStatus;
  /** Which official poll is currently driving rank display, if any. */
  officialRankingsPoll: {
    /** Poll name exactly as published, e.g. "AP Top 25". Null when none published. */
    activePoll: string | null;
    /** "cfp" once the committee poll exists, otherwise "ap", or null when neither. */
    activeKind: "ap" | "cfp" | null;
    week: number | null;
  };
  generatedAt: string;
  notes: string[];
};
