// CFB Model V2 — WU7A app-side shadow projection consumer.
//
// STOP CONDITION (see .github/workflows and WU7A directive): this module
// is READ-ONLY consumption infrastructure. Nothing here is imported by
// any page or rendered component. It exists so tests/runtime code can
// prove the fetch -> validate -> join -> legacy-map path works, WITHOUT
// changing any existing user-facing output. The current authoritative
// `CfbGame.model` / `CfbGame.odds` fields (statically imported from the
// committed schedule JSON) remain the only thing any page reads.
//
// PRECISE ROLLOUT STATE — see CFB_V2_ROLLOUT_STATE below. Two distinct
// things could both loosely be called "Stage 2," and conflating them is
// exactly the mistake this constant exists to prevent:
//   (A) infrastructure ready:  loader/validator/hook/publication path all
//       exist and are tested, but the running app never calls them.
//   (B) active:  the running app actually invokes the hook/loader at
//       runtime (even if only internally, never rendered).
// As of this file, it is (A), not (B) — shadowProjections.architectureGuard
// .test.ts's `git grep` check confirms zero .tsx files import this module
// or the hook, and `npm run build`'s module count is unchanged from before
// this module existed, meaning it is not even reachable from the bundle
// graph. Do not treat (A) as (B) merely because the code exists and
// passes its own unit tests — "ready" and "active" are different claims.
//
// Stage 3 (populating real UI fields from V2 data) requires a SEPARATE,
// later approval after live-season HEALTHY validation, and requires first
// promoting (A) to (B) — neither is authorized merely because this module
// exists.
//
// Bundle safety: this file imports ONLY (a) plain arithmetic/object
// helpers, (b) `import type` from production/v2 (erased entirely at
// build time — zero runtime import), and (c) two specific production/v2
// VALUE modules already confirmed to have zero Node-only transitive
// imports (types.ts and legacyCompat.ts are pure — no node:fs/path/
// crypto, no other production/v2 module). Never import the production/v2
// barrel (`@/lib/cfb/production/v2` / `.../index`) here — it re-exports
// Node-only modules (artifactWriter.ts, the *-audit-shadow scripts, etc.)
// that would leak into the client bundle. See
// shadowProjections.architectureGuard.test.ts for the enforcement side.

import { projectedMarginToUiSpread } from "@/lib/cfb/production/v2/legacyCompat";
import type { CfbGameModelProjections } from "@/data/cfb/types";
import type { CfbV2MatchupPopulation, CfbV2ProjectionStatus } from "@/lib/cfb/production/v2/types";

/**
 * Explicit process gate — see file header. Not a betting switch, not a
 * calendar date. Self-documenting string (not a bare stage number) so the
 * (A) infrastructure-ready vs (B) active distinction can never be lost in
 * a log line, a test assertion, or a future diff.
 */
export type CfbV2RolloutState = "stage-1-shadow-only" | "stage-2-infrastructure-ready" | "stage-2-active" | "stage-3-visible-integration";

export const CFB_V2_ROLLOUT_STATE: CfbV2RolloutState = "stage-2-infrastructure-ready";

export type CfbV2PublicProjectionRow = {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  matchupPopulation: CfbV2MatchupPopulation;
  projectionStatus: CfbV2ProjectionStatus;
  expectedHomePoints: number | null;
  expectedAwayPoints: number | null;
  projectedMargin: number | null;
  projectedTotal: number | null;
  homeWinProbability: number | null;
  awayWinProbability: number | null;
};

export type CfbV2PublicProjectionArtifact = {
  schemaVersion: string;
  season: number;
  asOfWeek: number;
  dataAsOf: string;
  generatedAt: string;
  configVersion: string;
  modelVersion: string;
  scoringVersion: string;
  calibrationVersion: string;
  probabilityVersion: string;
  ratingsContentHash: string;
  projectionsContentHash: string;
  healthState: "HEALTHY" | "DEGRADED";
  degradedFlags: readonly string[];
  records: readonly CfbV2PublicProjectionRow[];
};

