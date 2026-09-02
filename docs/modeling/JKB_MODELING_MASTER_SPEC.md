# JKB Football Modeling Master Specification

Status: initial governing specification, reconstructed from repository state at `2b2b2b56d4d233816f3b2f5398bfe99505b5ee26` on 2026-09-02.

This document is the required entry point for work on JKB NFL spreads, totals, passing, rushing, receiving, prediction archives, market comparison, outcome resolution, features, evaluation, or model versions. Detailed contracts live in:

- [Prediction Archive Schema](PREDICTION_ARCHIVE_SCHEMA.md)
- [Model Versioning Guide](MODEL_VERSIONING_GUIDE.md)
- [Feature Registry](FEATURE_REGISTRY.md)
- [Evaluation Standards](EVALUATION_STANDARDS.md)
- [Model Changelog](MODEL_CHANGELOG.md)

Earlier NFL reports remain evidence and provenance. When they describe an earlier phase, this specification and current code own current status.

## Purpose

JKB is building one football modeling platform for game spreads, game totals, passing yards, rushing yards, and receiving yards. The platform must preserve immutable production prediction history, the market state actually available for comparison, separately attached outcomes, and research-grade evaluation. A current browser artifact or reproducible backtest is not a substitute for an archived production prediction.

## Governing principles

- Production predictions **MUST** have an unambiguous UTC prediction timestamp, model name and model version.
- Archived production predictions **MUST NOT** be retroactively overwritten. Corrections create a new snapshot or an explicit correction event linked to the original.
- Historical backtests **MUST** be labeled as backtests or historical replays and **MUST NOT** be represented as true production predictions.
- Every feature **MUST** use only information available by the prediction cutoff. Source publication time matters in addition to game time.
- Market observations used for comparison **MUST** be preserved with provider, sportsbook, line/price, and observation time.
- Market information used as a model input **MUST** be explicit in the model specification and feature snapshot. Passing currently uses game spread, total, implied team total, home/away, and dome status in its fitted feature vector. Rushing and receiving production formulas do not use their broader encoded feature sets.
- Outcomes **MUST** be attached separately from immutable prediction and market snapshots.
- Feature schemas, archive schemas, model behavior, and evaluation methodology **MUST** be versioned.
- Evaluation **MUST** declare train, validation, benchmark/holdout, population, exclusions, and market timestamp policy.
- A model **MUST NOT** be promoted solely because of a small-sample split, retrospective pattern, or betting win percentage.
- Missing values **MUST NOT** be silently converted to zero unless the source semantics establish a true zero.
- Team/player/game joins **MUST** use canonical IDs or an explicit tested alias/crosswalk. Unresolved production rows must fail or be visibly excluded.
- Future agents **MUST** update this document and the affected linked specification in the same PR when behavior, schemas, features, or evaluation rules change.
- Research **SHOULD** reuse the canonical identity layer, compact nflverse caches, temporal split utilities, market stores, validators, and feature builders.
- Production model code **SHOULD** be deterministic for fixed inputs and preserve input provenance or hashes.
- Production files **MUST NOT** be treated as archives merely because Git history may retain earlier versions.
- Closing lines **MUST NOT** be claimed unless the selection rule proves the observation is the final valid pre-kickoff observation for the stated book/consensus.

## System architecture

```text
raw/provider data
  -> normalized canonical data
  -> point-in-time feature generation
  -> versioned model projection
  -> immutable production prediction snapshot
  -> timestamped market snapshot(s)
  -> game occurs
  -> separately appended outcome resolution
  -> versioned evaluation dataset
  -> research diagnostics and hypotheses
  -> candidate model
  -> temporal validation and untouched holdout confirmation
  -> approved model version
  -> production
```

WU1 implements immutable production predictions for spread and player yardage. WU2 implements separate append-only outcome attachment. Evaluation materialization and the total model remain absent, so the full chain is not yet complete.

### WU1 production archive implementation

Forward production records use `jkb-football-prediction-v1` and partition under `data/nfl/predictions/<season>/<week>/<model-name>.jsonl`. Shared source and fitted-model manifests are content-addressed under the adjacent `manifests/` directories. `scripts/lib/nfl-production-prediction-archive.ts` is the only writer/validator; generators do not implement local append rules. Material-state SHA-256 identities make exact reruns idempotent and preserve changed same-game/player states. Archive persistence is fail-closed before live artifact replacement. See [Prediction Archive Schema](PREDICTION_ARCHIVE_SCHEMA.md) for the exact identity, manifest, market-cutoff, and storage contracts.

