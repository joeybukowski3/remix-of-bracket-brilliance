# MLB Strikeout Projection, K Score & K value sort

## Current authority

This document is the current methodology and contract authority for the three
**live** MLB strikeout-prop analytical outputs:

1. **`projectedKs`** — the single production strikeout projection (`Proj K`).
2. **K Score** — `strikeoutMatchupScore`, the client-side matchup display score.
3. **"Best K Prop Bets" value sort** — `buildKPropBestBets`, which also feeds
   the canonical X K-candidate pool.

Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md).
`KS-007` / `KS-008` are binding: a projection, a projection-vs-line gap, a K
Score, or a `valueScore` is **not** an edge, +EV claim, best bet, pick, or
calibrated probability without a documented calibration gate — none exists.
Surface routing, distinct-number list, and artifacts:
[../features/mlb-k.md](../features/mlb-k.md). Two systems on the same page are
explicitly **out of scope** here — see "Not this".

## Status / version

| Output | Status | Version id |
| --- | --- | --- |
| `projectedKs` (live) | current production, user-facing | resolve step `mlb-k-production-projection-v1`; committed payload `kProjectionMode: "shadow"`, `kProjectionModelVersion: "workload-team-k-v3"` — i.e. the **legacy** formula is live and V2 rides shadow |
| K Score (`strikeoutMatchupScore`) | current production, user-facing (client-only display score) | unversioned; moves with `src/lib/mlb/mlbSocialSelection.ts` |
| Best K Prop Bets value sort | current production, user-facing; feeds canonical social K pool | unversioned; moves with `src/lib/mlb/kPropBestBets.ts` |

## Purpose

Give each probable starter a single strikeout projection, a 0–100 matchup score
for ordering the board, and a rule-based "best value" shortlist per side — all
descriptive, none calibrated.

## Current inputs

### `projectedKs` (live / legacy path)

`scripts/resolve-mlb-k-production-projection.mjs`
([`npm run mlb:k-production-projection`](../../scripts/resolve-mlb-k-production-projection.mjs))
is the **one** place a production projection is chosen. It writes `projectedKs`
into `hr-props-raw.json` after the V2 shadow artifact is generated and
schema-validated. With `kProjectionMode: "shadow"` it serializes the **stored
legacy projection** for every normal row:

```
projectedKs = calculateProjectedKs(projectedIP, projectedK9)
            = round1( (projectedIP × projectedK9) / 9 )      // null if either input null
```

- `projectedK9 = calculateProjectedK9(pitcher)`:
  real `round1(clamp((seasonStrikeOuts / seasonIP) × 9, 1, 15))` when season SO
  and IP are present; else an estimate from `kRate` / `whiffRate`
  (`clamp(baseK9 × skillMult, 3, 15)`, treating a literal `0%` as missing); else
  `null` (never a fabricated floor).
- `projectedIP` from
  [`scripts/lib/mlb-projected-innings.mjs`](../../scripts/lib/mlb-projected-innings.mjs)
  (`classifyPitcherRole` / `calculateProjectedInnings`; role-aware; shared with
  the Moneyline projected-IP shadow). Its internals are cited from that module,
  not re-derived here.

### K Score — `strikeoutMatchupScore`

Built client-side in `buildPitcherStrikeoutRows`
([`src/lib/mlb/mlbSocialSelection.ts`](../../src/lib/mlb/mlbSocialSelection.ts))
as a weight-renormalizing weighted average, each term 0–100 via
`normalizeRange`:

| Term | Mapping | Weight |
| --- | --- | --- |
| `pitcherKSkillScore` | see below | 0.40 |
| opponent lineup K% | `normalizeRange(14, 28)` | 0.30 |
| opponent lineup Whiff% | `normalizeRange(18, 36)` | 0.20 |
| opponent lineup xBA | `100 − normalizeRange(0.21, 0.29)` | 0.10 |

`pitcherKSkillScore` = renormalizing weighted average of
`normalizeRange(kVs, 15, 85)` w 0.5, `normalizeRange(kRate, 15, 35)` w 0.3,
`normalizeRange(whiffRate, 15, 35)` w 0.2 — falling back to
`normalizeRange(kVs, 15, 85)` then `0`.

Opponent lineup K% / Whiff% / xBA are **flat averages of the listed hitters**,
not true team rates.

### Best K Prop Bets value sort — `buildKPropBestBets(rows, maxPerSide = 3)`

Only rows with `resolveKPropStatus(row).status === "VALID"`
([`src/lib/mlb/kPropStatus.ts`](../../src/lib/mlb/kPropStatus.ts), recomputed
fresh) are considered. `projectionEdge = round1(projectedKs − kLine)`.

