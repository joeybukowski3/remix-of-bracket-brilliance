import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const PREDICTION_ARCHIVE_SCHEMA_VERSION = "jkb-football-prediction-v1" as const;

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type PredictionType = "spread" | "passing" | "rushing" | "receiving" | "team_opportunity" | "team_total";

export type MarketSnapshotReference = {
  purpose: "model_input" | "comparison" | "evaluation";
  market_type: "spread" | "total" | "passing_yards" | "rushing_yards" | "receiving_yards";
  market_observation_id: string | null;
  content_hash: string | null;
  provider: string;
  sportsbook: string;
  observed_at: string;
  provider_updated_at: string | null;
  line: number;
  over_price: number | null;
  under_price: number | null;
  side_prices: Record<string, number | null> | null;
  designation: "first_observed" | "available_at_prediction" | "final_pre_kickoff" | "other";
};

export type ProjectionPayload =
  | { type: "spread"; projected_home_margin: number; projected_spread_team: string | null; projected_spread_line: number; market_spread: number | null; edge: number | null; formatted_jkb_spread?: string; home_power_number?: number; away_power_number?: number; home_field_adjustment?: number }
  | { type: "passing"; projected_attempts: number | null; projected_ypa: number | null; projected_passing_yards: number; direct_model_prediction: number }
  | { type: "rushing"; projected_carries: number; projected_ypc: number; projected_rushing_yards: number }
  | { type: "receiving"; projected_targets: number; projected_receptions: number | null; projected_yards_per_reception: number | null; projected_yards_per_target: number; projected_receiving_yards: number }
  | { type: "team_opportunity"; projected_team_plays: number; projected_dropback_rate: number; projected_pass_attempts: number; projected_rush_attempts: number }
  | { type: "team_total"; projected_team_points: number };

export type PredictionSnapshotV1 = {
  schema_version: typeof PREDICTION_ARCHIVE_SCHEMA_VERSION;
  prediction_id: string;
  snapshot_key: string;
  snapshot_label: string | null;
  prediction_timestamp: string;
  created_at: string;
  mode: "production" | "shadow" | "backtest" | "historical_replay";
  sport: "football";
  league: "nfl";
  season: number;
  week: number;
  slate_date: string | null;
  game_id: string;
  kickoff_utc: string;
  player_id: string | null;
  player_name_at_prediction: string | null;
  team: string;
  opponent: string;
  home_away: "home" | "away";
  neutral_site: boolean;
  position: "QB" | "RB" | "WR" | "TE" | null;
  prediction_type: PredictionType;
  model_name: string;
  model_version: string;
  feature_schema_version: string;
  pipeline_version: string;
  code_revision: string | null;
  run_id: string;
  workflow_name: string | null;
  workflow_run_id: string | null;
  cutoff_policy: "slate_before_first_kickoff" | "game_before_kickoff";
  status: "projected" | "eligible_insufficient_history" | "not_eligible" | "unavailable";
  projection: ProjectionPayload;
  feature_snapshot: {
    values: Record<string, JsonValue>;
    ordered_vector?: number[];
    imputation_flags?: Record<string, string>;
    source_manifest_hashes: Record<string, string>;
    fitted_model_hash: string | null;
    feature_payload_hash: string;
  };
  market_reference_status: "available" | "missing" | "not_applicable";
  market_snapshot_refs: MarketSnapshotReference[];
  provenance: { kind: "source_manifest" | "fitted_model_manifest"; logical_name: string; content_hash: string }[];
};

export type SourceManifest = {
  schema_version: "jkb-source-manifest-v1";
  logical_name: string;
  sources: { logical_name: string; path: string; content_hash: string; generated_at: string | null; schema_version: string | null }[];
};

export type FittedModelManifest = {
  schema_version: "jkb-fitted-model-manifest-v1";
  model_name: string;
  model_version: string;
  training_seasons: number[];
  feature_schema_version: string;
  feature_order: string[];
  parameters: Record<string, JsonValue>;
  fitted_state: JsonValue;
};

