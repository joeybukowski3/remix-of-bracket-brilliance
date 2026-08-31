# Active plan — NFL yardage props (projection + Matchup Score + review surface)

**Status: PARTIALLY SHIPPED, NOT PROMOTED.** The read-only review surface,
current-week generator/validator, market ingestion, history artifact, and
Phases 1–9.1 of the research stack are committed and tested. **No projection or
Matchup Score model has been promoted to production-ready.** Phase 7
(prop-line / Prop Edge integration) is blocked on a policy decision.

Authority note: this plan is the **status** document. The detailed methodology
and phase architecture live in
[../../../src/lib/nfl/props/README.md](../../../src/lib/nfl/props/README.md)
(durable phase-by-phase architecture + leakage contract) and the per-phase
research reports under `docs/` (see "Historical evidence"). Product behavior of
the surface is owned by
[../../features/nfl-yardage-props-review.md](../../features/nfl-yardage-props-review.md).
This plan does not restate the research tables.

Related: [../../DECISIONS.md](../../DECISIONS.md) (`KS-007`, `KS-008`, `KS-009`),
[../../DATA_SOURCES.md](../../DATA_SOURCES.md), [../../BACKLOG.md](../../BACKLOG.md)
(BL-NFL-001 … BL-NFL-004).

## Objective

Ship an independent, leakage-safe statistical yardage-projection system for
three NFL player-prop markets (passing, rushing, receiving yards), plus a
structurally separate 0–100 Matchup Score, structurally isolated from the
fantasy system. A "Prop Edge" layer (`projection − sportsbook line`) is an
explicit later phase, gated on a line-source policy decision.

The three outputs are separate types and none is derived from another:
`NflYardageProjection`, `NflYardageMatchupScore`, `NflYardagePropEdge`.

## Current architecture

```
nflverse stats_player_week + schedule   -> canonical player-game universe + outcomes (Phase 1, 5.5)
play-by-play (epa / play-volume caches)  -> team play-volume + pass-tendency features (Phase 2)
per-market feature builders              -> passing / rushing / receiving baseline competitions (Phase 3-6)
frozen research architectures            -> cross-market projection contract + intervals (Phase 7)
development-only pregame features        -> research 0-100 Matchup Score (Phase 8)
committed research artifacts + live roster/market feeds -> current-week production-candidate artifact (Phase 9, 9.1)
public/data/nfl/2026/yardage-projections.json + market + history -> read-only review surface
```

Namespace: `src/lib/nfl/props/**` (research/generation) and
`src/lib/nfl/props/review/**` (read-only adapters). The only fantasy dependency
is the shared canonical identity module.

## Completed phases (committed, tested)

| Phase | Delivered |
| --- | --- |
| 1 | Canonical schemas; per-player-game yardage outcome artifact; leakage contract + tests. |
| 2 | Shared team play-volume / pass-tendency feature foundation (genuine PROE); leakage-safe windows. |
| 3 | QB passing-opportunity baseline competition (expected pass attempts). No model recommended. |
| 4 | QB passing-yard baseline competition. Winner: direct/hybrid ridge. 2025 frozen as retrospective benchmark. |
| 5 / 5.5 | Rushing baseline competition + canonical player-game universe rerun. Winner: decomposition (carries × shrunk YPC). |
| 6 | Receiving baseline competition. Winner: 2-way decomposition (targets × shrunk YPT); position segmentation modestly helps. |
| 7 | Cross-market projection-output contract, empirical prediction intervals, calibration review, readiness gates. **No model promoted.** |
| 8 | Research-only 0–100 Matchup Scores (passing/rushing/receiving), frozen weights from a development grid. |
| 9 / 9.1 | Deterministic leakage-safe current-week projection artifact for a live `(season, week)`; eligibility closure separating role evidence from historical volume. |
| UI | `/nfl/yardage-props-review` route, components, read-only adapters, market join, history/freshness, tests. |

## What is currently shipped (current product behavior)

- Route `/nfl/yardage-props-review`, fixed to season 2026 / Week 1, passing +
  rushing + receiving market tabs, filters, presentation-only sorting.
- Current-week projection rows (`yardage-projections.json`) with per-market
  components, role/fallback provenance, estimated range, Matchup Score block,
  opponent EPA/success/production-allowed context, and history context.
- Current player-prop market join (`nfl-yardage-market.json`) on exact
  canonical `playerId` only — no name/team/fuzzy/synthetic fallback.
- Scheduled producers `nfl-yardage-projections.yml` and
  `nfl-yardage-market.yml` (production-writing).
- Freshness UI (diagnostic only; never alters a projection or score).

## What remains research / non-promoted

- The passing (direct ridge), rushing (carries × YPC), and receiving (targets ×
  YPT) projection architectures are **research baselines**. Phase 7:
  "none of the three markets are production-ready".
- The 0–100 Matchup Score is **research-only** and not a calibrated
  probability; its presence in the current-week artifact/UI is product
  existence, not model promotion.
