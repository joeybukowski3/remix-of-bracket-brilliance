# Social card framework

Supported templates: `mlb_daily_morning`, `mlb_daily_confirmed`.

The framework separates frozen upstream selection from normalization, validation, deterministic SVG rendering, Playwright PNG conversion, and output writing. Renderers preserve row order and never select, rerank, infer betting sides, or fabricate odds.

## Snapshot definitions

- `gamesModeled`: scheduled games represented by the upstream slate snapshot.
- `projectedStartingPitchers`: current projected starter rows represented by the upstream snapshot.
- `modeledHitters`: count of hitter projection rows available to the morning adapter. This is not a count of lineups.
- `highestHrScore`: highest HR Score from the already selected/normalized morning HR input.
- `highestProjectedK`: highest projected strikeout value from the already selected/normalized K input.
- `lastRefresh`: Eastern display timestamp supplied by the upstream artifact.

## Commands

```bash
npm run social-card:mlb:morning -- --input=scripts/fixtures/mlb-daily-morning.json
npm run social-card:mlb:confirmed -- --input=scripts/fixtures/mlb-daily-confirmed.json
node scripts/generate-social-card.mjs --template=mlb_daily_confirmed --input=scripts/fixtures/mlb-daily-confirmed-partial.json --preview
```

Fixture mode is network-free and unchanged.

### Live adapters: shared-selector architecture

The live daily card shows **the same HR and K picks already shown on the website's Social Media Tables** — not an independently ranked or differently sourced selection. This is achieved by having the card generator import and call the exact same selector functions the website calls, from the exact same `hr-props-raw.json` payload, rather than by re-deriving a selection inside the card adapter:

```
hr-props-raw.json
  → filterActiveSlate()          (excludes TBD-starter games -- same as useMlbPropsData())
  → selectTopSocialHrRows()       (src/lib/mlb/hrPropSocialSelection.ts)
  → buildPitcherStrikeoutRows()   (src/lib/mlb/mlbSocialSelection.ts)
  → selectTopSocialKRows()        (src/lib/mlb/kPropValueSorting.ts)
      ↓                                              ↓
  SocialTableHR / SocialTableK           scripts/generate-social-card-live.ts
  (src/pages/MlbGameDetail.tsx)          (build-morning.mjs / build-confirmed.mjs:
                                           pure field-mapping only, no selection)
```

- **`selectTopSocialHrRows(batters, { max })`** (`src/lib/mlb/hrPropSocialSelection.ts`) — extracted verbatim from `SocialTableHR`'s previously-inline filter/sort/slice. `SocialTableHR` now calls it with `max: 8`; the card generator calls it with `max: 6`. Same filter (barrel rate ≤25%, at-bats ≥50) and sort (`hrScore` descending) either way — the card's first 6 rows are always the identical prefix of the website's top 8, never a different or re-ranked selection.
- **`buildPitcherStrikeoutRows(batters, games, pitchers)`** (`src/lib/mlb/mlbSocialSelection.ts`) — extracted verbatim from `src/pages/MlbHrProps.tsx` (which is re-exported there for backward compatibility). Builds one row per pitcher with `strikeoutMatchupScore`, `kLine`, `kOddsOver/Under`, `projectedKs`, and a resolved `kProjectionStatus`. This is a row *builder*, not a selection — every pitcher gets a row.
- **`selectTopSocialKRows(rows, 5)`** (`src/lib/mlb/kPropValueSorting.ts`, unchanged) — the actual K selection: filters to rows with `resolveKPropStatus(row).status === "VALID"` (a real line + workload-confident projection), ranks by absolute projection-vs-line edge, caps at 5. Both `SocialTableK` and the card generator call this exact function with the exact same candidate rows.
- **`buildTbdGameKeySet(pitchers, batters)`** (`src/lib/mlb/mlbSocialSelection.ts`, re-exported from `MlbHrProps.tsx`) — both the website's `useMlbPropsData()` hook and the card generator exclude games where a probable pitcher is still `TBD`/`TBA` before running any selection.

These modules are dependency-free TypeScript (only `import type` references into `MlbHrProps.tsx`, erased at compile time) so they can run in a plain script via `tsx`, not just inside the React app.