The two production workflows persist only regex-validated WU1 partition and manifest filenames alongside their existing live artifacts. They retain the shared generated-data concurrency lock and established commit/rebase/push retry behavior; an unexpected path under the archive root fails closed instead of being staged.

### WU2 outcome resolver implementation

`jkb-football-prediction-outcome-v1` events partition under `data/nfl/prediction-outcomes/<season>/<week>/<prediction-type>.jsonl`. `scripts/lib/nfl-prediction-outcome-resolver.ts` resolves immutable prediction IDs from canonical nflverse-derived game results and player-week data, with weekly-roster evidence limited to explicit inactive/not-applicable or ACT-with-no-stats zero semantics. Relevant source-state SHA-256 identities make exact reruns idempotent; corrections append a numbered revision linked to the prior outcome event. Every unresolved prediction receives an explicit status. The manual command supports season, week, and dry-run filters. No workflow is modified in WU2 pending production-sensitive governance approval.

## Current model status

| Model | Current implementation | Primary output | Status |
| --- | --- | --- | --- |
| Spread | `scripts/generate-nfl-matchup-projections.mts` -> `src/lib/nfl/currentRating2026.ts` -> `src/lib/nfl/jkbPowerNumber2026.ts` | Home-team projected margin and formatted sportsbook-style spread in `public/data/nfl/matchup-projections.json` | Public/current production output plus forward append-only prediction and outcome archives; historical calibration exists |
| Total | No NFL JKB total calculation found | None | Not implemented; descriptive market totals and reusable scoring/pace inputs exist |
| Passing | `scripts/generate-nfl-current-week-yardage-projections.ts` and `currentWeekYardageModel.ts` | Direct ridge projected passing yards plus interval/status/features in `public/data/nfl/<season>/yardage-projections.json` | Scheduled production-candidate plus forward append-only prediction/fitted-state/outcome archives; automatic persistence not yet scheduled; known calibration/role risk |
| Rushing | Same current-week pipeline | Projected carries x shrunk YPC = projected rushing yards | Scheduled production-candidate plus forward append-only prediction/fitted-state/outcome archives; automatic persistence not yet scheduled |
| Receiving | Same current-week pipeline | Projected targets x shrunk yards/target = projected receiving yards | Scheduled production-candidate plus forward append-only prediction/fitted-state/outcome archives; automatic persistence not yet scheduled |

## Current-state audit

### JKB spread

The authoritative public spread is generated exactly in `scripts/generate-nfl-matchup-projections.mts`. It loads the 2026 schedule, the `nfl-power-v0.3.1` preseason board, the curated `nfl-power-v0.4-beta` preseason projection, and current Team Performance Analytics. `buildCurrentRatingBoard` produces the canonical Current OVR. `buildPowerNumberBoard` then applies:

```text
leagueAverageOVR = mean(Current OVR across 32 teams)
teamPowerNumber = (Current OVR - leagueAverageOVR) * 0.24
projectedHomeMargin = homePowerNumber - awayPowerNumber + (neutral ? 0 : 2.0)
```

The exact output is the unrounded `projectedHomeMargin`; `formattedJkbSpread` is the rounded display form. Model identity is `jkb-power-number-v1.0.0`, artifact schema `nfl-matchup-projections-v2` with common `_meta` schema `nfl-v0.1`.

Current OVR is preseason `nfl-power-v0.4-beta rating2026` blended with live performance rating by each team's completed games: preseason/performance weights are 100/0, 80/20, 60/40, 40/60, 25/75, 10/90, then 0/100 at six or more games. Preseason v0.4 starts with v0.3.1, then includes documented guide calibration, partial luck review, and curated personnel, coach, and returning-injury adjustments. Live performance is 40% offense, 40% defense, and 20% opponent-adjusted point differential; offense/defense each average opponent-adjusted EPA/play, traditional success rate, and explosive rate. Only the full-season performance composite feeds Current OVR; L4/L8 metrics are display/diagnostic data.

