# Backlog — blocked, deferred, and decision-needed work

Index of **known** unresolved work that is not being done now. Every entry is
supported by current repository evidence (a model doc, feature doc, plan, code
README, `DECISIONS.md`, or a committed artifact/workflow state).

This is not a wishlist. It does not duplicate limitations that already sit
cleanly inside a model or feature document unless they require a future action.

## Scope and authority

- **Active plans** (`docs/plans/active/`) own current approved-but-incomplete
  direction. **Completed plans** (`docs/plans/completed/`) are historical
  provenance. **Model docs** own current methodology. **Feature docs** own
  current product behavior. This file only indexes what is blocked/deferred and
  points at those documents.
- Authority hierarchy: [DECISIONS.md](DECISIONS.md) / [AGENTS.md](../AGENTS.md).

## Status legend

- **BLOCKED** — cannot proceed until an external dependency, data source, or
  upstream decision is resolved.
- **DEFERRED** — could proceed, but is intentionally not scheduled now.
- **NEEDS DECISION** — a repository-level choice must be made before work (or
  cleanup) can proceed.

---

## NFL

### BL-NFL-001 — Yardage prop line-source policy conflict
**Status:** NEEDS DECISION

- **What is needed:** an explicit, recorded decision on whether keyed/paid
  player-prop line ingestion is permitted for an NFL surface, or whether the
  free-first / no-player-props mandate still governs and the current market
  join must be removed.
- **Why not now:** the current yardage-market producer already uses keyed/paid
  The Odds API + Parlay API and the public artifact is consumed by the review
  page, but nothing supersedes the older NFL mandate. Use proves practice, not
  policy. No `DECISIONS.md` entry resolves it.
- **Do not:** treat the shipped paid integration as implicit approval; do not
  build the Prop Edge layer (BL-NFL-004) on top of it; do not delete the review
  UI without a decision. Missing/policy-blocked market data must leave the
  market column and raw difference unavailable.
- **Evidence:** [DATA_SOURCES.md](DATA_SOURCES.md) "NFL — player-prop market
  (yardage props)" (Unresolved note); [nfl-data-inventory.md](nfl-data-inventory.md)
  "Mandate"; [features/nfl-yardage-props-review.md](features/nfl-yardage-props-review.md)
  "Unresolved source-policy conflict"; [../src/lib/nfl/props/README.md](../src/lib/nfl/props/README.md)
  Phase 1 / Phase 7 blocked notes.

### BL-NFL-002 — Yardage projection + Matchup Score models not promoted
**Status:** BLOCKED

- **What is needed:** the Phase 7 production-readiness gates cleared — chiefly
  an accepted fix for the passing-market ~+12.5-yard calibration bias, plus
  operational status/history/interval scaffolding — and an authoritative
  promotion decision or a `docs/models/nfl-yardage-*.md` methodology doc.
- **Why not now:** Phase 7 classified all three markets as research baselines
  ("none is production-ready"); the passing calibration gate is explicitly not
  met; Matchup Score research is research-only. The current-week UI/artifacts
  exist but no review or decision promoted the underlying models.
- **Do not:** describe the yardage projection or Matchup Score methodology as
  production/promoted; do not add Over/Under, +EV, confidence, or best-bet
  language (`KS-008`).
- **Evidence:** [plans/active/nfl-yardage-props.md](plans/active/nfl-yardage-props.md);
  [nfl-cross-market-projection-review.md](nfl-cross-market-projection-review.md)
  §12–13; [nfl-matchup-score-research.md](nfl-matchup-score-research.md) §17;
  [features/nfl-yardage-props-review.md](features/nfl-yardage-props-review.md)
  "Status conflict".

### BL-NFL-003 — No depth-chart / starter-order data source
**Status:** BLOCKED

- **What is needed:** a compliant source of ordinal depth-chart / starter
  designation (nflverse `depth_chart_position` is a positional label, not an
  order).
- **Why not now:** none exists anywhere in committed repo data. Passing-starter
  resolution is a documented rolling-attempts heuristic; rushing/receiving role
  scarcity floors are `playerId`-sorted tie-breaks, not depth-informed picks.
