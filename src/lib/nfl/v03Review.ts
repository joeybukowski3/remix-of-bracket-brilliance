export const NFL_V03_REVIEW_SEASONS = [2022, 2023, 2024, 2025, 2026] as const;

export type NflV03ReviewSeason = (typeof NFL_V03_REVIEW_SEASONS)[number];
export type NflV03ArtifactKind =
  | "fullSeason"
  | "finalEight"
  | "preseason"
  | "contextFlags"
  | "manualAdjustments";

export const NFL_V03_METRIC_KEYS = [
  "offEpaPerPlay",
  "defEpaPerPlay",
  "netEpaPerPlay",
  "pointDiffPerGame",
] as const;

export type NflV03MetricKey = (typeof NFL_V03_METRIC_KEYS)[number];

export type NflV03Meta = {
  schemaVersion: string;
  modelVersion: string;
  validationStatus: string;
  generatedAt: string;
  season: number;
  source: string;
  notes: string[];
  knownLimitations: string[];
  formulaWeights: Record<string, number>;
  frozenPublicScaleDivisor: number;
  trajectory: {
    statement: string;
    lambda: number;
    shrinkageK: number;
    cap: number;
  };
};

export type NflV03Metric = {
  raw: number | null;
  adjusted: number | null;
  zScore: number | null;
  rank: number | null;
  missing: boolean;
};

export type NflV03Metrics = Record<NflV03MetricKey, NflV03Metric>;

export type NflV03FullSeasonTeam = {
  teamId: string;
  slug: string;
  abbr: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number | null;
  winPercentageScored: false;
  metrics: NflV03Metrics;
  passingEpaPerPlay: number | null;
  rushingEpaPerPlay: number | null;
  pythagoreanExpectedWins: number | null;
  expectedWinsDelta: number | null;
  adjustedComposite: number | null;
  rawComposite: number | null;
};

export type NflV03ContextFlag = {
  gameId: string;
  team: string;
  flag: string;
  origin: "manual" | "screen";
  confirmed?: unknown;
  source?: string;
  enteredBy: string;
  date: string;
  note: string;
};

export type NflV03FinalEightTeam = {
  teamId: string;
  slug: string;
  abbr: string;
  name: string;
  windowGames: string[];
  windowSize: number;
  shortWindow: boolean;
  l8OpponentStrength: number | null;
  contextFlags: NflV03ContextFlag[];
  canonicalMetricsLabel: string;
  metrics: NflV03Metrics;
  metricsExFlaggedLabel: string;
  metricsExFlagged: NflV03Metrics;
  alternateExcludedGameIds: string[];
  rawComposite: number | null;
  adjustedComposite: number | null;
  rawDelta: number | null;
  adjustedDelta: number | null;
  rawVsAdjGap: number | null;
  trajectoryRaw: number | null;
  trajectoryShrunk: number | null;
  trajectoryClamped: number | null;
  trajectoryLabel: string;
  modifiers: string[];
  triggers: Record<string, number>;
};

export type NflV03PreseasonRating = {
  teamId: string;
  slug: string;
  abbr: string;
  name: string;
  historical: {
    fullSeasonComposite: number;
    l8AdjustedComposite: number;
    trajectoryRaw: number;
    trajectoryShrunk: number;
    trajectoryClamped: number;
    lambda: number;
    k: number;
    cap: number;
  };
  manualAdjustments: string[];
  internalZ: number;
  publicRating: number;
  offenseRating: number;
  defenseRating: number;
  uncertainty: {
    band: string;
    inputs: Record<string, string | number | boolean | null>;
  };
  rank: number;
  rankChange: number | null;
  ratingChange: number | null;
};

export type NflV03ManualAdjustment = {
  team: string;
  component: "qb" | "coaching";
  value: number;
  author: string;
  date: string;
  rationale: string;
  sourceRef: string;
  reviewBy: string;
  expires: string;
  status: "active" | "expired" | "superseded";
};

