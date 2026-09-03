/**
 * WU4B S6 production packaging — compact, committed, fitted-state artifact
 * for the receiving v2 share model (`nfl-receiving-share-x-efficiency-v2.0.0`).
 *
 * `fitReceivingShareModel` needs the full role-allocation RESEARCH dataset
 * (`data/nfl/props/role-allocation-dataset-2022-2025.json`), which carries
 * every player-game share observation used to fit `NflShareModelFit`. That
 * file is gitignored (large, regenerable) and therefore absent on a fresh
 * CI runner -- production must not depend on it at request/run time.
 *
 * Everything production actually reads back out of the fitted model is
 * small:
 *   - `fit`     -- a ~20-entry rank-prior table + 4 scalars (NflShareModelFit)
 *   - `league`  -- 5 league-mean scalars (NflPoolLeagueConstants)
 *   - `leagueYardsPerTarget` -- 1 scalar
 *   - `poolRows` -- per-team-game AGGREGATE rows (dropbacks/attempts/sacks/
 *     scrambles/rush-pool counts). NOT player-level; used at allocation time
 *     by `buildTeamPriorPoolTendency` to look up a team's own recent-games
 *     tendency. This is the only piece that isn't a "fitted parameter" in
 *     the strict sense, but it's ~1 row per team-game (a few hundred bytes
 *     each), nothing like the player-level research rows.
 *
 * This module serializes exactly that slice to/from a small, deterministic,
 * hash-verified JSON artifact that IS safe to commit normally:
 *   data/nfl/models/receiving-role-allocation-v2.json
 *
 * Fitting (research dataset -> artifact) happens OFFLINE via
 * `scripts/analysis/nfl-role-allocation/fit-receiving-production-model.ts`.
 * Production only ever calls `loadReceivingRoleAllocationModel` on the
 * committed artifact.
 */
import { createHash } from "node:crypto";
import type { NflPoolLeagueConstants, NflTeamPoolTendencySourceRow } from "./poolModels";
import type { NflShareModelFit } from "./shareModels";
import {
  NFL_RECEIVING_V2_ALLOCATION_MODEL,
  NFL_RECEIVING_V2_MODEL_VERSION,
  type NflReceivingShareModel,
} from "./receivingProduction";

export const NFL_RECEIVING_ROLE_ALLOCATION_ARTIFACT_SCHEMA_VERSION = "nfl-receiving-role-allocation-artifact-v1" as const;

/** JSON-safe mirror of `NflShareModelFit` (`rankPrior` as a plain object, not a `Map`). */
export type NflReceivingRoleAllocationArtifactFit = {
  rankPrior: Record<string, number>;
  noHistoryPrior: number;
  overallMean: number;
  shrinkageK: number;
  teamChangeRetainedGames: number;
};

export type NflReceivingRoleAllocationArtifact = {
  schemaVersion: typeof NFL_RECEIVING_ROLE_ALLOCATION_ARTIFACT_SCHEMA_VERSION;
  modelVersion: typeof NFL_RECEIVING_V2_MODEL_VERSION;
  allocationModelVersion: typeof NFL_RECEIVING_V2_ALLOCATION_MODEL;
  /** Last season represented in the research dataset this artifact was fit from. */
  trainedThroughSeason: number;
  datasetSeasons: number[];
  /** sha256 of the research dataset's own content, for offline-fit provenance (not re-verified at load time). */
  datasetFingerprint: string;
  /** Informational only -- excluded from `contentHash`, so republishing with no fitted-state change is a no-op diff modulo this field. */
  generatedAt: string;
  fit: NflReceivingRoleAllocationArtifactFit;
  league: NflPoolLeagueConstants;
  leagueYardsPerTarget: number;
  poolRows: NflTeamPoolTendencySourceRow[];
  /** sha256 over every field above (stable key order, `generatedAt` excluded). Verified at load time -- see `loadReceivingRoleAllocationModel`. */
  contentHash: string;
};

type HashableArtifactFields = Omit<NflReceivingRoleAllocationArtifact, "generatedAt" | "contentHash">;

/** Deterministic (stable key order) canonical string used for both fitting and load-time verification. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeReceivingArtifactContentHash(fields: HashableArtifactFields): string {
  return createHash("sha256").update(canonicalize(fields)).digest("hex");
}

/**
 * Build the committed artifact from a freshly fitted `NflReceivingShareModel`
 * (offline fit script only -- see file header).
 */
