# MLB Strikeout Props (feature contract)

Durable router for the JoeKnowsBall MLB **Strikeout (K) Props** surface: route,
the distinct K numbers shown, which are production vs shadow/research, the
artifacts and producers, and the social-publishing relationship. This is a
**feature/automation** document; it does not own projection methodology.

Subject to `KS-007` / `KS-008` in [../DECISIONS.md](../DECISIONS.md): a
projection or a projection-vs-line gap is **not** an edge, +EV claim, or pick
without a documented calibration gate. Surface overview: [mlb.md](mlb.md).
Social publishing: [social-publishing.md](social-publishing.md).

Point-in-time evidence, **not** current authority (`KS-004`) — see "Conflicts":
[../mlb-k-projection-audit.md](../mlb-k-projection-audit.md) (2026-07-23),
[../mlb-k-v2-shadow-ui-validation.md](../mlb-k-v2-shadow-ui-validation.md).

There is no dedicated K **model** doc yet. Where methodology detail is needed
below it is cited from code; a future `docs/models/mlb-k-*.md` is warranted (see
"Flag").

## Route / page

| Route | Component |
| --- | --- |
| `/mlb/strikeout-props` | `src/pages/MlbStrikeoutPropsWithDebug.tsx` → `src/pages/MlbStrikeoutProps.tsx` (conditional workload debug panel; `?debug=k-v2` shows the internal V2 shadow comparison) |
| `/mlb/strikeout-props/x-export` | `src/pages/MlbStrikeoutPropsXExport.tsx` (social-image export, outside `MlbLayout`) |

Page data loader: `src/hooks/useMlbPropsData.ts` fetches
`/data/mlb/hr-props-raw.json` + `/data/mlb/hr-props-best-bets.json` (K rows ride
the HR dashboard artifact — there is no standalone K board artifact). Table rows
are assembled **client-side** by `buildPitcherStrikeoutRows`
(`src/lib/mlb/mlbSocialSelection.ts`). Expanded-row context:
`src/hooks/useMlbStrikeoutPropDetails.ts` ← `/data/mlb/strikeout-prop-details.json`.

## The distinct K numbers (keep separate)

### 1. Projection — `Proj K`

The single `projectedKs` field written into `hr-props-raw.json` by
`scripts/resolve-mlb-k-production-projection.mjs`
(`npm run mlb:k-production-projection`), which is the **one** place a production
projection is chosen. Every consumer (table, sorting, best-bet cards, social
graphic data attributes, frozen plan, caption) reads that field.

- **Current committed state:** `kProjectionMode: "shadow"`,
  `kProjectionModelVersion: "workload-team-k-v3"` — i.e. `projectedKs` is the
  **legacy** projection: `round1((projectedIP × projectedK9) / 9)` from
  `scripts/generate-mlb-hr-props.mjs` (`calculateProjectedKs`), wrapped by
  `scripts/generate-mlb-hr-props-with-k-shadow.mjs`. `projectedIP` from
  `scripts/lib/mlb-projected-innings.mjs`; `projectedK9` from
  `calculateProjectedK9`.
- A missing / stale / schema-invalid V2 artifact degrades to the stored legacy
  projection rather than erroring — the resolve step never publishes mixed or
  stale projections.

### 2. K Score — `strikeoutMatchupScore`

A **client-only display score** built in `buildPitcherStrikeoutRows` from
`pitcherKSkillScore` (pitcher K VS / K% / whiff%) and
`opponentTeamStrikeoutScore` (opponent lineup K% / whiff% / inverse xBA). Not a
generated server-side field, not a probability. Distinct from the projection.

### 3. K +EV — two distinct things, both non-calibrated

- **"Best K Prop Bets" value sort** — `buildKPropBestBets`
  (`src/lib/mlb/kPropBestBets.ts`): among `resolveKPropStatus(row).status ===
  "VALID"` rows, over side needs `projectionEdge ≥ 0.4`, under side
  `≤ −0.4`; ranked by a `valueScore` (weighted blend of projection edge,
  matchup score, K skill score, and a price bonus). This is **model-vs-line
  value sorting**, not a calibrated EV; `maxPerSide = 3`.
- **K +EV V1 table** — a separate view toggle on the page
  (`src/components/mlb/KPlusEvTable.tsx`, `src/hooks/useMlbKPlusEv.ts`,
  `src/lib/mlb/kPlusEvModel.ts`, generator version `mlb-k-plus-ev-v1`). Reads
  `/data/mlb/k-plus-ev.json`. **Independent** of K Projection V2, the workload
  shadow, and the HR +EV model.

### 4. Reference / context data

Non-authoritative supporting columns and expanded-row content:
`Pitcher K%` (`kRate`), `Pitcher Whiff%` (`whiffRate`), `K/9` (`projectedK9`),
`Projected IP`, `Pitcher K VS` (`kVs`), opponent lineup K% / whiff% (flat
averages of listed hitters, **not** true team rates), market line / over price /
under price / book. Expanded rows: pitcher last-5 starts and opponent last-5
games from `strikeout-prop-details.json`. Helpers:
`scripts/lib/mlb-strikeout-reference-context.mjs`,
`scripts/lib/mlb-opponent-k-context.mjs`.

### 5. Social candidate selection