Schedule context is limited to neutral-site status and the team-specific blend ramp. SOS does not directly enter Current OVR. Home field is fixed at 2.0, zero for neutral games. Current in-season injuries do not enter; only the curated preseason returning-injury adjustment can affect the anchor. Market data never enters spread generation. `src/lib/nfl/projectionData.ts` compares the completed projection with a market line downstream.

There is no training fit in the live Power Number module. The 0.24 conversion and 2.0 HFA were selected from the walk-forward Current-OVR calibration in `scripts/analysis/nfl-current-ovr-spread-calibration/`: reconstructable seasons 2023-2025, out-of-sample tests for 2024 and 2025, 544 pooled games. At HFA 1.5 the reported pooled OVR result was MAE 10.26, RMSE 13.15, correlation 0.396, winner accuracy 65.56%; the approved production HFA is 2.0, whose grid result was MAE 10.26, RMSE 13.14, correlation 0.396, winner accuracy 65.01%. The market benchmark was stronger (MAE 9.67; model ATS accuracy 50.46% on 539 non-push games). The older `nfl-spread-v0.1.0` (45% adjusted offense EPA, 35% inverted adjusted defense EPA, 20% adjusted point differential, K=2 prior, fitted beta, 2-point HFA) is retired to research under `scripts/analysis/nfl-spread-v0.1.0-legacy/`.

Formula-level historical calibration enforces prior-game cutoffs. Before WU1, the public production path was not fully point-in-time auditable: it read mutable aggregate artifacts, carried no feature/input hashes, applied no target-kickoff cutoff itself, and overwrote one season-wide file. WU1 does not rewrite that live artifact, but now adds pre-kickoff archive validation, hashed source/feature provenance, timestamp-valid market references, and immutable forward snapshots. Runs predating WU1 remain unreconstructable as true production forecasts.

### JKB total

No NFL projected-total producer, model module, model version, artifact field, or evaluation was found. UI copy mentioning projected totals does not establish a model; `weeklyDashboard.test.ts` explicitly verifies no `projectedTotal` property.

Reusable inputs are nflverse final scores/results; offensive and defensive EPA, success rate, explosive rate, pass/rush splits, points per drive; team play volume, dropback rate, early-down neutral pass rate and PROE; home/road, neutral site, dome/stadium coordinates; market total observations; and player-level usage. Missing or not production-ready inputs include a defined point-in-time scoring target/features pipeline, explicit pace such as seconds/play, historical weather cache, reliable travel/rest derivations, an approved total formula/version, total-specific walk-forward evaluation and calibration, immutable prediction snapshots, and outcome attachment. Current market totals are context/benchmark data, not a JKB total.

### Passing

The live universe resolves one ACT QB per team. ESPN-origin nflverse depth-chart rank 1 is primary; ambiguity/unavailability falls back to prior rolling attempts, then deterministic roster identity. The row records role provenance and uncertainty. Historical targets select the primary QB by most attempts (player-ID tie-break) and retain multi-QB/injury/benching outcomes.

Production version `nfl-passing-direct-ridge-alpha10-production-2022-2025-v1` fits a deterministic alpha-10 ridge at run time on 2022-2025 historical feature rows. It predicts yards directly; attempts x YPA is not the production identity. Its 16 inputs are own team plays/pass attempts, QB attempts, QB YPA/completion rate, opponent attempts/dropback rate/pass EPA allowed, own dropback rate/early-down neutral pass rate/PROE, game spread/total/implied team total, home indicator, and dome indicator. Window coalescing is current-season prior games -> prior season -> training mean. Windows available in feature snapshots include season-prior, last three, and prior season, though the production encoder coalesces season-prior before prior-season and does not encode last-three as a separate column.

Development used rolling folds train 2022 -> validate 2023 and train 2022-2023 -> validate 2024. The 2025 season, already inspected in an earlier phase, is a frozen retrospective benchmark rather than a pristine holdout. Direct ridge dev MAE was 55.81; 2025 MAE 55.81, RMSE 70.42, bias +12.53, R2 0.102. Multi-QB and no-history rows are the largest known risks. Production intervals use residuals from train 2022-2023/validate 2024. No current injury status enters the model.

### Rushing

The live universe includes QB/RB/WR/TE candidates via depth-chart evidence, strictly prior historical volume, or a disclosed roster-scarcity fallback. The corrected historical universe includes eligible zero-carry outcomes; ACT-with-no-stats rows can be true zeros, while inactive rows are absent.