const EXPECTED_SCHEMA_VERSION = "cfb-v2-public-projections-1";
const VALID_MATCHUP_POPULATIONS: readonly CfbV2MatchupPopulation[] = ["fbs_vs_fbs", "fbs_vs_fcs", "unsupported"];
const VALID_PROJECTION_STATUSES: readonly CfbV2ProjectionStatus[] = ["computed", "unavailable"];
const COHERENCE_TOLERANCE = 1e-6;

export class CfbV2PublicArtifactValidationError extends Error {}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateRow(row: unknown, index: number): asserts row is CfbV2PublicProjectionRow {
  if (typeof row !== "object" || row === null) throw new CfbV2PublicArtifactValidationError(`record[${index}] is not an object`);
  const r = row as Record<string, unknown>;
  if (typeof r.gameId !== "string" || r.gameId.length === 0) throw new CfbV2PublicArtifactValidationError(`record[${index}].gameId is not a non-empty string`);
  if (typeof r.homeTeamId !== "string" || typeof r.awayTeamId !== "string") throw new CfbV2PublicArtifactValidationError(`record[${index}] (${r.gameId}) has a non-string team id`);
  if (!VALID_MATCHUP_POPULATIONS.includes(r.matchupPopulation as CfbV2MatchupPopulation)) {
    throw new CfbV2PublicArtifactValidationError(`record[${index}] (${r.gameId}) has an invalid matchupPopulation: ${String(r.matchupPopulation)}`);
  }
  if (!VALID_PROJECTION_STATUSES.includes(r.projectionStatus as CfbV2ProjectionStatus)) {
    throw new CfbV2PublicArtifactValidationError(`record[${index}] (${r.gameId}) has an invalid projectionStatus: ${String(r.projectionStatus)}`);
  }

  if (r.projectionStatus === "unavailable") {
    if (r.expectedHomePoints !== null || r.expectedAwayPoints !== null) {
      throw new CfbV2PublicArtifactValidationError(`record[${index}] (${r.gameId}) is unavailable but carries expected points`);
    }
    return;
  }

  // computed
  for (const field of ["expectedHomePoints", "expectedAwayPoints", "projectedMargin", "projectedTotal", "homeWinProbability", "awayWinProbability"] as const) {
    if (!isFiniteNumber(r[field])) throw new CfbV2PublicArtifactValidationError(`record[${index}] (${r.gameId}) has a non-finite/missing ${field} for a computed projection`);
  }
  const expectedHomePoints = r.expectedHomePoints as number;
  const expectedAwayPoints = r.expectedAwayPoints as number;
  const projectedMargin = r.projectedMargin as number;
  const projectedTotal = r.projectedTotal as number;
  const homeWinProbability = r.homeWinProbability as number;
  const awayWinProbability = r.awayWinProbability as number;

  if (Math.abs(expectedHomePoints - expectedAwayPoints - projectedMargin) > COHERENCE_TOLERANCE) {
    throw new CfbV2PublicArtifactValidationError(`record[${index}] (${r.gameId}) margin identity mismatch`);
  }
  if (Math.abs(expectedHomePoints + expectedAwayPoints - projectedTotal) > COHERENCE_TOLERANCE) {
    throw new CfbV2PublicArtifactValidationError(`record[${index}] (${r.gameId}) total identity mismatch`);
  }
  if (homeWinProbability < 0 || homeWinProbability > 1 || awayWinProbability < 0 || awayWinProbability > 1) {
    throw new CfbV2PublicArtifactValidationError(`record[${index}] (${r.gameId}) win probability out of [0,1]`);
  }
  if (Math.abs(homeWinProbability + awayWinProbability - 1) > COHERENCE_TOLERANCE) {
    throw new CfbV2PublicArtifactValidationError(`record[${index}] (${r.gameId}) win probabilities do not sum to 1`);
  }
}

/**
 * Narrow, browser-safe validation of an already-parsed JSON value against
 * the compact public V2 contract. Throws CfbV2PublicArtifactValidationError
 * on any structural problem — never returns a partially-trusted artifact.
 * Callers (the hook below) are expected to catch this and fail safe.
 */
