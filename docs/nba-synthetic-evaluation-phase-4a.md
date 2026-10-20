# NBA synthetic model evaluation (Phase 4A)

Status: offline framework, **synthetic data only**. No real NBA player-game data was read, downloaded or modeled, no API was called, and no license record changed. Run it with `npm run nba:synthetic-eval`.

Results on the synthetic league are mechanism checks. The generator and the models share an author, so they say nothing about real-world accuracy. Every manifest it produces is stamped `evidenceClass: "synthetic"`, `realDataEligible: false`.

## What it adds to the existing baseline

Reviewed first: `backtest.ts` (walk-forward v0), `features.ts` (the date-based leakage gate), `projection.ts` (baseline v0 and the naive L5/L10/L20/season windows), `minutesV1.ts` and `minutesV1Backtest.ts` (conditional minutes plus a participation component). None of those files changed.

| Requirement | Before | Now |
|---|---|---|
| Previous-game comparison | missing | `previous_game` method |
| Median absolute error | missing (MAE, RMSE, bias only) | `medianAe` on every summary |
| Usage buckets | missing (role, history, team change only) | pregame usage terciles cut from the training window |
| Leakage gate | by game date | by instant: a result is usable only after `tipoff + resultLag`; a snapshot only if current before `tipoff - lead` |
| Availability | participation inferred from missing rows | pregame status snapshots, separate scoring, established outcomes only |
| Manifest | none | `nba-evaluation-manifest-v1` with content hashes and pre-registered criteria |
| Source license | not checked | `runEvaluation` calls the ingest license gate for `model-development` |

## Architecture (`src/lib/nba/props/evaluation/`)

| File | Role |
|---|---|
| `types.ts` | `ScheduledGame` (tipoff instant, neutral site), `FinalStatusRecord`, `EvaluationDataset` (any source), `FoldSpec`, method and model ids |
| `clock.ts` | cutoff policy, schedule validation (Eastern date must match the tipoff instant), `rollingFolds`, `assertFolds` |
| `access.ts` | the **only** place that decides what is knowable at a cutoff: gated history, team dates, pregame status, roster universe, established outcomes; rejects duplicate rows and rows whose date disagrees with the schedule; `countHistoryViolations` is an independent audit |
| `constants.ts` | every fixed choice (roster lookback, usage and availability constants, calibration bins, segments), all recorded in the manifest |
| `methods.ts` | previous game, last 5, last 10, season to date, JKB baseline v0, JKB minutes-v1 (v1 minutes x v0 rates) |
| `availability.ts` | P(plays): constant rate, history rate, status-aware; rates learned from the training window |
| `metrics.ts` | n, MAE, median AE, bias, RMSE; Brier, log loss, accuracy, calibration bins, terciles |
| `runner.ts` | folds, targets, segments, pooled summaries, license gate |
| `manifest.ts` | manifest, canonical JSON, hashes, acceptance criteria |
| `report.ts` | report shapes (plain JSON) |

Supporting: `__fixtures__/evaluationLeague.ts` (deterministic league, `synthetic-eval-league-v1`), `evaluation.test.ts` (45 tests), `scripts/nba-synthetic-evaluation.ts`.

### Rules enforced

- Training strictly precedes validation; validation windows are disjoint. Priors, participation rate, status rates and usage cut points come from the training window only, **and only from games whose result was available before the fold's first validation cutoff** (a long result lag shrinks the training set).
- A prior game counts only if it is scheduled and `tipoff + resultLag < cutoff`. A game missing from the schedule can never be history.
- Zero-minute rows are not production history. A DNP row is an absence, never a zero-point game.
- A player who did not play is scored as non-participating **only** if a zero-minute row or a post-game final status establishes it. Otherwise the absence is `unestablished`, excluded and counted.
- Availability is scored on a pregame universe (a usable snapshot naming the team, or a recent appearance for it), never on who turned out to play. A player who played but was outside the universe is counted, not scored.
- Conditional production is scored only on games the player played. Availability and conditional production are reported separately, plus a combined unconditional-minutes comparison.
- Neutral-site games must name their two teams in the schedule (`participantTeamIds`); teams are never inferred from the game's own results.
- A real source must list its snapshot ids (non-empty, prefixed by its source id) and every row must cite one of them. The acceptance list must include the `leakage-invariants` criterion, and the candidate model (`jkb_minutes_v1`) is gated like the benchmark.
- Accumulation order is canonical (sorted rows, tipoff-ordered games), so `resultsSha256` does not depend on input order.
- Segments use pregame information only (projected minutes bucket, prior-usage bucket, recent team change, venue from the schedule, history depth).

