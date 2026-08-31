# Active plan — CFB Model V2 (independent predictive rating)

**Status: SHADOW-ONLY. Not in the production UI. Not promoted.**

CFB Model V2 (`cfb-ipr-v2.0`) is an Independent Predictive Rating (IPR) for FBS
college football. Its shadow infrastructure — frozen config, weekly rating and
projection generators, fail-closed validation, an audit CLI, a refresh workflow,
and one published-but-unrendered browser artifact — is implemented and tested.
**No production page or component reads it.** Promotion into any user-facing
field is a separate, later decision gated by the criteria below.

Authority note: this plan supersedes
[../../cfb-model-v2-production-integration-plan.md](../../cfb-model-v2-production-integration-plan.md)
as the **status** document. That Phase 10 plan still opens with "design only —
nothing in this document has been implemented"; that statement is now stale — the
implementation described by its work units WU1–WU6 exists. The Phase 10 plan
remains the detailed **design rationale and schema reference**.

Related: [../../models/cfb-preseason-power.md](../../models/cfb-preseason-power.md)
(production MIC rating), [../../features/cfb.md](../../features/cfb.md) (surfaces),
[../../DECISIONS.md](../../DECISIONS.md) (`KS-007`, `KS-008`, `KS-009`).

## Objective

Ship an analytics-only independent CFB rating and game projection (margin, total,
win probability, 80% intervals) derived solely from CFBD box-score, schedule, and
roster data — never from market data — to sit **alongside** the market-informed
JKB Preseason Power, not replace it. No betting engine, no picks, no +EV badges
(Phase 10 §27).

## Validated research conclusions (from CFB Model V2 research, Phases 1–9)

Recorded here as the basis for building the shadow; **not re-verified in this
documentation pass.** Detailed evidence: `src/lib/cfb/research/phase{6,8,9}/**`,
`data/cfb/research/experiments/**` (gitignored), and Phase 10 §3.

- Phase 9 classified the Phase 8 connectivity-aware finalist as **"B — GO,
  ANALYTICS-ONLY CANDIDATE."**
- Frozen spec: YPP + PPP, game-weighted, no garbage-time filter; Prior D
  (prev-season opp-adjusted offense/defense + returning production + talent) with
  a downward-only fallback hierarchy, never zero-imputed; connectivity-aware
  Ridge opponent adjustment (`COMPONENT_SIZE`, base λ = 10, cap ≤ 3×); coherent
  home/away scoring regression with national HFA and a `SUCCESS` secondary block,
  no pace; `TOTAL_ONLY` linear total calibration, margin preserved exactly;
  empirical residual bootstrap, seed `20260101`, 20,000 draws, homoskedastic.
- Validated 2020–2025: margin MAE ≈ 12.87, RMSE ≈ 16.23, corr ≈ 0.60, directional
  accuracy ≈ 71.1%; Brier ≈ 0.188, log loss ≈ 0.553, ECE ≈ 0.010; 4/6 seasons
  improved, 2/6 tied, 0/6 materially worse.
- **No validated betting edge.** Phase 6/8/9 found no profitable threshold,
  negative ROI at every tested moneyline threshold, and a market that stays more
  accurate.

## IPR / MIC boundary (`KS-009`, Phase 10 §6–§7)

- **IPR** = CFB Model V2, Model V2 exactly as validated. **Never reads market
  data at any layer.** Lives under `src/lib/cfb/production/v2/**`.
- **MIC** = the production `cfb-preseason-v1.1-market-anchor` rating, which
  already blends the VSiN market baseline. Documented as MIC in
  [../../models/cfb-preseason-power.md](../../models/cfb-preseason-power.md).
- Enforced by architecture-guard tests:
  `src/lib/cfb/production/v2/architectureGuard.test.ts`,
  `scoringSupportMarketFreeGuard.test.ts`, and
  `src/data/cfb/v2/shadowProjections.architectureGuard.test.ts` (the last asserts
  no `.tsx` imports the shadow consumer and the bundle graph is unchanged).