export type NflV03FullSeasonArtifact = {
  _meta: NflV03Meta;
  adjustmentMethods: Record<string, string>;
  metricKeys: NflV03MetricKey[];
  teams: NflV03FullSeasonTeam[];
};

export type NflV03FinalEightArtifact = {
  _meta: NflV03Meta;
  adjustmentMethods: Record<string, string>;
  metricKeys: NflV03MetricKey[];
  teams: NflV03FinalEightTeam[];
};

export type NflV03PreseasonArtifact = {
  _meta: NflV03Meta;
  sourceSeason: number;
  ratings: NflV03PreseasonRating[];
};

export type NflV03ContextFlagsArtifact = {
  _meta: NflV03Meta;
  flags: NflV03ContextFlag[];
};

export type NflV03ManualAdjustmentsArtifact = {
  _meta: NflV03Meta;
  entries: NflV03ManualAdjustment[];
};

export type NflV03ArtifactByKind = {
  fullSeason: NflV03FullSeasonArtifact;
  finalEight: NflV03FinalEightArtifact;
  preseason: NflV03PreseasonArtifact;
  contextFlags: NflV03ContextFlagsArtifact;
  manualAdjustments: NflV03ManualAdjustmentsArtifact;
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
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${path} must be a non-empty string`);
  return value;
}

function requireFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be finite`);
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

function assertNoNonFinite(value: unknown, path: string): void {
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
  if (Array.isArray(value)) value.forEach((entry, index) => assertNoNonFinite(entry, `${path}[${index}]`));
  else if (isRecord(value)) Object.entries(value).forEach(([key, entry]) => assertNoNonFinite(entry, `${path}.${key}`));
}

function validateMeta(value: unknown, season: number, path: string): NflV03Meta {
  const meta = requireRecord(value, `${path}._meta`);
  if (meta.schemaVersion !== "nfl-v0.2") throw new Error(`${path} has an invalid schemaVersion`);
  if (meta.modelVersion !== "nfl-power-v0.3.0") throw new Error(`${path} has an invalid modelVersion`);
  if (meta.validationStatus !== "stage-1") throw new Error(`${path} has an invalid validationStatus`);
  if (meta.season !== season) throw new Error(`${path} has an invalid season`);
  if (typeof meta.generatedAt !== "string" || Number.isNaN(Date.parse(meta.generatedAt))) {
    throw new Error(`${path} has an invalid generatedAt`);
  }
  requireString(meta.source, `${path}._meta.source`);
  requireArray(meta.notes, `${path}._meta.notes`).forEach((note, index) => requireString(note, `${path}._meta.notes[${index}]`));
  requireArray(meta.knownLimitations, `${path}._meta.knownLimitations`).forEach((note, index) => requireString(note, `${path}._meta.knownLimitations[${index}]`));
  const weights = requireRecord(meta.formulaWeights, `${path}._meta.formulaWeights`);
  const weightTotal = Object.values(weights).reduce((sum, weight, index) => sum + requireFinite(weight, `${path}._meta.formulaWeights[${index}]`), 0);
  if (Math.abs(weightTotal - 1) > 1e-9) throw new Error(`${path} formula weights do not sum to 1`);
  if (meta.frozenPublicScaleDivisor !== 0.733) throw new Error(`${path} has an invalid public scale divisor`);
  const trajectory = requireRecord(meta.trajectory, `${path}._meta.trajectory`);
  if (trajectory.statement !== "lambda = 0" || trajectory.lambda !== 0 || trajectory.shrinkageK !== 4 || trajectory.cap !== 1) {
    throw new Error(`${path} has invalid trajectory metadata`);
  }
  return meta as NflV03Meta;
}

