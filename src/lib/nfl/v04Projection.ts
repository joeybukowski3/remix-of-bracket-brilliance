/**
 * nfl-power-v0.4-beta — 2026 preseason projection layer.
 *
 * This is a distinct, hand-curated artifact that sits ABOVE the automated
 * nfl-power-v0.3.1 objective model (see v03Review.ts). It is intentionally
 * decoupled from that module — no shared validation helpers, no shared
 * selection state — because it is not another window of the automated model,
 * it is a separate preseason projection layer with its own governance.
 *
 * Three layers, kept structurally distinct on every team row:
 *   - rating2025Adjusted        = jkbV03Rating + guideCalibrationAdjustment + luckAdjustment
 *   - projectionAdjustment2026  = personnelAdjustment + coachAdjustment + returningInjuryAdjustment
 *   - rating2026                = rating2025Adjusted + projectionAdjustment2026
 *
 * sosRank / sosAvgOpponentRating are display/context only and must never
 * feed any of the three formulas above (_meta.sosAffectsRating is required
 * to be false and is asserted at validation time).
 *
 * The detailed luck panel (components.luckAverageRank) was only transcribed
 * for the teams listed in _meta.luckCoverageTeams. A null luckAverageRank
 * means "not transcribed for this team" — it must never be read as "verified
 * league-average luck." Validation enforces that only coverage teams carry a
 * non-null luckAverageRank.
 */

export const NFL_V04_MODEL_VERSION = "nfl-power-v0.4-beta" as const;
export const NFL_V04_BASE_MODEL = "nfl-power-v0.3.1" as const;

/** Reconciliation checks compare rounded, published values against a chain
 * of independently-rounded upstream figures, so small compounding drift is
 * expected rather than a data error. This tolerance covers up to two
 * one-decimal roundings plus the source's own display rounding. */
const RECONCILIATION_TOLERANCE = 0.15;

const KNOWN_DIVISIONS = new Set([
  "AFC East",
  "AFC North",
  "AFC South",
  "AFC West",
  "NFC East",
  "NFC North",
  "NFC South",
  "NFC West",
]);

const KNOWN_CONFIDENCE_LABELS = new Set([
  "Low",
  "Medium-Low",
  "Medium",
  "Medium-High",
  "High",
]);

export type NflV04Scale = {
  min: number;
  center: number;
  max: number;
};

export type NflV04Meta = {
  modelVersion: string;
  season: number;
  sourceSeason: number;
  scale: NflV04Scale;
  baseModel: string;
  guideCalibrationWeight: number;
  guideCalibrationCap: number;
  luckAdjustmentCap: number;
  projectionAdjustmentCap: number;
  sosAffectsRating: false;
  luckCoverageTeams: string[];
  offseasonSnapshotVerifiedThrough: string;
  status: string;
};

/** Internal-only breakdown. Never ships past publicProjection2026.ts. */
export type NflV04TeamComponents = {
  jkbV03Rating: number;
  guideRating: number;
  guideCalibrationAdjustment: number;
  /** null = detailed luck panel not transcribed for this team (not "neutral"). */
  luckAverageRank: number | null;
  luckAdjustment: number;
  personnelAdjustment: number;
  coachAdjustment: number;
  returningInjuryAdjustment: number;
};

export type NflV04TeamProjection = {
  rank: number;
  team: string;
  abbr: string;
  division: string;
  rating2025Adjusted: number;
  projectionAdjustment2026: number;
  rating2026: number;
  sosRank: number;
  sosAvgOpponentRating: number;
  confidence: string;
  components: NflV04TeamComponents;
  notes: string;
};

export type NflV04ProjectionArtifact = {
  _meta: NflV04Meta;
  teams: NflV04TeamProjection[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function requireFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function requireNullableFinite(value: unknown, path: string): number | null {
  if (value === null) return null;
  return requireFinite(value, path);
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path} must be a boolean`);
  return value;
}

function assertNoNonFinite(value: unknown, path: string): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${path} contains a non-finite number`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoNonFinite(entry, `${path}[${index}]`));
  } else if (isRecord(value)) {
    Object.entries(value).forEach(([key, entry]) => assertNoNonFinite(entry, `${path}.${key}`));
  }
}

function requireCloseTo(actual: number, expected: number, path: string, detail: string): void {
  if (Math.abs(actual - expected) > RECONCILIATION_TOLERANCE) {
    throw new Error(
      `${path} does not reconcile (${detail}): got ${actual}, expected ~${expected.toFixed(3)} (tolerance ${RECONCILIATION_TOLERANCE})`
    );
  }
}

