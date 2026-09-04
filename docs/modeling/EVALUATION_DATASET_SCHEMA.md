# Evaluation Dataset Schema

Status: implemented in Work Unit 3 (2026-09-02). The materializer transforms
the immutable WU1 production prediction archive plus WU2 resolved outcomes
into analysis-ready research datasets. It changes no model, projection,
prediction record, or outcome record. It is research/diagnostic
infrastructure only.

WU4C.1 (2026-09-02, operational) wires this into the scheduled
`nfl-schedules-results.yml` workflow -- it now runs automatically after WU2
resolution, on the same run, rather than by manual invocation only. It also
adds the `team_opportunity` family (see below).

The NFL projected-total model (2026-09-04) adds the `team_total` family
additively, the same way: `EVALUATION_DATASET_SCHEMA_VERSION` and
`EVALUATION_MATERIALIZER_VERSION` are unchanged, the `spread` /
`passing` / `rushing` / `receiving` / `team_opportunity` row shapes and
metrics are byte-identical to before, and no existing evaluation row is
altered. `team_total`'s row carries the TEAM SCORE error (`points_error`,
via the shared core MAE/RMSE/correlation/bias block, keyed on
`projected_team_points` vs. `actual.team_points`) and cohorts (week band,
home/away, division game, model version, history status, projected-total
bucket) but no `market`/`volume` field -- the total model has no player
prop or Vegas input. `computeMetricBlock("team_total", ...)` additionally
computes a GAME TOTAL component by pairing the two sibling (home + away)
rows of each `game_id` and comparing their summed `projected_team_points`
against the game's actual total (`unpaired_games_excluded` counts, never
silently drops, any team_total row whose sibling has not yet resolved).
Vegas is never read anywhere in this evaluation layer, matching the total
model's own no-market-input contract.

## Scope and non-goals

WU3 builds a trustworthy research layer. It does **not** change spread,
passing, rushing, or receiving math, does not build the NFL total model,
does not retune or promote anything, and does not create a public dashboard.
Cohort patterns it surfaces are diagnostic, never causal claims.

## Contract identity

- Row contract: `jkb-football-evaluation-v1`
- Summary contract: `jkb-football-evaluation-summary-v1`
- Materializer: `nfl-evaluation-materializer-v1`
- Owner module: `scripts/lib/nfl-evaluation-dataset.ts` (types, validation,
  serialization, latest-outcome selection), with
  `nfl-evaluation-rows.ts`, `nfl-evaluation-cohorts.ts`,
  `nfl-evaluation-metrics.ts`, `nfl-evaluation-materializer.ts`.
- Entry point: `npm run materialize:nfl-evaluation -- --season=<year> [--week=<week>] [--prediction-type=spread|passing|rushing|receiving|team_opportunity] [--dry-run]`

## Storage layout

```text
data/nfl/prediction-evaluations/jkb-football-evaluation-v1/
  spread/<season>.jsonl
  passing/<season>.jsonl
  rushing/<season>.jsonl
  receiving/<season>.jsonl
  resolution-status/<season>.jsonl
  summary/<season>.json
```

Row-level datasets are JSONL (one row per line, nested structures preserved:
market observation arrays, the passing fitted vector, the archived feature
snapshot). Summaries are deterministic pretty JSON. A CSV export layer may be
added later without changing this canonical format.

The materializer fully rewrites only the season/type files inside the filter
it was run with, through a same-directory temp file plus atomic rename. It
never writes under `data/nfl/predictions` or `data/nfl/prediction-outcomes`.

## Row = one prediction + one selected outcome + prediction-time context

Each evaluable row represents exactly one archived production prediction
snapshot joined to the latest valid resolved outcome revision for that
`prediction_id`, plus the market and feature state that was archived at
prediction time.

`evaluation_row_id` = `eval_` + SHA-256 over `{prediction_id,
selected_outcome_id}`. The row carries full identity linkage
(`prediction_id`, `snapshot_key`, `model_name`, `model_version`,
`feature_schema_version`, `pipeline_version`, `code_revision`, `run_id`,
`fitted_model_hash`, `feature_payload_hash`, `source_manifest_hashes`), the
prediction/kickoff timestamps, and `hours_to_kickoff` derived only from the
archived `kickoff_utc` and `prediction_timestamp`.