function validateMetric(value: unknown, path: string): NflV03Metric {
  const metric = requireRecord(value, path);
  if (typeof metric.missing !== "boolean") throw new Error(`${path}.missing must be boolean`);
  const raw = requireNullableFinite(metric.raw, `${path}.raw`);
  const adjusted = requireNullableFinite(metric.adjusted, `${path}.adjusted`);
  const zScore = requireNullableFinite(metric.zScore, `${path}.zScore`);
  const rank = metric.rank === null ? null : requireFinite(metric.rank, `${path}.rank`);
  if (metric.missing && [raw, adjusted, zScore, rank].some((entry) => entry !== null)) {
    throw new Error(`${path} has inconsistent missing values`);
  }
  if (!metric.missing && [raw, adjusted, zScore, rank].some((entry) => entry === null)) {
    throw new Error(`${path} is missing required metric values`);
  }
  return metric as NflV03Metric;
}

function validateMetrics(value: unknown, path: string): NflV03Metrics {
  const metrics = requireRecord(value, path);
  if (JSON.stringify(Object.keys(metrics)) !== JSON.stringify(NFL_V03_METRIC_KEYS)) {
    throw new Error(`${path} has an invalid metric-key set`);
  }
  NFL_V03_METRIC_KEYS.forEach((key) => validateMetric(metrics[key], `${path}.${key}`));
  return metrics as NflV03Metrics;
}

function validateTeamIdentity(row: UnknownRecord, path: string): void {
  requireString(row.teamId, `${path}.teamId`);
  requireString(row.slug, `${path}.slug`);
  requireString(row.abbr, `${path}.abbr`);
  requireString(row.name, `${path}.name`);
}

function validateFullSeason(value: UnknownRecord, season: number, path: string): NflV03FullSeasonArtifact {
  validateMeta(value._meta, season, path);
  const keys = requireArray(value.metricKeys, `${path}.metricKeys`);
  if (JSON.stringify(keys) !== JSON.stringify(NFL_V03_METRIC_KEYS)) throw new Error(`${path} has invalid metricKeys`);
  requireRecord(value.adjustmentMethods, `${path}.adjustmentMethods`);
  requireArray(value.teams, `${path}.teams`).forEach((entry, index) => {
    const row = requireRecord(entry, `${path}.teams[${index}]`);
    validateTeamIdentity(row, `${path}.teams[${index}]`);
    ["gamesPlayed", "wins", "losses", "ties"].forEach((key) => requireFinite(row[key], `${path}.teams[${index}].${key}`));
    requireNullableFinite(row.winPercentage, `${path}.teams[${index}].winPercentage`);
    if (row.winPercentageScored !== false) throw new Error(`${path}.teams[${index}] must mark win percentage display-only`);
    validateMetrics(row.metrics, `${path}.teams[${index}].metrics`);
    ["passingEpaPerPlay", "rushingEpaPerPlay", "pythagoreanExpectedWins", "expectedWinsDelta", "adjustedComposite", "rawComposite"].forEach((key) => requireNullableFinite(row[key], `${path}.teams[${index}].${key}`));
  });
  return value as NflV03FullSeasonArtifact;
}

function validateContextFlag(value: unknown, path: string): NflV03ContextFlag {
  const flag = requireRecord(value, path);
  ["gameId", "team", "flag", "enteredBy", "date", "note"].forEach((key) => requireString(flag[key], `${path}.${key}`));
  if (flag.origin !== "manual" && flag.origin !== "screen") throw new Error(`${path}.origin is invalid`);
  if (flag.origin === "manual") requireString(flag.source, `${path}.source`);
  return flag as NflV03ContextFlag;
}

