# MLB K Projection v3 — production-capable integration (NOT promoted)

Status: **integrated, validated, shadow-only.** v2 remains the sole production
authority. Nothing under `public/data/` was written by this work.

## What runs today

`scripts/lib/mlb-k-props-v2-shadow-core.mjs` now emits a `v3` block on every row
of `k-props-v2-shadow.json`, alongside the untouched `legacy` and `v2` blocks.
Schema version moved 1 -> 2; the change is purely additive.

`scripts/resolve-mlb-k-production-projection.mjs` is untouched, so
`hr-props-raw.json` `pitchers[].projectedKs` still resolves from
`row.v2.projectedStrikeouts` exactly as before.

## v3 = v2 K-rate + two changes

1. Workload: projected IP and BF come from `mlb-k-workload-v3`
2. Shrinkage: alpha = seasonBF / (seasonBF + 125) instead of a fixed 0.55

Every K-rate component (pitcher skill, opponent environment, matchup, lineup,
handedness, whiff support) is consumed from the v2 result unchanged.

## Deliberate scope limits

- **Site and opponent adjustments are calibrated to zero.** Retained and
  instrumented; the opponent-SP signal correlated at most +0.037 with
  pitcher-side residual innings (n=602), indistinguishable from zero.
- **Starters only.** v3 declines openers and relievers with an explicit
  `ROLE_OUT_OF_V3_SCOPE_*` flag rather than applying its starter innings floor
  to a one-inning opener. v2 keeps per-role limits and stays the only
  projection for those rows.

## Known caution, not hidden

Directional hit rate on the 933-row historical sample:
production **53.86%** (502-430-1) vs v3 **52.04%** (485-447-1).
v3 wins on MAE, RMSE, high-line bias and workload calibration, and loses on
directional record. This is the strongest argument for a live shadow period
before any promotion.

## Reproduction

`node scripts/research/mlb-k-v3-production-reproduction.mjs` re-runs the clean
historical sample through the frozen `V3_PRODUCTION_CONFIG` and asserts every
research metric to zero delta. It exits nonzero if the shipped config ever
drifts from the validated one.

---

# Post-promotion consistency cleanup

Two defects found in the promotion review, both fixed without touching the v3
formula, the v2 fallback rules, or any model weight.

## 1. Resolved workload now matches the published projection

`applyResolvedKProjection` published V3's strikeouts on top of V2's innings.
That left the row internally inconsistent (`projectedKs != projectedKRate x
projectedBF`) and mattered because `kPropStatus` and the game top-props
eligibility rule both read `projectedIP`.

The resolver now carries `projectedInnings` / `projectedBattersFaced` /
`projectedKRate` from whichever model produced the published strikeouts, with
provenance in `resolvedProjectionModel`, `resolvedProjectedIPSource` and
`resolvedProjectedBFSource`. Legacy and unavailable rows keep the stored legacy
innings (`legacy-stored`) rather than being overwritten with null.

Openers are the case that proves the rule: Bryan Hudson keeps V2's 1.18 IP,
which V3's starter floor of 3.0 could not express.

## 2. Side and edge are decided at full precision

`toUsableProjection` rounded to one decimal *before* publishing, so a projection
of 5.46 was stored as 5.5 and compared against a 5.5 line as an exact tie -- a
real UNDER read as a push, and flips appeared that no model produced.

Full precision is now published. Rounding is presentation-only, which every
display surface already did for itself (`toFixed(1)`, `numOrDash(x, 1)`), so
nothing a reader sees changed. `getProjectionEdgeInfo` decides direction on the
raw difference with `PROJECTION_EDGE_EPSILON = 1e-9`, sized for binary
floating-point error and nothing larger; the reported `projectionEdge` stays
rounded for display but can no longer decide a side.

`kPropBestBets` was computing its own `.toFixed(1)` edge, which quietly made its
`>= 0.4` gate mean 0.35. It now uses the same canonical helper as everything
else, so the threshold means what it says.

## Result on the 2026-09-06 slate

Five apparent flips became **three real ones** (Nola, Mahle, Scott). Gage Jump
and Christian Scott sat within 0.05 K of their line and had been reported as
pushes; both now resolve to a real side. No row is a push. All 28 V3 rows
satisfy `Ks = rate x BF`.
