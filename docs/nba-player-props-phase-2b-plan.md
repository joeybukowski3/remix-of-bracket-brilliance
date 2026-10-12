# NBA player props — Phase 2B plan: commercial data access and containment

Status: preparation only, uncommitted, on `feat/nba-player-props-v1`
(2026-10-12). Phase 2A is approved as **experimental**. minutes-v1 is **not
promoted**. No provider requests, no NBA.com requests, and no data migration
were made. All new code is tested on synthetic fixtures only.

## 1. Provider comparison

Sources were read 2026-10-12. Each criterion lists what the provider's own
documentation **confirms**, followed by what must be **confirmed in writing**.
Third-party claims are marked unofficial. Having an API key or a subscription
is not treated as having every right.

Documents read:
- SportsDataIO: [data-rights help page](https://sportsdata.io/help/data-rights-and-licensing-questions), [NBA API docs](https://sportsdata.io/developers/api-documentation/nba), [NBA data dictionary](https://sportsdata.io/developers/data-dictionary/nba).
- BALLDONTLIE: [terms](https://www.balldontlie.io/terms) (updated 2026-09-17) and [API docs](https://docs.balldontlie.io/).

### 1.1 Commercial rights for an ad-supported analytics site

| | Confirmed | Needs written confirmation |
|---|---|---|
| **SportsDataIO** | "public-facing, revenue-generating, or business-operated products require a commercial license". Licenses "cover betting analytics, modeling, and decision-support products". "Attribution is a standard requirement of commercial licenses." The free Discovery Lab is "personal, non-commercial use only". | That an ad-supported, free site is within the quoted license, and the attribution wording and placement. |
| **BALLDONTLIE** | §6: use "for lawful personal or commercial purposes", publish, display, distribute, derivative works, no attribution required. §2: "Lawful gambling-industry uses are expressly permitted". | **Chain of title:** §1 says data is "compiled and aggregated from a variety of third-party sources", §11 says they have not "cleared every third-party intellectual property" right, and §12 disclaims non-infringement, so the user is "solely responsible". Need the upstream source and any indemnity. Also whether JKB counts as a product that "compete[s] with us" (§6). |

### 1.2 Creating and publicly displaying player-prop projections

| | Confirmed | Needs written confirmation |
|---|---|---|
| **SportsDataIO** | "commercial licenses that permit using the data as an input to statistical models". "License agreements can also cover display of those derived outputs", "pending the use case and the exact feeds required". | That public display of player-prop projections and model-vs-line comparisons is in the agreement. |
| **BALLDONTLIE** | §6 permits derivative works and public display; raw data may not be resold "in its original, unmodified form". | The upstream-rights question above, and that props-projection pages are not "competing". |

### 1.3 Historical player-game and team-game data

| | Confirmed | Needs written confirmation |
|---|---|---|
| **SportsDataIO** | Player Game Logs by Season, Player Game Stats by Date, Box Scores, Team Game Stats by Date, Team Game Logs by Season. `PlayerGame` has `Minutes` and `Seconds` (int), `Started`, `HomeOrAway`, `OpponentID`, `IsGameOver` and `Updated`. The **`Player` object carries `NbaDotComPlayerID`**, a crosswalk to the existing canonical ids. | How many past seasons the license includes; the docs show season parameters but no stated start ("SportsDataIO REPLAY" is mentioned for more). |
| **BALLDONTLIE** | Data "from 1946-current". `/v1/stats` (ALL-STAR) has player box stats with **`min` as a string such as `"30"`**. Box scores need GOAT. No team-game endpoint: team totals come from box scores. | **Minutes precision.** If `min` is whole minutes, per-minute rates lose precision against the decimal minutes the v0 benchmark used. Ask whether seconds are available. |

### 1.4 Injuries, starters, inactives and lineups

| | Confirmed | Needs written confirmation |
|---|---|---|
| **SportsDataIO** | `PlayerGame`: `InjuryStatus`, `InjuryBodyPart`, `InjuryStartDate`, `InjuryNotes`, `LineupStatus`, `LineupConfirmed`, `Started`. Starting Lineups by Date ("projected and confirmed"), Depth Charts, and InjuredPlayers ("status, start date, body part, and note"). | Whether historical, as-of injury and lineup snapshots exist, or whether only current state is kept. Whether DNP or inactive players get `PlayerGame` rows. |
| **BALLDONTLIE** | `/v1/player_injuries` (ALL-STAR): `status`, free-text `return_date` and `description`, **no structured timestamp**. `/v1/lineups` (GOAT): a `starter` boolean, "only once the game begins", **2025 season onward**. | Inactive or DNP players are not documented. There are no pregame lineups. |

### 1.5 Pregame timestamps and historical as-of data

| | Confirmed | Needs written confirmation |
|---|---|---|
| **SportsDataIO** | An `Updated` datetime (US Eastern) on `PlayerGame` and `Game`. The line-movement endpoints are "intended for historical data purposes". | As-of history for injuries and lineups. If it isn't available, JKB must snapshot these itself before each tip, going forward, using the `asOfUtc` contract in §2. |
| **BALLDONTLIE** | `updated_at` on odds and DFS; `wallclock` on plays. Injuries have no timestamp, and lineups appear after tip. | No historical as-of data for availability. Forward snapshots by JKB would be required. |

### 1.6 Advanced stats (usage, pace, tracking)

| | Confirmed | Needs written confirmation |
|---|---|---|
| **SportsDataIO** | `PlayerGame.UsageRatePercentage` and `PlayerEfficiencyRating`. `Possessions` appears only on team-level season objects. | Pace per game, and whether tracking data is available or a separate product. |
| **BALLDONTLIE** | GOAT tier. Advanced V1 (from 1996): `pace`, `usage_percentage`, ratings. Advanced V2 (from 2015): 100+ metrics, including tracking (`touches`, `speed`, `distance`, `passes`) and hustle stats (full game only). | Whether V2 coverage is complete for every game since 2015. |

### 1.7 Historical sportsbook prop lines and odds

| | Confirmed | Needs written confirmation |
|---|---|---|
| **SportsDataIO** | `BettingPlayerPropsByGameID` (10-minute interval). `BettingMarket/{marketId}` returns full line movement "intended for historical data purposes". Betting Results grades outcomes. | How far back historical **player-prop** markets go, which books, and whether the historical warehouse is a separate product and price. (A search summary quotes "odds older than 30 days are stored in our Historical API data warehouse"; I did not see that sentence on the docs page directly.) |
| **BALLDONTLIE** | Player props: "LIVE and updated in real-time. **We do not store historical data.**" Opening props cover only "the most recently completed season and ongoing seasons", and only the opening line. Game odds start in the 2025 season. | None needed: BALLDONTLIE **cannot** supply historical closing prop lines for backtesting. JKB would have to archive lines going forward. |

### 1.8 Retention and derived-model rights after cancellation

| | Confirmed | Needs written confirmation |
|---|---|---|
| **SportsDataIO** | "It is possible to retain data after your license expires." "Post-termination rights to previously delivered data (raw or derived) are set in your individual license agreement." | Negotiate retention of raw history, model parameters, and published derived outputs. |
| **BALLDONTLIE** | §17: termination "does not revoke the permissions in Section 6 for Data you lawfully obtained before termination, including … derivative works … already created". | Favorable on paper. It still depends on the §1.1 upstream question. |

### 1.9 Pricing, request limits and reliability

| | Confirmed | Needs written confirmation |
|---|---|---|
| **SportsDataIO** | Commercial licenses are quoted per client; "API usage volume is not a factor in pricing". The free trial covers only UEFA Champions League. Each endpoint has a recommended call interval (5 s to 1 day). There is a status page (`status.sportsdata.io`); the docs give no SLA. | Price, uptime SLA, and support terms. Unofficial: Vendr reports a median buyer spend of about $16.5k per year; this is not a quote. |
| **BALLDONTLIE** | Per sport: Free $0 (5 req/min: teams, players, games); ALL-STAR $9.99/mo (60/min: player stats, injuries, active players); **GOAT $39.99/mo (600/min: box scores, advanced, lineups, odds, props, plays)**; ALL-ACCESS $299.99/mo for all sports. 48-hour GOAT trial. No SLA. §16 allows the service to be discontinued "with or without notice". | Commercial terms beyond the published ToU, if any. |

### 1.10 Questions to send (both providers)

1. Is a free, advertising-supported betting-research website that publicly displays player-prop projections and model-vs-line comparisons covered? Under which plan or agreement?
2. Attribution wording and placement.
3. Historical seasons included: player and team box scores, minutes precision (seconds?), starters, DNP/inactive rows.
4. Historical **pregame** injury, lineup and availability snapshots with timestamps.
5. Historical player-prop lines: books, depth, closing vs line movement, and price.
6. Retention of raw data, model parameters and derived outputs after termination.
7. Permission to use trial or evaluation data for model development.
8. SLA and support.
9. BALLDONTLIE only: the upstream source of NBA data and any indemnity; whether JKB is a "competing" product.
10. SportsDataIO only: whether `NbaDotComPlayerID` is populated for all historical players.

## 2. Provider-independent adapter architecture

```
                    SourceTransport (injected; API key from env; the only network code)
                              │ TransportResponse
  NbaSourceAdapter ── planRequests(scope) ──▶ SourceRequest[]
         │                          │
         │                 createPayload() → SourcePayload { meta: nba-source-snapshot-meta-v2, bodyText }
         │                          │        (sha256, asOfUtc required for availability)
         ▼                          ▼
  normalizePayloads(adapter, payloads, use)
     1. assertUsePermitted(source license, use)   ← SOURCE_LICENSES (sources/licenses.ts)
     2. payload source == adapter source; sha256 integrity
     3. adapter.normalize(payload)  → NbaPlayerGame / NbaTeamGame / NbaAvailabilityRecord
         ▼
  buildDataset(...)  (Phase 1 builder: dedupe, opponents, reconciliation, coverage)
     · refuses to mix sources (ids are source-native) → PlayerIdCrosswalk first
         ▼
  existing features / v0 / minutes-v1 code, unchanged
```

| File | Role |
|---|---|
| `src/lib/nba/props/sources/types.ts` | Contract: `NbaSourceAdapter`, `SourceRequest`, `SourceTransport`, `SourceSnapshotMeta` (v2: `sourceId`, `table`, `asOfUtc`, sha256), `SourceCapabilities`, `SourceLicense`, `NbaAvailabilityRecord` (`nba-availability-v1`: status, starter, reason, **`asOfUtc`**), `PlayerIdCrosswalk` |
| `src/lib/nba/props/sources/licenses.ts` | License per source. stats.nba.com is **restricted, no permitted uses** (ToU §9 plus your decision). sportsdataio and balldontlie are **unlicensed, no uses** until an agreement exists. synthetic permits all uses. The record is frozen. |
| `src/lib/nba/props/sources/ingest.ts` | License gate, `createPayload`, integrity and source check, normalization, `buildSourceDataset`, `applyPlayerCrosswalk` (unmapped ids are reported, never guessed) |
| `src/lib/nba/props/sources/statsNbaAdapter.ts` | Phase 1 normalizers behind the contract, plus a v1→v2 metadata converter. Blocked by its license record. Parses via `ingest/statsNbaPayload.ts`; it has no network code. |
| `src/lib/nba/props/__fixtures__/syntheticSource.ts` | A synthetic "commercial" adapter with a deliberately different shape: nested objects, minutes + seconds, a 240-minute team total, its own id space, and availability rows with as-of times. |
| `src/lib/nba/props/dataset.ts` (changed) | `meta.endpoint` widened to a source-native string. The revision diff is chosen by row kind. **It throws on mixed sources.** Phase 1 tests and the v0 golden test pass unchanged. |

Leakage contract extension: pregame features may use an `NbaAvailabilityRecord`
only when `asOfUtc` is earlier than the prediction cutoff timestamp. Availability
payloads cannot be created without `asOfUtc`.

Not built, by design:
- No live transport for any commercial provider.
- No commercial adapter written against undocumented shapes.
- No migration of existing data.

## 3. Containment changes and test results

| Change | Purpose |
|---|---|
| `docs/nba-player-props-phase-1.md` | NBA.com-derived numbers removed: coverage counts, reconciliation counts, MAE/RMSE tables, CIs, segment errors, quirk counts, tuned values. Method and qualitative conclusions are kept. |
| `data/nba/reports/phase-1-results.md` (**gitignored**) | The removed numbers, verbatim, with a restricted-report marker. |
| `.vercelignore` (new) | `data/nba/`. Vercel docs: without the file, "all files within your project are uploaded", so a local `vercel deploy` would have uploaded gitignored data. Git deployments are unaffected. |
| `scripts/lib/nba-data-containment.mjs` + `scripts/check-nba-data-containment.mjs` | Rules plus a CLI (`npm run nba:check-containment`). **Path rules:** `data/nba/`, `stats-nba/` snapshots, NBA `*.body/meta.json`, canonical/prediction/outcome `.jsonl`, NBA backtest/canonical/report directories. **Content rules:** raw stats.nba.com payload shape, raw-snapshot metadata, canonical or model `schemaVersion`, NBA `modelVersion`, the report marker; in bundles also stats.nba.com endpoints and NBA model ids. **Required-source check:** NBA source, tests and docs must stay committable. **`.vercelignore` check.** Output names path and rule only, never content. Modes: default (tracked plus everything `git add -A` would pick up, `public/`, `dist/`), `--staged`, and `--no-git --deployable=dist`. |
| `package.json` `postbuild` | Appends `node scripts/check-nba-data-containment.mjs --no-git --deployable=dist`, so **every build (Vercel, GitHub Pages) fails** if restricted NBA content reaches `dist/`. This is a production-build change; please review. |
| `src/lib/nba/props/containment.test.ts` | Rule unit tests, plus live repository checks (Git scope, `public/`, ignore rules, `.vercelignore`, `vite.config.ts` deny rule) that run in `npm test`. |
| `src/lib/nba/props/isolation.test.ts` | minutes-v1 is imported only by its own modules, its test and the synthetic harness. Nothing outside `src/lib/nba` and `scripts/nba-*` imports NBA code. |

**Validation results**

| Check | Result |
|---|---|
| `npx vitest run src/lib/nba` (committed files) | **89/89 pass** across 8 files: golden 7, minutesV1 22, model 20, ingest 9, sources 11, dataset 8, containment 10, isolation 2. The local-only client test adds 5 (94 locally). |
| v0 golden | 7/7, re-captured with the public untuned parameters (§7) |
| `npm run nba:check-containment` | Pass. 5,636 Git-scope files, 535 `public/`, 550 `dist/`; `.vercelignore` ok |
| Containment probes | A synthetic canonical-record file and an `exports/nba/backtest/metrics.json` at committable paths → CLI exit 1 and repository test failed. A synthetic model-output file in `dist/` → post-build guard exit 1. Probes deleted. |
| `npm run nba:minutes-synthetic` | Runs; numbers unchanged from Phase 2A |
| Typecheck, NBA and changed files | 0 errors under `tsconfig.app`, `tsconfig.node`, `tsconfig.scripts` |
| ESLint, changed files | Clean |
| `npm run build` | Pass. Prerender 5/5; post-build containment `ok deployable dist/ (550 files)` |

**Pre-existing, unrelated** (identical to Phase 2A):
- `tsconfig.app.json`: 1 error in `src/lib/mlb/mlbPitcherRegression.ts(28,1)`.
- `tsconfig.scripts.json`: 165 errors, none NBA.
- `eslint .`: findings in 65 non-NBA files.
- `npm run build` again regenerated `public/sitemap-nfl-matchups.xml` (a date-dependent NFL slug), which I restored to `HEAD`.
- The full `npx vitest run` was **not** re-run this phase; Task 4 asked for targeted tests, and the last full run hit memory pressure. Phase 2A's full-suite failures (60 non-NBA files, mostly timeouts) are documented in `docs/nba-player-props-phase-2a.md` §5.1.

## 4. Files committed

Staged by exact path (never `git add -A`) and checked with
`npm run nba:check-containment -- --staged`. 43 files: 5 modified, 38 new.

Modified (5):
```
.gitignore
docs/ARCHITECTURE.md
docs/DATA_SOURCES.md
package.json
vite.config.ts
```
New (38):
```
.vercelignore
docs/nba-player-props-phase-1.md
docs/nba-player-props-phase-2a.md
docs/nba-player-props-phase-2b-plan.md
scripts/check-nba-data-containment.mjs
scripts/lib/nba-data-containment.mjs
scripts/nba-backtest-baseline.ts
scripts/nba-build-dataset.ts
scripts/nba-minutes-synthetic-harness.ts
src/lib/nba/props/__fixtures__/synthetic.ts
src/lib/nba/props/__fixtures__/syntheticLeague.ts
src/lib/nba/props/__fixtures__/syntheticSource.ts
src/lib/nba/props/__fixtures__/v0Golden.ts
src/lib/nba/props/backtest.ts
src/lib/nba/props/baselineV0.golden.test.ts
src/lib/nba/props/containment.test.ts
src/lib/nba/props/dataset.test.ts
src/lib/nba/props/dataset.ts
src/lib/nba/props/features.ts
src/lib/nba/props/ingest.test.ts
src/lib/nba/props/ingest/statsNbaPayload.ts
src/lib/nba/props/isolation.test.ts
src/lib/nba/props/minutesFeatures.ts
src/lib/nba/props/minutesV1.test.ts
src/lib/nba/props/minutesV1.ts
src/lib/nba/props/minutesV1Backtest.ts
src/lib/nba/props/model.test.ts
src/lib/nba/props/normalize.ts
src/lib/nba/props/projection.ts
src/lib/nba/props/role.ts
src/lib/nba/props/seasonType.ts
src/lib/nba/props/sources.test.ts
src/lib/nba/props/sources/ingest.ts
src/lib/nba/props/sources/licenses.ts
src/lib/nba/props/sources/statsNbaAdapter.ts
src/lib/nba/props/sources/types.ts
src/lib/nba/props/stats.ts
src/lib/nba/props/types.ts
```
Kept local and gitignored, never committed:
- `data/nba/**`: raw snapshots, canonical tables, backtest runs and predictions, `reports/phase-1-results.md`, `reports/v0-tuned-benchmark.json`.
- `scripts/nba-fetch-game-logs.ts`, `src/lib/nba/props/ingest/statsNbaClient.ts`, `src/lib/nba/props/ingest/statsNbaClient.test.ts` (§7).

## 5. Remaining licensing blockers

1. **No provider is licensed.** Every commercial source permits no use in `SOURCE_LICENSES` until a signed agreement or written confirmation exists.
2. **SportsDataIO:** price unknown; written scope for an ad-supported site and public prop projections; historical season depth; as-of injury and lineup history; historical prop-line depth and price; post-termination rights.
3. **BALLDONTLIE:** upstream rights and indemnity (it disclaims both); the "competing products" clause; minutes precision; **no historical prop lines**; lineups only after tip and only from 2025.
4. **NBA.com data stays restricted:** no development, evaluation or publication. The local data is kept but unused.
5. **A legal opinion** on whether JKB, which is ad-supported, can rely on any "private, non-commercial" allowance. This affects past Phase 1 work only and does not block the provider path.

## 6. Recommendation and next implementation step

**Recommended provider: SportsDataIO as primary.** Its documentation alone covers the most needs:
- Written license language for betting analytics and the display of derived outputs.
- Decimal minutes (`Minutes` + `Seconds`), `Started`, injury and lineup status fields.
- `NbaDotComPlayerID`, which keeps the Phase 1 identity space and v0 benchmark comparable.
- Historical player-prop line movement, which is needed later for any market comparison.

Its weaknesses are cost (unknown, likely much higher than BALLDONTLIE) and unconfirmed as-of injury history.

**BALLDONTLIE is a low-cost secondary option**, for prototyping or for advanced and tracking stats. Use it only after written answers on upstream rights and the competing-products clause. It cannot supply historical prop lines.

**Next step, after your review:**
1. Send §1.10 to both providers and get quotes.
2. Once an agreement exists, record it in `SOURCE_LICENSES` with its basis.
3. Build a `sportsDataIoAdapter`, test-first, against synthetic fixtures shaped from the published data dictionary.
4. Add a keyed transport, reading its secret from the environment.
5. Start forward pregame snapshots of injuries, lineups and props with `asOfUtc`.
6. Replicate v0 on licensed data.
7. Only then run the minutes-v1 protocol: development → validation → holdout once.

## 7. Review conditions applied (commit preparation)

1. **Retrieval tooling excluded.** `scripts/nba-fetch-game-logs.ts` and its npm command were removed from the repository and kept locally (gitignored). The stats.nba.com client (`ingest/statsNbaClient.ts`, with browser-mimicking headers) and its retry tests are also kept local-only, because they are the retrieval capability itself. The committed code that needs to parse preserved bodies uses the new network-free `ingest/statsNbaPayload.ts`. No other script depended on the removed command.
2. **Tuned v0 values removed.** Audit result:
   - The Phase 1 tuned values (`minutesShrinkGames`, `newPlayerMinutes`, per-stat `rateShrinkMinutes`) were NBA.com-derived.
   - So was the extension of the `newPlayerMinutes` tuning grid, added after a validation run selected the grid edge.
   - Both are preserved verbatim in the gitignored `data/nba/reports/v0-tuned-benchmark.json`, together with the original golden outputs.
   - Public code now uses `BASELINE_V0_PUBLIC_PARAMS`, a frozen copy of the untuned design defaults written before any data was retrieved. The tuning grid is back to its a-priori values.
   - The golden test was re-captured with the public parameters.
   - **Results are not numerically equivalent to the Phase 1 benchmark.** The Phase 2A synthetic comparison was re-computed against the untuned v0 and labeled accordingly.
   - Not derived, so kept: `DEFAULT_BASELINE_PARAMS`, the minutes-v1 defaults and grid (synthetic only), and the golden fixture's league rates (round figures entered by hand, not computed from data).
3. **Containment extended.** New path rule `nba-com-retrieval-tool`, and a source-content rule `nba-tuned-v0-params` that matches the tuned values in code, JSON or prose in any committable `.ts/.js/.mjs/.json/.md` file and in deployables. The required-source list now includes the payload module and the license gate.
4. **Build guard verified.** `postbuild` runs it only after prerender succeeds (`&&`).
   - It is read-only: the `dist/` tree hash was identical before and after the guard.
   - It is deterministic: two runs gave identical output and exit status.
   - It took about 1 s and needs no `.git`.
   - It is narrowly scoped: NBA-specific path and content rules; no false positives on the current 550 `dist/` and 535 `public/` files, which include NFL, MLB, PGA and CFB data.
   - It does not change NFL/MLB build output.
