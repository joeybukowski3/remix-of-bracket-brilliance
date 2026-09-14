/**
 * WU1 (dual-AI handicapping architecture, docs/nfl-grok-chatgpt-handicap-architecture.md
 * §4/§21) -- the Game Context Packet builder.
 *
 * This module EXTENDS scripts/lib/nfl-game-context.ts (buildPregameGameContext,
 * buildEpaContext, buildYppContext, buildTrenchesContext, buildCoachingContext)
 * rather than replacing it -- every one of those functions/types is imported
 * and reused verbatim. Nothing here recomputes JKB model math; every JKB
 * number is read verbatim from an already-generated artifact.
 *
 * Pure/composable: every builder in this file takes already-loaded artifact
 * data and returns a typed section. No file I/O happens here (that lives in
 * the fixture generator script) so every builder is directly unit-testable,
 * matching the existing nfl-game-context.ts / nfl-sides-performance.ts style.
 *
 * Leakage discipline: every section either derives its value from a
 * provably-pregame-safe source (prior-season-full windows, a coaching
 * snapshot whose cutoff predates kickoff, a market snapshot observed before
 * kickoff) or is marked unavailable. Nothing here ever substitutes a
 * postgame value, a league average, or an inferred value for a missing
 * field -- see validateNoPostgameFields below for the mechanical guard.
 *
 * Deviations from the architecture doc's §4 pseudocode (all justified by
 * reading the actual on-disk artifacts rather than guessing their shape --
 * see the WU1 report for the enumerated list):
 *  - GameContextMarket exposes `spread.homeLine`/`awayLine` (matching the
 *    real betting-lines-current.json / bettingLinesView.ts shape) instead of
 *    the doc's `home`/`away` field names.
 *  - GameContextJkbModels.projectedSpread uses `homeLine` (home-oriented,
 *    negative = home favored) instead of the doc's ambiguous `line`, so it
 *    is directly comparable to market.spread.homeLine without a sign bug.
 *  - GameContextTeamMetrics.periodWindow is the literal `"prior-season-full"`
 *    window nfl-game-context.ts actually supports, not the doc's aspirational
 *    "2025"/"2026"/"last8" UI period-selector enum (that selector is a
 *    frontend-only construct with no equivalent point-in-time weekly EPA/YPP
 *    archive yet -- building one is out of WU1 scope, see the doc's own
 *    caveat in scripts/lib/nfl-game-context.ts's file header).
 *  - GameContextTeamMetrics.sos is always `unavailable` in WU1: the "EPA
 *    Overall rank" SoS basis referenced by the doc lives in a browser-facing
 *    rating module (src/lib/nfl/currentRating2026.ts) with no Node-safe
 *    deterministic artifact to read from a script -- not invented here.
 *  - GameContextJkbModels.powerRating stays strictly scoped to
 *    public/data/nfl/<season>/power-ratings.json (the doc's named source);
 *    it is NOT backfilled from matchup-projections.json's Current-OVR
 *    figures even though those exist, because that would silently conflate
 *    two different JKB artifacts under one field name.
 */

import { contentHash, type JsonValue } from "./nfl-production-prediction-archive";
import {
  buildCoachingContext,
  buildEpaContext,
  buildTrenchesContext,
  buildYppContext,
  type CoachRatingSnapshot,
  type CoachingContext,
  type EpaContext,
  type EpaPriorSeasonWindow,
  type MetricsPriorSeasonWindow,
  type TeamAdvantage,
  type TrenchesContext,
  type TrenchSeasonData,
  type YppContext,
} from "./nfl-game-context";

export type ProvenanceStatus = "available" | "unavailable" | "stale";

function advantageFromDifferential(differential: number | null): TeamAdvantage | null {
  if (differential == null || !Number.isFinite(differential)) return null;
  if (differential > 0) return "home";
  if (differential < 0) return "away";
  return "even";
}

/* -------------------------------------------------------------------------- */
/* 1. Identity                                                                 */
/* -------------------------------------------------------------------------- */

