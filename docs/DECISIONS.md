# Decision registry

This file records accepted, durable repository-level decisions. It is not a sports-model methodology reference, implementation diary, audit log, or substitute for feature documentation.

## Status definitions

- **Accepted:** current repository direction until superseded by a higher-authority instruction or a later recorded decision
- **Superseded:** retained for provenance but no longer current
- **Open:** unresolved question; not authority for choosing an outcome

## Registry

| ID | Date | Status | Decision |
| --- | --- | --- | --- |
| KS-001 | 2026-08-21 | Accepted | Repository context follows the authority hierarchy recorded below. |
| KS-002 | 2026-08-21 | Accepted | Routine startup uses `AGENTS.md` and task-routed durable documentation; `SOUL.md`, `USER.md`, and daily `memory/` files are not mandatory startup context. |
| KS-003 | 2026-08-21 | Accepted | Documentation/implementation conflicts must be investigated and reported, never silently resolved. |
| KS-004 | 2026-08-21 | Accepted | Historical plans, audits, migrations, memory, and PR history remain provenance but do not automatically describe current authority. |
| KS-005 | 2026-08-21 | Accepted | Generated artifacts are changed through their producers unless artifact-level editing is explicitly authorized; unclear ownership must be investigated. |
| KS-006 | 2026-08-21 | Accepted | Automated browser work must use the repository analytics-blocking setup and must not send Google Analytics or Google Tag Manager traffic. |
| KS-007 | 2026-08-29 | Accepted | Model methodology and presentation/comparison layers are distinct; presentation helpers must not silently recompute or redefine model outputs. |
| KS-008 | 2026-08-29 | Accepted | A model output, or a model-versus-market comparison, is not by itself an edge, +EV claim, best bet, recommendation, or calibrated win probability; those claims require an explicitly documented calibration or validation gate. |
| KS-009 | 2026-08-29 | Accepted | Independent predictive ratings/models and market-informed composites must stay explicitly distinguishable; market information is never silently fed into an independent model, and a market-informed composite is never relabelled as independent. |
| KS-010 | 2026-08-31 | Accepted | Analytical heat color encodes goodness percentile: gold/green is favorable, red is unfavorable. Any alternate semantic palette must be explicitly documented as an exception. |
| KS-011 | 2026-08-31 | Accepted | Percentile computations may use different denominator conventions for large populations versus fixed small pools, but the choice follows the documented `docs/TABLE_CONVENTIONS.md` rule and direction is always explicit at the call site. |
| KS-012 | 2026-08-31 | Accepted | UI is light-first; new pages and components are not required to implement dark mode until dark mode is explicitly reopened as a dedicated project. |
| KS-013 | 2026-09-02 | Accepted | K Projection V2.2 (`projectStrikeoutsV2`, artifact/field model version `mlb-k-projection-v2-production`) is the production Projected K, resolved into `hr-props-raw.json` `pitchers[].projectedKs` by `mlb-k-production-projection-v1`; the legacy `IP × K9 / 9` projection is a per-row fail-safe fallback only. Calibration: pitcher-skill shrinkage α = 0.55, opponent matchup multiplier = 0.75, matchup clamp = ±0.035. |

## KS-001: authority hierarchy

Use this order when sources conflict:

1. Current explicit user instruction
2. Approved active plan
3. `docs/DECISIONS.md`
4. Relevant current model documentation
5. Relevant current feature documentation
6. Project, architecture, data, and brand documentation
7. Current implementation and tests
8. Completed plans, audits, migrations, memory, and PR history
9. Chat history

Higher authority does not make contradictory evidence disappear. Apply KS-003 whenever documentation and implementation disagree.

## KS-005: generated-artifact ownership

Retained as recorded. Generated artifacts are changed through their producers unless artifact-level editing is explicitly authorized, and unclear ownership must be investigated. `docs/ARCHITECTURE.md` describes the current source, cache, generated-artifact, and consumer layers; `docs/DATA_SOURCES.md` records the external providers each producer uses. This section adds no new rule.

## KS-007: methodology and presentation are distinct layers

A model's methodology (inputs, formula, weights, thresholds, fallback, calibration) and the presentation or comparison layer that renders it are separate concerns.

- Presentation, formatting, ranking-for-display, tiering, and market-comparison helpers must not silently recompute, re-derive, or redefine a model output. They consume the model's published values.
- When a comparison is shown (for example a projection beside a market line), the comparison is derived in the consumer layer after the model output already exists, and the model must not read the comparison input.
- A future `docs/models/` file owns the approved methodology contract for its model. Historical research, audits, migrations, code READMEs, and implementation code remain evidence and provenance, but once a current model document exists it is the authority for that model's formula, weights, fallback, and calibration.

## KS-008: predictive-output framing

The application may present forward-looking model outputs and model-versus-market comparisons. That alone does not license a stronger claim.

- A model output or a model-versus-market difference is not, by itself, an edge, a +EV or value claim, a best bet, a pick, a recommendation, or a calibrated win probability.
- Those claims require an explicitly documented calibration or validation gate for the specific model version, score version, and settled-history basis they rest on.
- Until such a gate is documented and satisfied, surfaces use descriptive language only (for example "projection", "model vs. market", "independent rating") and must not imply profitability or correctness.

