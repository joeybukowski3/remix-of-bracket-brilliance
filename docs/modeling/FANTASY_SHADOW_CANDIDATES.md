# Weekly fantasy: snap pipeline, shadow candidates and prospective archive

Status: **shadow / infrastructure only.** Nothing here is imported by any UI or by `generate-fantasy-weekly-projections.ts`; shadow output is written under `data/fantasy/`, never `public/`. The first clean prospective evaluation begins only after this reaches `main`.

Evidence base: `scripts/analysis/nfl-fantasy-projection-audit-2026-09/REPORT.md` (read-only audit; untracked) plus `20_freeze_coefficients.py` in the same folder.

## 1. Dependency: RB team-history repair (separate deliverable)

Candidate A's RB path assumes the production RB row already includes the team-history repair documented in `FANTASY_RB_TEAM_HISTORY_REPAIR.md` (a production fix, shipped independently and first). `generate-fantasy-shadow-candidates.ts` **fails closed** for week > 1 if the production artifact lacks the `epa-team-game` provenance entry, so shadow rows can never sit on the defective RB baseline. The audit's apparent "RB level bias" was that defect, so Candidate A has **no** separate RB level adjustment.

## 2. Prospective archive

* **Existing production archive (WU6B.1)** archives the public artifact verbatim (player id/name/position/team, baseline, projection, every component, model/inference/fit versions, generated/input timestamps, source hashes) with strict pre-kickoff selection; see `FANTASY_PROJECTION_ARCHIVE.md`. It was never scheduled; the workflow now runs it after generation (best-effort).
* **Shadow archive (this work)**: `data/fantasy/shadow-archive/<season>/week-NN.predictions.jsonl` (+ `.outcomes.jsonl`), implemented in `scripts/lib/fantasy-shadow-archive.ts`.
  * One event per player-game holding production baseline/projection/rank/components, Candidate A and B projection/rank/components, opponent, implied team total and delta, opponent-FPA context (prior/current/blend/ratio), snap-share inputs (value, games used, last game, source games), candidate version strings, spec hash, source hashes (public artifact, players cache, snap caches), canonical `gameId` and `kickoff`, and `capturedAt` (real clock).
  * Freeze rules: captured strictly before canonical kickoff (post-kickoff and kickoff-less rows are rejected, not written); append-only; event id = sha256(material excluding `capturedAt`) so an identical re-run is a no-op and keeps the first capture time; every append first re-verifies all existing lines (tampered/malformed line aborts); the final prediction is the latest pre-kickoff observation and later ones never replace it; `--captured-at` is refused unless `--dry-run`.
  * Outcomes are **separate events** (`actualFantasyPoints` under `jkb-full-ppr-v1.0.0`, `statLine`, stats-source hash, revision/supersedes). A team absent from the verified stats file is skipped, never zero-filled; a completed team with no player line records 0 with `statLine:false`.
* Public projection calculation is not touched by any of this.

## 3. 2026 snap-count pipeline

* Source: nflverse `snap_counts` release (Pro-Football-Reference). `snap_counts_2026.csv` is published (Weeks 1-2 complete, 16 games each, 32 teams; Week 3 partial while games are in progress). Retrieval reuses the existing manifest-verified cache mechanism: `node scripts/refresh-nfl-injury-source-cache.mjs --seasons=2026 --only=snapCounts` (`--only` is new; default behaviour unchanged).
* Reliability (2026-09-25): 98.9% of 2026 skill-position player-week stat rows join to a snap row via the GSIS->PFR crosswalk; upstream revisions of an already-cached season are negligible (2025: 2 of 25,395 player-week values changed, 1 added).
* `src/lib/fantasy/weekly/snap/pointInTimeSnap.ts` builds features **strictly from REG games before the target (season, week)**: `snapShareL3` (mean `offense_pct` of the last 3 games with a snap row, crossing seasons), `offenseSnapsL3`, `snapShareSeasonToDate`, `gamesPlayedSeasonPrior`, last game, source games; `laggingPriorWeeks` flags incomplete prior weeks (e.g. a Monday game not yet published). Tests prove target/later rows cannot leak.
* Not fed into production. Used only by Candidate B.

