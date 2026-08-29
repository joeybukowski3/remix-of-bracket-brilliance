# MLB Moneyline Edge

## Current authority

This document is the current methodology and contract authority for the MLB
**Moneyline Edge** model, its prediction archive, its grading, and its
closing-line-value (CLV) proxies.

Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md).
`KS-008` is binding: the model output is **not** a calibrated win probability, an
edge, a +EV/value claim, a best bet, or a pick, and no surface may present it as
one. External-source ownership lives in [../DATA_SOURCES.md](../DATA_SOURCES.md)
("MLB — odds providers"). Surface routing lives in
[../features/mlb.md](../features/mlb.md).

## Historical naming collision (read first)

"MLB Analytics Foundation — Phase 1"
([../mlb-analytics-foundation-phase-1.md](../mlb-analytics-foundation-phase-1.md),
memory `mlb-analytics-foundation`) is a **different, HR-centred effort**. It adds
TypeScript shared contracts and a deterministic score engine
(`jkb-hr-bridge@1.0.0`, `src/lib/mlb/analytics/**`) validated in shadow against
the HR slate. Its `kCompatibility.test.ts` proves the contracts *could* fit the K
market. It does **not** own, implement, or grade the Moneyline system described
here.

The Moneyline archive/grading/CLV system is a separate `.mjs` pipeline
(`scripts/*-mlb-ml-*.mjs`, `scripts/lib/mlb-ml-*.mjs`) versioned by
`MLB_ML_MODEL_VERSION = "mlb-ml-edge-v1.0"`. The 2026-07-14 reconciliation note
in memory `mlb-analytics-foundation` ("grading broken", "zero settled HR/ML
outcomes") describes the analytics-foundation TS shadow, not this `.mjs`
Moneyline pipeline, whose grader (`grade-mlb-ml-results.mjs`) is wired into
workflow `grade-mlb-ml-results.yml`. Any claim that "MLB analytics phase 1" owns
Moneyline is a naming collision, not current authority.

## The live model

Implemented by `computeModelEdge` in
[`src/lib/mlb/mlbModelEdge.ts`](../../src/lib/mlb/mlbModelEdge.ts). Computed **in
the browser** on `MlbGameDetail` and related surfaces, exactly as before the
archive pipeline existed.

Inputs are per-game: probable-starter season lines, lineup summaries / opponent
platoon splits, recent form, and team records. Five weighted factors, each scored
0–100 per side:

| Factor | Weight | Components |
| --- | --- | --- |
| Pitcher Quality | 0.30 | ERA, K/9, BB%, HR/9 (+ regression-score adjustment) |
| Matchup Edge | 0.25 | lineup OPS vs opposing starter hand · lineup K% |
| Lineup Offense | 0.20 | OPS, SLG, OBP |
| Recent Form | 0.15 | last-5 record · home/away split |
| Season Quality | 0.10 | season win % |

`differential` = away weighted total − home weighted total. `pick` is `push` when
`|differential| < 2.5`, otherwise the higher side. **Edge Strength** (stored in
the field named `confidence` for call-site compatibility) is
`round(min(82, 52 + (|differential| / 5) × 4))`, i.e. a linear function of a
bounded differential, floor ~52, cap 82; `50` for a push.

Tier labels (`getEdgeTierKey`): `strong` ≥ 72, `moderate` ≥ 64, `slight` ≥ 56,
else `coin-flip`. The shared methodology string is `ML_EDGE_METHODOLOGY`:
"Edge Strength reflects how strongly our factor model favors one side over the
other. It is not a calibrated win probability."

**Prohibited arithmetic (model audit):** never compute `confidence / 100` and
diff it against a market-implied probability. That silently claims a calibration
that does not exist. The previously shipped "value edge %" derived that way has
been removed from the UI.

## Version contract

`MLB_ML_MODEL_VERSION = "mlb-ml-edge-v1.0"`
([`scripts/lib/mlb-ml-model-version.mjs`](../../scripts/lib/mlb-ml-model-version.mjs)).
This id versions the **archival pipeline** — record schema, archive format,
grading rules — and the JS port of the scoring formula
(`scripts/lib/mlb-ml-edge-core.mjs`), which must be kept in sync with
`mlbModelEdge.ts` by hand. Increment it when the live weighting/inputs change, on
a backward-incompatible archive schema change, or when grading rules change.

`MLB_ML_PHASE2_SHADOW_VERSION = "mlb-ml-phase2-shadow-v1"` identifies **only** an
optional shadow/candidate scoring experiment (projected-IP, park, bullpen shadow
components), stored alongside — never in place of — the production version, and
only when a `RELEVANT_ML_SHADOW_FLAGS` flag is enabled. It never affects the live
pick, differential, Edge Strength, tier, or factors.

## Server pick generation

[`scripts/generate-mlb-ml-picks.mjs`](../../scripts/generate-mlb-ml-picks.mjs)
(`computeModelEdgeCore` + a Node port of the client fetch) →
`public/data/mlb/ml-picks-raw.json`. **Infrastructure for the archive only; it
does not feed the live website.**

- Skips games with no confirmed probable pitcher on both sides.
- `push` picks are logged and **not archived**.
- Captures `priceAtPick` (sportsbook, from `mlb-odds.json` produced earlier in
  the same workflow run) and `polymarketAtPick` (from that day's Polymarket
  snapshot; matched by team abbreviations, since Polymarket's `gameId` is a
  different namespace than StatsAPI `gamePk`).
- Preserves the previous file on a zero-pick or fetch-failure run.

## Archive behaviour

[`scripts/build-mlb-ml-archive.mjs`](../../scripts/build-mlb-ml-archive.mjs) +
pure helpers in
[`scripts/lib/mlb-ml-archive.mjs`](../../scripts/lib/mlb-ml-archive.mjs) →
`public/data/mlb/ml-prediction-history.json` (`schemaVersion: 1`, append-only).

- **Dedup key:** `date|gameId|modelVersion`.
- **New key** → appended.
- **Same-day rerun of a still-pending record** → updated in place;
  `firstGeneratedAt` preserved, `generatedAt` appended to `runHistory`.
- **Graded record** (`result.status !== "pending"`) → never overwritten by a
  fresh generation run.
- **Pick-price preservation:** `priceAtPick` and `polymarketAtPick` are pinned to
  the first archiving of the key and are never replaced by a later same-day
  capture.
- **Latest-price tracking:** `latestPriceSeen` / `latestPolymarketSeen` refresh
  on every same-day rerun. `latestPriceSeen` is the sportsbook closing-line
  **proxy** used at grading time.
- Repository-size safety cap: 50,000 records (refuse-to-write above it).
- Not exposed in any public UI.

## Grading

[`scripts/grade-mlb-ml-results.mjs`](../../scripts/grade-mlb-ml-results.mjs) +
pure logic in
[`scripts/lib/mlb-ml-grading.mjs`](../../scripts/lib/mlb-ml-grading.mjs).

- Result statuses: `pending`, `win`, `loss`, `push`, `postponed`, `cancelled`,
  `unresolved`.
- Final score / game state from the MLB Stats API schedule endpoint (same
  approved endpoint as HR grading). Winner = higher final score; `push` on a
  level final; `unresolved` when a final game has no usable scores.
- Only `pending` records are candidates (`isGradeable`). Regrading is idempotent
  (`isRegradeIdempotent`).
- `--validate-only` checks archive schema with no provider calls or writes;
  `--dry-run` computes without writing; `--date` scopes to one date.
- Recoverable errors always exit 0 so one bad lookup never blocks the run.
- Writes only when at least one record changed status.

## CLV proxies

Both CLV figures are **proxies**, documented as such in the module header, and
must not be presented as verified closing-line data.

**Sportsbook CLV** (`computeSportsbookClv`, method `latestPriceSeen_proxy`):
implied-probability delta between `priceAtPick.implied` and
`latestPriceSeen.implied`. `beatClose` is true when the delta is positive (line
moved toward the picked side). It is gated by `evaluateSportsbookClvEligibility`:
CLV is withheld — with a machine-readable `sportsbookClvSkipReason`
(`missing_capture_time`, `invalid_capture_time`, `captured_after_first_pitch`) —
unless `latestPriceSeen.capturedAt` is present, parseable, and at or before the
game's official first-pitch time. No substitute price is ever used.

**Polymarket CLV** (`computePolymarketClv`, method `final_pregame_snapshot`):
uses the last snapshot at or before scheduled first pitch from that day's
`public/data/polymarket/snapshots-<date>.json` time-series
(`findFinalPregameSnapshot`) — a closer proxy than the sportsbook one because
snapshots are fetched multiple times per day, but still bounded by the last
observed pregame snapshot.

`result.closingLine` records both the sportsbook `latestPriceSeen` and the
Polymarket final pregame snapshot; `result.clv` records both proxy objects plus
the skip reason.

## Performance summary

[`scripts/build-mlb-ml-performance-summary.mjs`](../../scripts/build-mlb-ml-performance-summary.mjs)
+ [`scripts/lib/mlb-ml-performance-summary.mjs`](../../scripts/lib/mlb-ml-performance-summary.mjs)
→ `public/data/mlb/ml-model-performance.json`.

- Reports **empirical historical outcome rates and CLV-proxy statistics**,
  overall and by edge tier (`EDGE_TIERS`).
- Always includes a `note` field stating Edge Strength is not a calibrated
  probability.
- Emits `sampleSizeWarnings` for any group below 20 graded picks.
- Internal-only; **no public UI reads it.**

## Calibration status

**None.** There is no calibration or validation gate for the Moneyline Edge
model. Edge Strength has never been fit to outcomes. Until a documented gate for
the specific (model version, settled-history basis) exists, per `KS-008`:

- no surface may show a win probability, fair value, edge, EV, or "JKB Value"
  derived from the model output;
- the archive record schema carries no probability field;
- copy is descriptive only ("Edge Strength", "model lean", "model vs market
  agreement").

## Presentation limits

- `MlbGameDetail` (`/mlb`): the Game Matchup Analyzer shows a categorical **Edge
  Strength** row (tier + team), titled with `ML_EDGE_METHODOLOGY`; a push renders
  "Even" / "—".
- `MlbPolymarketMoneylinePanel`: reports whether the model's pick **agrees** with
  the Polymarket-implied favourite and sorts by the model's own `differential` —
  not a fabricated edge number.
- ML Edges social table: `modelEdgePoints` is labelled "full factor model, not a
  win-probability edge"; "Adjusted" = missing factor(s) with renormalized
  weights; "N/A" = data unavailable.
- Recent-form / record columns shown beside the edge are season-free diagnostics,
  not summed into the model.

## Artifacts, producers, workflows

| Artifact | Producer | Workflow |
| --- | --- | --- |
| `public/data/mlb/ml-picks-raw.json` | `generate-mlb-ml-picks.mjs` | `generate-mlb-hr-props.yml` (ML steps) |
| `public/data/mlb/ml-prediction-history.json` | `build-mlb-ml-archive.mjs` | `generate-mlb-hr-props.yml`; graded by `grade-mlb-ml-results.yml` |
| `public/data/mlb/ml-model-performance.json` | `build-mlb-ml-performance-summary.mjs` | `grade-mlb-ml-results.yml` (cron 07:45 ET) |
| `public/data/mlb/ml-phase2-shadow-comparison.json` | `build-mlb-phase2-shadow-comparison.mjs` | `generate-mlb-hr-props.yml` (flag-gated) |
| Social "ML Edges" image/post | `post-mlb-ml-edges-to-x.mjs` | `post-mlb-ml-edges-to-x.yml` |

Odds inputs: `mlb-odds.json` (`fetch-mlb-odds.mjs`, keyed/paid providers — see
[../DATA_SOURCES.md](../DATA_SOURCES.md)); Polymarket snapshots
(`fetch-polymarket-snapshots.mjs`, workflow `track-polymarket-odds.yml`).

## Relevant tests

- [`src/lib/mlb/mlbModelEdge.test.ts`](../../src/lib/mlb/mlbModelEdge.test.ts) —
  factor weights, differential, push threshold, Edge Strength bounds, tiers.
- `scripts/build-mlb-ml-archive.test.mjs`,
  `scripts/lib/mlb-ml-archive` tests — dedup key, upsert, price pinning,
  graded-record protection, safety cap.
- `scripts/grade-mlb-ml-results.test.mjs`,
  `scripts/lib/mlb-ml-grading` tests — statuses, CLV eligibility gate, proxy
  methods, idempotency.
- `scripts/build-mlb-ml-performance-summary.test.mjs` — tier grouping, note
  field, sample-size warnings.
- `scripts/generate-mlb-ml-picks.phase2.test.mjs` — Phase 2 shadow wiring,
  field-omission-when-disabled.
- `src/pages/MlbGameDetail.mlSocialContrast.test.tsx`,
  `MlbGameDetail.modelEdgeAccordions.test.tsx` — no fabricated probability/edge.

## Known limitations

- Edge Strength is uncalibrated by construction (linear in a bounded
  differential) and will never become a probability by rescaling.
- The server JS port (`mlb-ml-edge-core.mjs`) must be manually kept in sync with
  `mlbModelEdge.ts`; drift is possible.
- Sportsbook CLV is a "last price this pipeline happened to capture" proxy; if
  the last pregame run was hours before first pitch it does not reflect true
  closing odds. Polymarket CLV is a closer but still non-final proxy.
- The archive and performance summary are internal; nothing surfaces graded
  Moneyline history to users.
- No two-sided no-vig pricing; implied probabilities are vig-inclusive and
  labelled as such.
- Graded-sample size is small and mostly below the 20-record meaningfulness
  threshold.

## Reopening criteria

Reopen this contract before: changing any factor, weight, or the Edge Strength
transform; changing the push threshold; changing the dedup key or archive schema;
changing grading rules or result statuses; changing a CLV method or its
eligibility gate; surfacing the archive/performance data in any public UI; or
introducing any probability, fair-value, edge, or +EV output (which additionally
requires a documented `KS-008` calibration gate).
