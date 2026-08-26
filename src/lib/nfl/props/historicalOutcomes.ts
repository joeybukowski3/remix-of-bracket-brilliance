import {
  normalizeNflPropTeamAbbr,
  resolveNflPropPlayerIdentity,
  type NflPropPosition,
} from "./types/identity";
import {
  NFL_PROP_PLAYER_GAME_CONTEXT_SCHEMA_VERSION,
  type NflPropPlayerGameContext,
} from "./types/playerGameContext";
import { NFL_YARDAGE_OUTCOME_SCHEMA_VERSION, type NflYardageOutcomes } from "./types/yardageOutcomes";

export const NFL_YARDAGE_OUTCOME_ROW_SCHEMA_VERSION = "nfl-yardage-outcome-row-v1" as const;

/**
 * One canonical player-game row: identity/environment context plus observed
 * yardage outcomes for all three markets. This is the Phase 1 artifact's
 * row shape -- ground truth for later backtesting, never a projection.
 */
export type NflYardageOutcomeRow = {
  schemaVersion: typeof NFL_YARDAGE_OUTCOME_ROW_SCHEMA_VERSION;
  outcomeSchemaVersion: typeof NFL_YARDAGE_OUTCOME_SCHEMA_VERSION;
  context: NflPropPlayerGameContext;
  outcomes: NflYardageOutcomes;
  provenance: {
    source: "nflverse stats_player weekly";
    sourceSeason: number;
    sourceWeek: number;
    /** Null when the season/week/team could not be joined to a game -- see `context.gameId`. */
    gameContextSource: "public/data/nfl/<season>/games.json" | null;
  };
};

export type NflYardageOutcomeSourceRow = Record<string, string | number | null | undefined>;

/**
 * Raw schedule record shape read from `public/data/nfl/<season>/games.json`.
 * Deliberately loose (a subset of the real file's fields) -- this module
 * only needs enough to resolve gameId/homeAway/kickoff per team-week.
 */
export type NflPropRawGameRecord = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  homeAbbr: string;
  awayAbbr: string;
  dateUtc: string;
};

export type NflGameJoinRecord = {
  gameId: string;
  homeAway: "home" | "away";
  gameDateUtc: string;
};

/** Reasons a source row is excluded from the artifact without being a data-integrity failure. */
export type NflYardageOutcomeSkipReason =
  | "missing-gsis-id"
  | "unsupported-position"
  | "invalid-name"
  | "non-regular-season";

export type NflYardageOutcomeRowResult =
  | { row: NflYardageOutcomeRow; skipReason: null; gameContextResolved: boolean }
  | { row: null; skipReason: NflYardageOutcomeSkipReason; gameContextResolved: false };

export function gameJoinKey(season: number, week: number, team: string): string {
  return `${season}|${week}|${team}`;
}

/**
 * Builds a `season|week|team -> {gameId, homeAway, gameDateUtc}` index from
 * one or more seasons' `games.json` schedule records. Regular-season games
 * only -- postseason games are excluded from the join because the source
 * outcome data (`stats_player_week` cache) carries no postseason rows (see
 * README "Data coverage found").
 */
export function buildGameJoinIndex(
  games: readonly NflPropRawGameRecord[],
): Map<string, NflGameJoinRecord> {
  const index = new Map<string, NflGameJoinRecord>();
  for (const game of games) {
    if (String(game.seasonType).toUpperCase() !== "REG") continue;
    const home = normalizeNflPropTeamAbbr(game.homeAbbr);
    const away = normalizeNflPropTeamAbbr(game.awayAbbr);
    if (!home || !away) {
      throw new Error(`Unresolved team code in schedule game ${game.gameId}.`);
    }
    index.set(gameJoinKey(game.season, game.week, home), {
      gameId: game.gameId,
      homeAway: "home",
      gameDateUtc: game.dateUtc,
    });
    index.set(gameJoinKey(game.season, game.week, away), {
      gameId: game.gameId,
      homeAway: "away",
      gameDateUtc: game.dateUtc,
    });
  }
  return index;
}

function optionalNonNegative(source: NflYardageOutcomeSourceRow, key: string): number | null {
  const raw = source[key];
  if (raw === "" || raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Yardage outcome field "${key}" is not a finite non-negative number: ${String(raw)}`);
  }
  return value;
}

function optionalSigned(source: NflYardageOutcomeSourceRow, key: string): number | null {
  const raw = source[key];
  if (raw === "" || raw == null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Yardage outcome field "${key}" is not a finite number: ${String(raw)}`);
  }
  return value;
}

