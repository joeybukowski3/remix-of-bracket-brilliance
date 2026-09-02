# Model Versioning Guide

## Identity format

Use a stable model family plus semantic version: `<league>-<target>-<family>-vMAJOR.MINOR.PATCH`. Existing names remain valid historical identities; new versions should converge on this convention. Keep schema and pipeline versions separate.

Examples:

- `nfl-spread-power-number-v1.0.0` (successor identity to current `jkb-power-number-v1.0.0` only if behavior changes)
- `nfl-passing-direct-ridge-v1.0.0`
- `nfl-rushing-carries-x-shrunk-ypc-v1.0.0`
- `nfl-receiving-targets-x-shrunk-ypt-v1.0.0`
- `nfl-total-<approved-family>-v1.0.0` only after a model is approved

The model name identifies target and family. The version identifies behavior. Training-window metadata belongs in the fitted-model manifest and archive record, not only in an ever-growing version string.

## Version changes

### Major

Increment MAJOR when interpretation or architecture breaks comparability: direct yards to decomposition, different target population/eligibility semantics, changed spread sign/target, market-free to market-anchored projection, new outcome definition, or incompatible normalization.

### Minor

Increment MINOR for intentional backward-compatible predictive changes: adding/removing a feature, changing a weight/coefficient/HFA/shrinkage constant, retraining policy, window/coalesce order, imputation method, approved provider input, role resolution rule, or materially changed training population.

### Patch

Increment PATCH for a defect correction intended to restore documented behavior without changing the specification, such as fixing an alias join or arithmetic implementation bug. A patch can still change numbers and therefore creates new snapshots; it never rewrites old predictions.

Pure documentation, logs, formatting, UI labels, or a pipeline retry with identical model inputs do not change model version. Change the schema version for record-shape changes and pipeline version for orchestration/provenance changes. If a “bug fix” changes intended methodology, it is minor or major, not patch.

## Feature and fitted-state rules

- Every model manifest names its feature-schema version and ordered feature list.
- Any load-bearing feature change requires at least a minor model version.
- A source refresh with the same feature/model method creates a new fitted-model instance/hash, not necessarily a new semantic model version.
- Training seasons, row population, hyperparameters, coefficients/constants, fallbacks, source hashes and code revision must be recoverable from the fitted-model manifest.
- Current player models refit from 2022-2025 on every run. Before calling them fully production-ready, archive a hash-addressed fitted state so identical version names cannot hide coefficient drift caused by revised source data.

## Archive and backtest labels

Every production record stores model name/version plus fitted-model hash, feature schema, pipeline version, code revision, run ID and mode. Backtests use `mode: backtest`; historical reconstructions use `mode: historical_replay`. Neither may use a production timestamp implying the prediction was actually issued then.

Examples:

- Changing spread HFA from 2.0 to 1.5: minor version and new predictions; old `jkb-power-number-v1.0.0` records stay unchanged.
- Fixing LA/LAR mapping where the documented canonical mapping was already LA -> lar: patch version, new snapshots, correction note; no rewrite.
- Replacing passing direct ridge with attempts x YPA: major version.
- Adding weather to the passing fitted vector: minor version plus feature-schema bump.
- Regenerating current projections tomorrow from unchanged code and newly available roster/market data: same model version, new run/snapshot and fitted/input hashes.

## Promotion record

A promoted version must add a changelog entry naming the approved candidate evidence, population, train/validation/holdout policy, benchmark results, known limitations, files/artifacts and effective production timestamp. Production history created under an older version remains authoritative for what was known then and cannot be regenerated under the newer version.