- `NflYardagePropEdge` is a schema only; nothing constructs it. The raw
  projection-minus-line difference shown on the review surface is labelled
  research context and does not license Over/Under, +EV, confidence, or
  best-bet language.

## Unresolved line-source / policy issue (BL-NFL-001)

The current yardage-market producer uses keyed/paid The Odds API + Parlay API.
The older NFL free-first mandate forbids paid vendors, paid The Odds API use,
and player-props products for the NFL pipeline. The shipped implementation
proves use, not that the mandate was superseded. No `DECISIONS.md` entry
resolves it. Until resolved:

- Prop Edge (Phase "7" in the audit numbering) stays blocked.
- Missing or policy-blocked market data must leave the market column and the
  raw difference unavailable while the projection and Matchup Score remain.

## Promotion criteria still missing (Phase 7 §12–13)

Before any yardage market may be called production-ready:

1. **Accepted calibration fix for passing** — the ~+12.5-yard benchmark bias
   has no adopted correction (gate not met for passing).
2. **Operational status assignment** — per-row status/eligibility state in
   production code (gate not yet met for any market).
3. **Role/volume-conditioned prediction intervals** — flat empirical band is
   groundwork only; conditioned intervals deferred (gate not yet met).
4. **An authoritative promotion decision** — a `docs/models/nfl-yardage-*.md`
   methodology doc or a `DECISIONS.md` entry. None exists.
5. **Matchup Score**: a documented rationale for promoting a research-only
   score to a durable product concept, or an explicit decision to keep it
   descriptive-only permanently.

## Explicit non-scope

- No fantasy UI, fantasy page, or fantasy fitted model changes.
- No red-zone/goal-line usage, route participation, or designed-run/scramble
  split (not available repo-wide).
- No historical per-game market cache; `spread`/`total`/`impliedTeamTotal` on
  historical context rows stay null.
- No historical prop-line archive; closing-line / CLV backtesting is not
  possible from repo data.
- No injury/availability join (`availabilityStatus` stays null;
  `matchup-injuries.json` is a single live snapshot).
- No `seconds/play` pace metric; no cross-window blend weight (model-fitting,
  out of scope for the shared feature phase).

## Current blockers

- **BL-NFL-001** — line-source policy decision (blocks Prop Edge).
- **BL-NFL-002** — passing calibration bias + operational scaffolding (blocks
  projection promotion).
- **BL-NFL-003** — no depth-chart / starter-order source (QB starter and
  role-scarcity picks remain heuristic/`roleUncertain`).

## Validation requirements

- Leakage: every training/reference/interval row matching the target
  `(season, week)` is stripped before any fit or reference build; the
  weekly-snapshot temporal contract holds. Adversarial leakage tests exist for
  Phase 2 windows and the Phase 1 schedule join.
- Determinism: the current-week generator takes a fully-parsed source bundle
  (no disk I/O in the module) and is unit-tested.
- Frozen-design parity: the production Matchup Score reads the already-selected
  weights from `matchup-score-research.json`; dimension definitions are a
  shared module so research and production cannot drift.
- Schema validation: `validate-nfl-current-week-yardage-projections.mjs` gates
  the artifact; review-surface joins/filters/details/freshness are tested.
- 2025 never participates in reference construction, candidate selection, or
  weight selection.

## Completion / distillation criteria

Move this plan to `docs/plans/completed/` only when **all** hold:

1. A `docs/models/nfl-yardage-*.md` methodology doc owns the promoted formula,
   weights, fallback, and calibration status (or an explicit decision records
   that the models stay permanently research-only and the surface stays
   descriptive).
2. BL-NFL-001 is resolved (Prop Edge shipped, or explicitly abandoned and the
   market join removed/kept per decision).
3. The Phase 7 readiness gates are met or formally waived with a recorded
   rationale.
4. `docs/DECISIONS.md` carries the promotion (or permanent-research) decision.

## Historical evidence

- [../../../src/lib/nfl/props/README.md](../../../src/lib/nfl/props/README.md) — durable phase architecture.
- [../../nfl-yardage-props-audit.md](../../nfl-yardage-props-audit.md) — Phase 0 audit + architecture.
- [../../nfl-play-by-play-audit.md](../../nfl-play-by-play-audit.md),
  [../../nfl-player-game-universe.md](../../nfl-player-game-universe.md).
- Baseline competitions:
  [qb-opportunity](../../nfl-qb-opportunity-baseline-competition.md),
  [qb-passing](../../nfl-qb-passing-baseline-competition.md),
  [rushing](../../nfl-rushing-baseline-competition.md) /
  [v2](../../nfl-rushing-baseline-competition-v2.md),
  [receiving](../../nfl-receiving-baseline-competition.md).
- [../../nfl-cross-market-projection-review.md](../../nfl-cross-market-projection-review.md) — Phase 7.
- [../../nfl-matchup-score-research.md](../../nfl-matchup-score-research.md) — Phase 8.
- [../../nfl-yardage-context-family-study.md](../../nfl-yardage-context-family-study.md),
  [../../nfl-vsin-dataset-validation.md](../../nfl-vsin-dataset-validation.md).
