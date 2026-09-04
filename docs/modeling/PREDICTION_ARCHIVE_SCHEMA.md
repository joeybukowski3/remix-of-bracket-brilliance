# Prediction Archive Schema

Status: implemented for forward production spread, passing, rushing, and receiving predictions in Work Unit 1, with append-only outcome resolution implemented in Work Unit 2, automated 2026 postgame refresh/persistence implemented in WU2.5, and the deterministic evaluation materializer implemented in Work Unit 3 (2026-09-02, see [Evaluation Dataset Schema](EVALUATION_DATASET_SCHEMA.md)). WU4A (2026-09-02) adds a backwards-compatible `team_opportunity` prediction type (one row per team per game: projected plays, dropback rate, pass attempts, rush attempts). WU4C.1 (2026-09-02, operational) wires `team_opportunity` through WU2 outcome resolution, WU3 evaluation materialization, and the scheduled production workflows -- see below. The NFL total model (2026-09-04) adds a backwards-compatible `team_total` prediction type (one row per team per game: projected team points) additively wired the same way -- see "`team_total` outcome resolution and evaluation" below.

### `team_total` outcome resolution and evaluation (NFL projected game total, 2026-09-04)

`team_total` resolves purely from `games.json` + `results.json`, joined by `game_id` + canonical team + `home_away`, once the game is `final` -- the same lightweight path as `spread`, and unlike `team_opportunity` it never depends on any nflverse play-derived cache. One archived row is one team's expected points; its actual is that team's final score (`team_points`), the opponent's score (`opponent_points`), and the game total (`game_total`), all three carried on both sibling (home + away) rows of a game so the evaluation materializer can pair them without a second read of `results.json`. `points_error = projected_team_points - actual.team_points`, matching every other family's `projection - actual` sign convention. `market_reference_status` is always `"not_applicable"` and `market_snapshot_refs` is always empty -- the total model has, and must never gain, a Vegas input (see `docs/modeling/JKB_MODELING_MASTER_SPEC.md`'s "JKB total" section). The evaluation row's GAME TOTAL metrics (MAE/RMSE/correlation/bias of `projected_team_points` summed across the two sibling rows vs. `actual.game_total`) are computed downstream in the materializer by pairing on `game_id`, never on the archive/resolver side.

### `team_opportunity` outcome resolution and evaluation (WU4C.1)

`team_opportunity` resolves against `data/nfl/nflverse/play-volume-team-game/` (the same PBP-derived cache WU4A trains against), joined by `game_id` + canonical team, once the game is `final`. It is a **team-level** resolution path, independent of `data/nfl/nflverse/player-week-stats/` and `data/nfl/nflverse/weekly-rosters/` -- a delayed or failed player-stat refresh never blocks it (it has its own `pending_team_stats` resolution status, distinct from `pending_player_stats`, for exactly this reason).

**Naming note (semantic audit finding, not a bug fix in scope here):** `teamOpportunityFeatures.ts`'s training target literally assigns `passAttempts: actual.passPlays`, where `passPlays` (from `nfl-epa-core.mjs`'s `classifyPlay`) counts sacks and QB scrambles as pass plays -- i.e. it is a true **dropback** count, not the official box-score "attempts" column (which excludes sacks/scrambles). WU4A's `projected_pass_attempts` / `projected_rush_attempts` projection fields inherit this naming, predating WU4C.1. Renaming those fields touches WU4A's shipped code/tests and was out of scope for this operational work unit (model-math lockout). Instead, the new outcome/evaluation types name the actual values honestly -- `dropbacks` and `designed_rush_attempts`, not `pass_attempts`/`rush_attempts` -- and grade `projected_pass_attempts` against `actual.dropbacks` (the like-for-like comparison, since that is what the model was actually trained on). A separate, purely diagnostic `actual.pass_attempts` field is also populated opportunistically from official player-week stats when available (never required for resolution) so the two counts stay distinguishable. A future model-touching work unit should rename the WU4A projection fields themselves via a version-safe migration.

