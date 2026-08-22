// CFB Model V2 research namespace — raw CFBD provider shapes and normalized
// research contracts. Isolated from the production pipeline
// (src/lib/cfb/pipeline, src/lib/cfb/model, src/lib/cfb/production).
// Nothing here feeds the live /college-football UI or generatedV1 ratings.

// ---------------------------------------------------------------------------
// Raw CFBD provider shapes (field names verified against live API responses)
// ---------------------------------------------------------------------------

// CFBD uses more than "regular"/"postseason" in practice — e.g. 2020's
// COVID-affected slate includes "spring_regular" and "spring_postseason".
// Kept as a passthrough string rather than a narrow union so unexpected
// provider values are preserved, not silently coerced or dropped.
export type CfbdResearchSeasonType = string;

export type CfbdResearchGameRaw = {
  id: number;
  season: number;
  week: number;
  seasonType: CfbdResearchSeasonType;
  startDate: string;
  startTimeTBD: boolean;
  completed: boolean;
  neutralSite: boolean;
  conferenceGame?: boolean | null;
  attendance?: number | null;
  venueId?: number | null;
  venue?: string | null;
  homeId: number;
  homeTeam: string;
  homeClassification?: string | null;
  homeConference?: string | null;
  homePoints?: number | null;
  awayId: number;
  awayTeam: string;
  awayClassification?: string | null;
  awayConference?: string | null;
  awayPoints?: number | null;
  excitementIndex?: number | null;
  notes?: string | null;
  playoff?: unknown | null;
};

export type CfbdResearchPlayClockRaw = {
  minutes: number | null;
  seconds: number | null;
};

export type CfbdResearchPlayRaw = {
  gameId: number;
  driveId?: string | null;
  id: string;
  driveNumber?: number | null;
  playNumber?: number | null;
  offense: string;
  offenseConference?: string | null;
  offenseScore?: number | null;
  defense: string;
  defenseConference?: string | null;
  defenseScore?: number | null;
  home: string;
  away: string;
  period?: number | null;
  clock?: CfbdResearchPlayClockRaw | null;
  offenseTimeouts?: number | null;
  defenseTimeouts?: number | null;
  yardline?: number | null;
  yardsToGoal?: number | null;
  down?: number | null;
  distance?: number | null;
  yardsGained?: number | null;
  scoring?: boolean | null;
  playType?: string | null;
  playText?: string | null;
  ppa?: number | null;
  wallclock?: string | null;
};

export type CfbdResearchLineEntryRaw = {
  provider: string;
  spread: number | null;
  formattedSpread?: string | null;
  spreadOpen: number | null;
  overUnder: number | null;
  overUnderOpen: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
};

// The /lines endpoint returns one row per game, embedding one entry per
// provider in `lines`. There is no separate per-line observedAt timestamp.
export type CfbdResearchLinesGameRaw = {
  id: number;
  season: number;
  seasonType: CfbdResearchSeasonType;
  week: number;
  startDate?: string | null;
  homeTeamId: number;
  homeTeam: string;
  homeConference?: string | null;
  homeClassification?: string | null;
  homeScore?: number | null;
  awayTeamId: number;
  awayTeam: string;
  awayConference?: string | null;
  awayClassification?: string | null;
  awayScore?: number | null;
  lines: CfbdResearchLineEntryRaw[];
};

export type CfbdResearchTeamRaw = {
  id: number;
  school: string;
  mascot?: string | null;
  abbreviation?: string | null;
  conference?: string | null;
  division?: string | null;
  classification?: string | null;
};

export type CfbdResearchConferenceRaw = {
  id: number;
  name: string;
  shortName?: string | null;
  abbreviation?: string | null;
  classification?: string | null;
};

export type CfbdResearchReturningProductionRaw = {
  season: number;
  team: string;
  conference?: string | null;
  totalPPA?: number | null;
  percentPPA?: number | null;
  usage?: number | null;
};

export type CfbdResearchTalentRaw = {
  year: number;
  team: string;
  talent: number | null;
};