- Recommendation on record: relabel MIC, do not delete it; any future
  regeneration of MIC's statistical input from V2 IPR is a **MIC change**, out of
  this plan's scope.

## Completed work (implemented, in the committed repo)

| Area | Where | State |
| --- | --- | --- |
| Frozen config + versions + drift hash | `src/lib/cfb/production/v2/config.ts`, `versions.ts` (`CFB_V2_MODEL_VERSION = "cfb-v2.0"`, `CFB_V2_CONFIG_VERSION = "cfb-v2-config-<hash>"`) | Parity-tested against the research snapshot; `validateCfbV2Config()` runs on import. |
| Rating foundation | `ratingInputs.ts`, `priorModel.ts`, `prevSeasonRating.ts`, `connectivity.ts`, `ridge.ts`, `linearSolver.ts`, `iterativeAdjustment.ts`, `buildTeamRatings.ts`, `ratingValidation.ts` | Phase 8/9 coefficient-parity and production-parity tests. |
| Scoring / calibration / probability | `scoringEnvironment.ts`, `scoringModel.ts`, `totalCalibration.ts`, `residualPool.ts`, `probability.ts`, `buildGameProjections.ts`, `projectionValidation.ts`, `successDerivation.ts`, `successFeature.ts` | Determinism + coherence tests. |
| Current-season input wiring | `currentSeasonCalibration.ts`, `scheduleGraph.ts`, cutoff filters (`asOfWeek`, `isEligibleBeforeCutoff`) | `historicalCutoffReconstruction.test.ts`, leakage tests. |
| Shadow build orchestrator | `scripts/cfb-v2-build-shadow.ts` (`npm run cfb:v2:build-shadow`, `cfb:v2:refresh`) | One shared in-memory rating state; atomic promotion of ratings + projections + `manifest.json`; failure diagnostics written separately; last-known-good untouched on failure. `cfb-v2-build-shadow.fail-closed.test.ts`. |
| Fail-closed validation | `shadowValidation.ts` (`assertPublishableCfbV2Shadow`), `shadowManifest.ts` (degraded-flag computation) | Health state HEALTHY / DEGRADED / INVALID; DEGRADED/preseason is not a failure. |
| Audit CLI | `scripts/cfb-v2-audit-shadow.ts` (`cfb:v2:audit-shadow`) | Read-only; non-zero exit on INVALID so CI can gate. |
| Browser artifact publish | `scripts/cfb-v2-publish-browser-artifact.ts` (`cfb:v2:publish-browser-artifact`) → `public/data/cfb/v2/shadow-projections.json` (schema `cfb-v2-public-projections-1`) | Internal `data/generated/cfb/v2/**` stays gitignored; only the one compact public file is tracked. |
| Refresh workflow | `.github/workflows/cfb-v2-shadow-refresh.yml` | Scheduled Aug–Jan, Monday-morning cadence; commits exactly `public/data/cfb/v2/shadow-projections.json`; calls `deploy.yml` via `workflow_call` for that commit. |
| App-side read-only consumer (infra only) | `src/data/cfb/v2/shadowProjections.ts` — loader/validator/game-id join/legacy-map | `CFB_V2_ROLLOUT_STATE = "stage-2-infrastructure-ready"`: exists and tested, **never invoked by the running app**, not in the bundle graph. |

Current committed artifact state: `asOfWeek: 0`, `healthState: "DEGRADED"`
(`MISSING_CURRENT_TALENT`, `PRESEASON_PRIOR_A_FALLBACK`, `NO_CURRENT_SUCCESS_DATA`,
`PRESEASON_ZERO_COMPLETED_GAMES`), every record `projectionStatus: "unavailable"`
with null margin/total/probability. The shadow is producing structurally valid
but empty preseason output.

## What has NOT been approved or promoted

- No production page, component, or `src/data/cfb/season2026/*` module reads V2.
- `CfbGameModelProjections` / `CfbJkbRatings` have **not** gained V2 fields;
  `jkbProjectedSpread` etc. remain null placeholders.