Outcome actual fields: `team_plays`, `dropbacks`, `dropback_rate`, `designed_rush_attempts`, `pass_attempts` (nullable diagnostic). Error fields (all `projection - actual`, matching every other family): `team_plays_error`, `dropbacks_error`, `dropback_rate_error`, `designed_rush_attempts_error`, `pass_attempts_error` (nullable). See `TeamOpportunityActual`/`TeamOpportunityDerived` in `scripts/lib/nfl-prediction-outcome-resolver.ts`.

WU3 evaluation rows (`TeamOpportunityEvaluationRow`) carry the same actual/error fields plus prediction-time cohorts: `home_away`, `favorite_underdog`, `spread_bucket_abs`, `total_bucket`, `week_band`, `model_version`. There is no player-market `volume`/`market` block -- there is no over/under line on a team's play count. See `scripts/lib/nfl-evaluation-cohorts.ts`'s `deriveTeamOpportunityCohorts` and `scripts/lib/nfl-evaluation-metrics.ts`'s `teamOpportunityExtras`.

## Design choice for this repository

Use append-only JSONL partitions initially, following the existing game-line and yardage-market stores. Keep immutable prediction events, market observations, outcome events, and evaluation events separate. Publish smaller derived browser artifacts from those private/research stores. A database may replace the file adapter later without changing event semantics.

Recommended partitions:

```text
data/nfl/predictions/<season>/<week>/<model-name>.jsonl
data/nfl/predictions/manifests/sources/<sha256>.json
data/nfl/predictions/manifests/fitted-models/<sha256>.json
data/nfl/prediction-outcomes/<season>/<week>/<prediction-type>.jsonl
data/nfl/prediction-evaluations/<evaluation-version>/<family>/<season>.jsonl
```

WU3 refined the evaluation partitioning to one file per model family per season, plus a `resolution-status/<season>.jsonl` ledger and a `summary/<season>.json` artifact; see [Evaluation Dataset Schema](EVALUATION_DATASET_SCHEMA.md).

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

The implemented `snapshot_key` is the stable logical entity key: league, season, week, game, entity, prediction type, model name, and model version. The `entity` segment is the `player_id` for player predictions, the literal `game` for `spread`, and `team:<team>` for `team_opportunity` (which has a home row and an away row per game and no player). `spread` and the player types keep their exact historical key shape and `prediction_id`s — the `team:<team>` form applies only to `team_opportunity`.

WU4A relaxes two validation rules for `team_opportunity` only: `player_id` must be absent (not present), and the finite/non-negative projection check is replaced by the team-opportunity coherence check (`pass + rush == plays`, `dropback_rate <= 1`). `fitted_model_hash` is still required (the model is a refit ridge). No existing prediction type's validation changes. `prediction_id` is `pred_` plus SHA-256 of that key and the material state: mode, projection payload, feature payload hash, source-manifest hashes, fitted-model hash, and ordered market references. Operational timestamps, labels, and run IDs are provenance and do not force duplicates. Thus a retry or later run over byte-equivalent logical state is idempotent, while a changed projection, actual feature value/vector, fitted state, source content, or market state creates a new immutable snapshot. This is the concrete WU1 interpretation of a “legitimate new timestamp”: time alone is not a material model state change.

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

