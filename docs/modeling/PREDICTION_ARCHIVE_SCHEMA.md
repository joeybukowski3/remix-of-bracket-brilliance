# Prediction Archive Schema

Status: design contract only. It does not authorize implementation or migration.

## Design choice for this repository

Use append-only JSONL partitions initially, following the existing game-line and yardage-market stores. Keep immutable prediction events, market observations, outcome events, and evaluation events separate. Publish smaller derived browser artifacts from those private/research stores. A database may replace the file adapter later without changing event semantics.

Recommended partitions:

```text
data/nfl/predictions/<season>/<week>/<model-name>.jsonl
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
  market_snapshot_refs: MarketSnapshotReference[];
  provenance: ProvenanceReference[];
};
```

`snapshot_key` should include league, game, optional player, model, version, market/output type, and prediction timestamp or run ID. Re-running at a new legitimate timestamp creates a new record, even if values are identical. Retrying the same run should be idempotent by `prediction_id`/`snapshot_key`.

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