```bash
npm run social-card:mlb:morning:live -- --slate-date=2026-07-29                     # blocks (exit 1) only if selectTopSocialKRows finds zero VALID rows
npm run social-card:mlb:morning:live -- --slate-date=2026-07-29 --preview           # if blocked: explicit partial preview (HR rows + empty K section)
npm run social-card:mlb:confirmed:live -- --slate-date=2026-07-29                   # exits non-zero with a blocked-readiness report (K/values, see below)
npm run social-card:mlb:confirmed:live -- --slate-date=2026-07-29 --preview         # explicit opt-in, writes a *-preview.* card
```

`scripts/generate-social-card-live.ts` is a **TypeScript entrypoint run directly via `tsx`** (`tsx` added as a devDependency; the repo had no TS execution runtime for plain scripts before this). It's a real `.ts` file, not compiled or spawned as a second process, so it can `import ... from "@/lib/mlb/..."` with the project's normal path alias exactly like the website does. It resolves the source artifact, replicates the website's TBD filtering, calls the shared selectors above, then hands the already-selected rows to the existing `.mjs` adapters (`build-morning.mjs` / `build-confirmed.mjs`) for pure field-mapping, then to the **same** `normalizeMorning`/`normalizeConfirmed` + `renderCard` + `writeSocialCard` pipeline fixture mode uses. Flags: `--edition=morning|confirmed` (required), `--slate-date=YYYY-MM-DD` (defaults to today's Eastern date), `--raw=` (override the default `public/data/mlb/hr-props-raw.json` path), `--output-dir=`, `--preview`. There is no `--k-plan` or `--best-bets` flag — both were removed; see "What changed" below.

#### Source artifact consumed

- `public/data/mlb/hr-props-raw.json` (written by `scripts/generate-mlb-hr-props.mjs`): `games[]`, `pitchers[]` (`gameKey`, `role`, `kVs`, `kLine`, `kOddsOver/Under`, `projectedKs`), `batters[]` (`gameKey`, `hrScore`, `hrOddsYes`). This is the **only** artifact the live CLI reads — `hr-props-best-bets.json` is no longer consumed by the live card path at all (see below). Must exist at the resolved path and have `.date === --slate-date`; the resolver (`scripts/lib/social-cards/adapters/resolve-source.mjs`) never falls back to `scripts/fixtures/*`.

#### Morning mapping

- **Home runs**: `selectTopSocialHrRows(batters, { max: 6 })` output, mapped in the selector's order (never re-ranked by the adapter), joined to `.games` by `gameKey` for `venueSide`.
- **Strikeouts**: `selectTopSocialKRows(buildPitcherStrikeoutRows(batters, games, pitchers), 5)` output, mapped in the selector's order. `kScore` comes from `strikeoutMatchupScore` and `projectedK` from `projectedKs` — the same fields `SocialTableK` displays. The adapter never copies `kLine`/`kOddsOver`/`kOddsUnder`/status fields into the morning output, per the morning display contract (no odds, no line, no Over/Under, no edge). If `selectTopSocialKRows` finds zero VALID rows (e.g. no lines posted yet for anyone on the slate), `buildMlbDailyMorningCardInput` returns `{ data: null, readiness: { ready: false, reasons: ["MORNING_K_ROWS_UNAVAILABLE"] }, diagnostics }` and generation blocks, unless `--preview` is passed, in which case it returns a real card with a genuinely empty strikeout section — never a fabricated row.
- **Snapshot**: `gamesModeled` = `games.length`, `projectedStartingPitchers` = `pitchers.length`, `modeledHitters` = `batters.length` (all from `hr-props-raw.json`, post-TBD-filter; `null` + a diagnostic warning if the array is missing). `highestHrScore`/`highestProjectedK` come from `deriveMorningSnapshot()` over the selected rows above. `lastRefresh`/`updatedTimeEt` are derived from `hr-props-raw.json.generatedAt` via `formatEasternClock()`.

#### Confirmed mapping and the confirmed-values decision