- **Over** requires `projectionEdge ≥ 0.4` and an over price;
  `valueScore = projectionEdge·18 + strikeoutMatchupScore·0.42 +
  pitcherKSkillScore·0.18 + priceBonus(overOdds)`.
- **Under** requires `projectionEdge ≤ −0.4` and an under price;
  `valueScore = |projectionEdge|·20 + (100 − strikeoutMatchupScore)·0.2 +
  (100 − pitcherKSkillScore)·0.12 + priceBonus(underOdds)`.
- `priceBonus`: `≥ +100 → min(8, price/50)`; `≥ −120 → 2`; `≥ −145 → 0`;
  else `−3`.
- Sort by `valueScore` desc, then `|projectionEdge|` desc, then pitcher name;
  take `maxPerSide` (3) per side.

The card's projection is always the row's canonical `projectedKs` — there is
deliberately no third IP×K9 re-derivation, so the card and the table cannot
disagree.

## Eligibility

- **Board / `projectedKs`:** any probable starter with enough inputs to produce
  a non-null projection; otherwise `Proj K` renders unavailable.
- **Best Bets / social / exports:** `resolveKPropStatus` must return `VALID` —
  a real two-sided market line, `kLine ≥ MIN_ELIGIBLE_K_LINE (3.5)`,
  workload-confident projection (not grade C/D, no critical workload flags),
  coherent odds (combined implied ≥ `0.85`), an allowed book (not `underdog` /
  `prizepicks` / `sleeper`), and legacy-vs-candidate divergence `≤ 2.5` K.
  `LOW_CONFIDENCE`, `INSUFFICIENT_DATA`, `INVALID_ODDS`, `INVALID_WORKLOAD` are
  excluded; `NO_MARKET` rows stay on the board but out of Best Bets.

## Formula / weights

See "Current inputs". The legacy `IP×K9/9`, the K9 clamps (`[1,15]` real,
`[3,15]` estimated), the K Score term list / weights / `normalizeRange` bands,
the `±0.4` edge thresholds, the `valueScore` coefficients, `priceBonus`
breakpoints, and `maxPerSide = 3` are the methodology and are fixed here.

## Fallbacks

- V2 artifact missing, stale, or schema-invalid → every row falls back to its
  stored legacy projection; the resolve step still succeeds (it exits nonzero
  only on a structurally broken public payload). Mixed or stale projections are
  never published.