function validateFinalEight(value: UnknownRecord, season: number, path: string): NflV03FinalEightArtifact {
  validateMeta(value._meta, season, path);
  const keys = requireArray(value.metricKeys, `${path}.metricKeys`);
  if (JSON.stringify(keys) !== JSON.stringify(NFL_V03_METRIC_KEYS)) throw new Error(`${path} has invalid metricKeys`);
  requireRecord(value.adjustmentMethods, `${path}.adjustmentMethods`);
  requireArray(value.teams, `${path}.teams`).forEach((entry, index) => {
    const row = requireRecord(entry, `${path}.teams[${index}]`);
    const rowPath = `${path}.teams[${index}]`;
    validateTeamIdentity(row, rowPath);
    const windowGames = requireArray(row.windowGames, `${rowPath}.windowGames`);
    windowGames.forEach((gameId, gameIndex) => requireString(gameId, `${rowPath}.windowGames[${gameIndex}]`));
    const windowSize = requireFinite(row.windowSize, `${rowPath}.windowSize`);
    if (windowSize !== windowGames.length || windowSize > 8 || row.shortWindow !== (windowSize < 8)) throw new Error(`${rowPath} has an invalid window`);
    requireNullableFinite(row.l8OpponentStrength, `${rowPath}.l8OpponentStrength`);
    requireArray(row.contextFlags, `${rowPath}.contextFlags`).forEach((flag, flagIndex) => validateContextFlag(flag, `${rowPath}.contextFlags[${flagIndex}]`));
    requireString(row.canonicalMetricsLabel, `${rowPath}.canonicalMetricsLabel`);
    requireString(row.metricsExFlaggedLabel, `${rowPath}.metricsExFlaggedLabel`);
    validateMetrics(row.metrics, `${rowPath}.metrics`);
    validateMetrics(row.metricsExFlagged, `${rowPath}.metricsExFlagged`);
    requireArray(row.alternateExcludedGameIds, `${rowPath}.alternateExcludedGameIds`).forEach((gameId, gameIndex) => requireString(gameId, `${rowPath}.alternateExcludedGameIds[${gameIndex}]`));
    ["rawComposite", "adjustedComposite", "rawDelta", "adjustedDelta", "rawVsAdjGap", "trajectoryRaw", "trajectoryShrunk", "trajectoryClamped"].forEach((key) => requireNullableFinite(row[key], `${rowPath}.${key}`));
    requireString(row.trajectoryLabel, `${rowPath}.trajectoryLabel`);
    requireArray(row.modifiers, `${rowPath}.modifiers`).forEach((modifier, modifierIndex) => requireString(modifier, `${rowPath}.modifiers[${modifierIndex}]`));
    Object.entries(requireRecord(row.triggers, `${rowPath}.triggers`)).forEach(([key, trigger]) => requireFinite(trigger, `${rowPath}.triggers.${key}`));
  });
  return value as NflV03FinalEightArtifact;
}

function validatePreseason(value: UnknownRecord, season: number, path: string): NflV03PreseasonArtifact {
  validateMeta(value._meta, season, path);
  requireFinite(value.sourceSeason, `${path}.sourceSeason`);
  requireArray(value.ratings, `${path}.ratings`).forEach((entry, index) => {
    const row = requireRecord(entry, `${path}.ratings[${index}]`);
    const rowPath = `${path}.ratings[${index}]`;
    validateTeamIdentity(row, rowPath);
    const historical = requireRecord(row.historical, `${rowPath}.historical`);
    ["fullSeasonComposite", "l8AdjustedComposite", "trajectoryRaw", "trajectoryShrunk", "trajectoryClamped", "lambda", "k", "cap"].forEach((key) => requireFinite(historical[key], `${rowPath}.historical.${key}`));
    if (historical.lambda !== 0 || historical.k !== 4 || historical.cap !== 1) throw new Error(`${rowPath} has invalid trajectory constants`);
    requireArray(row.manualAdjustments, `${rowPath}.manualAdjustments`).forEach((reference, referenceIndex) => requireString(reference, `${rowPath}.manualAdjustments[${referenceIndex}]`));
    ["internalZ", "publicRating", "offenseRating", "defenseRating", "rank"].forEach((key) => requireFinite(row[key], `${rowPath}.${key}`));
    ["publicRating", "offenseRating", "defenseRating"].forEach((key) => {
      const rating = row[key] as number;
      if (rating < 1 || rating > 99) throw new Error(`${rowPath}.${key} is outside [1, 99]`);
    });
    if (row.rankChange !== null) requireFinite(row.rankChange, `${rowPath}.rankChange`);
    if (row.ratingChange !== null) requireFinite(row.ratingChange, `${rowPath}.ratingChange`);
    const uncertainty = requireRecord(row.uncertainty, `${rowPath}.uncertainty`);
    requireString(uncertainty.band, `${rowPath}.uncertainty.band`);
    requireRecord(uncertainty.inputs, `${rowPath}.uncertainty.inputs`);
  });
  return value as NflV03PreseasonArtifact;
}

