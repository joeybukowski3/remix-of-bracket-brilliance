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

### Live adapters (Phase 1)

```bash
npm run social-card:mlb:morning:live -- --slate-date=2026-07-29
npm run social-card:mlb:confirmed:live -- --slate-date=2026-07-29           # exits non-zero with a blocked-readiness report (see below)
npm run social-card:mlb:confirmed:live -- --slate-date=2026-07-29 --preview # explicit opt-in, writes a *-preview.* card
```

`scripts/generate-social-card-live.mjs` reads real production artifacts, adapts them with `scripts/lib/social-cards/adapters/*`, then hands the result to the **same** `normalizeMorning`/`normalizeConfirmed` + `renderCard` + `writeSocialCard` pipeline fixture mode uses — this CLI never renders or writes anything itself. Flags: `--edition=morning|confirmed` (required), `--slate-date=YYYY-MM-DD` (defaults to today's Eastern date), `--raw=`/`--best-bets=` (override the default `public/data/mlb/hr-props-{raw,best-bets}.json` paths), `--output-dir=`, `--preview`.

#### Source artifacts consumed

- `public/data/mlb/hr-props-raw.json` (written by `scripts/generate-mlb-hr-props.mjs`): `games[]` (`gameKey`, `homeTeam`, `awayTeam`), `pitchers[]` (`gameKey`, `role`, `kVs`, `projectedKs`), `batters[]` (`gameKey`, `hrScore`, `hrOddsYes`).
- `public/data/mlb/hr-props-best-bets.json`: `bestBets[]`, the pipeline's own deterministic HR selection (`selectDeterministicHrPicks`), currently capped at 5 rows, each carrying a real, already-attached sportsbook price in `hrOddsYes`.

Both must exist at the resolved path and have `.date === --slate-date`; the resolver (`scripts/lib/social-cards/adapters/resolve-source.mjs`) never falls back to `scripts/fixtures/*`.

#### Morning mapping

- **Home runs**: `hr-props-best-bets.json.bestBets`, in its frozen order (never re-ranked), joined to `hr-props-raw.json.batters` by player/team/opponent for `hrScore`, and to `.games` by `gameKey` for `venueSide`. Capped at 6 (renderer cap); production currently emits 5.
- **Strikeouts**: `hr-props-raw.json.pitchers` filtered to `role === "starter"`, sorted descending by the pipeline's own precomputed `kVs` (tie-break: pitcher name), capped at 5. **No frozen "best K picks" artifact exists upstream** — this is a documented selection over an already-computed field, not a new scoring model (see `NOTES-live-adapters.md` for why: the only production K-selection logic, `scripts/lib/mlb-k-x-selection-core.mjs`, is for X-post captions and requires a live Playwright scrape plus a live MLB Stats API confirmation snapshot, both out of scope here).
- **Snapshot**: `gamesModeled` = `games.length`, `projectedStartingPitchers` = `pitchers.length`, `modeledHitters` = `batters.length` (all from the same `hr-props-raw.json` payload; `null` + a diagnostic warning if the array is missing). `highestHrScore`/`highestProjectedK` come from `deriveMorningSnapshot()` over the already-selected rows above. `lastRefresh`/`updatedTimeEt` are derived from `hr-props-raw.json.generatedAt` via `formatEasternClock()` (`Intl.DateTimeFormat` with `timeZone: "America/New_York"`) — no artifact pre-formats an Eastern clock string.

#### Confirmed mapping and the confirmed-values decision

- **Home runs**: same `bestBets` join as morning, plus `odds` parsed from the already-attached `hrOddsYes` string. A row without a parseable American-odds price is dropped, never fabricated or padded.
- **Strikeouts and top-level `values[]`: intentionally left empty in Phase 1.** No frozen, already-selected static artifact exists with `side`+`line`+`odds`+`edge` (or player/market/side/line/odds/edge for values) together. Deriving `side`/`edge` from `kLine`/`projectedKs` ourselves would be exactly the "infer betting sides / calculate new edges" this adapter must never do, and the production logic that legitimately does this (`mlb-k-x-selection-core.mjs`) additionally requires a live lineup-confirmation snapshot this adapter doesn't have. `buildMlbDailyConfirmedCardInput` records `CONFIRMED_K_SOURCE_UNAVAILABLE` and `CONFIRMED_VALUES_SOURCE_UNAVAILABLE` in its diagnostics and calls `evaluateConfirmedReadiness(..., { valuesSourceAvailable: false })`.
- Result: confirmed generation is **blocked by design** — `buildMlbDailyConfirmedCardInput` returns `{ data: null, readiness, diagnostics }` unless `preview: true` is passed explicitly, in which case it returns the real (HR-only) data with `preview: true`, `publishReady: false`. The CLI mirrors this: without `--preview` it prints the readiness/diagnostics report to stderr and exits 1; with `--preview` it writes a `mlb-daily-confirmed-preview.*` artifact.
- A future phase that wants a real, ready confirmed card must add either a frozen confirmed K/values artifact upstream, or wire in the live confirmation-snapshot infra (`mlb-x-confirmation-snapshot.mjs`) — out of scope here.

#### Real-slate example (2026-07-29 Eastern slate, this worktree)

`public/data/mlb/hr-props-raw.json` (16 games, 32 pitchers, 288 batters) + `hr-props-best-bets.json` (5 bestBets) →
morning card: 5 HR rows (Yordan Alvarez 98.8 … Drake Baldwin 67.0), 5 K rows (Tarik Skubal 95.2 … Jared Jones 77.7) →
`artifacts/social-cards/mlb/2026-07-29/mlb-daily-morning.{json,svg,png}`.
Confirmed (non-preview) exits 1 with `INSUFFICIENT_CONFIRMED_K_ROWS`/`INSUFFICIENT_CONFIRMED_VALUE_ROWS`/`CONFIRMED_VALUES_SOURCE_UNAVAILABLE`; with `--preview`, the same 5 HR rows are written (with real odds, e.g. Yordan Alvarez `+175`) alongside empty strikeout/values sections to `mlb-daily-confirmed-preview.{json,svg,png}`.

Incomplete confirmed previews use `mlb-daily-confirmed-preview.*`, set `preview: true`, `publishReady: false`, and retain machine-readable readiness reasons.

Logo loading first checks local SVG assets under `public/assets/mlb/team-logos/`, then the existing `public/logos/mlb/` path. It never fetches remote assets at render time. Missing assets use a fixed abbreviation fallback. Existing repository logo mappings largely reference ESPN CDN assets, so they are not reused as runtime dependencies. Add locally licensed/approved SVGs incrementally using canonical filenames and aliases in `core.mjs`.

The live HR selector remains capped at five rows. The renderer supports six; changing the production selection policy requires a separate PR.

Future site migration should consume the same normalized JSON in a React card component, run beside legacy Social Media Tables behind a feature flag, validate parity, then retire the legacy tables in a later PR. X integration should first upload dry-run artifacts during the existing confirmed/morning windows and reuse the current leases, receipts, account checks, and duplicate protection.

**Phase 1 boundary**: the live adapters and CLI above only read static production JSON and write local card artifacts. They do not touch `.github/workflows/mlb-x-editions.yml` or any other workflow, do not post to X, do not consume or write leases/receipts, and do not change the website. Wiring a scheduled workflow run and/or a website-facing consumer of these live cards is explicitly future work.
