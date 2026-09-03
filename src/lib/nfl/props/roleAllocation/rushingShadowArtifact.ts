/**
 * WU4D.3 — compact, committed, fitted-state artifact for the rushing-v2
 * SHADOW role allocator. Mirrors `productionArtifact.ts` (receiving v2)
 * exactly, adapted for rushing's three designed-rush pools (qb/rb/wrTe).
 *
 * `fitShareModel` needs the full role-allocation RESEARCH dataset
 * (`data/nfl/props/role-allocation-dataset-2022-2025.json`, gitignored,
 * ~34MB, player-level) -- exactly the dependency class receiving v2 was
 * fixed to avoid (see productionArtifact.ts's own docblock). This module
 * is that same fix, for rushing: a small, deterministic, hash-verified
 * artifact safe to commit and load on a fresh CI runner with no research
 * dataset present.
 *
 * UNLIKE receiving v2, this artifact backs a SHADOW-ONLY diagnostic path
 * (see rushingShadowAllocation.ts) -- it is never used to compute
 * `projectedCarries`/`projectedYardsPerCarry`/`projectedYards` on a
 * production rushing row.
 *
 * Fitting (research dataset -> artifact) happens OFFLINE via
 * `scripts/analysis/nfl-role-allocation/fit-rushing-shadow-model.ts`.
 * Shadow instrumentation only ever calls `loadRushingShadowModel` on the
 * committed artifact.
 */
import { createHash } from "node:crypto";
import type { NflPoolLeagueConstants, NflTeamPoolTendencySourceRow } from "./poolModels";
import type { NflShareModelFit } from "./shareModels";

export const NFL_RUSHING_SHADOW_ARTIFACT_SCHEMA_VERSION = "nfl-rushing-shadow-allocation-artifact-v1" as const;
export const NFL_RUSHING_SHADOW_MODEL_VERSION = "nfl-rushing-role-allocation-shadow-v1.0.0" as const;
export const NFL_RUSHING_SHADOW_ALLOCATION_MODEL = "nfl-rushing-shrinkage-blend-shadow-v1.0.0" as const;

/** JSON-safe mirror of `NflShareModelFit` (`rankPrior` as a plain object, not a `Map`). */
export type NflRushingShadowArtifactFit = {
  rankPrior: Record<string, number>;
  noHistoryPrior: number;
  overallMean: number;
  shrinkageK: number;
  teamChangeRetainedGames: number;
};

export type NflRushingShadowModel = {
  allocationModelVersion: typeof NFL_RUSHING_SHADOW_ALLOCATION_MODEL;
  fit: NflShareModelFit;
  league: NflPoolLeagueConstants;
  leagueEfficiency: number;
  poolRows: NflTeamPoolTendencySourceRow[];
  datasetSeasons: number[];
  fittedArtifactHash?: string;
  trainedThroughSeason?: number;
};

export type NflRushingShadowArtifact = {
  schemaVersion: typeof NFL_RUSHING_SHADOW_ARTIFACT_SCHEMA_VERSION;
  modelVersion: typeof NFL_RUSHING_SHADOW_MODEL_VERSION;
  allocationModelVersion: typeof NFL_RUSHING_SHADOW_ALLOCATION_MODEL;
  trainedThroughSeason: number;
  datasetSeasons: number[];
  /** sha256 of the research dataset's own content, for offline-fit provenance (not re-verified at load time). */
  datasetFingerprint: string;
  /** Informational only -- excluded from `contentHash`. */
  generatedAt: string;
  fit: NflRushingShadowArtifactFit;
  league: NflPoolLeagueConstants;
  leagueEfficiency: number;
  poolRows: NflTeamPoolTendencySourceRow[];
  /** sha256 over every field above (stable key order, `generatedAt` excluded). Verified at load time. */
  contentHash: string;
};

type HashableArtifactFields = Omit<NflRushingShadowArtifact, "generatedAt" | "contentHash">;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeRushingShadowArtifactContentHash(fields: HashableArtifactFields): string {
  return createHash("sha256").update(canonicalize(fields)).digest("hex");
}

export function serializeRushingShadowModel(
  model: NflRushingShadowModel,
  meta: { trainedThroughSeason: number; datasetFingerprint: string; generatedAt: string },
): NflRushingShadowArtifact {
  const fields: HashableArtifactFields = {
    schemaVersion: NFL_RUSHING_SHADOW_ARTIFACT_SCHEMA_VERSION,
    modelVersion: NFL_RUSHING_SHADOW_MODEL_VERSION,
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
    leagueEfficiency: model.leagueEfficiency,
    poolRows: [...model.poolRows]
      .map((r) => ({ ...r, rushPools: { ...r.rushPools } }))
      .sort((a, b) => (a.gameId === b.gameId ? a.team.localeCompare(b.team) : a.gameId.localeCompare(b.gameId))),
  };
  return { ...fields, generatedAt: meta.generatedAt, contentHash: computeRushingShadowArtifactContentHash(fields) };
}

export class NflRushingShadowArtifactLoadError extends Error {}

/**
 * Load + validate a committed artifact into a runtime `NflRushingShadowModel`.
 * FAILS CLOSED: throws on any schema/version/hash mismatch. Callers must
 * catch this explicitly and treat it as "shadow diagnostics unavailable
 * this run" -- NEVER as a reason to alter the production rushing row (see
 * rushingShadowAllocation.ts).
 */
export function loadRushingShadowModel(json: unknown): NflRushingShadowModel {
  if (json == null || typeof json !== "object") {
    throw new NflRushingShadowArtifactLoadError("Rushing shadow artifact is not a JSON object.");
  }
  const a = json as Partial<NflRushingShadowArtifact>;
  if (a.schemaVersion !== NFL_RUSHING_SHADOW_ARTIFACT_SCHEMA_VERSION) {
    throw new NflRushingShadowArtifactLoadError(
      `Rushing shadow artifact schemaVersion mismatch: expected "${NFL_RUSHING_SHADOW_ARTIFACT_SCHEMA_VERSION}", got ${JSON.stringify(a.schemaVersion)}.`,
    );
  }
  if (a.modelVersion !== NFL_RUSHING_SHADOW_MODEL_VERSION) {
    throw new NflRushingShadowArtifactLoadError(
      `Rushing shadow artifact modelVersion mismatch: expected "${NFL_RUSHING_SHADOW_MODEL_VERSION}", got ${JSON.stringify(a.modelVersion)}.`,
    );
  }
  if (
    a.allocationModelVersion == null ||
    a.fit == null ||
    a.league == null ||
    typeof a.leagueEfficiency !== "number" ||
    !Array.isArray(a.poolRows) ||
    !Array.isArray(a.datasetSeasons) ||
    typeof a.trainedThroughSeason !== "number" ||
    typeof a.datasetFingerprint !== "string" ||
    typeof a.contentHash !== "string"
  ) {
    throw new NflRushingShadowArtifactLoadError("Rushing shadow artifact is missing required fields.");
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
    leagueEfficiency: a.leagueEfficiency,
    poolRows: a.poolRows,
  };
  const recomputed = computeRushingShadowArtifactContentHash(fields);
  if (recomputed !== a.contentHash) {
    throw new NflRushingShadowArtifactLoadError(
      `Rushing shadow artifact hash mismatch (artifact was hand-edited or corrupted): expected contentHash ${a.contentHash}, recomputed ${recomputed}.`,
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
    leagueEfficiency: a.leagueEfficiency,
    poolRows: a.poolRows,
    datasetSeasons: a.datasetSeasons,
    fittedArtifactHash: a.contentHash,
    trainedThroughSeason: a.trainedThroughSeason,
  };
}
