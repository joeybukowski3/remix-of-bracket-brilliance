/**
 * stats.nba.com as a source adapter: wraps the Phase 1 normalizers unchanged.
 * Its license record permits no use (see licenses.ts), so ingestion through
 * this adapter is refused until that decision changes.
 */
import { parseStatsNbaResultSets } from "../ingest/statsNbaPayload";
import { normalizePlayerGameLogs, normalizeTeamGameLogs } from "../normalize";
import { STATS_NBA_SEASON_TYPE_PARAM } from "../seasonType";
import type { RawSnapshotMeta } from "../types";
import { SOURCE_LICENSES } from "./licenses";
import type { NbaSourceAdapter, NormalizedSourceSnapshot, SourcePayload, SourceRequest, SourceSnapshotMeta, SourceTable } from "./types";

const ENDPOINT_BY_TABLE: Partial<Record<SourceTable, string>> = {
  player_games: "playergamelogs",
  team_games: "teamgamelogs",
};

export const statsNbaAdapter: NbaSourceAdapter = {
  sourceId: "stats.nba.com",
  license: SOURCE_LICENSES["stats.nba.com"],
  capabilities: { playerMinutes: "decimal", starterFlag: false, availabilityRecords: false, pregameAsOfTimestamps: false },

  planRequests({ seasons, seasonTypes, tables }) {
    const unsupported = tables.filter((table) => !ENDPOINT_BY_TABLE[table]);
    if (unsupported.length > 0) throw new Error(`stats.nba.com season logs do not provide: ${unsupported.join(", ")}`);
    return seasons.flatMap((season) =>
      seasonTypes.flatMap((seasonType) =>
        tables.map((table): SourceRequest => ({
          requestKey: `${table}/${season}/${seasonType}`,
          table,
          season,
          seasonType,
          endpoint: ENDPOINT_BY_TABLE[table]!,
          params: { LeagueID: "00", Season: season, SeasonType: STATS_NBA_SEASON_TYPE_PARAM[seasonType] },
        })),
      ),
    );
  },

  normalize(payload: SourcePayload): NormalizedSourceSnapshot {
    const { meta } = payload;
    const [resultSet] = parseStatsNbaResultSets(payload.bodyText);
    const ctx = { snapshotId: meta.snapshotId, season: meta.season, seasonType: meta.seasonType };
    const snapshotMeta = { snapshotId: meta.snapshotId, endpoint: meta.endpoint, season: meta.season, seasonType: meta.seasonType, retrievedAtUtc: meta.retrievedAtUtc };
    if (meta.table === "player_games") {
      const { rows, issues } = normalizePlayerGameLogs(resultSet, ctx);
      return { meta: snapshotMeta, playerRows: rows, issues };
    }
    if (meta.table === "team_games") {
      const { rows, issues } = normalizeTeamGameLogs(resultSet, ctx);
      return { meta: snapshotMeta, teamRows: rows, issues };
    }
    throw new Error(`stats.nba.com adapter cannot normalize table ${meta.table}`);
  },
};

/** Phase 1 raw snapshot metadata (v1) -> provider-neutral metadata (v2). */
export function statsNbaMetaV1ToV2(meta: RawSnapshotMeta): SourceSnapshotMeta {
  const table: SourceTable = meta.endpoint === "playergamelogs" ? "player_games" : "team_games";
  return {
    schemaVersion: "nba-source-snapshot-meta-v2",
    sourceId: "stats.nba.com",
    snapshotId: meta.snapshotId,
    requestKey: `${table}/${meta.season}/${meta.seasonType}`,
    table,
    endpoint: meta.endpoint,
    season: meta.season,
    seasonType: meta.seasonType,
    retrievedAtUtc: meta.retrievedAtUtc,
    asOfUtc: null,
    bodyByteSize: meta.bodyByteSize,
    bodySha256: meta.bodySha256,
  };
}
