# Numerology / Sin City (product router)

Durable router for the JoeKnowsBall MLB **Numerology** product and its optional
**Sin City / Masonic** scoring component: routes, surfaces, artifacts,
producers, and which systems are independent. Methodology contracts live in the
model docs — this file does **not** restate scoring formulas.

Model docs:

- [../models/numerology-base.md](../models/numerology-base.md) — Base Numerology
  (Alignment Score) scoring contract.
- [../models/sin-city.md](../models/sin-city.md) — Sin City / Masonic
  methodology contract.

Subject to `KS-007` / `KS-008` in [../DECISIONS.md](../DECISIONS.md): numerology
scores select and rank; baseball opportunity is context only; Grok prose is
presentation copy, not a model output. Surface routing overview:
[mlb.md](mlb.md).

Point-in-time evidence, **not** current authority (`KS-004`):
[../numerology-v3-promotion-criteria.md](../numerology-v3-promotion-criteria.md)
(see "Conflict" below), memory `mlb-x-slate-timing`.

## Name collision (read first)

Two unrelated systems use the words "Sin City":

1. **Sin City / Masonic** — a Numerology scoring component
   (`src/lib/numerology/sinCityMasonic.ts`, `evaluateSinCityMasonic`). Evaluated
   only inside the Numerology Explorer, opt-in, as a standalone 0–100 grade.
   This is what [../models/sin-city.md](../models/sin-city.md) covers.
2. **Sin City** (MLB HR rules screen) — route `/mlb/sin-city`
   (`src/pages/MlbSinCity.tsx` → `getSinCityResults` in
   `src/lib/mlb/mlbHrFilter.ts`): a 3-of-5 Statcast qualification screen
   (Barrel%, Pull%, Hard Hit%, Exit Velo, Wind Out) with a closest-five
   fallback, plus `sin-city-performance*.json` tracking. That system belongs to
   [mlb-hr.md](mlb-hr.md), **not** here.

They share no code, fields, or artifacts.

## Routes / surfaces (verified in `src/App.tsx`)

| Route | Component | Surface |
| --- | --- | --- |
| `/mlb/numerology` | `MlbNumerologyPage` → `MlbNumerologyPageEnhanced` | Numerology leaderboard, daily Universal Day profile, per-player score-breakdown modal, the **Numerology Explorer** (`src/components/mlb/numerology/NumerologyExplorer.tsx` — field / signal-type toggles, optional Sin City column), and the results tracker. |
| `/mlb/numerology/x-export` | `MlbNumerologyXExport` (outside `MlbLayout`) | Social-image export route for the numerology card. |
| `/mlb/performance-preview` | `MlbPerformancePreview` (`PerformanceTrackerShell`) | "MLB Results Tracker" — aggregates empirical outcome rates per system. Its **Sin City panel** tracks the `/mlb/sin-city` HR-rules screen (`sinCityTracker.ts`), not the Masonic numerology component. |

Page data loader: `src/hooks/useMLBNumerology.ts` fetches
`public/data/mlb/numerology-daily.json`. The browser recomputes the per-player
signal breakdown for display via `calculateNumerologyScoreBreakdown`
(`src/lib/numerology/mlbScoreAudit.ts`), a faithful port of the generator engine
(same weights JSON, same `/76` normalization).

## Base Numerology

The daily leaderboard product. Players are selected and ranked **only** by
deterministic numerology resonance (Pythagorean); baseball opportunity is
displayed as context and never affects alignment, qualification, or rank.
Current engine is methodology **v3.0.0** (hierarchical scoring). Full contract:
[../models/numerology-base.md](../models/numerology-base.md).

## Sin City / Masonic

An **independent** five-field symbol evaluation (Jersey #, Batting Order,
Birthday, Life Path, Current HR Count) against the daily Universal Day profile.
Rendered only when the Explorer's Sin City toggle is on
(`options.sinCity.included === true`), as a standalone 0–100 grade against its
own raw ceiling. It is **never folded into the Base Numerology `/76` ledger**;
overlapping fields still score normally in the base ledger and Sin City only
awards its own smaller symbol points, so no field is double-counted at base
weights. Full contract: [../models/sin-city.md](../models/sin-city.md).

## Performance / result tracking

| Artifact | Producer | Notes |
| --- | --- | --- |
| `public/data/mlb/numerology/performance.json`, `performance-summary.json` | `scripts/grade-mlb-numerology-plays.mjs`, `scripts/persist-mlb-numerology-performance.mjs` (`scripts/lib/mlb-numerology-tracking.mjs`) | Settled outcome rates for graded numerology plays. Workflow `mlb-numerology-grade.yml` (07:20 ET daily). |
| `public/data/mlb/numerology/archive/`, `history/` | `scripts/generate-mlb-numerology.mjs` | Daily card + play snapshots for later grading. |