- **Do not:** present the QB starter heuristic or the scarcity-floor picks as
  confident individual selections; the `roleUncertain` / `fallbackProvenance`
  flags must be preserved.
- **Evidence:** [../src/lib/nfl/props/README.md](../src/lib/nfl/props/README.md)
  Phase 9 (`qbStarterResolution.ts`) and Phase 9.1; [nfl-yardage-props-audit.md](nfl-yardage-props-audit.md)
  §2.3; [../src/lib/fantasy/weekly/README.md](../src/lib/fantasy/weekly/README.md)
  (`starterStatus` frozen `unknown`).

### BL-NFL-004 — Prop Edge (`edgeYards`) layer unavailable
**Status:** BLOCKED (depends on BL-NFL-001)

- **What is needed:** an approved, mandate-compliant player-prop line source
  and, separately, the calibration gate of BL-NFL-002.
- **Why not now:** `NflYardagePropEdge` is a schema only; nothing constructs it.
  A raw projection-minus-line difference on the review surface is labelled
  research context and does not satisfy or bypass the gate.
- **Do not:** synthesize a "line" from the projection to backtest Over/Under
  hit rate (circular); do not license lean/over/under/best-bet copy.
- **Evidence:** [../src/lib/nfl/props/README.md](../src/lib/nfl/props/README.md)
  "Intentionally not implemented yet"; [nfl-yardage-props-audit.md](nfl-yardage-props-audit.md)
  §2.1; [features/nfl-yardage-props-review.md](features/nfl-yardage-props-review.md)
  "Projection, Matchup Score, and market comparison".

---

## Fantasy

### BL-FF-001 — `fantasy-weekly-production-operations.md` is stale
**Status:** NEEDS DECISION

- **What is needed:** reconcile the operations doc, which names
  `fantasy:weekly-rankings` / `public/data/fantasy/weekly/<season>/`
  (`weekly-fantasy-ranking-artifact-v1`) as the canonical consumer artifact,
  with current code, which consumes the production **projection** artifact
  `public/data/fantasy/projections/<season>/`.
- **Why not now:** flagged for a later operations-doc update pass; the doc was
  deliberately not modified when the feature/model docs were written.
- **Do not:** treat the operations doc's artifact path as current; the
  projection artifact is authoritative per the authority hierarchy.
- **Evidence:** [features/fantasy-weekly-rankings.md](features/fantasy-weekly-rankings.md)
  "Operational-doc conflict"; [models/fantasy-weekly-projections.md](models/fantasy-weekly-projections.md)
  "Open conflict".

### BL-FF-002 — Superseded `weekly-fantasy-ranking-artifact-v1` not formally retired
**Status:** DEFERRED

- **What is needed:** a decision to retire (and a `DECISIONS.md` entry) or to
  keep the Phase 2 baseline ranking artifact, producer
  (`scripts/generate-fantasy-weekly-rankings.ts`), schema, authority module,
  and committed `week-01.json`.
- **Why not now:** it has no live consumer (its loader hook is imported only by
  its own test) but its pipeline remains wired and maintained.
- **Do not:** describe it as deleted or decommissioned; no decision records its
  removal.
- **Evidence:** [features/fantasy-weekly-rankings.md](features/fantasy-weekly-rankings.md)
  "Historical / superseded".

---

## PGA

### BL-PGA-001 — Legacy 4/5-band heat needs visual sign-off
**Status:** NEEDS DECISION

- **What is needed:** explicit visual sign-off before migrating
  `src/lib/pga/pgaHeatColors.ts` (4 bands) or
  `src/lib/pga/rankColors.ts` (5 bands) to the 8-band JKB Heat scale.
- **Why not now:** the legacy thresholds are compatibility-tested, and a direct
  conversion would add gold plus additional green/red strengths across broad
  percentile ranges. That is a material palette change, not a mechanical
  framework migration.
- **Do not:** silently convert either palette. Retain the legacy bands as a
  temporary intentional exception; preserve `getPercentileFromRank` in any
  future approved migration.
