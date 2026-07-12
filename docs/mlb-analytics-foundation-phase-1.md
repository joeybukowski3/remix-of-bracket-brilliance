# MLB Analytics Foundation — Phase 1

Branch: `codex/mlb-analytics-foundation-phase-1` · Base: `main@bd3f18d`

Phase 1 is a **foundation and shadow-validation phase**. It adds the shared
contracts (metric registry, model configuration, reference ranges, history and
odds schemas) and a pure deterministic score engine, validated in shadow
against the live HR slate. **Nothing public changed**: the production
`hrScore`, `hrScoreRank`, sorting, best bets, Sin City, K projections, email,
and social selection are untouched.

## What was implemented

| Piece | Location |
|---|---|
| Canonical identity passthrough | `src/pages/MlbHrProps.tsx` (`HrDashboardBatter` + normalizer) |
| Shared contract types | `src/lib/mlb/analytics/types.ts` |
| Metric registry (`mlb-metrics@1`) + validation | `src/lib/mlb/analytics/metricRegistry.ts` |
| Model configuration + validation | `src/lib/mlb/analytics/modelConfig.ts` |
| Reference-range artifact loader/validator | `src/lib/mlb/analytics/referenceRanges.ts` |
| Bridge range artifact (`hr-bridge-v1`) | `public/data/mlb/model-reference-ranges/hr-bridge-v1.json` |
| Deterministic score engine | `src/lib/mlb/analytics/scoreEngine.ts` |
| HR bridge model (`jkb-hr-bridge@1.0.0`) | `src/lib/mlb/analytics/hrBridgeModel.ts` |
| Shadow integration (data-loading path) | `src/lib/mlb/analytics/shadow.ts`, `src/hooks/useMlbPropsData.ts` |
| History observation schema + snapshot types | `src/lib/mlb/analytics/historySchema.ts` |
| Storage adapter boundary + in-memory adapter | `src/lib/mlb/analytics/historyStore.ts` |
| Odds observation schema | `src/lib/mlb/analytics/oddsObservation.ts` |
| Fixture comparison report | `scripts/mlb-hr-bridge-shadow-report.ts` (`npx tsx`, writes to gitignored `artifacts/`) |

## Canonical identity

The generator already emits numeric `playerId`, `gameId`, `opposingPitcherId`,
plus `lineupStatus`, `battingOrder`, `starterConfirmed`, `position`. The
frontend normalizer previously dropped them; it now passes them through.
Numeric MLB ids are the canonical history keys. `gameKey` (`"MIL@PIT"`) is a
display/grouping alias only — the history schema **rejects** records that
carry a `gameKey`. Invalid ids become explicit `null`s; ids are never
fabricated, and rows from older cached payloads still normalize.

## Current HR score vs. bridge Absolute Score

The production `hrScore` is **slate-relative**: most Statcast components blend
60% fixed-range scaling with 40% same-slate percentile; recent HR and park use
same-slate min-max; missing components are dropped and remaining weights
renormalized; and a pitcher xERA multiplier plus regression adjustment are
applied after the weighted blend. The same player profile can score
differently on a different slate.

The shadow bridge score (`hr-bridge-abs@1`) uses the **same weight
allocation** (so the comparison isolates normalization behavior) but:

- versioned fixed reference ranges only — no same-slate percentile, no
  same-slate min-max;
- neutral (0.5) substitution for missing metrics — weights are **not**
  renormalized, so thin-evidence rows are no longer silently flattered;
- no post-blend multipliers;
- identical inputs + identical versions ⇒ identical score on any slate.

Bridge weights (exactly 100): Barrel% 22, Hard Hit% 18, xBA 12, inverse
Whiff% 8, last-7 HR 10, last-30 HR 10, opposing-pitcher HR vulnerability 15,
park 3, weather 2.

**Slate Rank stays separate** (`shadowSlateRank`): the Absolute Score answers
"how strong is this profile on a stable scale," the rank answers "where does
it sit on today's slate." Folding rank into the score is what makes the
current score unstable, so the two are distinct outputs by contract; the
engine itself never sees the slate.

On the checked-in 2026-07-12 fixture (270 rows, all scored, none suppressed):
mean score delta −2.1 points, max |delta| 16.3, mean |rank delta| ≈ 16. The
deltas are expected for the three reasons above and do not indicate a defect
in either score.

## Missing values, completeness, confidence

- Missing scoring metric → neutral normalized 0.5, flagged as substituted;
  **no weight renormalization**.
- Completeness = % of active model weight backed by real values.
- Confidence = completeness × weighted sample adequacy (sample-size policies
  exist in the contract; no Phase 1 HR metric declares one because the daily
  payload carries no verified per-metric sample fields).
- Completeness floor: **65%** (`completenessFloorPercent` on the model, not a
  scattered constant). Below it the engine returns a `suppressed` result
  (null score, diagnostics preserved) instead of a normal score.
- Missing park/weather: neutral substitution; only their own weight reduces
  completeness. A verified closed/dome roof makes weather **inapplicable**
  (real neutral, no completeness penalty) rather than missing.
- Missing lineup/starter confirmation is context/eligibility metadata — never
  numerically substituted into the score.

