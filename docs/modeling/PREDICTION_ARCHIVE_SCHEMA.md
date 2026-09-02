# Prediction Archive Schema

Status: implemented for forward production spread, passing, rushing, and receiving predictions in Work Unit 1 (2026-09-02). Outcome resolution remains unimplemented.

## Design choice for this repository

Use append-only JSONL partitions initially, following the existing game-line and yardage-market stores. Keep immutable prediction events, market observations, outcome events, and evaluation events separate. Publish smaller derived browser artifacts from those private/research stores. A database may replace the file adapter later without changing event semantics.

Recommended partitions:

```text
data/nfl/predictions/<season>/<week>/<model-name>.jsonl
data/nfl/predictions/manifests/sources/<sha256>.json
data/nfl/predictions/manifests/fitted-models/<sha256>.json
data/nfl/prediction-outcomes/<season>/<week>.jsonl
data/nfl/prediction-evaluations/<evaluation-version>/<season>/<week>.jsonl
```

Existing `data/market/betting-lines/history/` and `data/nfl/props/market-archive/` remain market stores; prediction records reference selected observation IDs/hashes rather than copy or mutate those sources.

## Prediction snapshot envelope

Each line is one immutable player-game-market or game-model prediction.

```ts
type PredictionSnapshotV1 = {
  schema_version: "jkb-football-prediction-v1";
  prediction_id: string;             // globally unique and stable
  snapshot_key: string;              // deterministic logical key
  snapshot_label: string | null;     // descriptive only, e.g. game_day_morning
  prediction_timestamp: string;      // UTC observation/cutoff
  created_at: string;                // UTC writer time
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
  team: string;                       // canonical lowercase site abbreviation
  opponent: string;
  home_away: "home" | "away";
  neutral_site: boolean;
  position: "QB" | "RB" | "WR" | "TE" | null;
  prediction_type: "spread" | "passing" | "rushing" | "receiving";

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
  projection: SpreadProjection | TotalProjection | PassingProjection | RushingProjection | ReceivingProjection;
  feature_snapshot: FeatureSnapshotReference;
  market_reference_status: "available" | "missing" | "not_applicable";
  market_snapshot_refs: MarketSnapshotReference[];
  provenance: ProvenanceReference[];
};
```

The implemented `snapshot_key` is the stable logical entity key: league, season, week, game, optional player, prediction type, model name, and model version. `prediction_id` is `pred_` plus SHA-256 of that key and the material state: mode, projection payload, feature payload hash, source-manifest hashes, fitted-model hash, and ordered market references. Operational timestamps, labels, and run IDs are provenance and do not force duplicates. Thus a retry or later run over byte-equivalent logical state is idempotent, while a changed projection, actual feature value/vector, fitted state, source content, or market state creates a new immutable snapshot. This is the concrete WU1 interpretation of a “legitimate new timestamp”: time alone is not a material model state change.

`created_at`, `prediction_timestamp`, and `run_id` from the first persisted occurrence remain authoritative when an identical state is retried. SHA-256 collisions are guarded by comparing the identity-bearing state before treating an existing ID as a duplicate.

## Projection payloads

```ts
type SpreadProjection = {
  type: "spread";
  projected_home_margin: number;
  projected_spread_team: string | null;
  projected_spread_line: number;
  home_power_number?: number;
  away_power_number?: number;
  home_field_adjustment?: number;
};

type TotalProjection = {
  type: "total";
  projected_total: number;
  projected_home_points?: number;
  projected_away_points?: number;
};

type PassingProjection = {
  type: "passing";
  projected_attempts: number | null;  // null for current direct model output
  projected_ypa: number | null;
  projected_passing_yards: number;
  direct_model_prediction: number;
};

type RushingProjection = {
  type: "rushing";
  projected_carries: number;
  projected_ypc: number;
  projected_rushing_yards: number;
};

type ReceivingProjection = {
  type: "receiving";
  projected_targets: number;
  projected_receptions: number | null;
  projected_yards_per_reception: number | null;
  projected_yards_per_target: number;
  projected_receiving_yards: number;
};
```

Do not fabricate decomposition legs for a model that does not produce them. Passing currently records direct yardage and must leave attempts/YPA projection fields null unless a versioned model genuinely emits them.

## Market snapshot reference

```ts
type MarketSnapshotReference = {
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
```

The prediction snapshot must capture or reference the exact market state used. `firstObservedAt` is not automatically an opening line. `final_pre_kickoff` may be assigned only by a deterministic postgame selection over observations strictly before kickoff. Market edge is derived (`projection - comparable line`) and should not be the only preserved value.