function assertJsonValue(value: unknown, path = "value"): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite numbers`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonValue(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) throw new Error(`${path}.${key} must not be undefined`);
      assertJsonValue(entry, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`${path} is not JSON-serializable`);
}

export function canonicalJson(value: JsonValue): string {
  assertJsonValue(value);
  const normalize = (entry: JsonValue): JsonValue => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry !== null && typeof entry === "object") {
      return Object.fromEntries(Object.keys(entry).sort().map((key) => [key, normalize(entry[key])])) as Record<string, JsonValue>;
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
}

export function contentHash(value: JsonValue | string): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

export function buildSourceManifest(logicalName: string, sources: { logicalName: string; path: string; content: string }[]): { manifest: SourceManifest; hash: string } {
  const rows = sources.map((source) => {
    let generatedAt: string | null = null;
    let schemaVersion: string | null = null;
    try {
      const parsed = JSON.parse(source.content) as Record<string, unknown>;
      const meta = parsed._meta as Record<string, unknown> | undefined;
      generatedAt = typeof meta?.generatedAt === "string" ? meta.generatedAt : typeof parsed.generatedAt === "string" ? parsed.generatedAt : null;
      schemaVersion = typeof parsed.schemaVersion === "string" ? parsed.schemaVersion : typeof meta?.schemaVersion === "string" ? meta.schemaVersion : null;
    } catch { /* CSV and JSONL sources intentionally have no document-level metadata. */ }
    return { logical_name: source.logicalName, path: source.path.replaceAll("\\", "/"), content_hash: contentHash(source.content), generated_at: generatedAt, schema_version: schemaVersion };
  }).sort((a, b) => a.logical_name.localeCompare(b.logical_name) || a.path.localeCompare(b.path));
  const manifest: SourceManifest = { schema_version: "jkb-source-manifest-v1", logical_name: logicalName, sources: rows };
  return { manifest, hash: contentHash(manifest as unknown as JsonValue) };
}

export function buildFittedModelManifest(input: Omit<FittedModelManifest, "schema_version">): { manifest: FittedModelManifest; hash: string } {
  const manifest: FittedModelManifest = { schema_version: "jkb-fitted-model-manifest-v1", ...input };
  return { manifest, hash: contentHash(manifest as unknown as JsonValue) };
}

function isoMillis(value: string, field: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || !value.endsWith("Z")) throw new Error(`${field} must be a valid UTC ISO-8601 timestamp`);
  return milliseconds;
}

function requiredString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
}

export function validatePredictionSnapshot(record: PredictionSnapshotV1): void {
  assertJsonValue(record as unknown, "prediction");
  if (record.schema_version !== PREDICTION_ARCHIVE_SCHEMA_VERSION) throw new Error("unsupported schema_version");
  for (const [field, value] of Object.entries({ prediction_id: record.prediction_id, snapshot_key: record.snapshot_key, game_id: record.game_id, team: record.team, opponent: record.opponent, model_name: record.model_name, model_version: record.model_version, feature_schema_version: record.feature_schema_version, pipeline_version: record.pipeline_version, run_id: record.run_id })) requiredString(value, field);
  if (!Number.isInteger(record.season) || !Number.isInteger(record.week) || record.week < 1) throw new Error("season/week must be positive integers");
  if (record.sport !== "football" || record.league !== "nfl") throw new Error("sport/league must be football/nfl");
  if (!["production", "shadow", "backtest", "historical_replay"].includes(record.mode)) throw new Error("unsupported mode");
  if (!["home", "away"].includes(record.home_away)) throw new Error("unsupported home_away");
  if (!["projected", "eligible_insufficient_history", "not_eligible", "unavailable"].includes(record.status)) throw new Error("unsupported status");
  if (!["slate_before_first_kickoff", "game_before_kickoff"].includes(record.cutoff_policy)) throw new Error("unsupported cutoff_policy");
  if (!["available", "missing", "not_applicable"].includes(record.market_reference_status)) throw new Error("unsupported market_reference_status");
  if (record.prediction_type !== record.projection.type || !["spread", "passing", "rushing", "receiving", "team_opportunity", "team_total"].includes(record.prediction_type)) throw new Error("prediction_type must match projection.type");
  const predictionTime = isoMillis(record.prediction_timestamp, "prediction_timestamp");
  isoMillis(record.created_at, "created_at");
  const kickoff = isoMillis(record.kickoff_utc, "kickoff_utc");
  if (record.mode === "production" && predictionTime >= kickoff) throw new Error("production prediction_timestamp must precede kickoff_utc");
  if (record.prediction_type !== "spread" && record.prediction_type !== "team_opportunity" && record.prediction_type !== "team_total" && !record.player_id) throw new Error("player_id is required for player predictions");
  if (record.prediction_type === "team_opportunity" && record.player_id) throw new Error("team_opportunity predictions must not carry a player_id");
  if (record.prediction_type === "team_total" && record.player_id) throw new Error("team_total predictions must not carry a player_id");
  if (record.prediction_type !== "spread" && !record.feature_snapshot.fitted_model_hash) throw new Error("player, team_opportunity, and team_total predictions require fitted_model_hash");
  requiredString(record.feature_snapshot.feature_payload_hash, "feature_payload_hash");
  const expectedFeatureHash = contentHash({ values: record.feature_snapshot.values, ordered_vector: record.feature_snapshot.ordered_vector ?? null, imputation_flags: record.feature_snapshot.imputation_flags ?? null } as JsonValue);
  if (record.feature_snapshot.feature_payload_hash !== expectedFeatureHash) throw new Error("feature_payload_hash mismatch");
  if (Object.keys(record.feature_snapshot.source_manifest_hashes).length === 0) throw new Error("source_manifest_hashes is required");
  for (const reference of record.market_snapshot_refs) {
    if (!["model_input", "comparison", "evaluation"].includes(reference.purpose)) throw new Error("unsupported market purpose");
    const observed = isoMillis(reference.observed_at, "market observed_at");
    if (observed > predictionTime) throw new Error("market observation must not be after prediction_timestamp");
    if (!Number.isFinite(reference.line)) throw new Error("market line must be finite");
    requiredString(reference.provider, "market provider");
    requiredString(reference.sportsbook, "market sportsbook");
  }
  if (record.market_reference_status === "missing" && record.market_snapshot_refs.length !== 0) throw new Error("missing market status cannot include references");
  if (record.market_reference_status === "available" && record.market_snapshot_refs.length === 0) throw new Error("available market status requires references");
  if (record.projection.type === "spread") {
    for (const n of [record.projection.projected_home_margin, record.projection.projected_spread_line]) if (!Number.isFinite(n)) throw new Error("spread projection fields must be finite");
  } else if (record.projection.type === "passing") {
    for (const n of [record.projection.projected_passing_yards, record.projection.direct_model_prediction]) if (!Number.isFinite(n)) throw new Error("passing projection fields must be finite");
  } else if (record.projection.type === "rushing") {
    for (const n of [record.projection.projected_carries, record.projection.projected_ypc, record.projection.projected_rushing_yards]) if (!Number.isFinite(n)) throw new Error("rushing projection fields must be finite");
  } else if (record.projection.type === "team_opportunity") {
    const p = record.projection;
    for (const n of [p.projected_team_plays, p.projected_dropback_rate, p.projected_pass_attempts, p.projected_rush_attempts]) if (!Number.isFinite(n) || n < 0) throw new Error("team_opportunity projection fields must be finite and non-negative");
    if (p.projected_dropback_rate > 1) throw new Error("team_opportunity projected_dropback_rate must not exceed 1");
    if (Math.abs(p.projected_pass_attempts + p.projected_rush_attempts - p.projected_team_plays) > 1e-6) throw new Error("team_opportunity pass + rush attempts must reconstitute projected_team_plays");
  } else if (record.projection.type === "team_total") {
    if (!Number.isFinite(record.projection.projected_team_points)) throw new Error("team_total projected_team_points must be finite");
    // The home+away sum invariant (projectedGameTotal = homeExpectedPoints + awayExpectedPoints) spans
    // the TWO sibling rows of one game and cannot be checked from a single record in isolation -- it is
    // enforced at generation time (see src/lib/nfl/props/totals/totalsGenerator.ts and its tests), the
    // same way team_opportunity's own generator enforces plays == pass + rush before archiving, not here.
  } else {
    for (const n of [record.projection.projected_targets, record.projection.projected_yards_per_target, record.projection.projected_receiving_yards]) if (!Number.isFinite(n)) throw new Error("receiving projection fields must be finite");
  }
  if (!record.prediction_id.startsWith("pred_") || record.prediction_id !== `pred_${contentHash(identityState(record))}`) throw new Error("prediction_id does not match material state");
}

export type PredictionSnapshotDraft = Omit<PredictionSnapshotV1, "prediction_id" | "snapshot_key" | "feature_snapshot"> & {
  feature_snapshot: Omit<PredictionSnapshotV1["feature_snapshot"], "feature_payload_hash">;
};

function identityState(record: PredictionSnapshotV1 | (PredictionSnapshotDraft & { snapshot_key: string; feature_snapshot: PredictionSnapshotV1["feature_snapshot"] })): JsonValue {
  return {
    snapshot_key: record.snapshot_key,
    mode: record.mode,
    projection: record.projection,
    feature_payload_hash: record.feature_snapshot.feature_payload_hash,
    source_manifest_hashes: record.feature_snapshot.source_manifest_hashes,
    fitted_model_hash: record.feature_snapshot.fitted_model_hash,
    market_snapshot_refs: record.market_snapshot_refs,
  } as JsonValue;
}

export function finalizePredictionSnapshot(draft: PredictionSnapshotDraft): PredictionSnapshotV1 {
  const featurePayloadHash = contentHash({ values: draft.feature_snapshot.values, ordered_vector: draft.feature_snapshot.ordered_vector ?? null, imputation_flags: draft.feature_snapshot.imputation_flags ?? null } as JsonValue);
  // team_opportunity and team_total both have two rows per game (home +
  // away) with no player_id; their logical entity key must include `team`
  // so the sibling rows do not collide. Every other prediction type keeps
  // its historical key shape exactly (unchanged prediction_ids).
  const entityKey = draft.player_id ?? (draft.prediction_type === "team_opportunity" || draft.prediction_type === "team_total" ? `team:${draft.team}` : "game");
  const snapshotKey = [draft.league, draft.season, draft.week, draft.game_id, entityKey, draft.prediction_type, draft.model_name, draft.model_version].join("|");
  const state = identityState({ ...draft, snapshot_key: snapshotKey, feature_snapshot: { ...draft.feature_snapshot, feature_payload_hash: featurePayloadHash } });
  const record: PredictionSnapshotV1 = {
    ...draft,
    prediction_id: `pred_${contentHash(state)}`,
    snapshot_key: snapshotKey,
    feature_snapshot: { ...draft.feature_snapshot, feature_payload_hash: featurePayloadHash },
  };
  validatePredictionSnapshot(record);
  return record;
}

function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function safeModelFileName(modelName: string): string {
  return modelName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function archiveProductionPredictions(options: {
  rootDir: string;
  records: readonly PredictionSnapshotV1[];
  sourceManifests?: readonly { hash: string; manifest: SourceManifest }[];
  fittedModelManifests?: readonly { hash: string; manifest: FittedModelManifest }[];
}): { appended: number; duplicates: number; files: string[] } {
  options.records.forEach(validatePredictionSnapshot);
  for (const item of options.sourceManifests ?? []) {
    if (contentHash(item.manifest as unknown as JsonValue) !== item.hash) throw new Error("source manifest hash mismatch");
    const target = join(options.rootDir, "manifests", "sources", `${item.hash}.json`);
    if (existsSync(target)) {
      if (contentHash(JSON.parse(readFileSync(target, "utf8")) as JsonValue) !== item.hash) throw new Error(`source manifest collision for ${item.hash}`);
    } else atomicWrite(target, `${canonicalJson(item.manifest as unknown as JsonValue)}\n`);
  }
  for (const item of options.fittedModelManifests ?? []) {
    if (contentHash(item.manifest as unknown as JsonValue) !== item.hash) throw new Error("fitted model manifest hash mismatch");
    const target = join(options.rootDir, "manifests", "fitted-models", `${item.hash}.json`);
    if (existsSync(target)) {
      if (contentHash(JSON.parse(readFileSync(target, "utf8")) as JsonValue) !== item.hash) throw new Error(`fitted model manifest collision for ${item.hash}`);
    } else atomicWrite(target, `${canonicalJson(item.manifest as unknown as JsonValue)}\n`);
  }

  const grouped = new Map<string, PredictionSnapshotV1[]>();
  for (const record of options.records) {
    const path = join(options.rootDir, String(record.season), String(record.week).padStart(2, "0"), `${safeModelFileName(record.model_name)}.jsonl`);
    grouped.set(path, [...(grouped.get(path) ?? []), record]);
  }
  let appended = 0;
  let duplicates = 0;
  const files: string[] = [];
  for (const [path, incoming] of grouped) {
    const existing = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as PredictionSnapshotV1) : [];
    existing.forEach(validatePredictionSnapshot);
    const byId = new Map(existing.map((record) => [record.prediction_id, record]));
    const additions: PredictionSnapshotV1[] = [];
    for (const record of incoming) {
      const previous = byId.get(record.prediction_id);
      if (previous) {
        if (canonicalJson(identityState(previous)) !== canonicalJson(identityState(record))) throw new Error(`prediction_id collision for ${record.prediction_id}`);
        duplicates += 1;
        continue;
      }
      byId.set(record.prediction_id, record);
      additions.push(record);
    }
    if (additions.length > 0) {
      const all = [...existing, ...additions];
      atomicWrite(path, `${all.map((record) => canonicalJson(record as unknown as JsonValue)).join("\n")}\n`);
      appended += additions.length;
      files.push(path);
    }
  }
  return { appended, duplicates, files };
}