function validateContextFlags(value: UnknownRecord, season: number, path: string): NflV03ContextFlagsArtifact {
  validateMeta(value._meta, season, path);
  requireArray(value.flags, `${path}.flags`).forEach((flag, index) => validateContextFlag(flag, `${path}.flags[${index}]`));
  return value as NflV03ContextFlagsArtifact;
}

function validateManualAdjustments(value: UnknownRecord, season: number, path: string): NflV03ManualAdjustmentsArtifact {
  validateMeta(value._meta, season, path);
  requireArray(value.entries, `${path}.entries`).forEach((entry, index) => {
    const row = requireRecord(entry, `${path}.entries[${index}]`);
    const rowPath = `${path}.entries[${index}]`;
    ["team", "author", "date", "rationale", "sourceRef", "reviewBy", "expires"].forEach((key) => requireString(row[key], `${rowPath}.${key}`));
    if (row.component !== "qb" && row.component !== "coaching") throw new Error(`${rowPath}.component is invalid`);
    const valueNumber = requireFinite(row.value, `${rowPath}.value`);
    if (Math.abs(valueNumber) > (row.component === "qb" ? 0.75 : 0.25)) throw new Error(`${rowPath}.value exceeds its governance limit`);
    if (!(["active", "expired", "superseded"] as unknown[]).includes(row.status)) throw new Error(`${rowPath}.status is invalid`);
  });
  return value as NflV03ManualAdjustmentsArtifact;
}

export function validateNflV03ReviewArtifact<K extends NflV03ArtifactKind>(
  kind: K,
  season: NflV03ReviewSeason,
  value: unknown,
  path = `${season}:${kind}`
): NflV03ArtifactByKind[K] {
  const artifact = requireRecord(value, path);
  assertNoNonFinite(artifact, path);
  if (kind === "fullSeason") return validateFullSeason(artifact, season, path) as NflV03ArtifactByKind[K];
  if (kind === "finalEight") return validateFinalEight(artifact, season, path) as NflV03ArtifactByKind[K];
  if (kind === "preseason") return validatePreseason(artifact, season, path) as NflV03ArtifactByKind[K];
  if (kind === "contextFlags") return validateContextFlags(artifact, season, path) as NflV03ArtifactByKind[K];
  return validateManualAdjustments(artifact, season, path) as NflV03ArtifactByKind[K];
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry));
  }
  return value;
}

export function publicScaleEquivalent(composite: number | null): number | null {
  if (composite === null || !Number.isFinite(composite)) return null;
  return Math.max(1, Math.min(99, 50 + 15 * (composite / 0.733)));
}

export type NflV03FullSortKey = "rank" | "team" | "record" | "rawComposite" | "adjustedComposite" | "offense" | "defense" | "net" | "pointDiff";