## Reference-range limitations (read this before trusting ranges)

`hr-bridge-v1` ranges are **inherited from verified production constants**,
each with explicit provenance — they are *not* empirical multi-season league
derivations (`sourceSeasons: null`, `sampleCount: null`):

- barrel 3–20, hard-hit 25–60, xBA .180–.340, whiff 15–38, weather −10..+10:
  the exact fixed ranges in `computeBatterHrScore`;
- pitcher HR vulnerability 0–100: the composite's native scale, used raw in
  production;
- last-7 HR 0–5 and last-30 HR 0–10: frontend heat-display constants —
  production has **no** fixed range for these (it uses same-slate min-max);
- park 0.85–1.40: min/max of the checked-in `DEFAULT_PARK_FACTORS` table.

A future derivation script should emit an empirical artifact under a new
`artifactVersion` — the engine interface does not change.

## Why probabilities remain prohibited

At the audited baseline there are zero graded HR records and calibration
readiness is false. A 0–100 weighted-evidence index cannot be converted to a
probability by rescaling; that requires settled, non-void observations per
model version with time-based validation. Until those gates pass, nothing in
this codebase may present a score, shadow or production, as a probability,
fair value, edge, EV, or "JKB Value." The history schema deliberately has no
probability fields in record version 1.

## Official-versus-custom calibration boundary

Only official versioned JKB default models or explicitly tracked curated
model versions may ever receive calibrated probability outputs, because
calibration attaches to a specific frozen (model version, score version,
registry version) triple with its own settled history. Arbitrary local user
models get Custom Score, Slate Rank, contributions, and Price Context only —
a user model must never inherit the default model's calibration, since its
weights are not the weights that were calibrated.

## History and storage boundary

`HrHistoryObservation` (record version 1) pins everything needed to replay a
score offline: canonical numeric identity, market/side/**exact line**, model,
score and registry versions, generator commit SHA, artifact hashes, raw +
normalized metric snapshots, contributions, completeness/confidence, lineup
context, book-level odds observations, and settlement placeholders
(result/void/DNP/postponement/pitcher-change/units). Six immutable snapshot
labels (`OPENING_OBSERVED`, `PUBLICATION`, `T_MINUS_60`, `FINAL_PRE_LOCK`,
`CLOSING_CONFIRMED`, `SETTLEMENT`) are declared centrally — snapshot identity
is explicit, never inferred from array order.

Storage sits behind `HistoryObservationStore` (append-only: duplicate keys
rejected, no update/delete). Phase 1 ships only the in-memory fixture
adapter. Future adapters plug in without touching scoring or schemas:

- **Object storage** (Phase B): immutable compressed artifacts, one per slate
  + snapshot type — never a growing monthly rewrite file in Git.
- **Supabase/Postgres** (Phase C): database-backed observations and querying.
  Requires credentials and migrations — deliberately out of Phase 1 scope.

## Odds observations

`OddsObservation` records one price per (game, player, market, side, **exact
line**, book, capture). Quote keys make it structurally impossible to group
different lines or sides as the same quote. `impliedProbability` is the
vig-inclusive single-price conversion — labeled as such, never a fair
probability. No consensus pricing yet; no-vig eligibility requires coherent
two-sided prices at the same book/line and is encoded as a gate.

## K compatibility (contract proof only)

`kCompatibility.test.ts` proves the shared contracts already fit the K
market: the registry declares K metrics, a K weighted model validates
(fixture mirrors the verified kVs 45/35/20 allocation), the engine handles
lower-is-better (BB%) alongside higher-is-better metrics, the history schema
carries pitcher id / exact K line / over-under side / projection context, and
projected Ks stay a native-unit informational field that **cannot** receive
weight. Current K projection, eligibility, odds, and recommendation behavior
is untouched.

## Sin City

Unchanged: criteria, thresholds, 3-of-5 qualification, closest-five fallback.
A fixture regression test proves shadow enrichment cannot move Sin City
results. Representing Sin City as a rules-model preset (and any roof-aware
denominator change) is future work behind a version bump.

## Shadow integration path

Shadow scores are computed at the **data-loading path** (`useMlbPropsData`),
not at generation time: the generator is a plain-Node `.mjs` that cannot
import the TypeScript engine, and generation-time validation would require
live providers. The enrichment is pure, fixture-tested, additive
(`shadow*` fields + `shadowMeta` header), and fail-open — a shadow error
logs a warning and returns the payload unenriched. Consumers that ignore
unknown fields are unaffected. Moving shadow output to generation time
(emitting it into the payload) is a Phase 2 decision.

## Next recommended phase (Phase 2)

1. Start **append-only history persistence** for HR publication snapshots in
   the daily workflow (single-writer, fail-loud), including odds snapshots —
   every day without persisted observations is permanently lost to
   calibration.
2. Derive an empirical multi-season reference-range artifact
   (`hr-abs@1`-candidate) via script; keep the bridge artifact for
   comparison.
3. Settlement/grading job with documented HR grading rules (product-owner
   input needed on void/DNP handling).
4. Decide generation-time shadow emission vs. staying client-side.
5. Begin the model/preset UI work only after history is flowing.