## 4. Candidate A (`weekly-fantasy-shadow-candidate-a-v1`)

Frozen 2026-09-25 (`shadow-candidates/spec.ts`). Every coefficient: precision-weighted shrinkage of the 2024-2025 walk-forward estimate toward the current production value, tau 0.10, rounded to 0.01.

| Position | Formula | Frozen values (production -> A) |
|---|---|---|
| QB | `prod - fpa_prod + clamp(baseline*(fpaRatio-1)*w, +/-2.0)`; implied-total layer unchanged | FPA weight 0.20 -> **0.23** (estimate 0.29, SE 0.14) |
| RB | `prod - fpa_prod + clamp(baseline*(fpaRatio-1)*w, +/-1.5)` on the repaired production row | FPA weight 0.15 -> **0.17** (estimate 0.20, SE 0.13); no level shift (residual intercept after the repair -0.21, CI -0.56..+0.13) |
| WR | `prod - env_prod + clamp(impliedTotalDelta*c, +/-0.6)`; FPA layer exactly production; no new FPA logic | implied-total coefficient 0.26 -> **0.08** (estimate 0.054, SE 0.037), cap 1.75 -> 0.6 |
| TE | production | unchanged |

Explicitly excluded (no incremental fantasy-point value in the audit): trench advantage, EPA advantage, success advantage, TD score, red-zone usage.

## 5. Candidate B (`weekly-fantasy-shadow-candidate-b-v1`)

`B = A + clamp(perSd * (snapShareL3 - mean)/sd, +/-2.0)` for **WR and TE only**; missing snap share adds exactly 0 (no imputation, no indicator). QB/RB: B = A.

| | mean | sd | pts per SD | estimate (SE) | sample |
|---|---|---|---|---|---|
| WR | 0.7259 | 0.1844 | **0.55** | 0.59 (0.13) | 2023-2025 pool, played, residual of Candidate-A replay |
| TE | 0.7079 | 0.1668 | **0.62** | 0.69 (0.17) | same |

Shrunk toward 0 with tau 0.5 pts/SD. Coefficients must not be edited after prospective evaluation begins; a change requires a new version string.

## 6. Evaluation protocol

`scripts/evaluate-fantasy-shadow-candidates.ts` scores final pre-kickoff predictions against latest outcome revisions, per position, on the pregame pool (production rank <= 24/48/72/24): MAE, RMSE, signed error, calibration slope/intercept, correlation, weekly Spearman, pairwise ordering, top-12 (and top-24 RB/WR) inclusion, plus paired candidate-minus-production MAE/RMSE with a team-week cluster bootstrap (95%). Each position reports `INSUFFICIENT_SAMPLE` until >= 6 completed weeks and >= 150 pool rows; even then the output is descriptive and no candidate is auto-declared superior. Candidate feature/coefficient choices saw 2023-2026 Weeks 1-2 data during the audit, so only weeks archived from Week 3 onward are clean prospective evidence.

## 7. Operations

```sh
tsx scripts/generate-fantasy-shadow-candidates.ts --season=2026 --week=3   # --production-artifact=<path> only to rehearse before the RB fix is on main
tsx scripts/archive-fantasy-shadow-projections.ts --season=2026 --week=3 [--dry-run]
tsx scripts/append-fantasy-shadow-outcomes.ts --season=2026 --week=2
tsx scripts/evaluate-fantasy-shadow-candidates.ts --season=2026
```

Tests: `src/lib/fantasy/weekly/snap/pointInTimeSnap.test.ts`, `src/lib/fantasy/weekly/projections/shadow-candidates/{candidates,archive}.test.ts`.