There is no dedicated performance/result tracking for the Sin City / Masonic
component — it is display-only.

## Current artifacts / producers

| Artifact | Producer | Workflow |
| --- | --- | --- |
| `public/data/mlb/numerology-daily.json` | `scripts/generate-mlb-numerology.mjs` + `scripts/numerology-scoring-engine.mjs`, `config/mlb-numerology-methodology.json`, `prompts/mlb-numerology-system.md` (Grok narrative, Layer 3) | `generate-mlb-numerology.yml` (04:00 ET primary + lineup-confirmed + backup crons) |
| `public/data/mlb/numerology/daily-card.json` | `scripts/lib/mlb-numerology-tracking.mjs` (`buildDailyNumerologyCard`) | via generation / delivery |
| `public/data/mlb/numerology/x-post-preview.json` | `scripts/generate-mlb-numerology-x-preview.mjs` | preview only |
| `public/data/mlb/numerology/email-send-state.json` | `scripts/generate-mlb-numerology-email.mjs`, `scripts/lib/mlb-numerology-email-delivery.mjs` | `poll-mlb-numerology-delivery.yml` |
| `numerology-daily.fixture.json` | `--fixture` mode | never overwrites production |

Delivery (email + X) is documented in
[social-publishing.md](social-publishing.md#numerology-and-moneyline-social-paths-not-the-canonical-publisher):
`poll-mlb-numerology-delivery.yml` shares one frozen confirmed-lineup selection
artifact between both channels; `post-mlb-numerology-to-x.yml` and
`mlb-numerology-email-rescue.yml` are manual/rescue-only. Delivery selection
(`scripts/lib/mlb-numerology-x-selection-core.mjs`) only **filters** already-ranked
plays (confirmed-lineup-only, `NUMEROLOGY_QUALIFYING_SCORE_THRESHOLD = 50`); it
never re-scores or re-ranks.

## Which systems are independent

- **Base Numerology** and **Sin City / Masonic** are independent scoring systems
  with separate weights, ceilings, and normalization. Sin City is opt-in and
  standalone.
- **Numerology** (this product) and the **`/mlb/sin-city` HR-rules screen** are
  entirely unrelated (name collision only).
- **Numerology scoring/ranking** and **delivery selection** (email/X) are
  independent: delivery filters, never scores.
- Baseball opportunity data is independent of numerology scoring
  (`baseballWeight: 0`).

## Relevant tests

- `src/lib/numerology/hierarchical-scoring.test.ts` — v3 engine fixtures /
  synergy / precedence.
- `src/lib/numerology/generator-parity.test.ts` — browser audit vs generator
  engine parity.
- `src/lib/numerology/mlbScoreAudit.controls.test.ts` — field / signal-type
  toggles.
- `src/lib/numerology/sinCityMasonic.test.ts` — Sin City / Masonic evaluation.
- `src/lib/numerology/numerology-target-priority.test.ts` — has pre-existing
  failures noted in the v3 promotion doc; verify current state before relying
  on it.
- `src/pages/MlbNumerologyPageEnhanced.render.test.tsx` — page render.
- `scripts/lib/mlb-numerology-x-selection-core.test.mjs`,
  `mlb-numerology-tracking.test.mjs`, `mlb-numerology-poll-gate.test.mjs`,
  `numerology-schedule-gate.test.mjs`.

## Conflict: v3 promotion criteria doc vs current code

[../numerology-v3-promotion-criteria.md](../numerology-v3-promotion-criteria.md)
(branch `test/numerology-scoring-hierarchy`) describes v3 as **not yet promoted**
and lists gates for replacing "live" v2 scoring. Current committed code
contradicts that: `config/mlb-numerology-methodology.json` `version` is
`"3.0.0"`, `scripts/generate-mlb-numerology.mjs` runs
`scripts/numerology-scoring-engine.mjs` (hierarchical, `/76`, synergy, indirect
decay), and `src/lib/numerology/mlbScoreAudit.ts` mirrors it. Treat the
promotion-criteria doc as **historical provenance only**; the current committed
v3 engine is authoritative (see [../models/numerology-base.md](../models/numerology-base.md)).
The legacy v2 module `src/lib/numerology/scoring.ts` (`scorePlayer`, `/60`)
appears to survive only in tests and is **superseded**.