export function validateCfbV2PublicArtifact(value: unknown, expectedSeason?: number): CfbV2PublicProjectionArtifact {
  if (typeof value !== "object" || value === null) throw new CfbV2PublicArtifactValidationError("artifact is not an object");
  const a = value as Record<string, unknown>;
  if (a.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new CfbV2PublicArtifactValidationError(`unexpected schemaVersion: ${String(a.schemaVersion)} (expected ${EXPECTED_SCHEMA_VERSION})`);
  }
  if (typeof a.season !== "number") throw new CfbV2PublicArtifactValidationError("artifact.season is not a number");
  if (expectedSeason !== undefined && a.season !== expectedSeason) {
    throw new CfbV2PublicArtifactValidationError(`artifact.season (${a.season}) does not match the expected season (${expectedSeason})`);
  }
  if (a.healthState !== "HEALTHY" && a.healthState !== "DEGRADED") {
    throw new CfbV2PublicArtifactValidationError(`unexpected healthState: ${String(a.healthState)}`);
  }
  if (!Array.isArray(a.records)) throw new CfbV2PublicArtifactValidationError("artifact.records is not an array");

  const seenGameIds = new Set<string>();
  a.records.forEach((row, index) => {
    validateRow(row, index);
    const gameId = (row as CfbV2PublicProjectionRow).gameId;
    if (seenGameIds.has(gameId)) throw new CfbV2PublicArtifactValidationError(`duplicate gameId in artifact: ${gameId}`);
    seenGameIds.add(gameId);
  });

  return value as CfbV2PublicProjectionArtifact;
}

/** Game-ID join only — never joins on team name, date, or matchup text. */
export function indexCfbV2ProjectionsByGameId(artifact: CfbV2PublicProjectionArtifact): ReadonlyMap<string, CfbV2PublicProjectionRow> {
  return new Map(artifact.records.map((r) => [r.gameId, r]));
}

/**
 * Internal-only shadow representation for one game — NOT the authoritative
 * `CfbGame.model`. `legacy` is populated only when a computed V2 row
 * exists, using the exact WU1 legacyCompat.ts semantics (sign-flipped
 * margin -> spread); it is null for unavailable/missing/FBS-vs-FCS games,
 * matching current honest-null UI behavior if it were ever wired in
 * (it is not, in this WU).
 */
export type CfbV2ShadowProjection = {
  gameId: string;
  found: boolean;
  matchupPopulation: CfbV2MatchupPopulation | null;
  projectionStatus: CfbV2ProjectionStatus | null;
  legacy: CfbGameModelProjections | null;
  raw: {
    expectedHomePoints: number | null;
    expectedAwayPoints: number | null;
    projectedMargin: number | null;
    projectedTotal: number | null;
    homeWinProbability: number | null;
    awayWinProbability: number | null;
  } | null;
};

export function buildCfbV2ShadowProjection(gameId: string, byGameId: ReadonlyMap<string, CfbV2PublicProjectionRow>): CfbV2ShadowProjection {
  const row = byGameId.get(gameId);
  if (!row) {
    return { gameId, found: false, matchupPopulation: null, projectionStatus: null, legacy: null, raw: null };
  }
  const computed = row.projectionStatus === "computed";
  return {
    gameId,
    found: true,
    matchupPopulation: row.matchupPopulation,
    projectionStatus: row.projectionStatus,
    legacy: computed
      ? {
          jkbProjectedSpread: projectedMarginToUiSpread(row.projectedMargin),
          jkbProjectedTotal: row.projectedTotal,
          homeWinProbability: row.homeWinProbability,
          awayWinProbability: row.awayWinProbability,
          neutralPowerDifference: null,
          homeFieldAdjustment: null,
          jkbPowerLine: null,
        }
      : null,
    raw: computed
      ? {
          expectedHomePoints: row.expectedHomePoints,
          expectedAwayPoints: row.expectedAwayPoints,
          projectedMargin: row.projectedMargin,
          projectedTotal: row.projectedTotal,
          homeWinProbability: row.homeWinProbability,
          awayWinProbability: row.awayWinProbability,
        }
      : null,
  };
}