Production version `nfl-rushing-carries-x-shrunk-ypc-production-2022-2025-v1` is exactly:

```text
projected carries = coalesced prior carries/game or training fallback
projected YPC = prior YPC shrunk toward training league mean with four-game prior strength
projected rushing yards = projected carries * projected YPC
```

The final production formula uses player carries/game and YPC. Broader research/diagnostic features exist: carry share, team rush attempts/dropback rate/PROE, opponent rush attempts and rush EPA allowed, market spread/total/implied total, home/dome, QB indicator, and committee concentration. They are not inputs to Baseline C's final multiplication. No OL/trench metric or explicit game-script model enters the production formula. Corrected dev MAE was 12.48 and 2025 MAE 11.84; zero-carry rows materially lower aggregate MAE, so zero/non-zero decomposition is mandatory. The same development folds, retrospective 2025 benchmark, and interval split as passing apply.

### Receiving

The live/historical universe covers RB/WR/TE; QB is excluded. Depth-chart, historical-volume, and roster-scarcity evidence parallel rushing. Eligible zero-target rows are retained, including explicitly qualified ACT/no-stats inferred zeros.

Production version `nfl-receiving-targets-x-shrunk-ypt-production-2022-2025-v1` is:

```text
projected targets = coalesced prior targets/game or training fallback
projected YPT = prior yards/target shrunk toward training league mean with four-game prior strength
projected receiving yards = projected targets * projected YPT
```

The tested three-way targets x catch rate x yards/reception model lost to the two-way formula. Broader research features include target share, catch rate, YPR, aDOT, team pass attempts/dropback rate/PROE, target concentration, opponent targets and pass EPA allowed, market context, dome, and position. Air-yards share is defined but remains null; routes and route participation are unavailable. Dev MAE was 16.64 and 2025 MAE 16.39 for the selected decomposition. Position-specific ridge research helped modestly, but the production decomposition uses pooled training constants. The same folds and benchmark caveat apply.

## Data and feature inventory

| Source | Coverage/cadence | Pregame timing and risk | Current consumers |
| --- | --- | --- | --- |
| `public/data/nfl/teams.json` | 32-team curated canonical table; manual | Stable identity/environment; dome is a team-home proxy, not game-day roof state | All NFL joins; player models use game `isDome` derived from schedule/team data |
| nflverse `nfldata` schedule/results (`data/.../schedules/games.csv`, `public/data/nfl/<season>/{games,results}.json`) | Historical seasons plus current 2026; scheduled daily workflow | Schedule is pregame; scores/results are postgame and must be cutoff-filtered | Spread schedule, outcomes, game joins, market joins |
| nflverse PBP EPA compact cache | EPA 2020-2025; historical refresh/manifests | Postgame team-game data; safe only through strictly prior completed games | v0.3.1, spread research, live performance, all player opponent EPA features |
| nflverse PBP play-volume compact cache | 2022-2025 | Postgame; strict prior-kickoff windows required | Passing/rushing/receiving team environment |
| nflverse player-week stats | 2022-2025 | Outcome source; target-week values are leakage if used as features | Player outcomes, usage, efficiency, final player stats |
| nflverse weekly rosters | 2023-2026 (no 2022 historical roster) | Week-level status; publication/revision timing is not archived per prediction | Historical zero inference; live ACT candidate universe |
| nflverse/ESPN depth charts | 2025-2026 latest snapshots | Pregame role evidence, but only latest snapshot per season; 48-hour staleness gate | Live QB/RB/WR/TE eligibility and role provenance |
| nflverse injuries | 2023-2025 cache; current public matchup snapshot may be stale | Useful pregame only with observed-at archive; currently not model input | Display/join infrastructure only |
| nflverse snap counts | 2023-2025 | Target-game snaps are postgame leakage | Diagnostics only; not current yardage inputs |
| Team Performance Analytics | Current 2026 aggregate plus backtest tooling | Contains completed outcomes; current artifact lacks per-prediction cutoff/hash | Current OVR and public spread |
| Historical game market context | 2022-2025 settled nflverse spread/total | Pregame market in broad sense, but provider and exact timestamp are absent; can leak closing information into an early-week simulation | Passing fitted inputs; encoded but non-load-bearing for rushing/receiving formula |
| Game betting-line store | 2026 append-oriented JSONL by game/book/provider | Has captured/provider update times and spread/total/prices; first-observed is not opening, and no explicit closing designation exists | Market product; not joined to model archive |
| Player yardage market archive | Began 2026-08-26; change-only JSONL by player/market/book | Timestamped pregame observations; final pre-kickoff can be derived, not yet persisted as a closing label | Yardage market UI/history and Phase 11A join attempt |
| ESPN trench/RBSDM success artifacts | Current matchup snapshots | No arbitrary historical pregame archive; source/schema fragility | Matchup display/research; not final yardage formulas or spread |
| Weather/surface/travel/rest/routes | PBP exposes historical roof/temp/wind/surface but no normalized committed feature cache; no routes; travel/rest not modeled | Missing point-in-time feature contracts | None of the five current production outputs |