- **Home runs**: same `selectTopSocialHrRows(batters, { max: 6 })` selection as morning, plus `odds` parsed from each selected row's already-attached `hrOddsYes` string. A row without a parseable American-odds price is dropped, never fabricated or padded. This replaces the previous `hr-props-best-bets.json.bestBets` source, which was a *different* selection (a separate deterministic model pipeline, capped at 5) than what the website's Social Media Tables actually display — using it made the confirmed card show picks that could legitimately disagree with the website.
- **Strikeouts and top-level `values[]`: still intentionally left empty.** This is unchanged by the shared-selector migration and remains deliberately conservative: no frozen, already-selected static artifact exists with `side`+`line`+`odds`+`edge` together for the confirmed edition, and building one, or deriving those fields ourselves, is out of scope for this pass. `buildMlbDailyConfirmedCardInput` records `CONFIRMED_K_SOURCE_UNAVAILABLE` and `CONFIRMED_VALUES_SOURCE_UNAVAILABLE` in its diagnostics and calls `evaluateConfirmedReadiness(..., { valuesSourceAvailable: false })`.
- Result: confirmed generation is **blocked by design** — `buildMlbDailyConfirmedCardInput` returns `{ data: null, readiness, diagnostics }` unless `preview: true` is passed explicitly, in which case it returns the real (HR-only) data with `preview: true`, `publishReady: false`. The CLI mirrors this: without `--preview` it prints the readiness/diagnostics report to stderr and exits 1; with `--preview` it writes a `mlb-daily-confirmed-preview.*` artifact.
- A future phase that wants a real, ready confirmed card must add a way to populate confirmed K/values conservatively (e.g. wiring in the live confirmation-snapshot infra, `mlb-x-confirmation-snapshot.mjs`) — out of scope here.

#### What changed from the previous revision

The prior revision of this document proposed a frozen `k-props-daily-plan.json` artifact and a `--k-plan` CLI flag, on the premise that no reusable K-selection function existed anywhere. That premise was wrong: the website's own `SocialTableK` already calls a real, shared, pure, already-tested selector (`selectTopSocialKRows` + `buildPitcherStrikeoutRows`) at render time, computed live from `hr-props-raw.json` — it just wasn't extracted into a Node-importable module yet. This revision extracts it (and the equivalent HR selector) instead of proposing a new frozen-artifact producer. **The `--k-plan` flag, the K-plan artifact concept, and `hr-props-best-bets.json` as an HR source have all been removed** — there is nothing left to build upstream; the live CLI computes the same selection the website computes, on demand.

#### Real-slate example (2026-07-29 Eastern slate, this worktree)