- `projectedK9` unresolvable → `projectedKs` is `null` (propagated as "no
  projection"), never `0`.
- K Score: any missing term is dropped and weights renormalize;
  `pitcherKSkillScore` falls back to `kVs`-only then `0`; opponent xBA term uses
  a `50` neutral when absent.
- `buildKPropBestBets`: a side with no qualifying rows returns an empty list.

## Clamps

`projectedK9 ∈ [1, 15]` (real) or `[3, 15]` (estimated); `normalizeRange` terms
`∈ [0, 100]`; `priceBonus ∈ [−3, 8]`. `projectedKs`, K Score, and `valueScore`
are rounded to 1 dp. There is no calibrated probability anywhere in this stack —
K +EV V1's Poisson math is a **separate, non-live** module (see "Not this").

## Output interpretation

- `projectedKs` — an expected strikeout count in native units. Per `KS-008` it
  "cannot receive weight" as an edge; the projection-vs-line gap is a
  comparison, not a pick.
- K Score — a slate-relative matchup-quality rank for ordering the board; not a
  probability.
- Best K Prop Bets — a rule-based shortlist by side, labelled model-vs-line
  value sorting, not calibrated EV. `buildCanonicalKCandidatePool` reuses the
  same `buildPitcherStrikeoutRows` → `buildKPropBestBets(rows, 3)` pipeline to
  form the canonical X K pool (`k-production-candidates.json`); full publishing
  contract in [../features/social-publishing.md](../features/social-publishing.md).

## Calibration / validation status

**None** for any of the three. `top-k-performance*.json`
(`scripts/persist-top-k-picks.ts` + `scripts/grade-top-k-picks.mjs`, workflow
`grade-mlb-hr-results.yml`) records **empirical** graded outcome rates for the
daily "top K" picks only — descriptive history, not a `KS-008` gate. The
projection formula and K Score have never been fit to outcomes.

## Artifacts / producers

| Artifact | Producer(s) | Workflow |
| --- | --- | --- |
| `public/data/mlb/hr-props-raw.json` (K rows + resolved `projectedKs`) | `generate-mlb-hr-props.mjs` → `generate-mlb-hr-props-with-k-shadow.mjs` → `resolve-mlb-k-production-projection.mjs` | `generate-mlb-hr-props.yml` |
| `public/data/mlb/strikeout-prop-details.json` | `generate-mlb-strikeout-prop-details.mjs` | `generate-mlb-hr-props.yml` |
| `public/data/mlb/k-props-v2-shadow.json` (shadow only) | `generate-mlb-k-props-v2-shadow.mjs` (+ `:validate`) | `generate-mlb-hr-props.yml`, `test-mlb-k-shadow.yml` |
| `public/data/mlb/k-workload-shadow.json` (shadow inputs) | `generate-mlb-k-workload-shadow.mjs` | `generate-mlb-hr-props.yml` |
| `artifacts/mlb-x-canonical/k-production-candidates.json` | `generate-mlb-k-production-candidates.ts` | `mlb-x-canonical.yml` |
| `public/data/mlb/top-k-performance*.json` | `persist-top-k-picks.ts`, `grade-top-k-picks.mjs` | `generate-mlb-hr-props.yml` / `grade-mlb-hr-results.yml` |

K Score and the value sort are **client-computed** and have no artifact
(`KS-005` applies only to the generated inputs).

## Consumers

`src/pages/MlbStrikeoutProps.tsx` (via `MlbStrikeoutPropsWithDebug`),
`src/lib/mlb/mlbSocialSelection.ts`, `src/lib/mlb/kPropBestBets.ts`,
`src/lib/mlb/kPropStatus.ts`, `src/lib/mlb/kPropCanonicalCandidates.ts`,
`src/hooks/useMlbStrikeoutPropDetails.ts`, `MlbGameDetail` top-K previews, the K
social table and `x-export` route.

## Tests

- `src/lib/mlb/kPropCanonicalCandidates.test.ts` — social parity.
- `scripts/lib/mlb-k-x-selection-core.test.mjs`,
  `mlb-strikeout-reference-context.test.mjs`, `mlb-opponent-k-context.test.mjs`.
- `src/pages/MlbStrikeoutProps.viewToggle.test.tsx` — projection / K +EV toggle.
- `scripts/generate-mlb-hr-props.k9-missing-data.test.mjs` — K9/Ks null
  propagation.
- `scripts/validate-mlb-k-props-v2-shadow.mjs` (`test-mlb-k-shadow.yml`).

## Not this

- **Not K Projection V2 / `workload-team-k-v3`.** That is **current
  research/shadow**: `kProjectionMode: "shadow"`, comparison fields attached,
  `projectionSource: "legacy"` for normal rows, debug-only UI at `?debug=k-v2`,
  artifact `k-props-v2-shadow.json`. It does not drive any live number and must
  not be promoted silently — a promotion is a methodology change that reopens
  this contract.
- **Not K +EV V1** (`src/lib/mlb/kPlusEvModel.ts`, `k-plus-ev.json`,
  `mlb-k-plus-ev-v1`, `mlb-k-plus-ev-generator-v1`). It is **stale / dormant**:
  `scripts/generate-mlb-k-plus-ev.mjs` is wired to **no workflow**, and the
  committed `k-plus-ev.json` is frozen well before the current slate. The
  `/mlb/strikeout-props` K +EV table renders it with no freshness guard, so it
  is research-grade at best. Its Poisson probability / fair-odds / EV math is
  **not** part of the live methodology and is not covered by this document.
- **Not the HR models** ([mlb-hr-score.md](mlb-hr-score.md),
  [mlb-hr-plus-ev.md](mlb-hr-plus-ev.md)) or the Moneyline model
  ([mlb-moneyline.md](mlb-moneyline.md)).

## Limitations

- The live projection is a two-factor product (`projectedIP × projectedK9`);
  it carries no game-state, batting-order-turn, or bullpen-timing modelling and
  no uncertainty band.
- K Score's opponent terms are flat hitter averages, not lineup-weighted true
  team rates.
- `valueScore` coefficients are hand-tuned, never fit; the `±0.4` K threshold is
  a fixed heuristic.
- The estimated-K9 path can float a projection for a pitcher with no real
  season IP.
- V2 has been validated in shadow but its promotion criteria are not recorded in
  a decision; treat any "V2 is live" claim as false until `kProjectionMode`
  changes in committed data.

## Version / reopening criteria

Reopen this contract before: changing the legacy `IP×K9/9` formula, the K9
clamps, or `calculateProjectedK9`'s fallback; promoting K Projection V2 or
changing `kProjectionMode`; changing any K Score term, weight, or
`normalizeRange` band; changing the `±0.4` edge threshold, the `valueScore`
coefficients, `priceBonus`, or `maxPerSide`; changing `resolveKPropStatus`
thresholds (`MIN_ELIGIBLE_K_LINE`, divergence, book allowlist, implied-prob
floor); wiring `generate-mlb-k-plus-ev.mjs` into a workflow or otherwise
reviving K +EV V1; or introducing any calibrated probability / edge / EV output
(which additionally requires a documented `KS-008` gate).