function validateMeta(value: unknown, path: string): NflV04Meta {
  const meta = requireRecord(value, `${path}._meta`);
  if (meta.modelVersion !== NFL_V04_MODEL_VERSION) {
    throw new Error(`${path}._meta.modelVersion must be ${NFL_V04_MODEL_VERSION}`);
  }
  requireFinite(meta.season, `${path}._meta.season`);
  requireFinite(meta.sourceSeason, `${path}._meta.sourceSeason`);
  if (meta.baseModel !== NFL_V04_BASE_MODEL) {
    throw new Error(`${path}._meta.baseModel must be ${NFL_V04_BASE_MODEL}`);
  }
  const scale = requireRecord(meta.scale, `${path}._meta.scale`);
  if (scale.min !== 1 || scale.center !== 50 || scale.max !== 99) {
    throw new Error(`${path}._meta.scale must be { min: 1, center: 50, max: 99 }`);
  }
  requireFinite(meta.guideCalibrationWeight, `${path}._meta.guideCalibrationWeight`);
  requireFinite(meta.guideCalibrationCap, `${path}._meta.guideCalibrationCap`);
  requireFinite(meta.luckAdjustmentCap, `${path}._meta.luckAdjustmentCap`);
  requireFinite(meta.projectionAdjustmentCap, `${path}._meta.projectionAdjustmentCap`);
  if (requireBoolean(meta.sosAffectsRating, `${path}._meta.sosAffectsRating`) !== false) {
    throw new Error(`${path}._meta.sosAffectsRating must be false — SOS must never feed the rating`);
  }
  const luckCoverageTeams = requireArray(meta.luckCoverageTeams, `${path}._meta.luckCoverageTeams`).map(
    (entry, index) => requireString(entry, `${path}._meta.luckCoverageTeams[${index}]`)
  );
  if (new Set(luckCoverageTeams).size !== luckCoverageTeams.length) {
    throw new Error(`${path}._meta.luckCoverageTeams contains duplicates`);
  }
  requireString(meta.offseasonSnapshotVerifiedThrough, `${path}._meta.offseasonSnapshotVerifiedThrough`);
  if (Number.isNaN(Date.parse(meta.offseasonSnapshotVerifiedThrough as string))) {
    throw new Error(`${path}._meta.offseasonSnapshotVerifiedThrough must be a valid date`);
  }
  requireString(meta.status, `${path}._meta.status`);
  return meta as NflV04Meta;
}

function validateComponents(value: unknown, path: string): NflV04TeamComponents {
  const components = requireRecord(value, path);
  requireFinite(components.jkbV03Rating, `${path}.jkbV03Rating`);
  requireFinite(components.guideRating, `${path}.guideRating`);
  requireFinite(components.guideCalibrationAdjustment, `${path}.guideCalibrationAdjustment`);
  const luckAverageRank = requireNullableFinite(components.luckAverageRank, `${path}.luckAverageRank`);
  requireFinite(components.luckAdjustment, `${path}.luckAdjustment`);
  requireFinite(components.personnelAdjustment, `${path}.personnelAdjustment`);
  requireFinite(components.coachAdjustment, `${path}.coachAdjustment`);
  requireFinite(components.returningInjuryAdjustment, `${path}.returningInjuryAdjustment`);
  return { ...components, luckAverageRank } as NflV04TeamComponents;
}