export function serializeReceivingRoleAllocationModel(
  model: NflReceivingShareModel,
  meta: { trainedThroughSeason: number; datasetFingerprint: string; generatedAt: string },
): NflReceivingRoleAllocationArtifact {
  const fields: HashableArtifactFields = {
    schemaVersion: NFL_RECEIVING_ROLE_ALLOCATION_ARTIFACT_SCHEMA_VERSION,
    modelVersion: NFL_RECEIVING_V2_MODEL_VERSION,
    allocationModelVersion: model.allocationModelVersion,
    trainedThroughSeason: meta.trainedThroughSeason,
    datasetSeasons: [...model.datasetSeasons],
    datasetFingerprint: meta.datasetFingerprint,
    fit: {
      rankPrior: Object.fromEntries([...model.fit.rankPrior.entries()].sort(([a], [b]) => a.localeCompare(b))),
      noHistoryPrior: model.fit.noHistoryPrior,
      overallMean: model.fit.overallMean,
      shrinkageK: model.fit.shrinkageK,
      teamChangeRetainedGames: model.fit.teamChangeRetainedGames,
    },
    league: { ...model.league },
    leagueYardsPerTarget: model.leagueYardsPerTarget,
    poolRows: [...model.poolRows]
      .map((r) => ({ ...r, rushPools: { ...r.rushPools } }))
      .sort((a, b) => (a.gameId === b.gameId ? a.team.localeCompare(b.team) : a.gameId.localeCompare(b.gameId))),
  };
  return { ...fields, generatedAt: meta.generatedAt, contentHash: computeReceivingArtifactContentHash(fields) };
}

export class NflReceivingArtifactLoadError extends Error {}

/**
 * Load + validate a committed artifact into a runtime `NflReceivingShareModel`.
 * FAILS CLOSED: throws `NflReceivingArtifactLoadError` on any schema/version/
 * hash mismatch rather than returning a partially-usable model. Callers that
 * want a v1 fallback on failure must catch this explicitly and say so loudly
 * -- see `scripts/generate-nfl-current-week-yardage-projections.ts`.
 */
export function loadReceivingRoleAllocationModel(json: unknown): NflReceivingShareModel {
  if (json == null || typeof json !== "object") {
    throw new NflReceivingArtifactLoadError("Receiving v2 fitted artifact is not a JSON object.");
  }
  const a = json as Partial<NflReceivingRoleAllocationArtifact>;
  if (a.schemaVersion !== NFL_RECEIVING_ROLE_ALLOCATION_ARTIFACT_SCHEMA_VERSION) {
    throw new NflReceivingArtifactLoadError(
      `Receiving v2 fitted artifact schemaVersion mismatch: expected "${NFL_RECEIVING_ROLE_ALLOCATION_ARTIFACT_SCHEMA_VERSION}", got ${JSON.stringify(a.schemaVersion)}.`,
    );
  }
  if (a.modelVersion !== NFL_RECEIVING_V2_MODEL_VERSION) {
    throw new NflReceivingArtifactLoadError(
      `Receiving v2 fitted artifact modelVersion mismatch: expected "${NFL_RECEIVING_V2_MODEL_VERSION}", got ${JSON.stringify(a.modelVersion)}.`,
    );
  }
  if (
    a.allocationModelVersion == null ||
    a.fit == null ||
    a.league == null ||
    typeof a.leagueYardsPerTarget !== "number" ||
    !Array.isArray(a.poolRows) ||
    !Array.isArray(a.datasetSeasons) ||
    typeof a.trainedThroughSeason !== "number" ||
    typeof a.datasetFingerprint !== "string" ||
    typeof a.contentHash !== "string"
  ) {
    throw new NflReceivingArtifactLoadError("Receiving v2 fitted artifact is missing required fields.");
  }
  const fields: HashableArtifactFields = {
    schemaVersion: a.schemaVersion,
    modelVersion: a.modelVersion,
    allocationModelVersion: a.allocationModelVersion,
    trainedThroughSeason: a.trainedThroughSeason,
    datasetSeasons: a.datasetSeasons,
    datasetFingerprint: a.datasetFingerprint,
    fit: a.fit,
    league: a.league,
    leagueYardsPerTarget: a.leagueYardsPerTarget,
    poolRows: a.poolRows,
  };
  const recomputed = computeReceivingArtifactContentHash(fields);
  if (recomputed !== a.contentHash) {
    throw new NflReceivingArtifactLoadError(
      `Receiving v2 fitted artifact hash mismatch (artifact was hand-edited or corrupted): expected contentHash ${a.contentHash}, recomputed ${recomputed}.`,
    );
  }
  return {
    allocationModelVersion: a.allocationModelVersion,
    fit: {
      rankPrior: new Map(Object.entries(a.fit.rankPrior)),
      noHistoryPrior: a.fit.noHistoryPrior,
      overallMean: a.fit.overallMean,
      shrinkageK: a.fit.shrinkageK,
      teamChangeRetainedGames: a.fit.teamChangeRetainedGames,
    } as NflShareModelFit,
    league: a.league,
    leagueYardsPerTarget: a.leagueYardsPerTarget,
    poolRows: a.poolRows,
    datasetSeasons: a.datasetSeasons,
    fittedArtifactHash: a.contentHash,
    trainedThroughSeason: a.trainedThroughSeason,
  };
}