## KS-009: independent versus market-informed ratings

Independent predictive ratings/models and market-informed composites must remain explicitly distinguishable in code, artifacts, and copy.

- Market information (odds, spreads, totals, moneylines, market-derived baselines) is never fed into a rating or model that is presented as independent of the market.
- A composite that blends market information is never relabelled or renamed as an independent model.
- Field and artifact names should make provenance unambiguous rather than reusing one bare name for both.

## KS-010: analytical heat direction

Analytical table heat represents *how favorable a value is relative to its
comparison population*, not the raw numeric direction of the metric.

- Gold and green mean favorable; red means unfavorable; neutral slate means
  genuinely mid-pack.
- `higherBetter` metrics use the favorable percentile directly; `lowerBetter`
  metrics invert through the shared direction helper. An inverse palette is
  never hand-rolled.
- Identity and context-only metrics receive no heat.
- Alternate semantic palettes (for example an MLB "hot / cold" red/blue view)
  are permitted only when explicitly labelled as that semantic and documented as
  an exception in `docs/TABLE_CONVENTIONS.md`.

`docs/TABLE_CONVENTIONS.md` owns the band thresholds and the source-of-truth
implementations (`src/lib/mlb/percentileColorScale.ts` and `WeeklyHeatTone`).

## KS-011: percentile computation conventions

Large comparison populations and fixed small pools may use different existing
percentile denominator conventions (divide-by-`n` for large populations;
`n − 1` endpoint behaviour for fixed small pools such as 32-team leagues or
roughly 30–60-row position boards). The selection is not per-caller taste — it
follows the rule in `docs/TABLE_CONVENTIONS.md`, and the direction argument is
always explicit at the call site.

## KS-012: light-first UI

The UI framework default is light-first. Dark mode is currently
incomplete/vestigial (no `:root`-level dark token block; only a PGA-scoped
override). New pages and components are designed for the light palette and are
not required to implement dark mode. Dark mode is reopened only as a dedicated,
explicitly approved project. The existing PGA-scoped dark treatment may remain.

## KS-013: K Projection V2.2 is the production Projected K

The displayed `Proj K` on `/mlb/strikeout-props` — and every value derived from
it (projection-vs-line edge, OVER/UNDER lean, board sorting, Best Value / Best
Bets cards and their reason text, `kAdjustment`, the canonical X K-candidate
pool, and the top-K pregame snapshot) — is the resolved output of
`projectStrikeoutsV2` (`src/lib/mlb/kProjectionV2.ts`), model version
`mlb-k-projection-v2-production`.

- `scripts/resolve-mlb-k-production-projection.mjs` →
  `scripts/lib/mlb-k-production-projection.mjs` (`mlb-k-production-projection-v1`)
  is the one place the production projection is chosen. It writes V2 into
  `pitchers[].projectedKs` whenever a V2 row matches through stable identity
  with `confidence ∈ {high, medium}` and `projectedStrikeouts > 0`; otherwise
  the stored legacy `IP × K9 / 9` projection is the deterministic per-row
  fallback, and when that is also unusable the row is `unavailable` (never `0`).
  The two are never blended.
- **Calibration gate (KS-008):** the 2023-2024 development / 2025 holdout
  historical backtest calibration study — pitcher-skill shrinkage α = **0.55**
  ([mlb-k-calibration-experiment-1.md](mlb-k-calibration-experiment-1.md)),
  opponent matchup multiplier = **0.75**
  ([mlb-k-calibration-experiment-2.md](mlb-k-calibration-experiment-2.md)),
  matchup clamp = **±0.035** (unchanged). Experiments 3 and 4
  ([mlb-k-calibration-experiment-3.md](mlb-k-calibration-experiment-3.md),
  [mlb-k-calibration-experiment-4.md](mlb-k-calibration-experiment-4.md)) tested
  contextual / pitcher-baseline workload alternatives and were rejected as
  negative results; the V2.2 workload logic is unchanged.
- This still does not license an edge, +EV, best-bet, or calibrated-probability
  claim (KS-008); the projection and any projection-vs-line gap remain
  descriptive.
- The older `workload-team-k-v3` workload/team-rate projection is a separate
  model and remains a shadow comparison feed only
  (`kWorkloadProjectionMode: "shadow"`); it is not promoted, and further broad
  workload calibration is not being pursued.
- Confidence eligibility for Best Value / Best Bets still keys on the
  `workload-team-k-v3` workload confidence grade, not `v2Confidence`. Aligning
  that gate is separate future methodology work (BL-MLB-002) and is not part of
  this decision.
- Full methodology contract: [models/mlb-k-score.md](models/mlb-k-score.md).

## Open questions

| ID | Date | Status | Question |
| --- | --- | --- | --- |
| OPEN-001 | 2026-08-21 | Open | Which configured deployment mechanism is authoritative for production? |

See `docs/ARCHITECTURE.md` for the observed evidence. Obtain current evidence or explicit direction before resolving the question.

## Adding decisions

Add an entry only when a repository-level choice has been explicitly approved or is already established by authoritative evidence. Keep entries concise, link detailed feature or model documentation instead of copying it, and mark replaced entries **Superseded** rather than deleting them.