`public/data/mlb/hr-props-raw.json` (16 games, 32 pitchers, 288 batters) →
morning: 6 HR rows (Yordan Alvarez 98.8 … Ben Rice 67.4) and 5 real VALID K rows (ranked by projection-vs-line edge, not raw K score — e.g. Jesús Luzardo first despite a lower K Score than Tarik Skubal, because Luzardo's edge is larger) → `artifacts/social-cards/mlb/2026-07-29/mlb-daily-morning.{json,svg,png}`.
Confirmed (`--preview`): the same 6 HR rows with real parsed odds (e.g. Yordan Alvarez `+175`), K/values sections empty, `publishReady: false` → `mlb-daily-confirmed-preview.{json,svg,png}`.

Incomplete confirmed previews use `mlb-daily-confirmed-preview.*`, set `preview: true`, `publishReady: false`, and retain machine-readable readiness reasons.

Logo loading first checks local SVG assets under `public/assets/mlb/team-logos/`, then the existing `public/logos/mlb/` path. It never fetches remote assets at render time. Missing assets use a fixed abbreviation fallback. Existing repository logo mappings largely reference ESPN CDN assets, so they are not reused as runtime dependencies. Add locally licensed/approved SVGs incrementally using canonical filenames and aliases in `core.mjs`.

Future site migration should consume the same normalized JSON in a React card component displayed directly on the website (rather than the current standalone-artifact CLI flow), validate parity against the Social Media Tables tab, then retire the tab in a later PR now that both already share the same underlying selectors. X integration should first upload dry-run artifacts during the existing confirmed/morning windows and reuse the current leases, receipts, account checks, and duplicate protection.

**Phase 1 boundary**: the live adapters and CLI above only read static production JSON and write local card artifacts. They do not touch `.github/workflows/mlb-x-editions.yml` or any other workflow, do not post to X, do not consume or write leases/receipts, and do not change the website. Wiring a scheduled workflow run and/or a website-facing consumer of these live cards is explicitly future work.

## Phase 2: workflow-artifact generation

Card generation is wired into the existing `.github/workflows/mlb-x-editions.yml` ("MLB X Editions") workflow as two new, independent jobs. Neither job's `on:` triggers, schedules, concurrency groups, leases, receipts, duplicate protection, or X posting logic were changed — the new jobs are pure additions that nothing else depends on.

### Insertion points

- **`generate-daily-card-morning`** — `needs: plan`. Runs when the upstream `Generate MLB Data` workflow just completed successfully (`workflow_run`, the trigger that fires right after `hr-props-raw.json` is committed to `main`), or on `workflow_dispatch` with `mode: morning-dry-run` / `morning-live` for manual testing. Calls the live CLI once, without `--preview`:
  ```
  npx tsx scripts/generate-social-card-live.ts --edition=morning --slate-date="${{ needs.plan.outputs.slate_date }}"
  ```
- **`generate-daily-card-confirmed`** — `needs: plan`. Runs when `plan` decided either confirmed X edition (`hr_confirmed_should_run` or `k_confirmed_should_run`) should fire this run — i.e. the confirmed pregame window has actually been reached — or on `workflow_dispatch` with `mode: confirmed-dry-run` / `confirmed-live`. First attempts a full (non-preview) generation; if that exits non-zero it automatically retries once with `--preview`. Confirmed K/values selection has no trustworthy source yet (see above), so in this phase the fallback attempt is expected to run on essentially every invocation and always succeeds with a `-preview.*` artifact rather than failing the step.

Both jobs resolve the slate date exclusively from `needs.plan.outputs.slate_date` (the same America/New_York-based value the X-posting jobs use) — never the runner's UTC clock, and never pass `--slate-date` unset.

### Failure isolation

Each generation step runs with `continue-on-error: true` and captures its own exit code to a step output; a "Report ... summary" step and an "Upload ... artifacts" step both run `if: always()` regardless of that outcome. A card-generation failure therefore cannot fail the job (or the workflow), and can never affect `plan`'s outputs or any of the four X-posting jobs, none of which depend on these new jobs. A genuine setup failure (e.g. `npm ci`) is intentionally *not* swallowed — those steps still fail the job normally, which is the correct signal for an infra problem, not a card-generation readiness problem.

### Artifacts

Uploaded from the CLI's existing output directory, `artifacts/social-cards/mlb/<slate-date>/`, plus the captured stdout/stderr log for that run:

| Artifact name | Contents | Retention |
| --- | --- | --- |
| `mlb-daily-card-morning-<slate-date>` | `mlb-daily-morning.{json,svg,png}` (if generated) + `card-morning-stdout.log` / `card-morning-stderr.log` | 14 days |
| `mlb-daily-card-confirmed-<slate-date>` | `mlb-daily-confirmed.{json,svg,png}` or `mlb-daily-confirmed-preview.{json,svg,png}` (if generated) + `card-confirmed-stdout.log` / `card-confirmed-stderr.log` | 14 days |

`if-no-files-found: warn` so a run where generation failed before writing any card file still uploads its logs without failing the upload step. Generated artifacts are never committed — `artifacts/` is gitignored, matching every other pattern in this repo.

### Workflow summary

Each job appends a `### <edition> card — <slate-date>` block to `$GITHUB_STEP_SUMMARY` via `scripts/report-social-card-generation.mjs` (backed by the small, unit-tested `scripts/lib/social-cards/workflow-summary.mjs`), which parses the live CLI's own JSON result (success on stdout, blocked-readiness report on stderr — the CLI already produces both) rather than re-deriving readiness itself. The block reports: edition, slate date, source path and its embedded `.date`, publish-ready vs. preview-only vs. failed status, readiness reasons, HR/K row counts, and generated filenames.

### Playwright

`writeSocialCard()` launches Chromium directly (`@playwright/test`) to rasterize the PNG. Both new jobs run `npx playwright install --with-deps chromium` — the same single-browser install already used by every other job in this workflow file (`plan` and the four `post-*` jobs) — since GitHub Actions jobs don't share a filesystem or browser cache with each other. No other browsers are installed.

### How to inspect artifacts

From the workflow run's Actions page: **Summary** tab shows the per-edition markdown block described above; the **Artifacts** section at the bottom has the `mlb-daily-card-{morning,confirmed}-<slate-date>` zips containing the JSON/SVG/PNG (when generated) and the raw CLI logs.

### What Phase 2 does not do

Phase 2 only generates and uploads workflow artifacts. It does not publish, post, or otherwise surface any card on the website or on X — no website component consumes these artifacts, and no X-posting job reads or references them. That remains explicitly future work (see "Future site migration" above).