## Synthetic evaluation results (seed 20261019, 6 rolling folds, 3,151 scored player-games)

Common sample, error = predicted - actual.

| Stat | Best naive (MAE) | JKB v0 | JKB minutes-v1 |
|---|---|---|---|
| Minutes | season-to-date 3.743 | 3.879 (bias -0.37) | 3.808 |
| PTS | season-to-date 2.417 | 2.437 | 2.431 |
| REB | season-to-date 1.729 | 1.734 | 1.732 |
| AST | season-to-date 1.337 | 1.336 | 1.338 |

Previous-game is clearly worst (minutes MAE 5.17). On this league, where player levels are stable, the long windows win and the JKB models roughly tie the best naive method rather than beating it. Acceptance criteria are non-regression bars (within 5% of the best naive MAE), not superiority claims.

Availability (3,655 established player-games, 72 unestablished excluded): constant-rate Brier 0.1187, history-rate 0.1122, status-aware 0.0372. This is large only because the fixture's pregame statuses are informative by construction. Unconditional minutes MAE improves from 6.39 to 4.55 when weighted by availability. 938 late snapshots (after the cutoff) were ignored.

## Remaining requirements before real-data validation

1. **A permitted real source.** `runEvaluation` refuses any source whose registry record lacks `model-development`. ESPN/hoopR stay blocked pending the rights review; API-NBA needs a recorded private-evaluation decision at minimum.
2. **A real adapter that supplies the extra tables:** tipoff instants, pregame availability snapshots with true as-of times, and post-game final statuses. Without as-of timestamps the availability evaluation must not be run.
3. **Per-source field checks:** minutes precision and DNP representation (the acceptance gate in `sources/qualityGate.ts` already compares declared against delivered).
4. **Canonical IDs** (`canonical.ts`) if more than one source is compared; `compareSources` measures their agreement.
5. **A decision on the acceptance thresholds** before the first real run, recorded in the manifest and not tuned afterwards. The defaults here were chosen for the synthetic league.
6. **Real data will differ from the fixture:** mid-game injuries, overtime, G League assignments, rest policy, and statuses that are less informative than the fixture's. The usable-sample size and the bucket cut points need a first look on a development window, not the holdout.
7. **A holdout season kept out of every fold**, scored once with frozen parameters.
8. **Containment rules** for any new raw file shapes, and a real-data run must write only under the gitignored `data/nba/` or `exports/nba/`.

## Known limits

- **Leakage evidence.** The gate is leak-resistant by construction. `leakageInvariantViolations` is an audit that recomputes the rule independently from the schedule (a weakened gate fails 10 tests, checked by mutation), but the perturbation tests are the stronger proof: deleting everything after a day, rewriting that day's own results, and deleting or flipping post-cutoff snapshots leave pregame predictions, rosters and probabilities unchanged.
- **Availability selection bias.** "Played" is always established; "did not play" is established only by a zero-minute row or a final status. If a source's final-status coverage is thin, the overall rate, status rates and Brier are biased upward. The report gives `unestablishedByStatus` so coverage can be inspected before trusting them. The fixture leaves only some injury absences unestablished.
- **History features count unestablished absences as missed.** The minutes-v1 participation feature treats any team game without a positive-minute row as missed, including unestablished ones. Labels exclude those games; the feature does not.
- **Team attribution comes from the result row.** A scored player-game's team is taken from the row of the game he played, which is post-game information (inherent to conditioning on "played"). Availability uses the pregame roster instead. `outcome` is keyed by game and player, not team.
- **Thresholds are not tuned for real data.** The default acceptance bars were chosen for the synthetic league.
- Overtime and in-game events are not modeled, and usage cut points are per fold while segments are pooled across folds.