### Latest valid outcome selection

WU2 outcomes are revisioned append-only events; a later correction supersedes
but never deletes the prior event, and a reversion to an older value is still
a new (higher) revision. The materializer therefore, per `prediction_id`:

- selects `max(outcome_revision)` deterministically;
- records `selected_outcome_id`, `selected_outcome_revision`,
  `outcome_revision_count`, `superseded_outcome_ids[]`, and the full
  `outcome_revision_chronology[]` (`{outcome_revision, outcome_id,
  resolution_status, game_completion_status, recorded_at,
  supersedes_outcome_id}`), so the exact correction history stays
  inspectable;
- copies the selected event's `source_state_hash`, source-artifact hashes,
  and `identity_resolution` into the row.

### Resolution status handling

Only `resolution_status: "resolved"` outcomes enter the per-family evaluable
datasets and numeric error metrics. Every production prediction — resolved or
not — also produces a row in `resolution-status/<season>.jsonl` with
`ledger_status` in `{resolved, pending_game, pending_player_stats, inactive,
not_applicable, identity_unresolved, source_missing,
unresolved_missing_event}`, `evaluable` boolean, revision provenance, and a
`note`. `unresolved_missing_event` is a synthetic ledger status used only
when a production prediction has no WU2 outcome event at all; it is never a
real WU2 status. Nothing is silently dropped.

### Multiple point-in-time snapshots

WU1 intentionally allows multiple legitimate snapshots for one game/player.
Each `prediction_id` is evaluated independently, so N snapshots produce N
evaluation rows, each joined to the same final outcome. `hours_to_kickoff`
and `snapshot_label` allow later comparison of early-week versus game-day
projections.

### Production vs. backtest separation

Only predictions with `mode: "production"` are materialized; every row and
summary carries `evaluation_mode: "production"`, and non-production snapshots
are counted as `non_production_skipped`. Backtest/replay evaluation would use
a distinct `evaluation_mode` and namespace and is not implemented here. This
is deliberately separate from the Phase 11A historical / live-paper-trading
research join (`scripts/build-nfl-research-dataset.mjs`,
`nfl-research-*.mjs`), which reads the browser yardage artifact and a
provider archive rather than the immutable prediction archive. No forward
production timestamp is ever fabricated.

## Materialized fields by model family

All error fields use the repository convention `projection - actual`;
absolute errors are the absolute value. `bias` is `mean(projection - actual)`
(positive = over-projection).

### Spread

- Projection: `projected_home_margin`, `projected_spread_line`,
  `projected_spread_team`, `home_power_number`, `away_power_number`,
  `home_field_adjustment`, `archived_market_spread`,
  `archived_projection_edge` (all as archived; power/HFA fields null when the
  archive did not emit them).
- Actual: `home_score`, `away_score`, `home_margin`, `total`, `winner`.
- Error: `margin_error`, `absolute_margin_error`, `projected_winner_correct`,
  `projected_margin_direction`, `actual_margin_direction`.
- Market: per archived timestamp-valid `purpose: "comparison"` spread
  observation — `home_line`, `market_implied_home_margin` (`-home_line`),
  `jkb_vs_market_edge` (`projected_home_margin - market_implied_home_margin`),
  `jkb_side`, `ats_result` (copied from the WU2 derived market result; only
  present where the archived observation makes it mathematically valid). No
  observation is designated closing.

### Passing

- Projection: `projected_passing_yards`, `direct_model_prediction`,
  `projected_attempts`, `projected_ypa` (last two null for the current direct
  ridge).
- Fitted state: `fitted_ordered_vector` (the exact archived 16-value
  post-imputation vector, copied verbatim — never recomputed),
  `imputation_flags`, `fitted_model_hash`.
- Actual: `attempts`, `completions`, `yards`, `yards_per_attempt`,
  `touchdowns`, `interceptions`.