The canonical X publisher's K pool =
`buildCanonicalKCandidatePool(batters, games, pitchers)`
(`src/lib/mlb/kPropCanonicalCandidates.ts`) = the union of the page's Top Over
Plays + Top Under Plays via the **same** `buildPitcherStrikeoutRows` →
`buildKPropBestBets(rows, 3)` pipeline. Written to
`artifacts/mlb-x-canonical/k-production-candidates.json` by
`scripts/generate-mlb-k-production-candidates.ts` (no X call, no receipt). Full
publishing contract: [social-publishing.md](social-publishing.md).

## Production vs shadow / research

| Component | Status |
| --- | --- |
| `projectedKs` (legacy formula) | **Production** — the live `Proj K`. |
| `strikeoutMatchupScore` / K Score | Production display score (client-only, uncalibrated). |
| "Best K Prop Bets" value sort | Production surface (uncalibrated value sort, `KS-008`). |
| K +EV V1 (`k-plus-ev.json`) | Production **surface**, but see "Flag" — no scheduled producer. |
| **K Projection V2 / workload-team-k-v3** | **Shadow.** `kProjectionMode: "shadow"`; comparison fields attached, `projectionSource: "legacy"` for normal rows. Debug-only UI at `?debug=k-v2`. Artifact `mlb-k-props-v2-shadow.json`. Do not promote silently. |
| K workload shadow (`k-workload-shadow.json`) | Shadow inputs for V2. |

## Artifacts / producers

| Artifact | Producer(s) | Workflow |
| --- | --- | --- |
| `public/data/mlb/hr-props-raw.json` (K rows + `projectedKs`) | `scripts/generate-mlb-hr-props.mjs` → `scripts/generate-mlb-hr-props-with-k-shadow.mjs` → `scripts/resolve-mlb-k-production-projection.mjs` | `generate-mlb-hr-props.yml` ("Generate MLB Data") |
| `public/data/mlb/strikeout-prop-details.json` | `scripts/generate-mlb-strikeout-prop-details.mjs` | `generate-mlb-hr-props.yml` |
| `public/data/mlb/k-props-v2-shadow.json` | `scripts/generate-mlb-k-props-v2-shadow.mjs` (+ `validate-mlb-k-props-v2-shadow.mjs`) | `generate-mlb-hr-props.yml`, `test-mlb-k-shadow.yml` |
| `public/data/mlb/k-workload-shadow.json` | `scripts/generate-mlb-k-workload-shadow.mjs` (`scripts/mlb-k/fetch-workload-data.mjs`) | `generate-mlb-hr-props.yml` |
| `public/data/mlb/k-plus-ev.json` | `scripts/generate-mlb-k-plus-ev.mjs` (`npm run mlb:k-plus-ev`) | **none found** — see "Flag" |
| `public/data/mlb/top-k-performance.json`, `top-k-performance-summary.json` | `scripts/persist-top-k-picks.ts`, `scripts/grade-top-k-picks.mjs` | `generate-mlb-hr-props.yml` (persist), `grade-mlb-hr-results.yml` (grade) |
| K odds enrichment | `scripts/inject-k-odds.mjs`, `scripts/validate-mlb-prop-odds.mjs` | `generate-mlb-hr-props.yml` |

## Model / audit docs

- [../mlb-k-projection-audit.md](../mlb-k-projection-audit.md) — 2026-07-23
  branch audit of the projection pipeline and social path. Point-in-time.
- [../mlb-k-v2-shadow-ui-validation.md](../mlb-k-v2-shadow-ui-validation.md) —
  V2 shadow debug-UI browser validation. Point-in-time.

## Tests

- `src/lib/mlb/kPropCanonicalCandidates.test.ts` — social candidate parity.
- `scripts/lib/mlb-k-x-selection-core.test.mjs`,
  `mlb-strikeout-reference-context.test.mjs`, `mlb-opponent-k-context.test.mjs`.
- `src/pages/MlbStrikeoutProps.viewToggle.test.tsx` — projection / K +EV view
  toggle.
- `scripts/validate-mlb-k-props-v2-shadow.mjs` (run by `test-mlb-k-shadow.yml`).

## Conflicts

`docs/mlb-k-projection-audit.md` states "no dedicated server-side K props
artifact exists" and that social K selection "scrapes the live page". Current
committed code has **superseded the scrape**: the canonical publisher builds
`k-production-candidates.json` from the raw payload via
`buildCanonicalKCandidatePool` (no HTML scrape). The audit's core finding — K
table rows are still assembled **client-side** and `projectedKs` remains the
legacy projection (`kProjectionMode: "shadow"`) — is still accurate as of this
writing. Where the audit and current code disagree, current committed code wins;
the audit is provenance for the July 2026 state only.

## Flag: future model doc + producer gap

- The K projection (legacy formula + V2 workload shadow + promotion criteria),
  the K Score composition, and the "Best K Prop Bets" value sort each warrant a
  dedicated `docs/models/mlb-k-*.md` methodology contract. Until it exists, this
  feature doc plus the point-in-time audits are the only reference and are
  **not** current methodology authority.
- `scripts/generate-mlb-k-plus-ev.mjs` is wired to no workflow; the committed
  `k-plus-ev.json` can go stale (observed `date` predates the current slate).
  Whether K +EV V1 is intended to be live is **unverified** — treat the K +EV
  V1 table as research-grade until its refresh path is confirmed.