export type GameContextIdentity = {
  gameId: string;
  season: number;
  week: number;
  seasonType: "REG" | "WC" | "DIV" | "CON" | "SB";
  homeTeam: string;
  awayTeam: string;
  homeTeamFull: string;
  awayTeamFull: string;
};

export type GamesArtifactGame = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  dateUtc: string;
  homeAbbr: string;
  awayAbbr: string;
  status: string;
  stadium: string | null;
  isDome: boolean | null;
  neutralSite: boolean | null;
};

export type GamesArtifact = { games: GamesArtifactGame[] };

export type TeamRecord = {
  abbr: string;
  fullName: string;
  division: string;
  conference: string;
};

export type TeamsArtifact = { teams: TeamRecord[] };

const VALID_SEASON_TYPES = new Set(["REG", "WC", "DIV", "CON", "SB"]);

export function buildIdentity(input: {
  games: GamesArtifact;
  teams: TeamsArtifact;
  gameId: string;
}): GameContextIdentity | null {
  const game = input.games.games.find((g) => g.gameId === input.gameId);
  if (!game) return null;
  if (!VALID_SEASON_TYPES.has(game.seasonType)) return null;
  const homeTeam = game.homeAbbr;
  const awayTeam = game.awayAbbr;
  const homeRecord = input.teams.teams.find((t) => t.abbr === homeTeam);
  const awayRecord = input.teams.teams.find((t) => t.abbr === awayTeam);
  if (!homeRecord || !awayRecord) return null;
  return {
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    seasonType: game.seasonType as GameContextIdentity["seasonType"],
    homeTeam,
    awayTeam,
    homeTeamFull: homeRecord.fullName,
    awayTeamFull: awayRecord.fullName,
  };
}

/* -------------------------------------------------------------------------- */
/* 2. Schedule / situational                                                  */
/* -------------------------------------------------------------------------- */

export type GameContextSchedule = {
  kickoffUtc: string;
  venue: { stadium: string | null; isDome: boolean; neutralSite: boolean };
  restDays: { home: number | null; away: number | null };
  shortWeek: { home: boolean; away: boolean };
  offBye: { home: boolean; away: boolean };
  travel: { homeMilesFromPrevGame: number | null; awayMilesFromPrevGame: number | null };
  provenance_status: ProvenanceStatus;
};

const NORMAL_REST_DAYS = 7;
const SHORT_WEEK_THRESHOLD_DAYS = 6;

/**
 * Rest days = days since that team's most recent EARLIER game in the same
 * season (any status; only kickoff timestamps are used, never a score).
 * `null` when no earlier game exists this season (a Week 1 opener has no
 * in-season prior game to diff against -- never guessed as "normal rest").
 */