WU1 links each row only to observations at or before `prediction_timestamp`. Game markets select the latest eligible observation per sportsbook from `data/market/betting-lines/history/`; player comparisons select the latest eligible observation per sportsbook from `data/nfl/props/market-archive/`. Passing additionally records the exact nflverse spread and total used in its fitted vector with `purpose: model_input`, provider `nflverse/nfldata`, and sportsbook `undisclosed`. Rushing/receiving game-market fields remain archived feature context but are not mislabeled as model inputs. An empty reference list requires `market_reference_status: missing`; zero is never used as a missing sentinel. No WU1 reference is designated as closing.

## Feature snapshot

The existing yardage artifact already embeds a compact human-readable subset. Preserve that for diagnostics, but do not duplicate entire raw caches per prediction.

```ts
type FeatureSnapshotReference = {
  values: Record<string, number | string | boolean | null>;
  ordered_vector?: number[];          // required for fitted vector models where practical
  imputation_flags?: Record<string, string>;
  source_manifest_hashes: Record<string, string>;
  fitted_model_hash: string | null;
  feature_payload_hash: string;
};
```

For the passing ridge, store the ordered 16-value post-imputation vector, fallback vector, and fitted coefficient/model hash or an immutable fitted-model artifact reference. For rushing/receiving, store the selected raw window values, training constants, fallback volume, shrinkage constant, and calculated legs. For spread, store both Current OVR rows, blend weights, Power Numbers, input artifact hashes, coefficient and HFA. Large raw datasets remain in versioned/hash-verified caches.

WU1 source manifests are shared, canonical JSON documents containing logical name, repository-relative path, SHA-256 content hash, and document generation/schema metadata when available. Fitted-model manifests similarly hash the semantic model identity, training seasons, ordered feature schema, hyperparameters/shrinkage constants, fallbacks, standardization state, and coefficients/constants. Prediction rows carry only the manifest hashes, avoiding repeated source metadata across hundreds of rows.

## Outcome events

Outcomes append after the game and never alter prediction lines.

```ts
type PredictionOutcomeV1 = {
  schema_version: "jkb-football-prediction-outcome-v1";
  outcome_event_id: string;
  prediction_id: string;
  resolved_at: string;
  outcome_source: string;
  outcome_source_hash: string | null;
  status: "final" | "corrected" | "void" | "unresolved";
  final_home_score: number | null;
  final_away_score: number | null;
  actual_home_margin: number | null;
  actual_total: number | null;
  actual_attempts: number | null;
  actual_passing_yards: number | null;
  actual_carries: number | null;
  actual_rushing_yards: number | null;
  actual_targets: number | null;
  actual_receptions: number | null;
  actual_receiving_yards: number | null;
};
```

Corrections append a new event referencing the prior outcome event. An evaluation materializer derives projection error, directional winner, over/under/push, ATS result, market result and edge bucket under its own `evaluation_version`; those are not facts to bake into the immutable prediction.

## Multiple timestamps

Support any number of legitimate same-game snapshots. Use timestamp plus a stable optional label; do not encode timing only as fixed enum labels. Examples include an opening-window observation, early week, Friday, game-day morning, and final pregame, but workflows may choose other labels. Each snapshot declares its cutoff policy and links only to market/source observations available by that cutoff.

## Invariants

- Prediction rows are append-only and content-addressable.
- Production, shadow, backtest and replay modes cannot share ambiguous IDs.
- One `prediction_id` has one immutable prediction payload.
- Outcomes/evaluations reference prediction IDs and append independently.
- Timestamps are UTC ISO-8601; kickoff and prediction time are required.
- A production prediction timestamp must be before kickoff.
- Model, feature schema and pipeline versions are non-null.
- Market input references must be at or before the prediction timestamp.
- Duplicate logical rows fail validation; unresolved canonical identities do not enter production.

## Writer and integration behavior

`scripts/lib/nfl-production-prediction-archive.ts` owns canonical serialization, hashing, runtime validation, content-addressed manifest publication, partition selection, idempotency, and safe writes for every supported prediction type. It validates all rows before persistence and rewrites each affected JSONL partition through a same-directory temporary file plus atomic rename. Existing rows are replayed and validated before additions; malformed existing partitions fail closed.

Both production generators build, validate, and persist the archive before atomically replacing their existing browser artifact. Dry runs write neither output. A production row at or after kickoff is rejected; the season-wide spread generator archives only games still pre-kickoff while leaving its established live artifact schema and game coverage unchanged. This is single-writer workflow storage; concurrent multi-process locking is deferred unless production scheduling introduces overlapping writers.

The existing matchup-projection and yardage-projection GitHub workflows persist these outputs under their shared `main-data-writers` concurrency lock and existing fetch/rebase/push retry sequence. Each commit step discovers changed paths only beneath `data/nfl/predictions`, validates every path against its workflow-specific model-partition and 64-character manifest-hash allowlist, and stages each accepted filename explicitly. Unexpected archive paths fail the job; no blanket archive-directory staging is used. Existing live artifacts and their established commit behavior remain in the same commits.