- Error: `yards_error`, `absolute_yards_error`, `attempts_error`,
  `ypa_error` (component errors null unless the archived prediction emitted
  that leg and the actual denominator is non-zero).
- Volume: `zero_volume`, `actual_volume` (attempts).
- Market: nullable — `line`, `over_price`, `under_price`, `break_even_over`,
  `break_even_under`, `jkb_vs_market_edge` (`projected_yards - line`),
  `over_under_result`. Prices and break-even accompany every directional
  result; raw hit rate is never a promotion signal.

### Rushing

- Projection: `projected_carries`, `projected_ypc`,
  `projected_rushing_yards`.
- Actual: `carries`, `yards`, `yards_per_carry`.
- Error: `yards_error`, `absolute_yards_error`, `carries_error`,
  `ypc_error` (null on a zero-carry actual). Component errors are exposed;
  WU3 deliberately does **not** assign a workload-vs-efficiency causal label.
- Volume: `zero_volume`, `actual_volume` (carries).
- Market: same nullable shape as passing.

### Receiving

- Projection: `projected_targets`, `projected_yards_per_target`,
  `projected_receiving_yards`, `projected_receptions`,
  `projected_yards_per_reception` (last two null for the current two-leg
  model).
- Actual: `targets`, `receptions`, `yards`, `yards_per_target`,
  `yards_per_reception`.
- Error: `yards_error`, `absolute_yards_error`, `targets_error`,
  `receptions_error`, `yards_per_target_error`,
  `yards_per_reception_error` (component errors null unless emitted and
  denominator non-zero).
- Volume: `zero_volume`, `actual_volume` (targets).
- Market: same nullable shape as passing.

### Team opportunity (WU4C.1, 2026-09-02)

- Projection: `projected_team_plays`, `projected_dropback_rate`,
  `projected_pass_attempts`, `projected_rush_attempts` (as archived by
  WU4A).