// /games/teams — reuses the same wire shape as the production pipeline
// (scripts/lib/cfb-cfbd-client.ts callers); duplicated here so the research
// namespace has no import dependency on production pipeline types.
export type CfbdResearchGameTeamStatsRaw = {
  id: number;
  teams: Array<{
    teamId: number;
    team: string;
    homeAway: "home" | "away";
    points?: number | null;
    stats: Array<{ category: string; stat: string }>;
  }>;
};

// ---------------------------------------------------------------------------
// Normalized research contracts
// ---------------------------------------------------------------------------

export type CfbResearchGameStatus = "scheduled" | "final";

export type CfbResearchGameType =
  | "regular"
  | "conference_championship"
  | "bowl"
  | "playoff"
  | "other_postseason";

/**
 * CFBD's public /games response for historical seasons only distinguishes
 * `completed` true/false — no in-progress/cancelled/postponed states are
 * exposed, so `status` is derived as scheduled|final only. Do not fabricate
 * additional states.
 */
export type CfbResearchGame = {
  gameId: string;
  season: number;
  week: number;
  seasonType: CfbdResearchSeasonType;
  kickoffUtc: string | null;
  homeExternalId: string;
  awayExternalId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeConference: string | null;
  awayConference: string | null;
  homeClassification: string | null;
  awayClassification: string | null;
  neutralSite: boolean;
  homeScore: number | null;
  awayScore: number | null;
  status: CfbResearchGameStatus;
  gameType: CfbResearchGameType;
};

/**
 * CFBD's /plays response identifies offense/defense only by team name (no
 * numeric team id at the play level). offenseExternalId/defenseExternalId
 * are resolved by matching the play's offense/defense name against the
 * parent game's home/away name (which does carry CFBD's numeric team id).
 * When a play's offense/defense name cannot be matched to either side of
 * its game, the external id falls back to the raw name string and
 * offenseTeamId/defenseTeamId remain null — never fabricated.
 *
 * providerSuccess and providerGarbageTime are always null: CFBD's /plays
 * endpoint does not return success or garbage-time flags at the play level
 * (those are derived-aggregate concepts CFBD exposes only in season/game
 * advanced-stats endpoints, not here). Do not compute them in this Work Unit.
 */
export type CfbResearchPlay = {
  playId: string;
  gameId: string;
  driveId: string | null;
  season: number;
  week: number;
  offenseExternalId: string | null;
  defenseExternalId: string | null;
  offenseTeamId: string | null;
  defenseTeamId: string | null;
  offenseName: string;
  defenseName: string;
  period: number | null;
  clockMinutes: number | null;
  clockSeconds: number | null;
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  yardsToGoal: number | null;
  yardsGained: number | null;
  offenseScore: number | null;
  defenseScore: number | null;
  rawPlayType: string | null;
  providerPpa: number | null;
  providerSuccess: boolean | null;
  providerGarbageTime: boolean | null;
  providerScoringFlag: boolean | null;
};

/**
 * `spreadOpen`/`totalOpen` are stored only when CFBD explicitly returns a
 * non-null spreadOpen/overUnderOpen. `spreadLatestObserved`/
 * `totalLatestObserved` come from the unqualified spread/overUnder fields,
 * which CFBD does NOT document as closing lines — they are whatever value
 * was last observed for that provider. Never relabel these as "closing".
 * observedAtUtc is always null: CFBD's /lines response carries no per-line
 * timestamp.
 */
export type CfbResearchMarketLine = {
  gameId: string;
  provider: string;
  spreadOpen: number | null;
  spreadLatestObserved: number | null;
  totalOpen: number | null;
  totalLatestObserved: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  observedAtUtc: string | null;
  sourceSemantics: string;
};

export type CfbResearchTeamSeason = {
  externalTeamId: string;
  jkbTeamId: string | null;
  season: number;
  conference: string | null;
  classification: string | null;
  returningProductionPercentPpa: number | null;
  returningProductionUsage: number | null;
  talentComposite: number | null;
};

// ---------------------------------------------------------------------------
// Provenance / manifest
// ---------------------------------------------------------------------------

export type CfbResearchManifestFileEntry = {
  provider: "CollegeFootballData.com API v2";
  endpoint: string;
  params: Record<string, string | number>;
  season: number;
  week: number | null;
  fetchedAt: string;
  recordCount: number;
  sha256: string;
  schemaVersion: string;
};
