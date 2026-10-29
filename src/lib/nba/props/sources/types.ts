/**
 * Provider-neutral NBA source contract (Phase 2B preparation).
 *
 * A source adapter is pure: it plans requests and normalizes response bodies
 * into the existing canonical schemas (NbaPlayerGame / NbaTeamGame) plus the
 * optional availability schema below. Network access lives in a separately
 * injected transport, so adapters can be fully tested with synthetic payloads.
 *
 * Every source carries a license record. Uses not listed in
 * `permittedUses` are refused by `assertUsePermitted` (ingest.ts). A license
 * is recorded only from a signed agreement or verified terms, never assumed
 * from having an API key.
 */
import type { NormalizedSnapshot } from "../dataset";
import type { NbaSeasonType } from "../seasonType";

/**
 * `espn`, and the stats.nba.com data inside `llimllib-nba-data`, are ORIGINS:
 * we never retrieve from them directly. `hoopr-espn` and `llimllib-nba-data`
 * are redistributors whose code license says nothing about the data (see
 * registry.ts `origin` and `effectivePermittedUses`).
 */
export type NbaSourceId =
  | "stats.nba.com"
  | "espn"
  | "hoopr-espn"
  | "llimllib-nba-data"
  | "thesportsdb"
  | "sportsdataio"
  | "balldontlie"
  | "api-sports-nba"
  | "synthetic";

/**
 * private-research: evaluation by the owner only, on the owner's own machine.
 * private-hosted: storing the data on a third-party host (database) for the
 * owner's own deployment; private-research never implies it, because the data
 * leaves the owner's machine. It does NOT cover showing the data to visitors:
 * that needs public-display, and per-game rows also raw-redistribution.
 * model-development: training and tuning. public-display: publishing
 * DERIVED outputs (projections, predictions). raw-redistribution: republishing
 * or serving source rows; a grant for the other uses never implies this one.
 */
export const DATA_USES = ["private-research", "private-hosted", "model-development", "public-display", "raw-redistribution"] as const;
export type DataUse = (typeof DATA_USES)[number];

export type LicenseStatus = "synthetic" | "restricted" | "unlicensed" | "commercial-licensed";

export interface SourceLicense {
  status: LicenseStatus;
  permittedUses: readonly DataUse[];
  /** Where the permission comes from: agreement id, terms URL + date, or user decision. */
  basis: string;
  reviewedOn: string;
}

export type SourceTable = "player_games" | "team_games" | "availability";

export interface SourceCapabilities {
  /** Minutes precision delivered by the player-game table. */
  playerMinutes: "decimal" | "minutes-seconds" | "whole-minutes";
  starterFlag: boolean;
  /** Rows for players who did not play (DNP / inactive), with reasons. */
  availabilityRecords: boolean;
  /** Status known before tip with an as-of timestamp (needed for leakage-safe use). */
  pregameAsOfTimestamps: boolean;
}

export interface SourceRequest {
  /** Stable key, unique per (table, season, seasonType, params). */
  requestKey: string;
  table: SourceTable;
  season: string;
  seasonType: NbaSeasonType;
  /** Source-native endpoint name; becomes NormalizedSnapshot.meta.endpoint. */
  endpoint: string;
  params: Readonly<Record<string, string>>;
}

/** Provenance stored next to every preserved raw body (generalizes nba-raw-snapshot-meta-v1). */
export interface SourceSnapshotMeta {
  schemaVersion: "nba-source-snapshot-meta-v2";
  sourceId: NbaSourceId;
  snapshotId: string;
  requestKey: string;
  table: SourceTable;
  endpoint: string;
  season: string;
  seasonType: NbaSeasonType;
  retrievedAtUtc: string;
  /** For pregame snapshots (injuries, lineups, odds): when the content was current. */
  asOfUtc: string | null;
  bodyByteSize: number;
  bodySha256: string;
}

export interface SourcePayload {
  meta: SourceSnapshotMeta;
  /** Exact response text, as preserved. */
  bodyText: string;
}

export const AVAILABILITY_STATUSES = ["active", "inactive", "dnp", "out", "doubtful", "questionable", "probable", "unknown"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/**
 * Whether a player was available for a game, as known at `asOfUtc`.
 * Leakage contract: a pregame feature may only use records with
 * `asOfUtc` strictly before the prediction cutoff timestamp.
 */
export interface NbaAvailabilityRecord {
  schemaVersion: "nba-availability-v1";
  gameId: string;
  gameDate: string;
  season: string;
  seasonType: NbaSeasonType;
  playerId: number;
  teamId: number;
  status: AvailabilityStatus;
  starter: boolean | null;
  reason: string | null;
  asOfUtc: string;
  sourceSnapshotId: string;
}

export interface NormalizedSourceSnapshot extends NormalizedSnapshot {
  availability?: NbaAvailabilityRecord[];
}

export interface NbaSourceAdapter {
  readonly sourceId: NbaSourceId;
  readonly license: SourceLicense;
  readonly capabilities: SourceCapabilities;
  planRequests(scope: { seasons: readonly string[]; seasonTypes: readonly NbaSeasonType[]; tables: readonly SourceTable[] }): SourceRequest[];
  /** Pure. Throws on schema drift; reports row problems as ValidationIssues. */
  normalize(payload: SourcePayload): NormalizedSourceSnapshot;
}

export interface TransportResponse {
  httpStatus: number;
  retrievedAtUtc: string;
  bodyText: string;
}

/** Network boundary, injected per provider (API keys come from the environment, never from code). */
export type SourceTransport = (request: SourceRequest) => Promise<TransportResponse>;

/** Maps one source's player ids onto another id space (e.g. SportsDataIO NbaDotComPlayerID). */
export interface PlayerIdCrosswalk {
  fromSource: NbaSourceId;
  toSource: NbaSourceId;
  /** fromSource playerId -> toSource playerId; missing entries are reported, not guessed. */
  mapping: ReadonlyMap<number, number>;
}
