# WU4C Checkpoint — Matchup + Projected Game Flow (Research Phase)

Status: research/validation only, per instructions. **No production model changed. No commits made.**

## 1. Baseline

- pwd: `C:\Users\jbloo\remix-of-bracket-brilliance`
- branch: `feat/nfl-power-ratings-jkb-heat`
- HEAD: `f466825d feat: add NFL role allocation and receiving v2`
- WU4A team opportunity: exists, commit `be436de6` (`src/lib/nfl/props/teamOpportunityModel.ts` + `teamOpportunityFeatures.ts` + `scripts/generate-nfl-team-opportunity.ts`).
- WU4B role allocation + receiving v2: exists, commit `f466825d` (`src/lib/nfl/props/roleAllocation/*`).
- WU4B rushing v2 remains research-only (`scripts/generate-nfl-rushing-outcomes-v2.ts`, not referenced by any production commit workflow).
- QB rushing remains v1 (no v2 rushing-for-QB file found).
- Focused baseline tests: `src/lib/nfl/props/roleAllocation/*` (28/28 pass) + `teamOpportunityFeatures.test.ts`/`teamPlayVolume.test.ts` (24/24 pass, includes the N-1 leakage test).
- Pre-existing untracked files (`data/nfl/nflverse/player-week-stats/`, `data/nfl/nflverse/schedules/`, `data/nfl/predictions/`, plus fantasy/betting-splits work) were **not** touched.

## 2/3. Game-flow feature audit + build

Audited feature inputs already present in production:
- WU4A team-opportunity ridge (`teamOpportunityModel.ts`, `RIDGE_FEATURE_KEYS`): `market.spread`, `market.total`, `market.impliedTeamTotal`, `market.isHome` are **already** linear inputs to the dropback-rate/plays ridge, alongside prior-team and opponent-allowed windows.
- Passing direct ridge (`qbPassingEncoding.ts`): already includes `market.spread`, `market.total`, `market.impliedTeamTotal`, `market.homeAwayIsHome`, `market.isDome`, plus `opponentPassDefense.{passAttemptsPerGameAllowed, overallDropbackRateAllowed, passEpaPerPlayAllowed}`.
- Receiving v2 (`roleAllocation/*`) and rushing v2 (`generate-nfl-rushing-outcomes-v2.ts`): **zero** opponent-defense or game-environment features today — `opponent` is only a passthrough label, never a model input.

Built (research-only, new files, no production wiring):
- `scripts/lib/nfl-game-script-core.mjs` — point-in-time-safe(*) aggregation of nflverse play-by-play into team-game score-state (`trailing`/`close`/`leading`, threshold ±9 = two possessions) × half (first/second) pass/rush counts. Reuses the approved `classifyPlay` eligible-play filter from `nfl-epa-core.mjs`, so this population can't silently disagree with the existing play-volume/EPA caches. (*Note: this is a historical-target-derivation tool, not a prediction-time feature builder — it is never given prediction-time visibility into the target game; see Part 12.)
- `scripts/analysis/nfl-game-script-research/fetch-and-summarize.mjs` — streams nflverse PBP 2022-2025 (discarded after aggregation, matching the existing cache-refresh convention), writes compact team-game CSVs to `data/nfl/research/game-script/` (untracked, not committed).
- `scripts/analysis/nfl-wu4c-team-opportunity-gameflow/evaluate.ts` — walk-forward harness testing whether a nonlinear game-flow feature (`|market.spread|`, and a `market.total × isHome` interaction) beats the WU4A production ridge.

## 4. Historical game-script findings (real numbers, 2022-2025, 34,301-35,227 eligible plays/season)

League-wide pass rate by score state:

| Bucket | Plays | Pass rate |
|---|---|---|
| Trailing (≥2 scores) | 27,976 | 72.2% |
| Close | 94,072 | 60.1% |
| Leading (≥2 scores) | 17,472 | 49.1% |

By half — this is the key finding, and it **contradicts the naive "favorite = more rushes" assumption** the spec explicitly warned against:

| | Plays | Pass rate |
|---|---|---|
| 1st half trailing | 7,845 | 67.6% |
| 1st half close | 56,766 | 60.6% |
| **1st half leading** | 4,598 | **63.9%** (higher than close!) |
| 2nd half trailing | 20,131 | 74.0% |
| 2nd half close | 37,306 | 59.4% |
| **2nd half leading** | 12,874 | **43.8%** (the classic run-out-the-clock pattern) |