// WU4A backwards-compatible extension. One row per team per game.
type TeamOpportunityProjection = {
  type: "team_opportunity";
  projected_team_plays: number;       // eligible rush + pass plays
  projected_dropback_rate: number;    // 0..1
  projected_pass_attempts: number;    // dropbacks
  projected_rush_attempts: number;    // designed rushes
  // Invariant enforced by validation: pass + rush == plays (within 1e-6),
  // all finite and non-negative, dropback_rate <= 1.
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

WU4B adds an additive `values.allocation_diagnostics` object to `receiving` predictions produced by `nfl-receiving-share-x-efficiency-v2.0.0`: `allocation_model_version`, `projected_team_opportunity` (WU4A dropbacks) / `projected_targetable_pool` / `implied_targetable_ratio`, `projected_opportunity_share` and `prior_opportunity_share`, `prior_team`, a deterministic `role_confidence_evidence` vector (depth rank, sourced flag, teamChanged, no/limited history, prior games, roster competition), `allocation_fallback_reason` (`none` / `noTeamOpportunity` / `equalSplit`), and the team-level `residual_unallocated` (~0 by construction, surfaced not hidden). It is `null` on every v1 receiving row and absent for other prediction types. The receiving share model is reproduced from the committed `role-allocation-dataset-2022-2025.json`, whose content hash is in `source_manifest_hashes`. A v1 -> v2 model-version change is a material state change, so v2 rows get fresh `prediction_id`s; no v1 row is altered.

WU1 source manifests are shared, canonical JSON documents containing logical name, repository-relative path, SHA-256 content hash, and document generation/schema metadata when available. Fitted-model manifests similarly hash the semantic model identity, training seasons, ordered feature schema, hyperparameters/shrinkage constants, fallbacks, standardization state, and coefficients/constants. Prediction rows carry only the manifest hashes, avoiding repeated source metadata across hundreds of rows.

## Outcome events

Outcomes append after the game and never alter prediction lines. `scripts/lib/nfl-prediction-outcome-resolver.ts` is the sole outcome validator/writer, and `npm run resolve:nfl-prediction-outcomes -- --season=<year> --week=<week> [--dry-run]` is the manual entrypoint. The implemented resolver version is `nfl-prediction-outcome-resolver-v1`.

```ts
type PredictionOutcomeV1 = {
  schema_version: "jkb-football-prediction-outcome-v1";
  outcome_id: string;
  prediction_id: string;
  snapshot_key: string;
  outcome_revision: number;
  supersedes_outcome_id: string | null;
  prediction_type: "spread" | "passing" | "rushing" | "receiving";
  season: number;
  week: number;
  game_id: string;
  player_id: string | null;
  team: string;
  opponent: string;
  recorded_at: string;
  resolved_at: string | null;
  resolution_status:
    | "resolved"
    | "pending_game"
    | "pending_player_stats"
    | "inactive"
    | "not_applicable"
    | "identity_unresolved"
    | "source_missing";
  game_completion_status: "final" | "not_final" | "missing";
  resolver_version: "nfl-prediction-outcome-resolver-v1";
  provider: "nflverse";
  source_artifacts: {
    logical_name: string;
    path: string;
    provider: string;
    content_hash: string;
    source_updated_at: string | null;
  }[];
  source_state_hash: string;
  identity_resolution: {
    method: "game_id" | "canonical_player_id_and_game_id" | "canonical_player_id_and_roster" | "unresolved";
    actual_team: string | null;
    actual_opponent: string | null;
    team_match: boolean | null;
    roster_status: string | null;
    zero_source: "stats_table" | "active_roster_confirmed" | null;
  };
  actual: SpreadActual | PassingActual | RushingActual | ReceivingActual | null;
  derived: SpreadDerived | PassingDerived | RushingDerived | ReceivingDerived | null;
};
```

`outcome_id` is `outcome_` plus SHA-256 over prediction ID, revision number, resolution status, game completion status, the relevant source-state hash, identity evidence, actual values, and deterministic derived values. Operational timestamps and whole-artifact hashes are provenance and do not create revisions by themselves. An exact rerun of the latest relevant source/outcome state appends nothing and is reported as `already_resolved`. A changed relevant game, player-stat, or roster state appends the next `outcome_revision`, links `supersedes_outcome_id`, and preserves every prior event. A source reversion to an older value is still a new revision because it differs from the latest state. Pending and terminal non-resolved states are also explicit append-only events; this prevents silent skips.

The source-state hash uses only the relevant schedule/result/player/roster evidence, so an unrelated correction elsewhere in a season file does not revise every prediction. Whole source artifact hashes remain on each event for later verification. Current authoritative sources are:

- Games and completion: `public/data/nfl/<season>/games.json` plus `results.json`, produced by the existing nflverse `nfldata games.csv` schedule/results workflow. A game resolves only when the schedule row says `final` and the matching result says `final: true` with both scores.
- Player outcomes: `data/nfl/nflverse/player-week-stats/stats_player_week_<season>.csv`, provider `nflverse/nflverse-data stats_player`, joined by `gsis:<player_id>` and exact `game_id`. `npm run nfl:player-week-stats-cache -- --seasons=2026 --partial-season=2026` refreshes the 2026 projection from `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv`, preserving IDs, game/team/opponent fields, zeroes, upstream hashes, retrieval timestamps, and coverage metadata.
- DNP evidence: `data/nfl/nflverse/weekly-rosters/roster_weekly_<season>.csv`, provider `nflverse/nflverse-data weekly_rosters`, joined by GSIS ID, season/week, and one of the completed game's teams. Current cache coverage is 2023-2026; it cannot create a resolved player outcome unless game results are final.

Upstream refreshes replace these canonical source artifacts. The resolver detects relevant corrected content and appends a revision; it never rewrites an outcome or prediction.

The current-season release may update game by game. An absent player row can use weekly-roster evidence only after at least one player-stat row establishes that the exact game is present in the refreshed release. Until then player predictions remain `pending_player_stats`; finalized spread predictions still resolve from schedules/results. If the player-stat refresh itself fails, automation invokes the resolver with `--prediction-types=spread`, so an older player cache cannot create new or regressed player outcomes.

### Outcome values and error signs

Spread actual margin is `final home score - final away score`, matching positive `projected_home_margin` as a home-team advantage. All error fields use the repository metric convention `projection - actual`; absolute errors are their absolute value. Factual game total may be retained, but no NFL total prediction or total error is created.

Passing resolves attempts, completions when present, yards, and YPA only for attempts greater than zero. Rushing resolves carries, yards, and YPC only for carries greater than zero. Receiving resolves targets, receptions, yards, YPT only for targets greater than zero, and YPR only for receptions greater than zero. A zero denominator produces `null`, never infinity or a fabricated rate. Component errors remain `null` when the archived prediction did not emit that component.

Spread market results are an array keyed by the archived comparison observation. Each entry uses that observation's home spread, provider, book, and timestamp. JKB side is determined by projected home margin versus the market-implied home margin; ATS win/loss/push is then deterministic from final home margin. An equal model/market direction is `not_applicable`. No observation is reclassified as closing.

### Zero, inactive, and missing rules

- A present stats-table row preserves its reported zeros as real outcomes.
- With no stats row, an exact weekly-roster `ACT` row on a team in the completed game establishes a true all-zero offensive outcome (`active_roster_confirmed`). This includes a dressed player with no carries/targets and a backup quarterback who never enters.
- An exact `INA` row is `inactive` with null actuals, never zero.
- Other exact roster states such as reserve/developmental are `not_applicable` with null actuals.
- No stats row and no decisive roster evidence is `pending_player_stats`; a missing player artifact is `source_missing`.
- A canonical player found in the same game on the other team can resolve with `team_match: false` (trade/team mismatch). Evidence attached to neither game team, duplicate matches, or ambiguous roster matches is `identity_unresolved`.

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

WU2.5 makes `.github/workflows/nfl-schedules-results.yml` the outcome owner. Its order is schedules/results refresh -> authoritative 2026 player-week refresh -> resolver -> strict persistence. The original daily NFL-season schedule, shared `main-data-writers` lock, and five-attempt fetch/rebase/push sequence remain intact. The commit step stages schedules/results, only `stats_player_week_2026.csv` plus its manifest, and only 2026 `spread|passing|rushing|receiving` outcome partitions; any unexpected path under either WU2 root fails closed. Exact reruns stage no duplicate outcome data. Upstream corrections refresh the source and append a linked outcome revision.

Emergency/debug sequence:

```sh
npm run nfl:schedules
npm run nfl:player-week-stats-cache -- --seasons=2026 --partial-season=2026
npm run resolve:nfl-prediction-outcomes -- --season=2026 --dry-run
npm run resolve:nfl-prediction-outcomes -- --season=2026
```

`--week=<week>` may narrow either resolver command. `--prediction-types=spread` is the automation/debug safety valve when a verified player-stat refresh is unavailable: spreads may resolve while player outcomes remain untouched and pending for a later successful source refresh.