Canonical player IDs are `gsis:<id>` through `src/lib/nfl/identity/identity.ts`. Canonical site team abbreviations are lowercase. Explicit aliases include JAC/JAX -> jax, LA/LAR -> lar, WAS/WSH -> wsh, and AZ/ARI -> ari. Risks remain because other helpers use ESPN-style `lar/wsh` while raw nflverse commonly uses `LA/WAS`; the yardage-history pipeline separately documents an `LAR`/`WSH` versus `LA`/`WAS` rank join defect that required a local alias. Multiple player-week cache directories (`stats-player-week` and `player-week-stats`) also increase accidental-source divergence risk.

## Research philosophy

An **observation** describes measured behavior. A **hypothesis** states a pre-specified possible improvement and why it should generalize. A **backtest** estimates historical behavior with time-correct inputs. **Validation** selects among hypotheses on declared development folds. **Holdout confirmation** evaluates the already-frozen choice on data never used for selection. **Production promotion** is an explicit decision after statistical, data, operational, identity, archive, and monitoring gates pass.

Correlation and subgroup patterns do not establish causation. A split can arise from noise, population mix, market timing, or multiple comparisons. Findings must carry sample size, uncertainty, out-of-time stability, and a plausible mechanism before they justify a candidate; they still do not become production behavior without versioned approval.

## Point-in-time integrity

“Known at prediction time” means the value was observable from an approved source at or before the snapshot's `prediction_timestamp`, after accounting for provider publication/revision time. A game ending before the target game is not sufficient if the source had not published the result. Weekly snapshots must use one declared slate cutoff before the first included kickoff; game-level snapshots may use their own kickoff cutoff. Backfilled historical data, final rosters, closing markets, corrected stat feeds, and target-game participation are not valid early-week features merely because their event timestamps precede a later repository run.

A reproducible point-in-time row needs the prediction timestamp, cutoff policy, source observations or immutable references/hashes, feature-schema version, model version, and code/pipeline version. Current historical player feature builders have strong N-1 isolation tests, but current live input snapshots and the public spread artifact do not preserve enough state to reconstruct every past production decision.

## Gap analysis and roadmap

### Phase A — Modeling governance/specification

This documentation establishes current ownership, feature/evaluation rules, versioning, and the archive design. Review must verify that it correctly supersedes older phase-status prose without rewriting historical reports.

### Phase B — JKB Spread production readiness

Retain the current formula. Add immutable per-run snapshots with input hashes/features, model/pipeline versions and cutoff; define a safe Current OVR point-in-time materialization; archive the exact downstream market comparison; add automatic outcome resolution and ongoing model-vs-market monitoring. Resolve the incomplete v0.4 luck coverage/status before treating its anchor as final.

### Phase C — JKB Total

Reuse schedules/results, team performance metrics, play volume/PROE, home/dome, market archive, identity, temporal tooling, and archive schema. Build only after approving a target definition, point-in-time scoring feature dataset, weather/pace policy, temporal evaluation, and versioned model specification. No total formula is approved here.

### Phase D — Passing/Rushing/Receiving production readiness

All three need immutable prediction snapshots, serialized or hash-addressed fitted model state, current injury/availability integration, reliable historical/live role snapshots, automatic outcomes, and live monitoring. Passing additionally needs bias/drift and multi-QB/no-history treatment. Rushing needs workload/committee validation and zero/non-zero reporting; receiving needs role/route limitations and position behavior monitored. Player-market coverage must mature before betting evaluation.