function restDaysFor(games: GamesArtifactGame[], team: string, kickoffUtc: string, season: number): number | null {
  const kickoffMs = Date.parse(kickoffUtc);
  const priorGames = games.filter(
    (g) =>
      g.season === season &&
      (g.homeAbbr === team || g.awayAbbr === team) &&
      Date.parse(g.dateUtc) < kickoffMs
  );
  if (priorGames.length === 0) return null;
  const mostRecent = priorGames.reduce((latest, g) => (Date.parse(g.dateUtc) > Date.parse(latest.dateUtc) ? g : latest));
  const diffMs = kickoffMs - Date.parse(mostRecent.dateUtc);
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function buildSchedule(input: { games: GamesArtifact; gameId: string }): GameContextSchedule | null {
  const game = input.games.games.find((g) => g.gameId === input.gameId);
  if (!game) return null;
  const homeRest = restDaysFor(input.games.games, game.homeAbbr, game.dateUtc, game.season);
  const awayRest = restDaysFor(input.games.games, game.awayAbbr, game.dateUtc, game.season);
  return {
    kickoffUtc: game.dateUtc,
    venue: {
      stadium: game.stadium,
      isDome: Boolean(game.isDome),
      neutralSite: Boolean(game.neutralSite),
    },
    restDays: { home: homeRest, away: awayRest },
    shortWeek: {
      home: homeRest != null && homeRest < SHORT_WEEK_THRESHOLD_DAYS,
      away: awayRest != null && awayRest < SHORT_WEEK_THRESHOLD_DAYS,
    },
    offBye: {
      home: homeRest != null && homeRest > NORMAL_REST_DAYS + 6,
      away: awayRest != null && awayRest > NORMAL_REST_DAYS + 6,
    },
    // Travel distance is internally derivable (teams.json lat/long + the
    // prior game's stadium) but no utility resolves stadium -> coordinates
    // yet; not invented here -- WU1 leaves this null/unavailable.
    travel: { homeMilesFromPrevGame: null, awayMilesFromPrevGame: null },
    provenance_status: "available",
  };
}

export type GameContextSituational = {
  restDifferential: number | null;
  divisionalGame: boolean;
  revengeGame: boolean;
};

export function buildSituational(input: {
  schedule: GameContextSchedule;
  identity: GameContextIdentity;
  teams: TeamsArtifact;
  /** Completed results from the season immediately prior, for the revenge-game check only. */
  priorSeasonResults?: { homeAbbr: string; awayAbbr: string }[];
}): GameContextSituational {
  const { home, away } = input.schedule.restDays;
  const restDifferential = home != null && away != null ? home - away : null;

  const homeRecord = input.teams.teams.find((t) => t.abbr === input.identity.homeTeam);
  const awayRecord = input.teams.teams.find((t) => t.abbr === input.identity.awayTeam);
  const divisionalGame = Boolean(homeRecord && awayRecord && homeRecord.division === awayRecord.division);

  const revengeGame = (input.priorSeasonResults ?? []).some(
    (g) =>
      (g.homeAbbr === input.identity.homeTeam && g.awayAbbr === input.identity.awayTeam) ||
      (g.homeAbbr === input.identity.awayTeam && g.awayAbbr === input.identity.homeTeam)
  );

  return { restDifferential, divisionalGame, revengeGame };
}

/* -------------------------------------------------------------------------- */
/* 3. Market                                                                  */
/* -------------------------------------------------------------------------- */

export type MarketSpread = { homeLine: number | null; awayLine: number | null; homePrice: number | null; awayPrice: number | null };
export type MarketTotal = { line: number | null; overPrice: number | null; underPrice: number | null };
export type MarketMoneyline = { homePrice: number | null; awayPrice: number | null };

export type GameContextMarket = {
  sportsbook: string | null;
  selectionReason: "priority" | "first-available" | null;
  spread: MarketSpread;
  total: MarketTotal;
  moneyline: MarketMoneyline;
  firstObserved: { spread: number | null; total: number | null; observedAt: string | null };
  lineMovement: { spread: number | null; total: number | null };
  freshness: "fresh" | "recent" | "stale" | "unknown";
  /** Always true: the-odds-api's firstObservedAt is "earliest JKB capture", not a true market open. */
  openingLineCaveat: true;
  provenance_status: ProvenanceStatus;
};

const NULL_SPREAD: MarketSpread = { homeLine: null, awayLine: null, homePrice: null, awayPrice: null };
const NULL_TOTAL: MarketTotal = { line: null, overPrice: null, underPrice: null };
const NULL_MONEYLINE: MarketMoneyline = { homePrice: null, awayPrice: null };

export function buildMarketSection(input: {
  currentView: import("@/lib/nfl/bettingLinesView").CurrentMarketView | null;
  movementView: import("@/lib/nfl/bettingLinesView").LineMovementView | null;
}): GameContextMarket {
  const { currentView, movementView } = input;
  if (!currentView) {
    return {
      sportsbook: null,
      selectionReason: null,
      spread: NULL_SPREAD,
      total: NULL_TOTAL,
      moneyline: NULL_MONEYLINE,
      firstObserved: { spread: null, total: null, observedAt: null },
      lineMovement: { spread: null, total: null },
      freshness: "unknown",
      openingLineCaveat: true,
      provenance_status: "unavailable",
    };
  }
  const spreadMovement = movementView?.spread ?? null;
  const totalMovement = movementView?.total ?? null;
  return {
    sportsbook: currentView.sportsbook.id,
    selectionReason: currentView.selectionReason,
    spread: currentView.spread ?? NULL_SPREAD,
    total: currentView.total ?? NULL_TOTAL,
    moneyline: currentView.moneyline ?? NULL_MONEYLINE,
    firstObserved: {
      spread: spreadMovement?.firstObserved ?? null,
      total: totalMovement?.firstObserved ?? null,
      observedAt: spreadMovement?.firstObservedAt ?? totalMovement?.firstObservedAt ?? null,
    },
    lineMovement: {
      spread: spreadMovement?.move ?? null,
      total: totalMovement?.move ?? null,
    },
    freshness: currentView.freshness.level,
    openingLineCaveat: true,
    provenance_status: currentView.spread || currentView.total ? "available" : "unavailable",
  };
}

/* -------------------------------------------------------------------------- */
/* 4. JKB models                                                              */
/* -------------------------------------------------------------------------- */

export type GameContextJkbModels = {
  powerRating: { home: number | null; away: number | null; modelVersion: string | null };
  projectedSpread: { homeLine: number | null; favoredTeam: string | null; modelVersion: string | null };
  projectedTotal: { line: number | null; modelVersion: string | null };
  modelMarketEdge: { spread: number | null; total: number | null };
  provenance_status: ProvenanceStatus;
};

export type PowerRatingsArtifact = {
  model?: { version?: string | null };
  ratings: Record<string, { rating?: number | null }> | { team: string; rating?: number | null }[];
};

export type MatchupProjectionsArtifact = {
  modelVersion: string;
  projections: Record<
    string,
    {
      homeTeam: string;
      awayTeam: string;
      projectedHomeMargin: number;
    }
  >;
};

export type TeamTotalsArtifact = {
  modelVersion: string;
  projections: Record<string, { projectedGameTotal: number | null }>;
};

function ratingFor(artifact: PowerRatingsArtifact | null, team: string): number | null {
  if (!artifact) return null;
  const { ratings } = artifact;
  if (Array.isArray(ratings)) {
    return ratings.find((r) => r.team === team)?.rating ?? null;
  }
  return ratings[team]?.rating ?? null;
}

export function buildJkbModelsSection(input: {
  powerRatings: PowerRatingsArtifact | null;
  matchupProjections: MatchupProjectionsArtifact | null;
  teamTotals: TeamTotalsArtifact | null;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  marketHomeSpread: number | null;
  marketTotal: number | null;
}): GameContextJkbModels {
  const homeRating = ratingFor(input.powerRatings, input.homeTeam);
  const awayRating = ratingFor(input.powerRatings, input.awayTeam);

  const projection = input.matchupProjections?.projections[input.gameId] ?? null;
  const projectedHomeMargin = projection?.projectedHomeMargin ?? null;
  const jkbHomeLine = projectedHomeMargin != null ? -projectedHomeMargin : null;
  const favoredTeam = projectedHomeMargin == null || projectedHomeMargin === 0 ? null : projectedHomeMargin > 0 ? input.homeTeam : input.awayTeam;

  const totalEntry = input.teamTotals?.projections[input.gameId] ?? null;
  const jkbTotal = totalEntry?.projectedGameTotal ?? null;

  const spreadEdge = jkbHomeLine != null && input.marketHomeSpread != null ? jkbHomeLine - input.marketHomeSpread : null;
  const totalEdge = jkbTotal != null && input.marketTotal != null ? jkbTotal - input.marketTotal : null;

  return {
    powerRating: {
      home: homeRating,
      away: awayRating,
      modelVersion: homeRating != null || awayRating != null ? (input.powerRatings?.model?.version ?? null) : null,
    },
    projectedSpread: {
      homeLine: jkbHomeLine,
      favoredTeam,
      modelVersion: projection ? (input.matchupProjections?.modelVersion ?? null) : null,
    },
    projectedTotal: {
      line: jkbTotal,
      modelVersion: totalEntry ? (input.teamTotals?.modelVersion ?? null) : null,
    },
    modelMarketEdge: { spread: spreadEdge, total: totalEdge },
    provenance_status: jkbHomeLine != null || jkbTotal != null ? "available" : "unavailable",
  };
}

/* -------------------------------------------------------------------------- */
/* 5. Team metrics                                                            */
/* -------------------------------------------------------------------------- */

export type GameContextTeamMetrics = {
  epa: EpaContext;
  ypp: YppContext;
  periodWindow: "prior-season-full";
  sos: { home: number | null; away: number | null; basis: "epa-overall-rank"; provenance_status: ProvenanceStatus };
};

export function buildTeamMetricsSection(input: {
  epaWindow: EpaPriorSeasonWindow | null;
  yppWindow: MetricsPriorSeasonWindow | null;
  homeTeam: string;
  awayTeam: string;
}): GameContextTeamMetrics {
  return {
    epa: buildEpaContext(input.epaWindow, input.homeTeam, input.awayTeam),
    ypp: buildYppContext(input.yppWindow, input.homeTeam, input.awayTeam),
    periodWindow: "prior-season-full",
    // No Node-safe deterministic SoS artifact exists yet (see file header) --
    // always honestly unavailable in WU1, never backfilled with a guess.
    sos: { home: null, away: null, basis: "epa-overall-rank", provenance_status: "unavailable" },
  };
}

/* -------------------------------------------------------------------------- */
/* 6. Matchup (trenches + unit-vs-unit)                                       */
/* -------------------------------------------------------------------------- */

export type GameContextMatchup = {
  trenches: TrenchesContext;
  offenseVsDefense: { passing: TeamAdvantage | null; rushing: TeamAdvantage | null };
};

export function buildMatchupSection(input: {
  trenchSeasonData: TrenchSeasonData | null;
  trenchSeasonKey: number | null;
  metricsWindow: MetricsPriorSeasonWindow | null;
  homeTeam: string;
  awayTeam: string;
}): GameContextMatchup {
  const trenches = buildTrenchesContext(input.trenchSeasonData, input.trenchSeasonKey, input.homeTeam, input.awayTeam);

  const home = input.metricsWindow?.teams[input.homeTeam] ?? null;
  const away = input.metricsWindow?.teams[input.awayTeam] ?? null;

  function unitAdvantage(offKey: string, defKey: string): TeamAdvantage | null {
    const homeOff = home?.metrics[offKey]?.[0] ?? null;
    const awayOff = away?.metrics[offKey]?.[0] ?? null;
    const homeDefAllowed = home?.metrics[defKey]?.[0] ?? null;
    const awayDefAllowed = away?.metrics[defKey]?.[0] ?? null;
    if (homeOff == null || awayOff == null || homeDefAllowed == null || awayDefAllowed == null) return null;
    // homeNet: how home's offense should fare against away's defense; awayNet: the mirror.
    const homeNet = homeOff - awayDefAllowed;
    const awayNet = awayOff - homeDefAllowed;
    return advantageFromDifferential(homeNet - awayNet);
  }

  return {
    trenches,
    offenseVsDefense: {
      passing: unitAdvantage("off.yardsPerPassAttempt", "def.opponentYardsPerPassAttempt"),
      rushing: unitAdvantage("off.yardsPerRushAttempt", "def.opponentYardsPerRushAttempt"),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 7. Coaching                                                                */
/* -------------------------------------------------------------------------- */

export type GameContextCoaching = CoachingContext;

export function buildCoachingSection(input: {
  snapshot: CoachRatingSnapshot | null;
  homeTeam: string;
  awayTeam: string;
  gameKickoffUtc: string;
}): GameContextCoaching {
  return buildCoachingContext({
    snapshot: input.snapshot,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    gameKickoffUtc: input.gameKickoffUtc,
  });
}

/* -------------------------------------------------------------------------- */
/* 8. Players                                                                 */
/* -------------------------------------------------------------------------- */

export type GameContextPlayers = {
  yardageProjections: {
    playerId: string;
    name: string;
    team: string;
    position: string;
    statCategory: "passing" | "rushing" | "receiving";
    projectedYards: number | null;
    matchupScore: number | null;
    starterUncertain: boolean;
  }[];
  tdScores: { playerId: string; name: string; team: string; tdScore: number | null; window: string }[];
  provenance_status: ProvenanceStatus;
};

export type YardageProjectionRow = {
  gameId: string;
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  market: "passing" | "rushing" | "receiving";
  projectedYards: number | null;
  matchupScore?: { matchupScore: number | null } | null;
  hardCaseFlags?: { multiQbRoleUncertain?: boolean; roleUncertain?: boolean };
};

export type YardageProjectionsArtifact = { rows: YardageProjectionRow[] };

export type TdPreviewRow = {
  gameId: string;
  playerId: string;
  playerName: string;
  team: string;
  windows: Record<string, { jkbTdScore?: number | null } | undefined>;
};

export type TdPreviewArtifact = { defaultWindow: string; players: TdPreviewRow[] };

export function buildPlayersSection(input: {
  yardageProjections: YardageProjectionsArtifact | null;
  tdPreview: TdPreviewArtifact | null;
  gameId: string;
}): GameContextPlayers {
  const yardageRows = (input.yardageProjections?.rows ?? []).filter((r) => r.gameId === input.gameId);
  const yardageProjections = yardageRows.map((r) => ({
    playerId: r.playerId,
    name: r.playerName,
    team: r.team,
    position: r.position,
    statCategory: r.market,
    projectedYards: r.projectedYards ?? null,
    matchupScore: r.matchupScore?.matchupScore ?? null,
    starterUncertain: Boolean(r.hardCaseFlags?.multiQbRoleUncertain || r.hardCaseFlags?.roleUncertain),
  }));

  const window = input.tdPreview?.defaultWindow ?? null;
  const tdRows = (input.tdPreview?.players ?? []).filter((p) => p.gameId === input.gameId);
  const tdScores = window
    ? tdRows.map((p) => ({
        playerId: p.playerId,
        name: p.playerName,
        team: p.team,
        tdScore: p.windows[window]?.jkbTdScore ?? null,
        window,
      }))
    : [];

  return {
    yardageProjections,
    tdScores,
    provenance_status: yardageProjections.length > 0 || tdScores.length > 0 ? "available" : "unavailable",
  };
}

/* -------------------------------------------------------------------------- */
/* 9. Availability                                                            */
/* -------------------------------------------------------------------------- */

export type GameContextAvailability = {
  injuries: {
    playerId: string;
    name: string;
    team: string;
    position: string;
    status: "out" | "doubtful" | "questionable" | "probable" | "active" | null;
    asOf: string | null;
  }[];
  depthChart: { playerId: string; team: string; position: string; depthRank: number | null; evidence: string | null }[];
  feedStale: boolean;
  provenance_status: ProvenanceStatus;
};

export type MatchupInjuriesArtifact = {
  isHistorical: boolean;
  dataSeason: number;
  dataWeek: number;
  teams: Record<
    string,
    {
      entries: {
        playerId: string;
        playerName: string;
        position: string;
        gameStatus: string | null;
      }[];
    }
  >;
};

export type DfsRoleRow = {
  playerId: string;
  team: string;
  position: string;
  gameId: string;
  depthRank: number | null;
  starterEvidence: string | null;
  injuryFeedStale?: boolean;
};

export type DfsWeekArtifact = { roles: DfsRoleRow[] };

const INJURY_STATUS_MAP: Record<string, GameContextAvailability["injuries"][number]["status"]> = {
  OUT: "out",
  DOUBTFUL: "doubtful",
  QUESTIONABLE: "questionable",
  PROBABLE: "probable",
  ACTIVE: "active",
};

export function buildAvailabilitySection(input: {
  matchupInjuries: MatchupInjuriesArtifact | null;
  dfsWeek: DfsWeekArtifact | null;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  currentSeason: number;
}): GameContextAvailability {
  const mi = input.matchupInjuries;
  const injuryTeams = [input.homeTeam, input.awayTeam];
  const injuries = injuryTeams.flatMap((team) =>
    (mi?.teams[team]?.entries ?? []).map((e) => ({
      playerId: e.playerId,
      name: e.playerName,
      team,
      position: e.position,
      status: e.gameStatus ? (INJURY_STATUS_MAP[e.gameStatus] ?? null) : null,
      asOf: mi ? `${mi.dataSeason}-week-${mi.dataWeek}` : null,
    }))
  );

  const dfsRows = (input.dfsWeek?.roles ?? []).filter((r) => r.gameId === input.gameId);
  const depthChart = dfsRows.map((r) => ({
    playerId: r.playerId,
    team: r.team,
    position: r.position,
    depthRank: r.depthRank,
    evidence: r.starterEvidence,
  }));

  // Feed is stale whenever it is not this season's data, or a game row on
  // the DFS artifact itself flags injuryFeedStale -- never silently assumed fresh.
  const feedStale = Boolean(mi?.isHistorical) || (mi != null && mi.dataSeason !== input.currentSeason) || dfsRows.some((r) => r.injuryFeedStale);

  return {
    injuries,
    depthChart,
    feedStale,
    provenance_status: mi ? (feedStale ? "stale" : "available") : "unavailable",
  };
}

/* -------------------------------------------------------------------------- */
/* 10. Trends (empty by construction in WU1)                                  */
/* -------------------------------------------------------------------------- */

export type GameContextTrends = {
  id: string;
  rule: string;
  sampleSize: number;
  historicalResult: string;
  relevanceNote: string;
  productionSafe: boolean;
};

/**
 * No situational trend in this repo currently clears the doc's §3.D
 * production-safety bar (defined rule + real sample + validated relevance,
 * not raw ATS trivia). The TD-score calibration research (scripts/research/)
 * is research-only. WU1 returns an empty, honestly-labeled array rather than
 * inventing a trend just to populate the field.
 */
export function buildTrendsSection(): GameContextTrends[] {
  return [];
}

/* -------------------------------------------------------------------------- */
/* 11. Weather (always unavailable -- Category C gap)                         */
/* -------------------------------------------------------------------------- */

export type GameContextWeather = { status: "not_available"; note: string };

export function buildWeatherSection(): GameContextWeather {
  return {
    status: "not_available",
    note: "No internal NFL weather provider exists; weather must be AI-researched and evidence-tracked, not treated as deterministic.",
  };
}

/* -------------------------------------------------------------------------- */
/* 12. Provenance                                                             */
/* -------------------------------------------------------------------------- */

export type ProvenanceSourceRef = { logicalName: string; path: string; contentHash: string; generatedAt: string | null };

export type GameContextProvenance = {
  sources: ProvenanceSourceRef[];
  contextVersion: string;
  builtAt: string;
};

export const GAME_CONTEXT_SCHEMA_VERSION = "nfl-game-context-v1";

export function buildProvenanceSection(input: { sources: ProvenanceSourceRef[]; builtAt: string }): GameContextProvenance {
  return { sources: input.sources, contextVersion: GAME_CONTEXT_SCHEMA_VERSION, builtAt: input.builtAt };
}

export function sourceRef(logicalName: string, path: string, content: unknown, generatedAt: string | null): ProvenanceSourceRef {
  return { logicalName, path, contentHash: contentHash(content as JsonValue), generatedAt };
}

/* -------------------------------------------------------------------------- */
/* Full packet                                                                */
/* -------------------------------------------------------------------------- */

export type NflGameContextPacket = {
  identity: GameContextIdentity;
  schedule: GameContextSchedule;
  market: GameContextMarket;
  jkbModels: GameContextJkbModels;
  teamMetrics: GameContextTeamMetrics;
  matchup: GameContextMatchup;
  coaching: GameContextCoaching;
  players: GameContextPlayers;
  availability: GameContextAvailability;
  situational: GameContextSituational;
  trends: GameContextTrends[];
  weather: GameContextWeather;
  provenance: GameContextProvenance;
  generatedAt: string;
};

export type BuildFullGameContextInput = {
  games: GamesArtifact;
  teams: TeamsArtifact;
  gameId: string;
  epaWindow: EpaPriorSeasonWindow | null;
  yppWindow: MetricsPriorSeasonWindow | null;
  trenchSeasonData: TrenchSeasonData | null;
  trenchSeasonKey: number | null;
  coachingSnapshot: CoachRatingSnapshot | null;
  currentMarketView: import("@/lib/nfl/bettingLinesView").CurrentMarketView | null;
  lineMovementView: import("@/lib/nfl/bettingLinesView").LineMovementView | null;
  powerRatings: PowerRatingsArtifact | null;
  matchupProjections: MatchupProjectionsArtifact | null;
  teamTotals: TeamTotalsArtifact | null;
  yardageProjections: YardageProjectionsArtifact | null;
  tdPreview: TdPreviewArtifact | null;
  matchupInjuries: MatchupInjuriesArtifact | null;
  dfsWeek: DfsWeekArtifact | null;
  priorSeasonResults?: { homeAbbr: string; awayAbbr: string }[];
  provenanceSources: ProvenanceSourceRef[];
  generatedAt: string;
};

export type BuildFullGameContextResult =
  | { status: "ok"; packet: NflGameContextPacket }
  | { status: "error"; reason: "unknown_game" | "unknown_team" };

export function buildFullGameContext(input: BuildFullGameContextInput): BuildFullGameContextResult {
  const identity = buildIdentity({ games: input.games, teams: input.teams, gameId: input.gameId });
  if (!identity) return { status: "error", reason: "unknown_game" };

  const schedule = buildSchedule({ games: input.games, gameId: input.gameId });
  if (!schedule) return { status: "error", reason: "unknown_game" };

  const situational = buildSituational({
    schedule,
    identity,
    teams: input.teams,
    priorSeasonResults: input.priorSeasonResults,
  });

  const market = buildMarketSection({ currentView: input.currentMarketView, movementView: input.lineMovementView });

  const jkbModels = buildJkbModelsSection({
    powerRatings: input.powerRatings,
    matchupProjections: input.matchupProjections,
    teamTotals: input.teamTotals,
    gameId: input.gameId,
    homeTeam: identity.homeTeam,
    awayTeam: identity.awayTeam,
    marketHomeSpread: market.spread.homeLine,
    marketTotal: market.total.line,
  });

  const teamMetrics = buildTeamMetricsSection({
    epaWindow: input.epaWindow,
    yppWindow: input.yppWindow,
    homeTeam: identity.homeTeam,
    awayTeam: identity.awayTeam,
  });

  const matchup = buildMatchupSection({
    trenchSeasonData: input.trenchSeasonData,
    trenchSeasonKey: input.trenchSeasonKey,
    metricsWindow: input.yppWindow,
    homeTeam: identity.homeTeam,
    awayTeam: identity.awayTeam,
  });

  const coaching = buildCoachingSection({
    snapshot: input.coachingSnapshot,
    homeTeam: identity.homeTeam,
    awayTeam: identity.awayTeam,
    gameKickoffUtc: schedule.kickoffUtc,
  });

  const players = buildPlayersSection({
    yardageProjections: input.yardageProjections,
    tdPreview: input.tdPreview,
    gameId: input.gameId,
  });

  const availability = buildAvailabilitySection({
    matchupInjuries: input.matchupInjuries,
    dfsWeek: input.dfsWeek,
    gameId: input.gameId,
    homeTeam: identity.homeTeam,
    awayTeam: identity.awayTeam,
    currentSeason: identity.season,
  });

  const trends = buildTrendsSection();
  const weather = buildWeatherSection();
  const provenance = buildProvenanceSection({ sources: input.provenanceSources, builtAt: input.generatedAt });

  const packet: NflGameContextPacket = {
    identity,
    schedule,
    market,
    jkbModels,
    teamMetrics,
    matchup,
    coaching,
    players,
    availability,
    situational,
    trends,
    weather,
    provenance,
    generatedAt: input.generatedAt,
  };

  return { status: "ok", packet };
}