export function sortFullSeasonTeams(
  rows: readonly NflV03FullSeasonTeam[],
  key: NflV03FullSortKey,
  direction: "asc" | "desc"
): NflV03FullSeasonTeam[] {
  const ranked = [...rows].sort((a, b) => (b.adjustedComposite ?? Number.NEGATIVE_INFINITY) - (a.adjustedComposite ?? Number.NEGATIVE_INFINITY) || a.name.localeCompare(b.name));
  const rankByAbbr = new Map(ranked.map((row, index) => [row.abbr, index + 1]));
  const value = (row: NflV03FullSeasonTeam): string | number => {
    if (key === "rank") return rankByAbbr.get(row.abbr) ?? 999;
    if (key === "team") return row.name;
    if (key === "record") return row.winPercentage ?? Number.NEGATIVE_INFINITY;
    if (key === "rawComposite") return row.rawComposite ?? Number.NEGATIVE_INFINITY;
    if (key === "adjustedComposite") return row.adjustedComposite ?? Number.NEGATIVE_INFINITY;
    if (key === "offense") return row.metrics.offEpaPerPlay.zScore ?? Number.NEGATIVE_INFINITY;
    if (key === "defense") return row.metrics.defEpaPerPlay.zScore ?? Number.NEGATIVE_INFINITY;
    if (key === "net") return row.metrics.netEpaPerPlay.zScore ?? Number.NEGATIVE_INFINITY;
    return row.metrics.pointDiffPerGame.zScore ?? Number.NEGATIVE_INFINITY;
  };
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    const comparison = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
    return (direction === "asc" ? comparison : -comparison) || a.name.localeCompare(b.name);
  });
}

export type NflV03ValidationCheck = { label: string; pass: boolean; detail: string };

export function buildCrossArtifactChecks(artifacts: Partial<NflV03ArtifactByKind>, season: NflV03ReviewSeason): NflV03ValidationCheck[] {
  const loaded = Object.values(artifacts);
  const metas = loaded.map((artifact) => artifact?._meta).filter(Boolean) as NflV03Meta[];
  const full = artifacts.fullSeason;
  const final = artifacts.finalEight;
  const allFinite = loaded.every((artifact) => {
    try {
      assertNoNonFinite(artifact, "artifact");
      return true;
    } catch {
      return false;
    }
  });
  const weightsValid = metas.every((meta) => Math.abs(Object.values(meta.formulaWeights).reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
  return [
    { label: "Model version uniformity", pass: metas.length > 0 && metas.every((meta) => meta.modelVersion === "nfl-power-v0.3.0"), detail: "nfl-power-v0.3.0" },
    { label: "Stage-1 status uniformity", pass: metas.length > 0 && metas.every((meta) => meta.validationStatus === "stage-1"), detail: "stage-1" },
    { label: "Formula weights sum to 1", pass: weightsValid, detail: "0.40 + 0.40 + 0.20" },
    { label: "Frozen public divisor", pass: metas.length > 0 && metas.every((meta) => meta.frozenPublicScaleDivisor === 0.733), detail: "0.733" },
    { label: "Trajectory lambda", pass: metas.length > 0 && metas.every((meta) => meta.trajectory.lambda === 0), detail: "lambda 0 · k 4 · cap ±1.0" },
    { label: "Full/L8 metric-key identity", pass: Boolean(full && final && JSON.stringify(full.metricKeys) === JSON.stringify(final.metricKeys)), detail: full && final ? full.metricKeys.join(", ") : "requires both artifacts" },
    { label: "Finite numeric values", pass: allFinite, detail: allFinite ? "No NaN or Infinity" : "Non-finite value found" },
    { label: "Team-count expectation", pass: season === 2026 ? (full?.teams.length ?? 0) === 0 && (final?.teams.length ?? 0) === 0 : (full?.teams.length ?? 0) === 32 && (final?.teams.length ?? 0) === 32, detail: season === 2026 ? "honest empty performance state" : "32 full-season · 32 final-eight" },
    { label: "2026 honest empty state", pass: season !== 2026 || ((full?.teams.length ?? 0) === 0 && (final?.teams.length ?? 0) === 0), detail: season === 2026 ? "No invented performance rows" : "Not applicable" },
  ];
}