function validateTeam(value: unknown, path: string): NflV04TeamProjection {
  const row = requireRecord(value, path);
  requireFinite(row.rank, `${path}.rank`);
  requireString(row.team, `${path}.team`);
  requireString(row.abbr, `${path}.abbr`);
  const division = requireString(row.division, `${path}.division`);
  if (!KNOWN_DIVISIONS.has(division)) throw new Error(`${path}.division "${division}" is not a recognized NFL division`);

  const rating2025Adjusted = requireFinite(row.rating2025Adjusted, `${path}.rating2025Adjusted`);
  if (rating2025Adjusted < 1 || rating2025Adjusted > 99) {
    throw new Error(`${path}.rating2025Adjusted is outside [1, 99]`);
  }
  const projectionAdjustment2026 = requireFinite(row.projectionAdjustment2026, `${path}.projectionAdjustment2026`);
  const rating2026 = requireFinite(row.rating2026, `${path}.rating2026`);
  if (rating2026 < 1 || rating2026 > 99) {
    throw new Error(`${path}.rating2026 is outside [1, 99]`);
  }
  const sosRank = requireFinite(row.sosRank, `${path}.sosRank`);
  if (!Number.isInteger(sosRank) || sosRank < 1 || sosRank > 32) {
    throw new Error(`${path}.sosRank must be an integer in [1, 32]`);
  }
  requireFinite(row.sosAvgOpponentRating, `${path}.sosAvgOpponentRating`);

  const confidence = requireString(row.confidence, `${path}.confidence`);
  if (!KNOWN_CONFIDENCE_LABELS.has(confidence)) {
    throw new Error(`${path}.confidence "${confidence}" is not a recognized label`);
  }

  const components = validateComponents(row.components, `${path}.components`);
  const notes = requireString(row.notes, `${path}.notes`);

  requireCloseTo(
    rating2025Adjusted,
    components.jkbV03Rating + components.guideCalibrationAdjustment + components.luckAdjustment,
    `${path}.rating2025Adjusted`,
    "jkbV03Rating + guideCalibrationAdjustment + luckAdjustment"
  );
  requireCloseTo(
    projectionAdjustment2026,
    components.personnelAdjustment + components.coachAdjustment + components.returningInjuryAdjustment,
    `${path}.projectionAdjustment2026`,
    "personnelAdjustment + coachAdjustment + returningInjuryAdjustment"
  );
  requireCloseTo(
    rating2026,
    rating2025Adjusted + projectionAdjustment2026,
    `${path}.rating2026`,
    "rating2025Adjusted + projectionAdjustment2026"
  );

  return {
    rank: row.rank,
    team: row.team,
    abbr: row.abbr,
    division,
    rating2025Adjusted,
    projectionAdjustment2026,
    rating2026,
    sosRank,
    sosAvgOpponentRating: row.sosAvgOpponentRating,
    confidence,
    components,
    notes,
  } as NflV04TeamProjection;
}

/**
 * Validate a raw parsed JSON value as an nfl-power-v0.4-beta projection
 * artifact. Throws with a descriptive path-qualified message on any
 * violation. Enforces the 32-team invariants, the SOS/rating separation,
 * and the luck-coverage null-vs-zero distinction.
 */
export function validateNflV04ProjectionArtifact(
  value: unknown,
  path = "nfl-power-v0.4-beta"
): NflV04ProjectionArtifact {
  const artifact = requireRecord(value, path);
  assertNoNonFinite(artifact, path);

  const meta = validateMeta(artifact._meta, path);
  const rawTeams = requireArray(artifact.teams, `${path}.teams`);
  if (rawTeams.length !== 32) {
    throw new Error(`${path}.teams must contain exactly 32 teams, got ${rawTeams.length}`);
  }

  const teams = rawTeams.map((entry, index) => validateTeam(entry, `${path}.teams[${index}]`));

  const abbrs = teams.map((team) => team.abbr);
  if (new Set(abbrs).size !== abbrs.length) {
    throw new Error(`${path}.teams contains duplicate abbreviations`);
  }

  const ranks = teams.map((team) => team.rank).sort((a, b) => a - b);
  const expectedRanks = Array.from({ length: 32 }, (_, index) => index + 1);
  if (JSON.stringify(ranks) !== JSON.stringify(expectedRanks)) {
    throw new Error(`${path}.teams ranks must be exactly 1..32 with no duplicates or gaps`);
  }

  const sosRanks = teams.map((team) => team.sosRank).sort((a, b) => a - b);
  if (JSON.stringify(sosRanks) !== JSON.stringify(expectedRanks)) {
    throw new Error(`${path}.teams sosRank values must be exactly 1..32 with no duplicates or gaps`);
  }

  const byRank = [...teams].sort((a, b) => a.rank - b.rank);
  const byRatingDesc = [...teams].sort((a, b) => b.rating2026 - a.rating2026);
  for (let i = 0; i < byRank.length; i += 1) {
    if (byRank[i].abbr !== byRatingDesc[i].abbr) {
      throw new Error(
        `${path}.teams rank order does not match descending rating2026 order at position ${i + 1} ` +
          `(rank list has ${byRank[i].abbr}, rating2026-sorted has ${byRatingDesc[i].abbr})`
      );
    }
  }

  const coverageSet = new Set(meta.luckCoverageTeams.map((abbr) => abbr.toUpperCase()));
  for (const team of teams) {
    const isCoverageTeam = coverageSet.has(team.abbr.toUpperCase());
    const hasLuckRank = team.components.luckAverageRank !== null;
    if (hasLuckRank && !isCoverageTeam) {
      throw new Error(
        `${path}.teams[${team.abbr}].components.luckAverageRank is set but ${team.abbr} is not in _meta.luckCoverageTeams`
      );
    }
    if (!hasLuckRank && isCoverageTeam) {
      throw new Error(
        `${path}.teams[${team.abbr}].components.luckAverageRank is null but ${team.abbr} is listed in _meta.luckCoverageTeams`
      );
    }
  }

  return { _meta: meta, teams };
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry));
  }
  return value;
}
