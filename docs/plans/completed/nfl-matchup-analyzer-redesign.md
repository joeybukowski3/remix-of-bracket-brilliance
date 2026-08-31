# Completed plan — NFL Matchup Analyzer redesign

**Status: COMPLETE (historical provenance).** The redesign shipped across
Phases 1–9. This document is a distilled record of what was delivered and where
current authority now lives. **It is not methodology authority.**

Current readers should use:

- [../../features/nfl-matchup-analyzer.md](../../features/nfl-matchup-analyzer.md)
  — current routes, four-tab composition, consumed artifacts, degradation
  behavior, presentation boundaries.
- [../../models/nfl-power-rating.md](../../models/nfl-power-rating.md) — current
  Current OVR / Power Rating / JKB Power methodology.
- [../../models/nfl-projected-spread.md](../../models/nfl-projected-spread.md) —
  current Power Number and projected-spread methodology (`jkb-power-number-v1.0.0`).

The original giant specification
([../../nfl-matchup-analyzer-redesign-spec.md](../../nfl-matchup-analyzer-redesign-spec.md),
~2,080 lines) remains valuable **implementation evidence**. Its section
inventory, stacked-section layout, and "future intentions" are superseded and
must not be merged silently into the current feature contract.

## Objective (as specified)

Replace the single Team Comparison layout with a dense, responsive,
multi-section NFL matchup analyzer based on `NFL new.xlsx`, preserving the
existing power model, Advantages, and Angles ("Things to Watch"). The first
implementation was a **comparison product only** — no projected spread, winner,
win probability, or weighted score — structured so those could be added later
under a "Model Analysis" placeholder.

Non-negotiables that held throughout: do not modify power-rating formulas in the
UI layer; do not invent missing statistics; rank-normalize visual coloring;
keep the power rating prominent; mobile uses collapsible sections + a "Jump to"
control.

## Delivered scope

- Responsive multi-section analyzer with sample controls (Season / Last 5) and
  a historical-blend rolling-eight window that replaces late-2025 games with
  completed 2026 games.
- Preserved Advantages and Things to Watch (relabelled Angles).
- Conventional team stats, EPA efficiency, RBSDM success rates, ESPN trench win
  rates, injuries + snap participation, and a spread / market profile — each an
  independent failure domain that degrades to `N/A` without recomputation.
- A JKB projected spread and Model vs Market comparison (added in the later
  phases, then re-owned by the dedicated spread model).
- The live navigation converged on **four hash-addressable tabs** (Overview,
  Team Comparison, Availability & Snaps, Model Details) — this supersedes the
  spec's stacked-section shape.

## Major phases completed

| Phase | Delivered | Now owned by |
| --- | --- | --- |
| 1 | Responsive UI architecture, sample controls, Jump To, comparison components, rank-tier styling | feature doc |
| 2 | Conventional team-stats pipeline (source moved TeamRankings → nflverse); 22 metrics; Season / Last 5 | feature doc + `matchup-metrics` producer |
| 3A | RBSDM success rate (periods never blended — no published denominator) | feature doc |
| 3B | ESPN trench win rates (PBWR/RBWR/PRWR/RSWR, season-to-date only) | feature doc |
| 4 | Injury designations + snap participation with exact gsis/pfr ID join; generic reserve status | feature doc |
| 5 | Spread / market profile (game-level nflverse market line; current line kept separate from historical ATS/O-U) | feature doc + `DATA_SOURCES.md` |
| 6 | EPA efficiency (nflverse/nflfastR play-by-play, eligible-play filter, RBSDM cross-check) | feature doc; power-rating EPA left deliberately unchanged |
| 7B | EPA source migration + generated hero ratings | [nfl-power-v0.3.1 migration](nfl-power-v0.3.1-migration.md) |
| 9 | JKB projected spread `nfl-spread-v0.1.0` (later retired) | [nfl-projected-spread.md](../../models/nfl-projected-spread.md) |

## Current feature / model docs that own durable behavior

- **Surface, tabs, artifacts, degradation:**
  [../../features/nfl-matchup-analyzer.md](../../features/nfl-matchup-analyzer.md).
- **Team strength (Current OVR / OFF / DEF):**
  [../../models/nfl-power-rating.md](../../models/nfl-power-rating.md). The
  canonical board is a composition of `nfl-power-v0.4-beta` (OVR anchor),
  `nfl-power-v0.3.1` (OFF/DEF anchors), and the Team Performance Rating.
- **Projected spread:**
  [../../models/nfl-projected-spread.md](../../models/nfl-projected-spread.md).
  `jkb-power-number-v1.0.0` replaced `nfl-spread-v0.1.0` on 2026-08-19; the spec's
  Phase 9 model and its 3.5–5.5 beta guard band are retired.
- **Sources:** [../../DATA_SOURCES.md](../../DATA_SOURCES.md).

## Known deferred items

- The spec's "Phase 7 — future weighted model" (metric-weighted matchup score /
  model pick) was **not** built as specified; a linear Power-Number spread was
  shipped instead, and it does not beat the market benchmark. No weighted
  matchup score or model "pick" exists (`KS-008`).
- "Game Trends" remained a restrained placeholder.
- A retained `MatchupModelAnalysis.tsx` component + tests still exist but the
  live detail page does not import it (history evidence, not a fifth tab).
- First downs, third-down rate, and time of possession stay unavailable from the
  conventional-stats source and are not estimated.
- RBSDM and ESPN sources remain undocumented third-party APIs; schema drift
  degrades those panels to `N/A`.

## Historical evidence

- [../../nfl-matchup-analyzer-redesign-spec.md](../../nfl-matchup-analyzer-redesign-spec.md)
  — the full implementation specification and per-phase implementation notes
  (§§19–27).
- [../../nfl-data-inventory.md](../../nfl-data-inventory.md) — the free-first
  mandate and canonical caches.
- [../../nfl-play-by-play-audit.md](../../nfl-play-by-play-audit.md),
  [../../nfl-vsin-dataset-validation.md](../../nfl-vsin-dataset-validation.md).

## Completion status

Complete. The surface is live at `/nfl/matchups` and `/nfl/matchups/:gameSlug`;
durable behavior is owned by the feature and model docs above. This plan is
retained for provenance only.