function requireInt(source: NflYardageOutcomeSourceRow, key: string): number {
  const raw = source[key];
  const value = Number(raw);
  if (raw === "" || raw == null || !Number.isInteger(value)) {
    throw new Error(`Yardage outcome field "${key}" must be an integer: ${String(raw)}`);
  }
  return value;
}

/**
 * Normalizes one raw `stats_player_week` row into a canonical outcome row.
 *
 * Leakage note: this function reads only fields that describe the row's own
 * game (season, week, team, opponent, the player's own observed stats). It
 * never reads or infers anything from a different week. See README
 * "Leakage contract" for the full temporal contract this artifact must
 * satisfy.
 *
 * Failure policy: an unresolved team/opponent code is a hard error (the
 * repository-wide NFL mandate is that ingest must fail loudly on an unknown
 * team code, never guess). A row that is legitimately out of scope --
 * non-regular-season, missing identity, or an unsupported position -- is
 * returned as a typed skip result instead of being silently dropped, so the
 * caller can count and report every skip reason.
 */
export function normalizeYardageOutcomeRow(
  source: NflYardageOutcomeSourceRow,
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
): NflYardageOutcomeRowResult {
  if (String(source.season_type ?? "").toUpperCase() !== "REG") {
    return { row: null, skipReason: "non-regular-season", gameContextResolved: false };
  }

  const identity = resolveNflPropPlayerIdentity({
    gsisId: String(source.player_id ?? ""),
    playerName: String(source.player_display_name || source.player_name || ""),
    position: String(source.position ?? ""),
  });
  if (identity.resolved === false) {
    return { row: null, skipReason: identity.reason, gameContextResolved: false };
  }

  const season = requireInt(source, "season");
  const week = requireInt(source, "week");
  const team = normalizeNflPropTeamAbbr(String(source.recent_team ?? ""));
  const opponent = normalizeNflPropTeamAbbr(String(source.opponent_team ?? ""));
  if (!team || !opponent) {
    throw new Error(
      `Yardage outcome row has an unresolved team or opponent (player ${identity.identity.playerId}, season ${season}, week ${week}).`,
    );
  }

  const gameJoin = gameJoinIndex.get(gameJoinKey(season, week, team)) ?? null;

  const context: NflPropPlayerGameContext = {
    schemaVersion: NFL_PROP_PLAYER_GAME_CONTEXT_SCHEMA_VERSION,
    season,
    week,
    gameId: gameJoin?.gameId ?? null,
    playerId: identity.identity.playerId,
    playerName: identity.identity.playerName,
    team,
    opponent,
    position: identity.identity.position as NflPropPosition,
    homeAway: gameJoin?.homeAway ?? null,
    gameDateUtc: gameJoin?.gameDateUtc ?? null,
    spread: null,
    total: null,
    impliedTeamTotal: null,
    availabilityStatus: null,
  };

  const outcomes: NflYardageOutcomes = {
    passAttempts: optionalNonNegative(source, "attempts"),
    passingYards: optionalSigned(source, "passing_yards"),
    carries: optionalNonNegative(source, "carries"),
    rushingYards: optionalSigned(source, "rushing_yards"),
    targets: optionalNonNegative(source, "targets"),
    receptions: optionalNonNegative(source, "receptions"),
    receivingYards: optionalSigned(source, "receiving_yards"),
  };

  const row: NflYardageOutcomeRow = {
    schemaVersion: NFL_YARDAGE_OUTCOME_ROW_SCHEMA_VERSION,
    outcomeSchemaVersion: NFL_YARDAGE_OUTCOME_SCHEMA_VERSION,
    context,
    outcomes,
    provenance: {
      source: "nflverse stats_player weekly",
      sourceSeason: season,
      sourceWeek: week,
      gameContextSource: gameJoin ? "public/data/nfl/<season>/games.json" : null,
    },
  };

  return { row, skipReason: null, gameContextResolved: gameJoin != null };
}

/** Unique key for duplicate/identity QA -- one row per player per season/week. */
export function outcomeRowKey(row: NflYardageOutcomeRow): string {
  return `${row.context.season}|${row.context.week}|${row.context.playerId}`;
}