- **Evidence:** [TABLE_CONVENTIONS.md](TABLE_CONVENTIONS.md) §D;
  [plans/completed/ui-design-framework.md](plans/completed/ui-design-framework.md)
  Phase 8C / Phase 9.

---

## MLB

### BL-MLB-004 — Park-factor heat direction is context-dependent
**Status:** NEEDS DECISION

- **What is needed:** each consuming `MlbParkContextPanel` context must define
  the comparison perspective before its park-factor tone can use goodness
  heat. A higher run or HR factor can favor offense/overs while disadvantaging
  pitching/unders.
- **Why not now:** the current panel does not encode one universally valid
  favorable direction, so assigning `higherBetter` or `lowerBetter` would
  manufacture semantics rather than reconcile presentation.
- **Do not:** apply JKB Heat to park factors until the consumer explicitly
  defines direction. Retain the current contextual display during that review.
- **Evidence:** [TABLE_CONVENTIONS.md](TABLE_CONVENTIONS.md) §§E–F;
  [plans/completed/ui-design-framework.md](plans/completed/ui-design-framework.md)
  Phase 8D / Phase 9.

### BL-MLB-001 — K +EV V1: stale-render risk, no scheduled producer
**Status:** NEEDS DECISION

- **What is needed:** decide whether K +EV V1 (`k-plus-ev.json`,
  `mlb-k-plus-ev-v1`, Poisson fair-odds/EV math) is retired, refreshed (wired
  to a workflow with a freshness guard), or re-promoted.
- **Why not now:** `scripts/generate-mlb-k-plus-ev.mjs` is wired to no
  workflow; the committed artifact predates the current slate; the
  `/mlb/strikeout-props` K +EV table renders it with no freshness guard.
- **Do not:** treat the K +EV V1 table as production-grade; its EV/fair-odds
  math is not part of the live K methodology.
- **Evidence:** [models/mlb-k-score.md](models/mlb-k-score.md) "Not this" and
  "Calibration / validation status"; [features/mlb-k.md](features/mlb-k.md)
  "Flag".

### BL-MLB-002 — K Projection V2 (`workload-team-k-v3`) promotion criteria unrecorded
**Status:** NEEDS DECISION

- **What is needed:** documented promotion criteria for V2 and a decision;
  promotion is a methodology change that reopens the K contract.
- **Why not now:** V2 rides shadow (`kProjectionMode: "shadow"`); it has been
  validated in shadow but no `DECISIONS.md` entry or model-doc gate records
  when it may go live.
- **Do not:** promote V2 silently by changing `kProjectionMode`; treat any "V2
  is live" claim as false until committed data changes.
- **Evidence:** [models/mlb-k-score.md](models/mlb-k-score.md) "Not this",
  "Limitations", "Version / reopening criteria".

### BL-MLB-003 — MLB Analytics Foundation stalled at Phase 1 (no HR history persistence / grading)
**Status:** DEFERRED

- **What is needed:** Phase 2 — begin append-only HR publication/odds snapshot
  persistence in the daily workflow, derive an empirical multi-season
  reference-range artifact, and add a documented settlement/grading job. This
  persistence + grading layer is also the prerequisite for any future
  `KS-008` calibration gate on HR +EV V2 (`mlb-hr-plus-ev-v2`, browser-only,
  never archived or graded) and on the K Score / "Best K Prop Bets" value sort
  (uncalibrated, hand-tuned coefficients).
- **Why not now:** Phase 1 shipped shared contracts + a deterministic score
  engine as client-side shadow only; nothing public changed and no persistence
  exists. Every day without persisted observations is lost to calibration.
- **Do not:** treat the `mlb-analytics-foundation-phase-1` name as authority
  for the HR or Moneyline models (it is a research collision); do not present
  any shadow score, HR EV label, or K value sort as a probability, fair value,
  edge, or pick (`KS-008`).
- **Evidence:** [mlb-analytics-foundation-phase-1.md](mlb-analytics-foundation-phase-1.md)
  "Next recommended phase (Phase 2)"; [models/mlb-hr-plus-ev.md](models/mlb-hr-plus-ev.md)
  and [models/mlb-k-score.md](models/mlb-k-score.md) "Calibration / validation
  status".

