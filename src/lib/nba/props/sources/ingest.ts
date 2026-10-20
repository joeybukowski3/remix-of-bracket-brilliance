/**
 * Source-independent ingestion: license gate -> integrity check -> adapter
 * normalization -> the existing dataset builder. No network here.
 */
import { createHash } from "node:crypto";
import { buildDataset, type NbaDataset } from "../dataset";
import { SOURCE_LICENSES } from "./licenses";
import { effectivePermittedUses } from "./registry";
import type { NbaPlayerGame } from "../types";
import type {
  DataUse,
  NbaAvailabilityRecord,
  NbaSourceAdapter,
  NbaSourceId,
  NormalizedSourceSnapshot,
  PlayerIdCrosswalk,
  SourceLicense,
  SourcePayload,
  SourceRequest,
  TransportResponse,
} from "./types";

export class SourceUseNotPermittedError extends Error {
  constructor(readonly sourceId: NbaSourceId, readonly use: DataUse, license: SourceLicense, chain: readonly NbaSourceId[] = [sourceId]) {
    super(`${sourceId} is not licensed for "${use}" (status: ${license.status}; basis: ${license.basis}; license chain: ${chain.join(" -> ")})`);
    this.name = "SourceUseNotPermittedError";
  }
}

/**
 * The adapter's license, the registry's record for the source, AND every
 * origin's record must all permit the use. An adapter cannot widen the
 * registry, the registry cannot widen a stale adapter copy, and a
 * redistributor cannot grant more than the data's owner.
 */
export function assertUsePermitted(sourceId: NbaSourceId, license: SourceLicense, use: DataUse, registry: Readonly<Record<NbaSourceId, SourceLicense>> = SOURCE_LICENSES): void {
  const own: SourceLicense = { ...license, permittedUses: license.permittedUses.filter((u) => registry[sourceId].permittedUses.includes(u)) };
  const { permittedUses, chain } = effectivePermittedUses(sourceId, { ...registry, [sourceId]: own });
  if (!permittedUses.includes(use)) throw new SourceUseNotPermittedError(sourceId, use, license, chain);
}

export const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** Wrap a transport response as a preserved payload. `asOfUtc` is required for pregame tables. */
export function createPayload(
  sourceId: NbaSourceId,
  request: SourceRequest,
  response: TransportResponse,
  asOfUtc: string | null = null,
): SourcePayload {
  const stamp = response.retrievedAtUtc.replace(/[:.]/g, "-");
  if (request.table === "availability" && asOfUtc === null) {
    throw new Error(`Availability snapshot ${request.requestKey} needs an asOfUtc timestamp`);
  }
  return {
    meta: {
      schemaVersion: "nba-source-snapshot-meta-v2",
      sourceId,
      snapshotId: `${sourceId}/${request.requestKey}/${stamp}`,
      requestKey: request.requestKey,
      table: request.table,
      endpoint: request.endpoint,
      season: request.season,
      seasonType: request.seasonType,
      retrievedAtUtc: response.retrievedAtUtc,
      asOfUtc,
      bodyByteSize: Buffer.byteLength(response.bodyText, "utf8"),
      bodySha256: sha256(response.bodyText),
    },
    bodyText: response.bodyText,
  };
}

export function normalizePayloads(
  adapter: NbaSourceAdapter,
  payloads: readonly SourcePayload[],
  use: DataUse,
  registry: Readonly<Record<NbaSourceId, SourceLicense>> = SOURCE_LICENSES,
): NormalizedSourceSnapshot[] {
  assertUsePermitted(adapter.sourceId, adapter.license, use, registry);
  return payloads.map((payload) => {
    if (payload.meta.sourceId !== adapter.sourceId) {
      throw new Error(`Payload ${payload.meta.snapshotId} is from ${payload.meta.sourceId}, not ${adapter.sourceId}`);
    }
    if (sha256(payload.bodyText) !== payload.meta.bodySha256) {
      throw new Error(`Payload integrity failure for ${payload.meta.snapshotId}`);
    }
    const snapshot = adapter.normalize(payload);
    return { ...snapshot, meta: { ...snapshot.meta, sourceId: adapter.sourceId } };
  });
}

export interface SourceDataset {
  sourceId: NbaSourceId;
  dataset: NbaDataset;
  availability: NbaAvailabilityRecord[];
}

export function buildSourceDataset(adapter: NbaSourceAdapter, payloads: readonly SourcePayload[], use: DataUse): SourceDataset {
  const snapshots = normalizePayloads(adapter, payloads, use);
  return {
    sourceId: adapter.sourceId,
    dataset: buildDataset(snapshots),
    availability: snapshots.flatMap((snapshot) => snapshot.availability ?? []),
  };
}

/** Re-key player rows into another source's id space; unmapped players are dropped and reported. */
export function applyPlayerCrosswalk(rows: readonly NbaPlayerGame[], crosswalk: PlayerIdCrosswalk): { rows: NbaPlayerGame[]; unmappedPlayerIds: number[] } {
  const unmapped = new Set<number>();
  const mapped: NbaPlayerGame[] = [];
  for (const row of rows) {
    const target = crosswalk.mapping.get(row.playerId);
    if (target === undefined) unmapped.add(row.playerId);
    else mapped.push({ ...row, playerId: target });
  }
  return { rows: mapped, unmappedPlayerIds: [...unmapped].sort((a, b) => a - b) };
}