### Phase E — Unified prediction archive

Today there are overwrite-in-place spread and yardage projection artifacts, Git commit history, an append-oriented game-line store, and an append-only player-prop line archive. There is no unified immutable prediction store. Implement the linked schema with append-only snapshot IDs and source/feature hashes.

### Phase F — Outcome resolver

Final team scores and player stats exist, and historical outcome builders exist. No scheduled resolver attaches them to archived production predictions. Build an idempotent append-only resolver that never mutates the prediction payload.

### Phase G — Evaluation/diagnostics

Reuse spread calibration/backtests, player temporal folds, metrics, feature ablations, intervals, and research joins. Add evaluation against archived production snapshots, valid market timestamps/prices, closing designation, cohort definitions, and live drift/coverage monitoring.

### Phase H — Research/candidate framework

Add hypothesis registration, frozen dataset/feature manifests, candidate versions, repeatable temporal folds, untouched future holdouts, comparison reports, promotion gates, and an approval/changelog record. Candidate experiments must never overwrite production artifacts.

## Audit answers

1. The current spread is generated by `scripts/generate-nfl-matchup-projections.mts` using `currentRating2026.ts` and `jkbPowerNumber2026.ts`.
2. It is determined by the two teams' Current OVR values, league-average centering (which cancels in the matchup difference), coefficient 0.24, and fixed 2.0/0 neutral HFA. Current OVR itself blends v0.4 preseason and completed-game performance.
3. Its formula is market-independent and the calibration is walk-forward, but the live artifact is not fully point-in-time provable or reconstructable because inputs/snapshots are mutable and not hashed/archived per prediction.
4. Current-OVR calibration covers 2023-2025 reconstruction and 2024-2025 out-of-sample evaluation; legacy spread backtests cover 2022-2025.
5. It lacks immutable prediction/feature snapshots, automated outcomes, versioned live evaluation, and a fully finalized preseason anchor/point-in-time input contract.
6. No NFL JKB total exists.
7. Reusable total inputs include scores, EPA, success/explosives, points/drive, play volume/pass tendency, schedule/home/dome, and timestamped market totals.
8. Missing items include an approved target/feature pipeline and formula, explicit pace/weather/rest/travel policy, temporal total evaluation, archive, and resolver.
9. Passing, rushing, and receiving are scheduled current-week production candidates with historical research and public artifacts, but are not fully production-ready under the archive/outcome/monitoring gates.
10. Passing yardage is direct ridge; rushing is carries x shrunk YPC; receiving is targets x shrunk YPT.
11. Historical research rows can be rebuilt with N-1 features, but exact historical production knowledge generally cannot be reconstructed.
12. Prediction snapshots are not stored in a dedicated append-only archive; current files are overwritten, with Git history only incidental.
13. Game and player-prop market snapshots are stored in separate append-oriented archives; they are not atomically linked to predictions.
14. Closing lines are not explicitly stored as closing-designated records. A final pre-kickoff player-prop observation can be selected retrospectively where coverage exists.
15. Outcomes are not automatically attached to production predictions.
16. Current prediction artifacts store model versions, but no unified archived prediction/version linkage exists; fitted player coefficients are recomputed rather than serialized.
17. Highest leakage risks are historical settled market lines without exact timestamps, mutable aggregate live inputs without as-of hashes, target-week roster/injury revision timing, using target-game snaps/participation, and retrospective production reconstruction from corrected data.
18. Yes: LA/LAR, WAS/WSH, AZ/ARI and JAC/JAX require aliases; player provider names require strict roster resolution; duplicate player-week cache namespaces and missing 2022 rosters threaten consistency.
19. Reuse canonical identity, schedules/results, compact EPA/play-volume caches, feature builders, temporal validation, ridge/metrics/interval helpers, current market stores, validators, atomic writers, and workflow allowlists.
20. The first three post-review work units are listed below.

## First three post-review work units

1. Implement the append-only unified prediction snapshot writer/validator for the existing spread and yardage outputs, without changing any model calculation.
2. Implement an idempotent outcome resolver that appends team/player actuals to snapshot IDs and proves prediction immutability.
3. Build an evaluation materializer joining snapshots, timestamp-valid market observations, and outcomes, with existing metrics plus decomposition/zero-volume cohorts.