- Actual: `team_plays`, `dropbacks`, `dropback_rate`,
  `designed_rush_attempts`, `pass_attempts` (nullable diagnostic).
  `dropbacks`/`designed_rush_attempts` come from the same
  `data/nfl/nflverse/play-volume-team-game/` cache WU4A trains against
  (sacks and QB scrambles counted as dropbacks, matching
  `nfl-epa-core.mjs`'s `classifyPlay`) -- **not** the official box-score
  attempts/carries columns, which is why they are not named
  `pass_attempts`/`rush_attempts` here despite WU4A's own projection fields
  using that (pre-existing, undocumented-until-now) naming. `pass_attempts`
  is a separate, opportunistic sum of official player-week passing attempts
  for the team, populated only when player-week stats are published; it is
  never required for resolution.
- Error: `team_plays_error`, `absolute_team_plays_error`,
  `dropbacks_error`, `absolute_dropbacks_error`, `dropback_rate_error`,
  `designed_rush_attempts_error`, `pass_attempts_error` (nullable).
  `dropbacks_error` compares the projection's `projected_pass_attempts`
  against `actual.dropbacks` -- the like-for-like comparison given the
  naming note above.
- No `volume`/`market` block: there is no player-prop line on a team's
  play count, unlike the player families.
- Cohorts: `home_away`, `favorite_underdog` (from the prediction-time
  market spread sign), `spread_bucket_abs`, `total_bucket`, `week_band`,
  `model_version`.
- Resolution is **team-level**: it never reads `data/nfl/nflverse/
  player-week-stats/` or `weekly-rosters/` for its primary grade, and so is
  never blocked by a delayed player-stat publication (see
  `pending_team_stats` in [Prediction Archive Schema](PREDICTION_ARCHIVE_SCHEMA.md)).

Every row also carries `feature_snapshot_values` (the archived compact
feature subset, verbatim) for feature-conditioned research.

WU4B (2026-09-02) is additive here: `nfl-receiving-share-x-efficiency-v2.0.0`
predictions are joined and evaluated exactly like v1 receiving rows, and
appear as a distinct `model_version` grouping alongside v1. Their
`feature_snapshot_values.allocation_diagnostics` block (targetable pool,
opportunity share, prior share, role-evidence vector, fallback reason,
residual) flows through verbatim for cohort research — no new required
column, no schema-version bump, and no historical evaluation row is
rewritten. v1 receiving rows keep `allocation_diagnostics: null`.

## Market edge conventions

- Spread: `jkb_vs_market_edge = projected_home_margin -
  market_implied_home_margin`, where `market_implied_home_margin =
  -home_line` (matches the WU2 resolver). Positive = JKB more favorable to
  the home team.
- Player props: `jkb_vs_market_edge = projected_yards - market_line`.
  Positive = JKB projects the over.

Edge buckets are descriptive diagnostic cohorts, not tuned betting
thresholds. Player-market edge widths reuse the Phase 11A research bucketer
(`passing 15 / rushing 7.5 / receiving 5` yards). Spread edge and
power-rating-difference cohorts use absolute-point boundaries `<1 / 1-2 /
2-3 / 3-4 / 4+`.

## Diagnostic cohorts

Every cohort field is computed from prediction-time information only
(archived projection, archived market observation, archived feature
snapshot). No postgame value is read into a cohort.

Currently available cohort dimensions:

- Common: `week_band`, `neutral_site`, `home_away`, `position`,
  `division_game` (from `public/data/nfl/teams.json` divisions; null when the
  table is unavailable).
- Spread: `jkb_home_side` (favorite/underdog/pick), `jkb_supports_side`,
  `market_home_side`, `jkb_agrees_with_market`, `spread_edge_bucket_abs`,
  `spread_edge_direction`, `power_rating_diff_bucket_abs`,
  `market_reference_available`.
- Passing/rushing/receiving: `role_status` (from archived `status`),
  `projected_volume_bucket`, `market_input_available`, `edge_bucket`,
  `edge_direction`.

Future/candidate cohort dimensions are passed through as `candidate__<key>`
**only when the archived feature snapshot actually contains them**: rest
differential, target/carry share, committee/target concentration, role
certainty, depth-chart rank, offensive-line/trench values, opponent
run/pass-defense rank. These are surfaced for research, not defined or
guaranteed by WU3, and their absence today is expected.

## Core metrics and sample-size discipline

`nfl-evaluation-metrics.ts` reuses the Phase 11A primitives (`mae`, `rmse`,
`bias`, `pearsonCorrelation`) verbatim and adds `median_absolute_error`.

Every metric block reports `n`. Below fixed thresholds a statistic is
returned as `null` with an explicit `*_insufficient_sample` flag rather than
computed:

- correlation: `n < 10`
- hit-rate style percentages (winner accuracy, ATS %, over/under): decided
  `n < 20`
- cohort cells: labeled `small_sample: true` below `n = 20`

Row-level datasets always exist regardless of sample size; the summary labels
small cells, it never hides them.

Spread blocks additionally report winner accuracy (with ties/pushes stated),
paired JKB-vs-market MAE (`jkb_minus_market_mae`), and ATS win/loss/push
counts for archived timestamp-valid observations. Player blocks report
component MAE (attempts/carries/targets, YPA/YPC/YPT error means, receptions
and YPR error means), a mandatory zero-volume vs. non-zero-volume yards-MAE
decomposition, and directional over/under counts.

## Summary artifact

`summary/<season>.json` (`jkb-football-evaluation-summary-v1`) contains:
`coverage` (predictions loaded, non-production skipped, ledger-by-status,
evaluable-by-type), and `metrics` grouped `by_prediction_type`,
`by_model_version`, `by_fitted_state` (model name + version +
`fitted_model_hash`, so scheduled refits of the same semantic version stay
distinguishable), `by_season`, and `by_cohort` (every cohort dimension x
label). `source_provenance` records the prediction/outcome schema versions
and the `teams.json` content hash.

## Determinism

Canonical JSON key ordering, rows sorted by `evaluation_row_id`
(resolution-status rows by `prediction_id` then type), no generated
timestamps in output. An exact rerun over unchanged prediction and outcome
inputs produces byte-identical files. `--dry-run` writes nothing.