---

## CFB

### BL-CFB-001 — CFB Model V2 IPR promotion gates unmet
**Status:** BLOCKED — tracked by the active plan

- **What is needed:** the seven promotion gates in the active plan (clean
  HEALTHY shadow weeks, staged rollout-state advances, additive-only UI
  contract, terminology review, FCS handling, rollback discipline, a
  `DECISIONS.md` entry).
- **Why not now:** shadow infrastructure is built and tested but
  `CFB_V2_ROLLOUT_STATE = "stage-2-infrastructure-ready"`, no `.tsx` reads it,
  and the committed artifact is entirely `DEGRADED` / `unavailable`
  (preseason). `CfbGameModelProjections` fields (`jkbProjectedSpread` etc.)
  stay null placeholders until promotion.
- **Do not:** substitute MIC values into any V2-labelled field; do not advance
  rollout state without the per-stage approval.
- **Evidence:** [plans/active/cfb-model-v2.md](plans/active/cfb-model-v2.md)
  "Remaining promotion gates"; [models/cfb-preseason-power.md](models/cfb-preseason-power.md);
  [features/cfb.md](features/cfb.md).

### BL-CFB-002 — MIC/IPR naming debt
**Status:** NEEDS DECISION

- **What is needed:** a `DECISIONS.md` entry documenting `jkbPowerRating` as a
  market-informed composite (MIC) and, when V2 lands, an explicit `mic` / `ipr`
  qualifier on rating fields plus per-layer immutable version ids replacing the
  ambiguous `v1` / `v1.1` / `CFB_V1_MODEL_VERSION` usage.
- **Why not now:** the boundary is documented but relabeling MIC and adding
  qualifiers is explicitly out of the active plan's scope and depends on the
  V2 promotion decision.
- **Do not:** silently reinterpret `jkbPowerRating` as an independent rating
  when V2 lands (`KS-009`).
- **Evidence:** [models/cfb-preseason-power.md](models/cfb-preseason-power.md)
  "Naming debt"; [plans/active/cfb-model-v2.md](plans/active/cfb-model-v2.md)
  "IPR / MIC boundary".

### BL-CFB-003 — CFB SOS / rating heat not re-expressed onto JKB Heat
**Status:** DEFERRED

- **What is needed:** re-express `src/lib/cfb/sosPresentation.ts` rank bands and
  the `CollegeFootballRatingLegend` / `getCfbRatingHeatClass` treatment onto the
  shared 8-band JKB Heat tones (gold → green → slate → red), with the legend
  driven from the same definitions the cells use, plus browser sign-off across
  the affected CFB rating components.
- **Why not now:** the UI / Design Framework rollout single-sourced the existing
  bands (cells and legend cannot drift) but deliberately kept the current
  rank-band palette. Converting to JKB Heat tones recolors broad rank ranges —
  a visual change needing sign-off, not a mechanical swap.
- **Do not:** silently convert the palette; SOS/rating thresholds and the
  established rank endpoints must be preserved in any approved migration.
- **Evidence:** [TABLE_CONVENTIONS.md](TABLE_CONVENTIONS.md) §D;
  [plans/completed/ui-design-framework.md](plans/completed/ui-design-framework.md)
  Phase 7 / Phase 8B / Phase 9.

---

## Repository / system

### BL-SYS-001 — Authoritative production deployment mechanism (OPEN-001)
**Status:** NEEDS DECISION

- **What is needed:** current evidence or explicit direction on which
  configured mechanism serves production for `www.joeknowsball.com` —
  `.github/workflows/deploy.yml` (GitHub Pages) or `vercel.json` (Vercel).
- **Why not now:** repository evidence proves both are configured but not which
  is authoritative; this also affects how `cfb-v2-shadow-refresh.yml` →
  `deploy.yml` `workflow_call` reaches production.
- **Do not:** resolve `OPEN-001` in documentation without current deployment
  evidence or an explicit instruction.
- **Evidence:** [DECISIONS.md](DECISIONS.md) `OPEN-001`;
  [ARCHITECTURE.md](ARCHITECTURE.md) "Deployment ambiguity".