Game-script pass/rush divergence is almost entirely a **second-half** phenomenon. In the first half, teams that are already up two scores pass *slightly more* than teams in a close game (small sample — 4,598 plays — but directionally consistent with the theory that an early lead often reflects an offense already playing well, not one shifting to run-heavy). This means any feature that assumes "spread favorite → run more all game" would be wrong for roughly half the game.

## 5. Candidate team-opportunity models (real walk-forward numbers)

Rolling-origin folds (train ≤2023→validate 2024; train ≤2024→validate 2025), same harness pattern as `nfl-team-opportunity-calibration/evaluate.ts`:

**Dropback rate MAE** (target: beat A):
| Fold | A baseline (10ft) | B +\|spread\| (11ft) | C +\|spread\|+total×home (12ft) |
|---|---|---|---|
| →2024 | 0.077 | 0.077 | 0.077 |
| →2025 | 0.078 | 0.078 | 0.078 |

**Team plays MAE**:
| Fold | A | B | C |
|---|---|---|---|
| →2024 | 6.998 | 6.998 | 7.000 |
| →2025 | 7.118 | 7.108 | 7.111 |

**Finding: no meaningful improvement.** Differences are in the third decimal place, within noise. The existing linear `market.spread`/`market.total` terms already capture essentially all of the game-flow signal available to a **full-game, team-week-grain** dropback-rate/plays model. This is consistent with the Part 4 finding above: the leading/trailing asymmetry is a *second-half, within-game* effect, and WU4A's target is a full-game aggregate — a magnitude/nonlinear spread feature can't recover a signal that mostly cancels out over 60 minutes.

**Recommendation: do not promote.** Per Part 15, negligible gain does not justify added complexity. Retain the existing WU4A production ridge unchanged.

A within-game (half-by-half) opportunity model is the more promising direction the Part 4 data points to, but that is a materially larger scope change (new target definition, new half-level archive schema) and is out of scope for this checkpoint — flagged as a candidate for a future WU4C-2, not attempted here.

## 6. Rushing matchup effects (opportunity vs. efficiency)

Audit only — no new fitted model built this pass (time-boxed; see Known Limitations). Confirmed real gap: `generate-nfl-rushing-outcomes-v2.ts` and the shrunk-YPC baseline carry **zero** opponent rush-defense features today. `scripts/lib/nfl-rbsdm-success.mjs` and `nfl-epa-team-metrics.mjs` already compute opponent rush EPA/success-rate-allowed at the team-week level and are point-in-time-joinable the same way `opponentDefense` is joined in `teamOpportunityFeatures.ts` — this is a concrete, low-risk next step, not a hypothetical. Recommend building this as a discrete follow-up (candidate: shrunk-YPC + opponent-rush-EPA-allowed residual adjustment) rather than fabricating results here.

## 7. Receiving matchup effects (opportunity vs. efficiency)

Same finding as rushing: receiving v2's `receivingProduction.ts`/`shareModels.ts` have no opponent pass-defense input. The targetable-pass pool (from WU4A dropback rate × plays) already flows through untouched — opportunity-side game-flow already applies via WU4A. Efficiency-side (opponent pass defense on YPT) is unbuilt; same recommendation as rushing — concrete, scoped, deferred to a follow-up rather than fabricated.

## 8. Passing audit

Confirmed: the production passing direct ridge (`qbPassingEncoding.ts`) **already** includes `market.spread`, `market.total`, `market.impliedTeamTotal`, home/dome, and `opponentPassDefense.{attemptsAllowed, dropbackRateAllowed, passEpaPerPlayAllowed}`. There is no double-counting risk to introduce because WU4C did not add any new passing features. A future decomposed `projected dropbacks × projected efficiency` structure is architecturally feasible (WU4A already produces `projectedPassAttempts`), but replacing the current single ridge was explicitly out of scope. **Recommendation: no change; decomposition path exists for later, do not build now.**

## 9. JKB projected margin vs. market

Not tested this pass. WU4A/WU4C features consume `market.spread` (published sportsbook line) directly; no separate "JKB projected margin" signal was located as an existing artifact independent of market-derived spread (the production spread model itself uses market comparison, not a standalone JKB power-rating margin feed into team-opportunity). Testing JKB-margin-only vs. market-only vs. combined requires locating/joining the spread-production model's own projected margin output, which was not done in this pass. **Documented gap, not fabricated.**