- `CFB_V2_ROLLOUT_STATE` has not advanced past `stage-2-infrastructure-ready`
  (i.e. "infrastructure ready" ≠ "active" ≠ "visible").
- No `docs/DECISIONS.md` entry promotes V2 or relabels MIC.
- No monitoring/performance-reporting job (Phase 10 WU8) exists yet.
- No historical source for prior-season completed-game point totals is wired
  (`previousSeasonMean` passed as null pre-Week-1).

## Remaining promotion gates (all required before any UI exposure)

1. **Clean shadow weeks.** Several consecutive in-season weekly refreshes that
   pass `assertPublishableCfbV2Shadow` and the audit CLI with `healthState:
   "HEALTHY"` (not DEGRADED), producing `projectionStatus: "computed"` rows for
   FBS-vs-FBS games.
2. **Rollout-state advance.** `stage-2-infrastructure-ready` →
   `stage-2-active` (app actually invokes the loader at runtime, still nothing
   rendered) → `stage-3-visible-integration`, each a separate approval.
3. **Additive-only UI contract.** New optional `ipr`-namespaced fields on
   `CfbJkbRatings` / `CfbGameModelProjections`; no rename or removal of existing
   fields in the same change (Phase 10 §24).
4. **Terminology review.** UI copy limited to "Model Projection", "Independent
   Rating", "Model vs. Market Difference" — never "edge", "+EV", "best bet", or
   "profitable" (Phase 10 §22; `KS-008`).
5. **FCS / non-FBS handling.** `matchupPopulation: "fbs_vs_fcs"` rows render an
   explicit "independent projection unavailable" state; V1/MIC numbers are never
   blended into a V2-labelled field (Phase 10 §14).
6. **Rollback discipline.** A failed V2 generation means no V2 output that day;
   MIC is never substituted into a V2-labelled field (Phase 10 §25).
7. **`docs/DECISIONS.md` entry** recording the promotion and the MIC relabel.

## Validation requirements

- Golden-fixture regression: historical games re-run through the production code
  path, margin/total/probability within tolerance of the Phase 9 numbers;
  bootstrap draws hash-locked (Phase 10 §18). Present:
  `phase9CoefficientParity.test.ts`, `phase9ProductionParity.test.ts`,
  `historicalShadowReplay.test.ts`, `postWeek1ShadowIntegration.test.ts`.
- Leakage guard: weekly graph/rating cutoff is integer-`week`-based; a same-week
  midweek result can never enter that week's own projections
  (`scheduleGraph.test.ts`, `historicalCutoffReconstruction.test.ts`).
- Fail-closed QA: every Phase 10 §16 condition aborts the publish
  (`cfb-v2-build-shadow.fail-closed.test.ts`, `shadowValidation.test.ts`).
- Architecture guards (market-free IPR; shadow not in bundle) — listed above.
- Post-launch (not yet built): recompute margin MAE / total MAE / Brier / log
  loss / ECE / calibration-bucket against realized outcomes, with
  market-performance diagnostics kept in a separate report from IPR-quality
  metrics (Phase 10 §26).

## Unresolved questions

- No production source for historical completed-game point totals
  (`previousSeasonMean` / `allPriorSeasonsMean`); the scoring environment falls
  back to current-season-so-far once games exist, but the pre-Week-1 estimate is
  unanchored.
- The current preseason shadow is entirely `DEGRADED` / `unavailable`; whether it
  ever reaches `HEALTHY` in the 2026 season is unverified (2026 is unplayed).
- No calibration/validation gate is published for V2 (or any CFB rating); Phase 9
  metrics are research findings, not a `KS-008` gate.
- The `jkbPowerLine` field's future meaning (MIC-sourced vs V2 vs removed) is
  undecided (Phase 10 §22).
- `OPEN-001` (authoritative deployment mechanism) affects how the
  `cfb-v2-shadow-refresh.yml` → `deploy.yml` `workflow_call` path actually
  reaches production.