## 10. Walk-forward validation

Completed for team opportunity (Part 5 table above) using real train≤2023→2024 / train≤2024→2025 folds. Rushing/receiving/passing decomposition walk-forward tables were **not** produced this pass (no new candidate models were fitted for those families — see 6-9). Sample sizes: 544 team-game rows in each of the 2024 and 2025 validation folds (272 games × 2 teams).

## 11. Cohorts

Not evaluated this pass (no promoted model to cohort-test against; Part 5's non-improvement makes cohort-slicing moot for team opportunity — a ~0.0001 MAE delta cannot plausibly help even a favorable cohort at n=544). Deferred.

## 12. Leakage

- Existing adversarial N-1 isolation test (`teamOpportunityFeatures.test.ts`, "uses only the team's own games strictly before the target kickoff (N-1)") passes, along with all 24 tests across `teamPlayVolume.test.ts` + `teamOpportunityFeatures.test.ts`.
- The new `nfl-game-script-core.mjs` module is a **historical target/feature-derivation tool only** — it aggregates raw PBP into team-game summaries for research analysis; it was not wired into any prediction-time feature builder, so no new leakage surface was introduced into production. If a future half-level opportunity model consumes this, it must gain its own N-1 test before promotion (not done here — flagged for follow-up).

## 13. Week 1 2026 candidate changes

**No diffs to show.** Since the Part 5 game-flow candidate did not beat the WU4A production ridge (Part 15 rule: negligible gain → no promotion), and no rushing/receiving/passing candidate was fitted this pass, there is no WU4C candidate that differs from the current production Week 1 2026 outputs. OLD == WU4C-candidate for every component this checkpoint actually evaluated.

## 14. Coherence

All existing WU4B accounting invariants still hold — unmodified by this checkpoint. Verified via the existing test suite: `roleAllocation/allocation.test.ts` (15/15), `dataset.test.ts` (8/8), `receivingProduction.test.ts` (5/5), and the WU4A `assertTeamOpportunityCoherent` invariant (plays = pass + rush attempts, no negative/over-1 values) is exercised by `teamOpportunityModel.test.ts` (not modified). No new allocation logic was added this pass, so no new coherence surface exists to break.

## 15. Production workflow audit — **P0 blockers found**

This is the most consequential finding of the checkpoint.

1. **Neither WU4A team-opportunity nor WU4B role-allocation/receiving-v2 is wired into any scheduled GitHub Actions workflow.** `grep -rl "generate-nfl-team-opportunity\|generate-nfl-receiving-outcomes\|roleAllocation" .github/workflows/` returns **zero matches**. `scripts/generate-nfl-team-opportunity.ts` and the role-allocation pipeline exist only as manually-runnable scripts today. The Part 17 sequencing requirement ("WU4A runs before receiving v2 on a fresh runner, consuming the current run's artifact") cannot be verified as guaranteed in production because **the sequence does not exist in CI at all yet.**
2. `.github/workflows/nfl-yardage-projections.yml` (the one scheduled workflow that does run adjacent yardage-projection scripts, daily at 9:30 AM ET in-season) has a hard-coded commit-path regex allowlist for prediction-archive partitions: `^data/nfl/predictions/${season}/[0-9]{2}/nfl-(passing-direct-ridge|rushing-carries-x-shrunk-ypc|receiving-targets-x-shrunk-ypt)\.jsonl$`. This does **not** include a `team_opportunity` or `receiving-...-v2` filename pattern, and the workflow's own commit step **exits 1 ("Refusing unexpected prediction archive path")** on any unrecognized partition under `data/nfl/predictions`. If WU4A/WU4B were wired into this (or a new) workflow without updating this allowlist, the job would fail closed on its first run rather than silently succeed — which is the correct fail-safe behavior, but it means **the allowlist must be updated before either model can run in CI**, not just the generation step added.
3. **The outcome resolver has no branch for `prediction_type: "team_opportunity"`.** `PredictionType` (in `nfl-production-prediction-archive.ts`) includes `"team_opportunity"` as a valid value, and `generate-nfl-team-opportunity.ts` does emit `team_opportunity` prediction snapshots with `player_id: null` (enforced by an assertion in the archive module). But `resolvePredictionOutcome` (`nfl-prediction-outcome-resolver.ts`) only branches explicitly on `"spread"` (line 387); every other prediction type falls through to player-stat/roster matching keyed on `player_id`. Since `team_opportunity` rows have `player_id: null` by contract, they will match zero player-stat rows and zero roster rows, landing in the `pending_player_stats`/`identity_unresolved` unresolved-draft branches **permanently** — team_opportunity predictions can never resolve to a graded outcome under the current resolver. This confirms, rather than rules out, the exact risk Part 17 point 6 asked to check.
4. No stale-committed-artifact risk was found for Week 1 2026 specifically (no `team-opportunity.json` or WU4B artifact is currently committed for 2026 at all, since nothing generates it in CI — see point 1), so there is nothing to silently go stale yet; the risk is "never generated," not "silently reused."

**These three items (1-3) are P0 blockers and must be fixed before any WU4A/WU4B production promotion or scheduling, independent of anything else in this checkpoint.**

## 16. Promotion recommendations by component

| Component | Recommendation |
|---|---|
| Team opportunity game-flow adjustment (`\|spread\|`, `total×home`) | **Do not promote.** Negligible improvement (Part 5). Keep WU4A ridge unchanged. |
| Rushing opportunity/efficiency matchup features | **No promotion decision possible yet** — not built this pass. Recommend as next scoped increment (opponent rush EPA/success-rate-allowed already exist as reusable point-in-time features). |
| Receiving opportunity/efficiency matchup features | Same as rushing — deferred, not fabricated. |
| Passing decomposition | **No change.** Existing ridge already includes market + opponent features; decomposed dropbacks×efficiency structure is feasible later but not evidenced as better now. |
| **Production workflow (WU4A/WU4B → CI)** | **P0 — must fix before ANY of the above can run in production**, independent of model promotion: (a) add WU4A/WU4B generation steps to a scheduled workflow with correct sequencing, (b) extend the commit-path allowlist in that workflow, (c) add an explicit `team_opportunity` branch to the outcome resolver (and decide its resolution semantics, since there's no player-level box score to compare against — likely resolves against the actual team play-volume/dropback-rate row, which is a new code path, not a fallback of the existing player-stat one). |

## 17. Files changed (all new, nothing modified, nothing committed)

```
?? scripts/lib/nfl-game-script-core.mjs
?? scripts/analysis/nfl-game-script-research/fetch-and-summarize.mjs
?? scripts/analysis/nfl-wu4c-team-opportunity-gameflow/evaluate.ts
?? data/nfl/research/game-script/               (research output: 4 CSVs + summary.json, not committed)
?? data/nfl/research/wu4c-checkpoint.md          (this file)
```
No file under `src/`, `.github/workflows/`, or any existing script was modified. No git commands beyond read-only `status`/`log` were run.

## 18. Tests

- `npx vitest run src/lib/nfl/props/roleAllocation scripts/generate-nfl-team-opportunity` → 28/28 pass (baseline, unmodified).
- `npx vitest run src/lib/nfl/props/teamOpportunityFeatures.test.ts src/lib/nfl/props/teamPlayVolume.test.ts` → 24/24 pass, including the N-1 leakage adversarial test.
- No new unit tests were added because no new production code path was written — the two new analysis scripts are one-off research tools, consistent with the existing `scripts/analysis/*` convention (that directory's other evaluate.ts files are also untested harnesses, not production code).

## 19. Known limitations

- **Scope**: a full WU4C pass (rushing/receiving matchup model fitting, cohort analysis, JKB-vs-market margin comparison, half-level game-script opportunity model) is multiple additional research cycles of work; this checkpoint prioritized (a) the two most architecturally central questions — does game-flow help WU4A, and is production wiring safe — over (b) breadth across every part of the spec. Parts 6, 7, 9, 11, 13 (beyond "no diff") are honest gaps, not silently skipped.
- The Part 4 score-state PBP data (`data/nfl/research/game-script/`) is real and reusable for the deferred rushing/receiving/half-level work but was not joined against opponent identity or pregame spread bucket in this pass — that join is the natural next step.
- Network access to nflverse's GitHub release assets was required and available in this environment; a future run in a different execution context should verify that access still works before assuming this data can be regenerated on demand.

## 20. Git state

- Branch: `feat/nfl-power-ratings-jkb-heat`, HEAD unchanged at `f466825d`.
- No commits made. No `git add`/`git commit`/`git push` run.
- Working tree additions are exactly the 5 new paths listed in Part 17, all untracked; all pre-existing untracked files from other sessions are unchanged.
